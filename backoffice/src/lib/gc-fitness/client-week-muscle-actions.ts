"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import {
  aggregateWorkoutHeatmap,
  type WorkoutHeatmap,
} from "./muscle-heatmap-aggregator";
import {
  muscleFocusInsight,
  type MuscleFocusInsight,
} from "./muscle-focus-insight";
import type { MuscleHeatmapExercise } from "./muscle-heatmap-resolver";
import {
  plannedHeatmapSets,
  plannedSetSlotCount,
} from "./muscle-heatmap-sets";

/**
 * #1074 (épica #1067, M6, `S9`) — el heatmap de la SEMANA de un cliente, para la agenda del
 * coach. Twin del `weekHeatmap` de iOS y del `loadWeekMuscle` de Android.
 *
 * Es donde el coach decide, así que es donde el desbalance tiene que ser visible **antes** de
 * asignar — el mismo argumento que pone el componente en la ficha de rutina y en el editor.
 */

const DAY_MS = 86_400_000;
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ClientWeekMuscleMapPayload {
  /** Lunes de la semana calendario que contiene el ancla. */
  readonly weekStartCivil: string;
  /** Domingo de esa misma semana. */
  readonly weekEndCivil: string;
  readonly heatmap: WorkoutHeatmap;
  readonly insight: MuscleFocusInsight;
  /**
   * El conteo CRUDO de series contables de la ventana. Viaja aparte porque NO es la suma de
   * `setsByRegion` — esa cuenta la misma serie una vez por cada región que toca y es mucho
   * mayor. Es lo que hace que el umbral de 10 de `D-08` signifique "10 series".
   */
  readonly totalSets: number;
}

export async function getClientWeekMuscleMap(input: {
  clientId: string;
  anchorCivil?: string;
}): Promise<ClientWeekMuscleMapPayload> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(input.clientId)
    .get();
  if (!clientSnap.exists) throw new Error("Not found");

  const client = clientSnap.data() as { coachId?: string; timezone?: string };
  if (client.coachId !== trainer.uid) throw new Error("Forbidden");

  const timezone =
    typeof client.timezone === "string" && client.timezone.length > 0
      ? client.timezone
      : "UTC";
  const anchorCivil = isValidCivilDate(input.anchorCivil)
    ? input.anchorCivil
    : civilDateToday(timezone);

  // ⚠️ SEMANA CALENDARIO LUNES→DOMINGO, no una ventana rodante de 7 días.
  //
  // El peek de al lado usa `ancla ± 3 días`, que para SU pregunta ("qué hay alrededor de este
  // día") está bien. Para ésta no: las dos apps cortan la semana en lunes, y una tercera
  // superficie que contara otros siete días le mostraría al coach un total distinto del que ve
  // el cliente para "la misma semana". Es el mismo error que #534 corrigió en mobile, donde los
  // buckets semanales eran rodantes y el resto del producto los tenía en semana calendario.
  const weekStartCivil = mondayOf(anchorCivil);
  const weekEndCivil = addCivilDays(weekStartCivil, 6);

  const assignmentsSnap = await db
    .collection(FirestoreCollections.workoutAssignments)
    .where("clientId", "==", input.clientId)
    .where("scheduledFor", ">=", weekStartCivil)
    .where("scheduledFor", "<=", weekEndCivil)
    .get();

  // ⚠️ LO AGENDADO, NO LO HECHO: la pregunta es sobre la rutina, no sobre el registro. Y las
  // series de TODAS las asignaciones se concatenan en UNA lista — el mismo ejercicio en dos
  // entrenos de la semana suma, que es lo que "series por grupo en la semana" significa.
  const planned: Array<{
    exerciseId: string;
    setCount: number;
    setTypesBySet?: readonly string[] | null;
  }> = [];
  const exerciseIds = new Set<string>();

  for (const doc of assignmentsSnap.docs) {
    const data = doc.data() as {
      templateSnapshot?: { exercises?: unknown };
    };
    const exercises = data.templateSnapshot?.exercises;
    if (!Array.isArray(exercises)) continue;
    for (const raw of exercises) {
      const exercise = raw as {
        exerciseId?: unknown;
        sets?: unknown;
        repsBySet?: unknown;
        weightBySetKg?: unknown;
        durationBySetSeconds?: unknown;
        setTypesBySet?: unknown;
      };
      if (typeof exercise.exerciseId !== "string" || exercise.exerciseId.length === 0) continue;
      exerciseIds.add(exercise.exerciseId);
      planned.push({
        exerciseId: exercise.exerciseId,
        // `plannedSetSlotCount` y NO `sets`: un documento desalineado (#562) le muestra al
        // cliente más filas que su `sets`, y el cuerpo tiene que contar las que existen.
        setCount: plannedSetSlotCount(
          exercise as Parameters<typeof plannedSetSlotCount>[0],
        ),
        setTypesBySet: Array.isArray(exercise.setTypesBySet)
          ? (exercise.setTypesBySet as string[])
          : null,
      });
    }
  }

  const exercisesById = await fetchExercises(db, [...exerciseIds]);
  const sets = plannedHeatmapSets(planned);
  const heatmap = aggregateWorkoutHeatmap(sets, exercisesById);
  const totalSets = sets.filter((set) => !set.isWarmup).length;

  return {
    weekStartCivil,
    weekEndCivil,
    heatmap,
    insight: muscleFocusInsight(heatmap, totalSets),
    totalSets,
  };
}

/**
 * Los ejercicios que las asignaciones referencian.
 *
 * ⚠️ `.doc(id).get()` de a uno y NO `getAll`/`batchGet`: en serverless éste falla **en
 * silencio** (memoria `firestore-getall-fails-on-vercel`, donde el dashboard de audit terminó
 * mostrando UIDs crudos). Un fallo silencioso acá no rompería nada visible — el cuerpo saldría
 * apagado, que es un estado legítimo.
 *
 * ⚠️ Y hay que filtrar los ids reservados antes de tocar `.doc()`: `/^__.*__$/` tira
 * (memoria `firestore-reserved-id-standard-sentinel`), y `__standard__` es un id que este
 * producto usa de verdad.
 */
async function fetchExercises(
  db: FirebaseFirestore.Firestore,
  ids: readonly string[],
): Promise<Record<string, MuscleHeatmapExercise>> {
  const out: Record<string, MuscleHeatmapExercise> = {};
  const safeIds = ids.filter((id) => !/^__.*__$/.test(id));
  await Promise.all(
    safeIds.map(async (id) => {
      const snap = await db.collection(FirestoreCollections.exercises).doc(id).get();
      if (!snap.exists) return;
      const data = snap.data() as {
        muscleGroups?: unknown;
        primaryMuscleGroup?: unknown;
        secondaryMuscles?: unknown;
      };
      out[id] = {
        muscleGroups: Array.isArray(data.muscleGroups) ? (data.muscleGroups as string[]) : [],
        primaryMuscleGroup:
          typeof data.primaryMuscleGroup === "string" ? data.primaryMuscleGroup : null,
        secondaryMuscles: Array.isArray(data.secondaryMuscles)
          ? (data.secondaryMuscles as string[])
          : [],
      };
    }),
  );
  return out;
}

function isValidCivilDate(value: string | undefined): value is string {
  return typeof value === "string" && CIVIL_DATE_PATTERN.test(value);
}

/** El lunes de la semana que contiene `civil`. Twin del `weekStart` de las dos apps. */
function mondayOf(civil: string): string {
  const date = parseCivilDate(civil);
  // `getUTCDay()`: 0 = domingo. Lunes-primero ⇒ el domingo retrocede 6 días, no 0.
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addCivilDays(civil, offset);
}

function addCivilDays(civil: string, days: number): string {
  return formatCivil(new Date(parseCivilDate(civil).getTime() + days * DAY_MS));
}

function parseCivilDate(civil: string): Date {
  const [year, month, day] = civil.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function formatCivil(date: Date): string {
  return date.toISOString().slice(0, 10);
}

"use client";

// #1072 (épica #1067) — la sección "Músculos trabajados" de un ENTRENO. Twin de
// `WorkoutMuscleHeatmapSection.swift` y `.kt`.
//
// Es el envoltorio que comparten las DOS superficies de M4 en el backoffice: la
// ficha de la rutina (`/templates/[id]/view`) y el editor (`TemplateForm`). Igual
// que `ExerciseMuscleHeatmapSection` en M3, pero con el contenido `workout` — el
// que pinta escalones 0…4 y cuya leyenda lleva el NÚMERO de series al lado del
// color (`D-07`).
//
// Es donde el coach decide, así que es donde el desbalance tiene que ser visible
// ANTES de asignar: en la ficha informa, en el editor todavía se puede cambiar.
//
// ⚠️ TOMA LOS EJERCICIOS PRESCRIPTOS, no un heatmap ya agregado (a diferencia de
// los twins nativos). Acá no hace falta el control fino sobre CUÁNDO se agrega:
// el backoffice no tiene la superficie cara —el entreno activo— y `useMemo` sobre
// las dos entradas alcanza. La regla que sí es la misma en las tres plataformas
// vive en `muscle-heatmap-sets.ts` y en el agregador.

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import {
  MuscleHeatmap,
  type MuscleHeatmapSize,
} from "@/components/gc-fitness/muscle-heatmap";
import { aggregateWorkoutHeatmap } from "@/lib/gc-fitness/muscle-heatmap-aggregator";
import type { MuscleHeatmapExercise } from "@/lib/gc-fitness/muscle-heatmap-resolver";
import {
  plannedHeatmapSets,
  plannedSetSlotCount,
  type PlannedExerciseSlotSource,
} from "@/lib/gc-fitness/muscle-heatmap-sets";

/** Un ejercicio prescripto tal como lo tienen la ficha y el editor de rutinas. */
export interface WorkoutHeatmapExerciseInput extends PlannedExerciseSlotSource {
  readonly exerciseId: string;
}

export interface WorkoutMuscleHeatmapSectionProps {
  /** Los ejercicios prescriptos, en cualquier orden (el heatmap no lo usa). */
  readonly exercises: readonly WorkoutHeatmapExerciseInput[];
  /**
   * El join `exerciseId → ejercicio` de la biblioteca. Un ejercicio ausente NO
   * aporta regiones — no se inventa ninguna.
   */
  readonly exercisesById: Readonly<Record<string, MuscleHeatmapExercise>>;
  /**
   * El texto del cuerpo apagado. Lo pasa la pantalla porque el motivo cambia: una
   * rutina vacía se está EMPEZANDO, y decirle "ningún ejercicio declara grupos"
   * sería un reproche por algo que todavía no hizo.
   */
  readonly emptyMessage?: string;
  readonly size?: MuscleHeatmapSize;
  readonly className?: string;
}

export function WorkoutMuscleHeatmapSection({
  exercises,
  exercisesById,
  emptyMessage,
  size = "regular",
  className,
}: WorkoutMuscleHeatmapSectionProps) {
  const t = useTranslations("muscleHeatmap");

  const heatmap = useMemo(
    () =>
      aggregateWorkoutHeatmap(
        plannedHeatmapSets(
          exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            // `plannedSetSlotCount` y NO `sets`: un documento desalineado (#562)
            // le muestra al coach más filas que su `sets`, y el cuerpo tiene que
            // coincidir con la lista que tiene al lado.
            setCount: plannedSetSlotCount(exercise),
            setTypesBySet: exercise.setTypesBySet as readonly string[] | undefined,
          })),
        ),
        exercisesById,
      ),
    [exercises, exercisesById],
  );

  return (
    <section className={className} data-testid="workout-heatmap-section">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t("workoutTitle")}</h2>

      <MuscleHeatmap
        content={{ kind: "workout", heatmap }}
        size={size}
        emptyMessage={emptyMessage ?? t("emptyWorkoutExercises")}
      />
    </section>
  );
}

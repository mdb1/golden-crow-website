// exercise-progress-actions.ts — Per-client per-exercise progress aggregation
// (backlog C4). Mirrors the iOS Progress charts (WorkoutProgressCharts.swift),
// but instead of a single global volume trend it lets the coach pick ONE
// exercise from the client's logged history and chart that exercise's
// progression over time.
//
// METRICS (computed per session, see ExerciseSessionPoint):
//   - topSetWeightKg — heaviest set's weight in the session. The simplest
//     "am I lifting heavier?" signal. PRIMARY metric.
//   - estimatedOneRmKg — best Epley estimate weightKg × (1 + reps/30) across
//     the session's sets. Matches the iOS PR e1RM math. SECONDARY.
//   - volumeKg — Σ (weightKg × reps) over the session's sets for THIS
//     exercise. Tertiary "total work" signal.
// #565: EVERY set type counts (warm-up / failure / drop set alike) — `set_type`
// is a display marker, never a filter. Bodyweight / time-based sets with no
// weight contribute nothing to the weight metrics; a session with no weighted
// set for the exercise is dropped.
//
// READ-COST: ONE Firestore read — `workout_logs where clientId == X and
// startedAt >= today-365 orderBy startedAt desc limit 300`. Reuses the EXISTING
// (clientId, startedAt DESC) composite index the WorkoutTrendsWidget relies on
// (a range filter on the orderBy field needs no new index). Each log's heavy
// sets[] array is reduced to lightweight points on the SERVER so it never
// crosses to the browser; the client only re-filters by date range locally.

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { civilDateFormat, civilDateToday } from "@/lib/gc-fitness/civil-date";
import {
  PROJECTION_WEEKS,
  buildMuscleGroupWeeks,
  civilWeekStart,
  projectedSetsForAssignment,
  shiftCivilDays,
  type ExerciseMuscleMeta,
  type MuscleGroupWeekPoint,
  type MuscleSetInput,
  type SnapshotExerciseInput,
} from "@/lib/gc-fitness/muscle-group-weeks";

/** A distinct exercise that appears in the client's logged history. */
export interface LoggedExerciseOption {
  exerciseId: string;
  name: string;
  /** How many sessions logged this exercise (helps order the picker). */
  sessionCount: number;
  /**
   * Canonical muscle groups for this exercise (from the `exercises` doc), used
   * by the coach's muscle-group filter. Empty when the exercise doc is missing
   * (e.g. deleted) or carries no groups.
   */
  muscleGroups: string[];
}

/** One session's aggregated metrics for a single exercise. */
export interface ExerciseSessionPoint {
  exerciseId: string;
  /** civilDate YYYY-MM-DD of the session start (client timezone). */
  date: string;
  /** Heaviest set weight (kg) in the session; null if unweighted. */
  topSetWeightKg: number | null;
  /** Best Epley estimated 1RM (kg) across the session's sets; null if unweighted. */
  estimatedOneRmKg: number | null;
  /** Σ weightKg × reps over this exercise's sets (every type — #565). */
  volumeKg: number;
}

export type { MuscleGroupWeekPoint };

export interface ClientExerciseProgress {
  clientId: string;
  exercises: LoggedExerciseOption[];
  points: ExerciseSessionPoint[];
  /**
   * #480 — weekly weighted sets + volume per coarse muscle group, for the
   * muscle-group comparison charts. Empty when the client has logged no
   * completed sets in the window.
   */
  muscleGroupWeeks: MuscleGroupWeekPoint[];
  /** Coarse groups with any data in the window, in `COARSE_MUSCLE_GROUPS` order. */
  availableMuscleGroups: string[];
  /**
   * #568 — Monday of the week containing today (client timezone). The chart
   * draws its "today" divider here and anchors the weekly readout on it.
   */
  currentWeekStart: string;
}

/** Firestore reserved-id guard — `.doc(id)` throws on ids matching /^__.*__$/. */
function isReservedId(id: string): boolean {
  return /^__.*__$/.test(id);
}

const MAX_LOOKBACK_DAYS = 365;
const LOG_FETCH_LIMIT = 300;

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function numeric(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function localizedName(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const loc = value as { es?: unknown; en?: unknown };
    // Spanish-first surface — prefer the ES label when present.
    if (typeof loc.es === "string" && loc.es.trim()) return loc.es.trim();
    if (typeof loc.en === "string" && loc.en.trim()) return loc.en.trim();
  }
  return fallback;
}

/**
 * Read-only: aggregate a client's completed workout logs into per-exercise,
 * per-session progress points + the list of exercises that appear in their
 * history. Trainer-auth gated + per-client ownership checked (defense in depth
 * alongside the Firestore rules).
 */
export async function getClientExerciseProgress(
  clientId: string,
  timezone: string,
): Promise<ClientExerciseProgress> {
  const trainer: CurrentTrainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  // Ownership gate at the query layer — only read this client's logs when the
  // logged-in trainer owns them (the page already verifies coachId too).
  const today = civilDateToday(timezone);
  const currentWeekStart = civilWeekStart(today);

  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!clientSnap.exists || clientSnap.get("coachId") !== trainer.uid) {
    return {
      clientId,
      exercises: [],
      points: [],
      muscleGroupWeeks: [],
      availableMuscleGroups: [],
      currentWeekStart,
    };
  }

  const windowStartDate = new Date(
    Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  // Single bounded read — same (clientId, startedAt DESC) index the workout
  // trends widget uses. orderBy desc + limit keeps the read tiny.
  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("clientId", "==", clientId)
    .where("startedAt", ">=", windowStartDate)
    .orderBy("startedAt", "desc")
    .limit(LOG_FETCH_LIMIT)
    .get();

  const points: ExerciseSessionPoint[] = [];
  const exerciseMeta = new Map<
    string,
    { name: string; sessionCount: number; hasData: boolean }
  >();

  // #480 — every completed set (bodyweight and warm-ups included, #565), tagged
  // with its session civil date + per-set volume, for the muscle-group
  // aggregation. The exercise→muscle-group join happens after the batched
  // exercise read below.
  const muscleSetInputs: MuscleSetInput[] = [];
  const muscleExerciseIds = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    // Only completed sessions contribute (a stamped completion or ≥1 completed
    // set). Drops empty/abandoned drafts, matching the workout-trends widget.
    const startedAt = toDate(data.startedAt) ?? toDate(data.createdAt);
    if (!startedAt) continue;

    const rawSets = Array.isArray(data.sets)
      ? (data.sets as Array<Record<string, unknown>>)
      : [];

    // exerciseId → localized name, resolved from the log's templateSnapshot
    // (the same map the workout-log detail builder uses).
    const templateExercises =
      (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
        ?.exercises ?? [];
    const nameById = new Map<string, string>();
    for (const ex of templateExercises) {
      const exId = typeof ex.exerciseId === "string" ? ex.exerciseId : "";
      if (exId) nameById.set(exId, localizedName(ex.name, exId));
    }

    const date = civilDateFormat(startedAt, timezone);

    // Per-exercise accumulation within THIS session.
    interface Acc {
      topWeight: number | null;
      bestE1rm: number | null;
      volume: number;
      hasCompleted: boolean;
    }
    const byExercise = new Map<string, Acc>();

    for (const s of rawSets) {
      const exId = typeof s.exerciseId === "string" ? s.exerciseId : "";
      if (!exId) continue;
      const done = Boolean(s.completed_at ?? s.completedAt);
      if (!done) continue;

      let acc = byExercise.get(exId);
      if (!acc) {
        acc = { topWeight: null, bestE1rm: null, volume: 0, hasCompleted: true };
        byExercise.set(exId, acc);
      } else {
        acc.hasCompleted = true;
      }

      // #565 — EVERY set type counts toward top-set / e1RM / volume /
      // muscle-group attribution (warm-up / failure / drop set alike; mirrors
      // iOS + Android). `set_type` / `is_warmup` are display markers only.
      const weight = numeric(s.weight_kg ?? s.weight);
      const reps = numeric(s.reps);

      // #480 — per-set volume for the muscle-group charts. Twin of
      // WorkoutVolume.setVolumeKg: a TIME set (duration present) → weight ×
      // (duration/60); otherwise → weight × reps. Bodyweight sets contribute 0
      // volume but still COUNT as a set (weighted set-count is a separate tally).
      const durRaw = s.duration_seconds ?? s.durationSeconds;
      const hasDuration =
        typeof durRaw === "number" ||
        (typeof durRaw === "string" &&
          durRaw.trim() !== "" &&
          Number.isFinite(Number(durRaw)));
      const setVolume = hasDuration
        ? weight * (numeric(durRaw) / 60)
        : weight * reps;
      muscleSetInputs.push({ date, exerciseId: exId, volumeKg: setVolume });
      muscleExerciseIds.add(exId);

      if (weight > 0) {
        acc.topWeight =
          acc.topWeight === null ? weight : Math.max(acc.topWeight, weight);
        if (reps > 0) {
          // Epley: 1RM ≈ weight × (1 + reps/30). Matches iOS PR e1RM.
          const e1rm = weight * (1 + reps / 30);
          acc.bestE1rm =
            acc.bestE1rm === null ? e1rm : Math.max(acc.bestE1rm, e1rm);
          acc.volume += weight * reps;
        }
      }
    }

    for (const [exId, acc] of byExercise) {
      if (!acc.hasCompleted) continue;
      // `hasData` = this session produced a chartable value (≥1 weighted working
      // set → topWeight non-null, which also implies e1RM/volume are available).
      // Bodyweight-only exercises never set it, so the filter below drops them
      // from the picker — only exercises WITH data show.
      const sessionHasData = acc.topWeight !== null;
      const meta = exerciseMeta.get(exId);
      const name = nameById.get(exId) ?? exId;
      if (meta) {
        meta.sessionCount += 1;
        meta.hasData = meta.hasData || sessionHasData;
        if (meta.name === exId && name !== exId) meta.name = name;
      } else {
        exerciseMeta.set(exId, { name, sessionCount: 1, hasData: sessionHasData });
      }

      points.push({
        exerciseId: exId,
        date,
        topSetWeightKg: acc.topWeight,
        estimatedOneRmKg:
          acc.bestE1rm === null ? null : Math.round(acc.bestE1rm * 10) / 10,
        volumeKg: Math.round(acc.volume),
      });
    }
  }

  // Only surface exercises that actually have chartable data (drops
  // bodyweight-only entries the coach can't plot — they carry no weight, so
  // there's nothing to chart even though they DO count as sets).
  const withData = Array.from(exerciseMeta.entries()).filter(
    ([, m]) => m.hasData,
  );
  const withDataIds = new Set(withData.map(([exId]) => exId));

  // #568 — PROJECTION inputs. Second bounded read: the client's still-`scheduled`
  // assignments from today through the last projected week, flattened into
  // prescribed sets off each assignment's frozen `templateSnapshot`. Twin of iOS
  // `ProgressPhotosViewModel.projectedContributions` / Android
  // `MuscleGroupCharts.projectedContributions`.
  //
  // The range filter is on `scheduledFor` alone (plus the clientId equality), so
  // it rides the EXISTING (clientId, scheduledFor) composite index — status is
  // filtered in memory (the window is at most ~5 weeks of assignments). Starting
  // at `today` is what keeps the projection honest: sets already logged this week
  // come from the logs above, and a still-`scheduled` assignment earlier in the
  // week is a MISSED workout, not something to project.
  const projectionEnd = shiftCivilDays(currentWeekStart, 7 * PROJECTION_WEEKS + 6);
  const assignmentSnap = await db
    .collection(FirestoreCollections.workoutAssignments)
    .where("clientId", "==", clientId)
    .where("scheduledFor", ">=", today)
    .where("scheduledFor", "<=", projectionEnd)
    .get();

  const projectedSetInputs: MuscleSetInput[] = [];
  for (const doc of assignmentSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    // Only not-yet-done work is projected — a `started`/`completed`/`missed`
    // assignment is already represented by (or excluded from) the actuals.
    if ((data.status ?? "scheduled") !== "scheduled") continue;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    if (!scheduledFor) continue;
    const snapshotExercises =
      (data.templateSnapshot as { exercises?: SnapshotExerciseInput[] } | undefined)
        ?.exercises ?? [];
    if (!Array.isArray(snapshotExercises)) continue;
    for (const input of projectedSetsForAssignment(
      scheduledFor,
      snapshotExercises,
    )) {
      projectedSetInputs.push(input);
      muscleExerciseIds.add(input.exerciseId);
    }
  }

  // Muscle groups for BOTH the per-exercise picker filter AND the #480
  // muscle-group charts. The logs don't carry muscle metadata, so read the
  // `exercises` docs for the (small, distinct) set of logged exercises in ONE
  // batched getAll — bounded by the client's training variety (typically tens
  // of docs), once per page load. We pull `muscleGroups` (picker filter),
  // `primaryMuscleGroup` + `secondaryMuscles` (the #480 attribution weighting).
  // Missing/deleted exercises resolve to nothing and simply don't contribute.
  const exerciseMetaById = new Map<string, ExerciseMuscleMeta>();
  const neededIds = Array.from(
    new Set<string>([...withDataIds, ...muscleExerciseIds]),
  ).filter((id) => id.length > 0 && !isReservedId(id));
  if (neededIds.length > 0) {
    const refs = neededIds.map((exId) =>
      db.collection(FirestoreCollections.exercises).doc(exId),
    );
    const exerciseDocs = await db.getAll(...refs);
    for (const exDoc of exerciseDocs) {
      if (!exDoc.exists) continue;
      const mgRaw = exDoc.get("muscleGroups");
      const secRaw = exDoc.get("secondaryMuscles");
      const primaryRaw = exDoc.get("primaryMuscleGroup");
      exerciseMetaById.set(exDoc.id, {
        muscleGroups: Array.isArray(mgRaw)
          ? mgRaw.filter((v): v is string => typeof v === "string")
          : [],
        primaryMuscleGroup:
          typeof primaryRaw === "string" && primaryRaw.trim()
            ? primaryRaw
            : null,
        secondaryMuscles: Array.isArray(secRaw)
          ? secRaw.filter((v): v is string => typeof v === "string")
          : [],
      });
    }
  }
  const muscleById = new Map<string, string[]>();
  for (const [exId, meta] of exerciseMetaById) {
    if (meta.muscleGroups.length > 0) muscleById.set(exId, meta.muscleGroups);
  }

  // #480 — weekly weighted sets + volume per coarse muscle group. Bucket every
  // collected set into its Monday-anchored week, spreading its weighted
  // contribution across each coarse group its exercise trains. #568 adds the
  // projected buckets (current week's remainder + PROJECTION_WEEKS ahead).
  const { muscleGroupWeeks, availableMuscleGroups } = buildMuscleGroupWeeks(
    muscleSetInputs,
    projectedSetInputs,
    exerciseMetaById,
    today,
  );

  // Order exercises by how often they appear (most-trained first), then name.
  const exercises: LoggedExerciseOption[] = withData
    .map(([exerciseId, m]) => ({
      exerciseId,
      name: m.name,
      sessionCount: m.sessionCount,
      muscleGroups: muscleById.get(exerciseId) ?? [],
    }))
    .sort(
      (a, b) =>
        b.sessionCount - a.sessionCount || a.name.localeCompare(b.name),
    );

  // Drop points for exercises that didn't make the cut so the client payload
  // stays lean (those exercises can never be selected anyway).
  const leanPoints = points.filter((p) => withDataIds.has(p.exerciseId));

  return {
    clientId,
    exercises,
    points: leanPoints,
    muscleGroupWeeks,
    availableMuscleGroups,
    currentWeekStart,
  };
}

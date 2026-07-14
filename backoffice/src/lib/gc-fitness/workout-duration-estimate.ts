// workout-duration-estimate.ts
//
// TypeScript TWIN of the iOS estimator
//   gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/WorkoutDurationEstimate.swift
// (+ the transition/superset rules from SupersetGrouping.swift). Estimates how
// long an authored workout template will take, for display in the trainer
// backoffice (template form + templates list).
//
// SAME-SOURCE-OF-TRUTH CONTRACT (algorithm twin — like civil-date /
// habit-compliance): any change to the formula or constants here MUST be made
// in the Swift file in the SAME logical change, and the shared COLO
// HIPERTROFIADO parity vector (2841s / 48 min) in BOTH test suites must stay
// green:
//   - iOS:        WorkoutDurationEstimateTests.swift  (coloHipertrofiadoParity)
//   - backoffice: __tests__/workout-duration-estimate.test.ts
//
// FORMULA (D11 superset-aware): base = Σ over every set of (active work + 45s
// setup). Rest is then charged by walking the FLATTENED interleaved coordinate
// sequence (the shared `live-workout-supersets` twin) and adding
// `prescribedRestSeconds` at every coordinate where `shouldRest` is true. So a
// superset block charges rest ONCE per round (using the D1/D3 group rest = the
// block's last member's `restSeconds`), and the block's final coordinate
// charges the transition rest — instead of over-counting a rest per member per
// set. Standalone math is unchanged: each set rests with its own
// `rest_seconds`, and an exercise→exercise handoff uses the transition rest
// (explicit `transition_rest_seconds`, else the 60s product default).
// minutes = max(1, ceil(seconds / 60)).
//
// WIRE-KEY NOTE: rest is the snake_case `rest_seconds` / `transition_rest_seconds`
// (the documented exceptions inside `exercises[]` — see workout-template-schema.ts);
// everything else (`durationSeconds`, `durationBySetSeconds`, `repsBySet`,
// `supersetGroup`, `metric`, `order`) is camelCase verbatim from Swift.

import {
  DEFAULT_TRANSITION_REST_SECONDS as SEQUENCE_DEFAULT_TRANSITION_REST_SECONDS,
  flattenedCoordinates,
  prescribedRestSeconds,
  shouldRest,
  type SequenceExercise,
} from "./live-workout-supersets";

/** Seconds of active work attributed to a single rep (mirrors
 *  `estimatedSecondsPerRep` in Swift). */
export const ESTIMATED_SECONDS_PER_REP = 3;

/** Per-set setup / transition dead time the prescription does not model
 *  (un-rack, walk to the station, load plates, adjust the seat, the gap
 *  between the rest timer ending and the next set starting). Mirrors
 *  `estimatedSetupSecondsPerSet` in Swift. 260604-i26 — calibrated against 66
 *  real production logs (median residual ~45s/set; re-centres the estimate on
 *  the real median, which ran 1.47× the old work+rest-only estimate). */
export const ESTIMATED_SETUP_SECONDS_PER_SET = 45;

/** Product fallback when an exercise handoff carries no explicit
 *  `transition_rest_seconds`. Mirrors `SupersetSequence.defaultTransitionRestSeconds`.
 *  Re-exported from the shared superset twin so there is one source of truth. */
export const DEFAULT_TRANSITION_REST_SECONDS =
  SEQUENCE_DEFAULT_TRANSITION_REST_SECONDS;

/** Permissive shape accepted by the estimator — structurally satisfied by both
 *  the react-hook-form `ExerciseRefInput` and a raw Firestore exercise record.
 *  All fields except `sets` are optional/nullable so partially-filled form rows
 *  and legacy docs estimate without throwing. */
export interface DurationEstimateExercise {
  exerciseId?: string | null;
  sets?: number | null;
  reps?: number | null;
  rest_seconds?: number | null;
  transition_rest_seconds?: number | null;
  order?: number | null;
  repsBySet?: number[] | null;
  supersetGroup?: string | null;
  metric?: "reps" | "time" | string | null;
  durationBySetSeconds?: number[] | null;
  durationSeconds?: number | null;
}

function num(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Snapshot-only time-based heuristic — mirrors
 *  `ExerciseSnapshot.isTimeBasedForEstimate`. Time-based when any time signal is
 *  present; reps-based otherwise. */
export function isTimeBasedForEstimate(ex: DurationEstimateExercise): boolean {
  if (ex.metric === "time") return true;
  if (typeof ex.durationSeconds === "number") return true;
  if (Array.isArray(ex.durationBySetSeconds) && ex.durationBySetSeconds.length > 0) {
    return true;
  }
  return false;
}

/** Per-exercise estimate: Σ over sets of (active + rest + setup overhead).
 *  Mirrors `ExerciseSnapshot.estimatedDurationSeconds`. */
export function exerciseEstimatedDurationSeconds(ex: DurationEstimateExercise): number {
  const sets = num(ex.sets);
  if (sets <= 0) return 0;

  const timeBased = isTimeBasedForEstimate(ex);
  const reps = num(ex.reps);
  const rest = num(ex.rest_seconds);
  const durBySet = ex.durationBySetSeconds;
  const durSeconds = ex.durationSeconds;
  const repsBySet = ex.repsBySet;

  let total = 0;
  for (let setIndex = 0; setIndex < sets; setIndex += 1) {
    let active: number;
    if (timeBased) {
      if (Array.isArray(durBySet) && setIndex < durBySet.length) {
        active = num(durBySet[setIndex]);
      } else if (typeof durSeconds === "number") {
        active = durSeconds;
      } else {
        // Degenerate: time-tagged but no duration prescribed — fall back to the
        // reps heuristic so we never under-count a time exercise to zero work.
        active = reps * ESTIMATED_SECONDS_PER_REP;
      }
    } else {
      const repsForSet =
        Array.isArray(repsBySet) && setIndex < repsBySet.length
          ? num(repsBySet[setIndex])
          : reps;
      active = repsForSet * ESTIMATED_SECONDS_PER_REP;
    }
    total += Math.max(0, active) + Math.max(0, rest) + ESTIMATED_SETUP_SECONDS_PER_SET;
  }
  return total;
}

/** Per-exercise active-work + per-set setup ONLY (no rest). The D11 estimator
 *  charges rest separately by walking the flattened coordinate sequence, so the
 *  base sum must exclude rest to avoid double-counting. */
function exerciseWorkAndSetupSeconds(ex: DurationEstimateExercise): number {
  const sets = num(ex.sets);
  if (sets <= 0) return 0;

  const timeBased = isTimeBasedForEstimate(ex);
  const reps = num(ex.reps);
  const durBySet = ex.durationBySetSeconds;
  const durSeconds = ex.durationSeconds;
  const repsBySet = ex.repsBySet;

  let total = 0;
  for (let setIndex = 0; setIndex < sets; setIndex += 1) {
    let active: number;
    if (timeBased) {
      if (Array.isArray(durBySet) && setIndex < durBySet.length) {
        active = num(durBySet[setIndex]);
      } else if (typeof durSeconds === "number") {
        active = durSeconds;
      } else {
        active = reps * ESTIMATED_SECONDS_PER_REP;
      }
    } else {
      const repsForSet =
        Array.isArray(repsBySet) && setIndex < repsBySet.length
          ? num(repsBySet[setIndex])
          : reps;
      active = repsForSet * ESTIMATED_SECONDS_PER_REP;
    }
    total += Math.max(0, active) + ESTIMATED_SETUP_SECONDS_PER_SET;
  }
  return total;
}

/** Map the estimator's (snake_case) exercise shape to the camelCase
 *  `SequenceExercise` the shared superset twins consume. */
function toSequenceExercise(ex: DurationEstimateExercise): SequenceExercise {
  return {
    exerciseId: ex.exerciseId ?? "",
    sets: num(ex.sets),
    restSeconds: Math.max(0, num(ex.rest_seconds)),
    transitionRestSeconds:
      typeof ex.transition_rest_seconds === "number"
        ? ex.transition_rest_seconds
        : null,
    supersetGroup: ex.supersetGroup ?? null,
  };
}

/** Whole-template estimate (D11 superset-aware). Base = Σ (active work + setup)
 *  over every set; rest = Σ over the flattened coordinate sequence of the
 *  round-based `prescribedRestSeconds` at every coordinate where `shouldRest`
 *  is true. A superset charges rest once per round (the block's last member's
 *  `restSeconds`) plus the block's final transition rest; standalone math is
 *  unchanged. Twin of `TemplateSnapshot.estimatedDurationSeconds`. */
export function estimateTemplateDurationSeconds(
  exercises: DurationEstimateExercise[],
): number {
  const sorted = [...exercises].sort((a, b) => num(a.order) - num(b.order));
  let total = sorted.reduce((sum, ex) => sum + exerciseWorkAndSetupSeconds(ex), 0);

  const sequence = sorted.map(toSequenceExercise);
  for (const coordinate of flattenedCoordinates(sequence)) {
    if (!shouldRest(coordinate, sequence)) continue;
    total += prescribedRestSeconds(coordinate, sequence);
  }
  return total;
}

/** Estimated whole minutes, floored at 1. Mirrors
 *  `estimatedDurationMinutes` (`max(1, ceil(seconds / 60))`). */
export function estimateTemplateDurationMinutes(
  exercises: DurationEstimateExercise[],
): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;
  return Math.max(1, Math.ceil(estimateTemplateDurationSeconds(exercises) / 60));
}

/** Coerce a raw Firestore `exercises[]` array (unknown-typed) into the estimator
 *  shape, then return whole minutes. Used by the templates-list row builder,
 *  which holds raw doc data. Returns 0 for an empty/invalid list. */
export function estimateTemplateDurationMinutesFromRaw(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  const exercises = raw.map((entry): DurationEstimateExercise => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const asNum = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const asNumArr = (v: unknown): number[] | null =>
      Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : null;
    return {
      exerciseId: typeof e.exerciseId === "string" ? e.exerciseId : null,
      sets: asNum(e.sets),
      reps: asNum(e.reps),
      rest_seconds: asNum(e.rest_seconds),
      transition_rest_seconds: asNum(e.transition_rest_seconds),
      order: asNum(e.order),
      repsBySet: asNumArr(e.repsBySet),
      supersetGroup: typeof e.supersetGroup === "string" ? e.supersetGroup : null,
      metric:
        e.metric === "reps" || e.metric === "time" ? (e.metric as "reps" | "time") : null,
      durationBySetSeconds: asNumArr(e.durationBySetSeconds),
      durationSeconds: asNum(e.durationSeconds),
    };
  });
  return estimateTemplateDurationMinutes(exercises);
}

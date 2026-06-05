// weight-prefill.ts
// Single source of truth for "what KG/REPS do we pre-fill into a workout set?"
//
// TypeScript twin of the Swift `WeightPrefillResolver` at:
//   gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/WeightPrefillResolver.swift
// Keep the two in lockstep — same branch order, same edge cases. Any change
// here MUST update the Swift twin (and both test suites) in the same PR.
//
// THE RULE — "most recent intent wins":
//   1. Never logged this exercise              → show the ROUTINE.
//   2. Coach changed the plan after your last  → show the ROUTINE once,
//      log (`prescriptionUpdatedAt` is newer)     with a "coach updated" notice.
//   3. Otherwise                               → show YOUR last logged value.
// After case 2, logging once makes your value the most-recent intent again,
// so the next session falls back to case 3. No setting, no per-session choice.
//
// Rationale: first time → routine; after logging → your last value; coach
// changes the plan → routine once (origin "routineUpdated" drives a "coach
// updated" notice on the apps), then back to remembering. We compare against a
// dedicated `prescriptionUpdatedAt` (not `updatedAt`) because `updatedAt` also
// bumps on reschedule / status changes, which would spuriously trigger the
// "coach updated" notice.
//
// GRANULARITY — per-workout (doc level): there is ONE `prescriptionUpdatedAt`
// per `workout_assignments/{id}`. If the coach touches any prescription on the
// assignment, the WHOLE workout shows the routine again the next session. We do
// NOT track which individual exercise changed. `lastLoggedAt` is naturally
// per-exercise (when you last logged THAT exercise), so the comparison is
// evaluated per exercise against the one shared prescription timestamp.
//
// PURITY: no Firestore types. Plain numbers / Dates in, ResolvedPrefill out —
// trivially unit-testable and identical across surfaces.

/** A single set's previously-logged values (the user's history channel — NOT
 *  the set just logged in the current workout). */
export interface PreviousSetValue {
  weightKg: number;
  reps: number;
  durationSeconds?: number | null;
}

/** Which intent the resolver chose for a set. Drives the "coach updated"
 *  notice (only `routineUpdated` surfaces it). */
export type WeightPrefillOrigin = "routine" | "routineUpdated" | "previous";

/** Resolved pre-fill for one set. */
export interface ResolvedPrefill {
  weightKg: number;
  reps: number;
  durationSeconds: number | null;
  origin: WeightPrefillOrigin;
}

export interface ResolveSetPrefillInput {
  /** Per-set routine weight (null if the coach prescribed none). */
  templateWeightKg: number | null;
  /** Per-set routine reps (null → falls back to `exerciseDefaultReps`). */
  templateReps: number | null;
  /** Per-set routine duration for time-based sets. */
  templateDurationSeconds?: number | null;
  /** Exercise-level reps fallback. */
  exerciseDefaultReps: number;
  /** Exercise-level duration fallback. */
  exerciseDefaultDurationSeconds?: number | null;
  /** The user's last logged value for THIS set index (null if none). */
  previous: PreviousSetValue | null;
  /** When the coach last set/changed this assignment's prescription. Callers
   *  should pass `prescriptionUpdatedAt ?? createdAt`. */
  prescriptionUpdatedAt: Date | null;
  /** `completedAt` of the most recent completed log of THIS exercise (null if
   *  the exercise was never logged). */
  lastLoggedAt: Date | null;
}

/**
 * True when the coach's prescription for this assignment is strictly newer
 * than the user's most recent completed log of the exercise — i.e. the routine
 * should override the remembered value once.
 *
 * - Never logged the exercise (`lastLoggedAt == null`) → `false`: that's the
 *   first-time-routine case, not an "update".
 * - Unknown prescription freshness (`prescriptionUpdatedAt == null`, e.g. a
 *   legacy assignment with no timestamp) → `false`: prefer to keep remembering
 *   the user's weights rather than nag spuriously. Callers should pass
 *   `prescriptionUpdatedAt ?? createdAt`.
 */
export function coachUpdatedSinceLastLog(
  prescriptionUpdatedAt: Date | null,
  lastLoggedAt: Date | null,
): boolean {
  if (lastLoggedAt === null) return false;
  if (prescriptionUpdatedAt === null) return false;
  // strict `>` — equal timestamps are NOT an update (keep remembering).
  return prescriptionUpdatedAt.getTime() > lastLoggedAt.getTime();
}

/** Resolve the seed value for ONE set. See the file header for the rule. */
export function resolveSetPrefill(input: ResolveSetPrefillInput): ResolvedPrefill {
  const {
    templateWeightKg,
    templateReps,
    templateDurationSeconds = null,
    exerciseDefaultReps,
    exerciseDefaultDurationSeconds = null,
    previous,
    prescriptionUpdatedAt,
    lastLoggedAt,
  } = input;

  const resolvedReps = templateReps ?? exerciseDefaultReps;
  const resolvedDuration = templateDurationSeconds ?? exerciseDefaultDurationSeconds;

  const routine = (origin: WeightPrefillOrigin): ResolvedPrefill => ({
    weightKg: templateWeightKg ?? 0,
    reps: resolvedReps,
    durationSeconds: resolvedDuration,
    origin,
  });

  // Case 1 — never logged this exercise → the coach's routine.
  if (lastLoggedAt === null) {
    return routine("routine");
  }

  // Case 2 — coach changed the plan after the last log → routine once, with
  // notice. Only override when the routine actually prescribes a weight;
  // otherwise there is nothing meaningful to override with.
  if (
    coachUpdatedSinceLastLog(prescriptionUpdatedAt, lastLoggedAt) &&
    templateWeightKg !== null
  ) {
    return {
      weightKg: templateWeightKg,
      reps: resolvedReps,
      durationSeconds: resolvedDuration,
      origin: "routineUpdated",
    };
  }

  // Case 3 — remember the user's last logged value for this set.
  if (previous !== null) {
    return {
      weightKg: previous.weightKg,
      reps: previous.reps,
      durationSeconds: previous.durationSeconds ?? null,
      origin: "previous",
    };
  }

  // Exercise was logged before, but not at this set index (e.g. the coach added
  // a set). Seed the new row from the routine, no "updated" notice.
  return routine("routine");
}

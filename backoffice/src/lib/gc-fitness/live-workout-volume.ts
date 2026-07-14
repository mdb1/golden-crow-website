// live-workout-volume.ts
//
// Pure finalize-math helpers — the TypeScript twin of the iOS
// ActiveWorkoutViewModel finalize totals (WLOG / 26-01 time-based volume).
// No I/O; unit-tested in __tests__/live-workout-volume.test.ts.
//
// Volume contract (mirrors iOS):
//   - WARMUP sets are EXCLUDED from total volume — via the HARDENED
//     effective predicate (quick-260714-m57 #403): a set is a warmup when
//     EITHER the richer setType === "warmup" OR the legacy isWarmup flag
//     says so (effectiveSetType from ./set-type). Failure / drop sets
//     count normally.
//   - reps-based set:  weightKg * reps
//   - time-based set:  weightKg * (durationSeconds / 60)   — a bodyweight
//     plank (weightKg = 0) contributes 0, which is correct.
//   A set counts as time-based when it carries a positive durationSeconds.

import type { SessionSetLog } from "./live-workout-types";
import { effectiveSetType } from "./set-type";

/** Σ working volume in kg. Warmups excluded; time sets use weight·minutes. */
export function computeTotalVolumeKg(sets: SessionSetLog[]): number {
  let total = 0;
  for (const set of sets) {
    if (effectiveSetType(set) === "warmup") continue;
    const duration = set.durationSeconds ?? 0;
    if (duration > 0) {
      total += set.weightKg * (duration / 60);
    } else {
      total += set.weightKg * set.reps;
    }
  }
  // Round to 2 decimals to avoid float dust on the wire (iOS stores a Double;
  // the dashboard renders ~1 decimal, so 2 dp is lossless for display).
  return Math.round(total * 100) / 100;
}

/**
 * Whole-second session duration from an ISO start to an end instant.
 * `endMs` defaults to the caller-supplied "now" (kept explicit so callers in
 * Server Actions pass `Date.now()` — the helper itself stays pure/testable).
 * Returns 0 when start is missing or the clock went backwards.
 */
export function computeDurationSeconds(
  startedAtIso: string | null,
  endMs: number,
): number {
  if (!startedAtIso) return 0;
  const startMs = Date.parse(startedAtIso);
  if (Number.isNaN(startMs)) return 0;
  const seconds = Math.round((endMs - startMs) / 1000);
  return seconds > 0 ? seconds : 0;
}

/** Count of completed (non-warmup) working sets — for the progress header. */
export function countWorkingSets(sets: SessionSetLog[]): number {
  return sets.filter((s) => effectiveSetType(s) !== "warmup").length;
}

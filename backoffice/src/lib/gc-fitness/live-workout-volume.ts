// live-workout-volume.ts
//
// Pure finalize-math helpers — the TypeScript twin of the iOS
// ActiveWorkoutViewModel finalize totals (WLOG / 26-01 time-based volume).
// No I/O; unit-tested in __tests__/live-workout-volume.test.ts.
//
// Volume contract (mirrors iOS):
//   - WARMUP sets are EXCLUDED from total volume.
//   - effective per-rep load = weightKg + bodyWeightKg × bodyweightLoadFactor
//   - reps-based set:  effectiveLoad × reps
//   - time-based set:  effectiveLoad × (durationSeconds / 60)
//   A set counts as time-based when it carries a positive durationSeconds.
//
// 26-vol (#243) — bodyweight-aware volume. The per-exercise
// `bodyweightLoadFactor` (0 = pure external load; ~1.0 = full body weight) and
// the client's `bodyWeightKg` are OPTIONAL inputs: when omitted (or 0, or no
// factor for an exercise), the math degrades EXACTLY to the previous
// load-only behavior (a bodyweight push-up at 0 kg → 0). Forward-only: callers
// pass real values only at finalize once the client has a logged body weight.

import type { SessionSetLog } from "./live-workout-types";

/**
 * Σ working volume in kg. Warmups excluded; time sets use load·minutes.
 *
 * @param bodyWeightKg client's body weight (0 → no body-weight contribution).
 * @param bodyweightLoadFactorByExerciseId per-exercise fraction of body weight
 *   the movement loads; missing exercise → 0 (pure external load).
 */
export function computeTotalVolumeKg(
  sets: SessionSetLog[],
  bodyWeightKg = 0,
  bodyweightLoadFactorByExerciseId: Record<string, number> = {},
): number {
  let total = 0;
  for (const set of sets) {
    if (set.isWarmup) continue;
    const factor = bodyweightLoadFactorByExerciseId[set.exerciseId] ?? 0;
    const effectiveLoad = set.weightKg + bodyWeightKg * factor;
    const duration = set.durationSeconds ?? 0;
    if (duration > 0) {
      total += effectiveLoad * (duration / 60);
    } else {
      total += effectiveLoad * set.reps;
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
  return sets.filter((s) => !s.isWarmup).length;
}

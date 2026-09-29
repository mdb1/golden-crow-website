// live-workout-volume.ts
//
// Pure finalize-math helpers — the TypeScript twin of the iOS
// ActiveWorkoutViewModel finalize totals (WLOG / 26-01 time-based volume).
// No I/O; unit-tested in __tests__/live-workout-volume.test.ts.
//
// Volume contract (mirrors iOS):
//   - EVERY set type contributes (issue #565). Warm-up / failure / drop sets
//     count exactly like a normal set. This REVERSES the #403 rule where a
//     warm-up contributed 0 — `setType` is now a display marker only (the
//     W/F/D letter + the Hevy numbering rule), never a multiplier.
//     `isWarmup` / `effectiveSetType` survive for that display layer and for
//     the wire sync invariant, but NOTHING in the sets/volume math may
//     consult them.
//   - reps-based set:  weightKg * reps
//   - time-based set:  weightKg * (durationSeconds / 60)   — a bodyweight
//     plank (weightKg = 0) contributes 0, which is correct.
//   A set counts as time-based when it carries a positive durationSeconds.
//   - #1197: the set's LOAD is weightKg + bodyweightKg, where bodyweightKg is
//     stamped at finalize on bodyweight-exercise sets only (full body weight,
//     no per-movement fraction). Absent ⇒ the external-load-only behavior.
//
// ⚠️ `workout_logs.total_volume_kg` is FROZEN at finalize and read directly by
// the volume-trend charts, so pre-#565 logs keep their warm-up-excluded totals
// until `scripts/backfill-total-volume-565.cjs` runs.

import type { SessionSetLog } from "./live-workout-types";

/** #1197 — external weight + stamped body weight. Twin of `WorkoutVolume.setLoadKg`. */
export function setLoadKg(set: Pick<SessionSetLog, "weightKg" | "bodyweightKg">): number {
  return set.weightKg + (set.bodyweightKg ?? 0);
}

/** Σ volume in kg over EVERY logged set (#565); time sets use load·minutes. */
export function computeTotalVolumeKg(sets: SessionSetLog[]): number {
  let total = 0;
  for (const set of sets) {
    const duration = set.durationSeconds ?? 0;
    const load = setLoadKg(set);
    if (duration > 0) {
      total += load * (duration / 60);
    } else {
      total += load * set.reps;
    }
  }
  // Round to 2 decimals to avoid float dust on the wire (iOS stores a Double;
  // the dashboard renders ~1 decimal, so 2 dp is lossless for display).
  return Math.round(total * 100) / 100;
}

/**
 * #1197 — stamp the client's body weight on the sets of bodyweight exercises,
 * at finalize. Other sets, and every set when no positive weight is known, are
 * returned untouched; a set that already carries a stamp keeps it. Twin of
 * `WorkoutVolume.stampingBodyweight` (iOS / Android).
 */
export function stampingBodyweight(
  sets: SessionSetLog[],
  bodyweightKg: number | null | undefined,
  bodyweightExerciseIds: ReadonlySet<string>,
): SessionSetLog[] {
  if (!bodyweightKg || bodyweightKg <= 0 || bodyweightExerciseIds.size === 0) {
    return sets;
  }
  return sets.map((set) =>
    set.bodyweightKg == null && bodyweightExerciseIds.has(set.exerciseId)
      ? { ...set, bodyweightKg }
      : set,
  );
}

/** #1197 — `Exercise.isBodyweight` twin: equipment "bodyweight" or "none". */
export function isBodyweightEquipment(equipment: unknown): boolean {
  const list = Array.isArray(equipment) ? equipment : [equipment];
  return list.some((raw) => {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return value === "bodyweight" || value === "none";
  });
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

/** Count of completed sets — every set type counts (#565). */
export function countWorkingSets(sets: SessionSetLog[]): number {
  return sets.length;
}

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
//   - #1197: the set's LOAD includes the athlete's body weight, stamped at
//     finalize as `bodyweightKg` (the FULL body weight) on bodyweight sets.
//   - #1307: only a FRACTION of that body weight counts —
//       load = weightKg + bodyweightFactor × bodyweightKg
//     `bodyweightFactor` is stamped next to `bodyweightKg` (wire
//     `bodyweight_factor`). A legacy set with `bodyweightKg` but no factor
//     counts it at 1.0 (the #1197 rule). The factor comes from the exercise's
//     `bodyweightLoadFactor`, else a default by primary muscle group for
//     bodyweight/none equipment, else 0 (see `resolveBodyweightLoadFactor`).
//   - 1.8.1 (gc-fitness docs/VOLUME.md): body weight counts ONLY on a REPS set
//     (no positive duration) with NO external weight (weightKg <= 0) — see
//     `countsBodyweight`. A loaded set counts only its kilos (a weighted
//     pull-up is underestimated — accepted); a time set never adds body
//     weight. Applied on READ (`setLoadKg` ignores a stamp on a set that
//     doesn't qualify, so 1.8.0 logs read right without migrating data) and
//     on WRITE (`stampingBodyweight` skips those sets). Why: custom exercises
//     default to equipment "bodyweight", so a 36 kg cable curl loaded
//     36 + 0.65 × BW.
//
// ⚠️ `workout_logs.total_volume_kg` is FROZEN at finalize and read directly by
// the volume-trend charts, so pre-#565 logs keep their warm-up-excluded totals
// until `scripts/backfill-total-volume-565.cjs` runs.

import type { SessionSetLog } from "./live-workout-types";

/** Legacy (#1197) factor for a set stamped with a body weight but no factor. */
export const LEGACY_BODYWEIGHT_FACTOR = 1;

/**
 * 1.8.1 — whether a set may add body weight to its load: a REPS set (no
 * positive duration) with NO external weight. Twin of
 * `WorkoutVolume.countsBodyweight` (iOS / Android) and functions'
 * `countsBodyweight`.
 */
export function countsBodyweight(
  set: Pick<SessionSetLog, "weightKg" | "durationSeconds">,
): boolean {
  return (set.durationSeconds ?? 0) <= 0 && set.weightKg <= 0;
}

/**
 * #1307 — external weight + the counted fraction of the stamped body weight.
 * 1.8.1: a stamp on a set that isn't `countsBodyweight` is ignored ⇒ weightKg.
 * Twin of `WorkoutVolume.setLoadKg` (iOS / Android) and functions'
 * `countedSets`.
 */
export function setLoadKg(
  set: Pick<
    SessionSetLog,
    "weightKg" | "durationSeconds" | "bodyweightKg" | "bodyweightFactor"
  >,
): number {
  if (!countsBodyweight(set)) return set.weightKg;
  const bodyweight = set.bodyweightKg ?? 0;
  if (!(bodyweight > 0)) return set.weightKg;
  const factor = set.bodyweightFactor ?? LEGACY_BODYWEIGHT_FACTOR;
  return set.weightKg + factor * bodyweight;
}

/** #1307 — per-set volume: load × reps, or load × minutes for a time set. */
export function setVolumeKg(
  set: Pick<
    SessionSetLog,
    "weightKg" | "reps" | "durationSeconds" | "bodyweightKg" | "bodyweightFactor"
  >,
): number {
  const duration = set.durationSeconds ?? 0;
  const load = setLoadKg(set);
  return duration > 0 ? load * (duration / 60) : load * set.reps;
}

/** Σ volume in kg over EVERY logged set (#565); time sets use load·minutes. */
export function computeTotalVolumeKg(sets: SessionSetLog[]): number {
  let total = 0;
  for (const set of sets) total += setVolumeKg(set);
  // Round to 2 decimals to avoid float dust on the wire (iOS stores a Double;
  // the dashboard renders ~1 decimal, so 2 dp is lossless for display).
  return Math.round(total * 100) / 100;
}

/**
 * #1307 — stamp the client's body weight AND the exercise's counted fraction
 * on the sets of bodyweight exercises, at finalize. `factorsByExerciseId`
 * holds the resolved factor per exercise (see `resolveBodyweightLoadFactor`);
 * an exercise absent from it, or with factor ≤ 0, is not stamped. Sets that
 * already carry a body-weight stamp keep it untouched, and every set is
 * returned untouched when no positive body weight is known. 1.8.1: a set
 * that isn't `countsBodyweight` (external weight, or a time set) is never
 * stamped. Twin of
 * `WorkoutVolume.stampingBodyweight` (iOS / Android).
 */
export function stampingBodyweight(
  sets: SessionSetLog[],
  bodyweightKg: number | null | undefined,
  factorsByExerciseId: ReadonlyMap<string, number>,
): SessionSetLog[] {
  if (!bodyweightKg || bodyweightKg <= 0 || factorsByExerciseId.size === 0) {
    return sets;
  }
  return sets.map((set) => {
    if (set.bodyweightKg != null || !countsBodyweight(set)) return set;
    const factor = factorsByExerciseId.get(set.exerciseId) ?? 0;
    return factor > 0 ? { ...set, bodyweightKg, bodyweightFactor: factor } : set;
  });
}

/** #1197 — equipment "bodyweight" or "none". */
export function isBodyweightEquipment(equipment: unknown): boolean {
  const list = Array.isArray(equipment) ? equipment : [equipment];
  return list.some((raw) => {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return value === "bodyweight" || value === "none";
  });
}

/**
 * #1307 — evidence-based default fraction of body weight moved, by PRIMARY
 * muscle group (raw `MUSCLE_GROUPS` values). Anything else / missing →
 * `DEFAULT_BODYWEIGHT_FACTOR_FALLBACK`. Sources in gc-fitness issue #1307.
 * Twin of iOS / Android `WorkoutVolume.defaultBodyweightFactor`.
 */
export const DEFAULT_BODYWEIGHT_FACTOR_BY_MUSCLE: Readonly<Record<string, number>> = {
  chest: 0.65,
  back: 0.8,
  shoulders: 0.65,
  triceps: 0.7,
  biceps: 0.8,
  quadriceps: 0.9,
  glutes: 0.6,
  hamstrings: 0.45,
  calves: 0.95,
  abs: 0.35,
  full_body: 0.65,
};
export const DEFAULT_BODYWEIGHT_FACTOR_FALLBACK = 0.65;

/** #1307 — default factor for a bodyweight exercise of this primary muscle. */
export function defaultBodyweightFactor(primaryMuscleGroup: unknown): number {
  const key =
    typeof primaryMuscleGroup === "string"
      ? primaryMuscleGroup.trim().toLowerCase()
      : "";
  return DEFAULT_BODYWEIGHT_FACTOR_BY_MUSCLE[key] ?? DEFAULT_BODYWEIGHT_FACTOR_FALLBACK;
}

/** Snap to the 0.05 grid and clamp to [0, 1]; null for a non-number. */
export function normalizeBodyweightFactor(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const clamped = Math.min(1, Math.max(0, raw));
  return Math.round(clamped * 20) / 20;
}

/** The exercise fields the factor resolution reads (raw Firestore doc ok). */
export interface BodyweightFactorSource {
  bodyweightLoadFactor?: unknown;
  equipment?: unknown;
  primaryMuscleGroup?: unknown;
}

/**
 * #1307 — the fraction of body weight this exercise counts toward volume:
 *   1. an explicit `bodyweightLoadFactor` wins (0 = doesn't count);
 *   2. else equipment bodyweight/none → default by primary muscle group;
 *   3. else 0.
 */
export function resolveBodyweightLoadFactor(exercise: BodyweightFactorSource): number {
  const explicit = normalizeBodyweightFactor(exercise.bodyweightLoadFactor);
  if (explicit !== null) return explicit;
  if (isBodyweightEquipment(exercise.equipment)) {
    return defaultBodyweightFactor(exercise.primaryMuscleGroup);
  }
  return 0;
}

/** #1307 — `Exercise.isBodyweight` twin: the resolved factor is positive. */
export function isBodyweight(exercise: BodyweightFactorSource): boolean {
  return resolveBodyweightLoadFactor(exercise) > 0;
}

// ── Wire-shaped readers (raw `workout_logs.sets[]` maps) ─────────────────
// Read sites that walk the raw Firestore sets go through these so the load
// formula lives in exactly one place.

function wireNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Decode the load inputs of a raw wire set (snake_case, camel fallback). */
export function wireSetLoadInputs(raw: Record<string, unknown>): {
  weightKg: number;
  durationSeconds: number | null;
  bodyweightKg: number | null;
  bodyweightFactor: number | null;
} {
  const bw = wireNumber(raw.bodyweight_kg ?? raw.bodyweightKg);
  const factor = wireNumber(raw.bodyweight_factor ?? raw.bodyweightFactor);
  return {
    weightKg: wireNumber(raw.weight_kg ?? raw.weightKg ?? raw.weight) ?? 0,
    durationSeconds: wireNumber(raw.duration_seconds ?? raw.durationSeconds),
    bodyweightKg: bw !== null && bw > 0 ? bw : null,
    bodyweightFactor: factor !== null && factor >= 0 ? factor : null,
  };
}

/** #1307 — load of a raw wire set (see `setLoadKg`). */
export function wireSetLoadKg(raw: Record<string, unknown>): number {
  return setLoadKg(wireSetLoadInputs(raw));
}

/** #1307 — volume of a raw wire set (see `setVolumeKg`). */
export function wireSetVolumeKg(raw: Record<string, unknown>): number {
  return setVolumeKg({
    ...wireSetLoadInputs(raw),
    reps: wireNumber(raw.reps) ?? 0,
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

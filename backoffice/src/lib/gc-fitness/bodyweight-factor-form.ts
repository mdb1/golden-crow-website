// bodyweight-factor-form.ts — #1307 form policy for the exercise editors'
// «% del peso corporal para el volumen» field (ExerciseForm + quick create).
// Pure; the math itself lives in live-workout-volume.ts.

import {
  defaultBodyweightFactor,
  isBodyweightEquipment,
  normalizeBodyweightFactor,
} from "./live-workout-volume";

/**
 * Whether the editor asks for the body-weight percentage. Bodyweight / none
 * equipment (an EMPTY list is saved as ["bodyweight"]), the pull-up bar (a
 * bodyweight apparatus: pull-ups, hanging leg raises), or an exercise that
 * already carries a positive factor.
 */
export function showsBodyweightFactorField(
  equipment: readonly string[] | null | undefined,
  currentFactor?: number | null,
): boolean {
  const list = equipment ?? [];
  if (list.length === 0) return true;
  if (isBodyweightEquipment(list)) return true;
  if (list.some((e) => e.trim().toLowerCase() === "pull_up_bar")) return true;
  return typeof currentFactor === "number" && currentFactor > 0;
}

/** The suggested percentage (0–100, step 5) for a primary muscle group. */
export function suggestedBodyweightPercent(primaryMuscleGroup: unknown): number {
  return Math.round(defaultBodyweightFactor(primaryMuscleGroup) * 100);
}

/** A typed percentage → a 0–1 factor on the 0.05 grid (null when not a number). */
export function percentToFactor(percent: number | null | undefined): number | null {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  return normalizeBodyweightFactor(percent / 100);
}

/**
 * The factor to persist at save time: the coach's explicit value when they
 * set one, else the suggestion for the current primary muscle.
 */
export function factorToPersist(
  explicitFactor: number | null | undefined,
  primaryMuscleGroup: unknown,
): number {
  return (
    normalizeBodyweightFactor(explicitFactor) ??
    defaultBodyweightFactor(primaryMuscleGroup)
  );
}

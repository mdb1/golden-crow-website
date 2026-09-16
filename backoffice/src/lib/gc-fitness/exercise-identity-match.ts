/**
 * Which logged sets belong to "this exercise", when the same exercise exists under more
 * than one document id (gc-fitness#1111).
 *
 * TWIN — siblings that must agree case for case:
 *   - `iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/ExerciseIdentityMatch.swift`
 *   - `android/core/src/main/kotlin/com/goldencrow/fitness/core/algorithms/ExerciseIdentityMatch.kt`
 *
 * ## The problem
 *
 * The exercise library is DOUBLE-SEEDED: 233 exercise names exist as two live documents (a
 * numeric id and a `std-<slug>` twin), identical in name, equipment, metric and muscle
 * groups. Which twin a routine froze depends on which one the picker happened to show the
 * day it was authored — so one client's history for one exercise routinely splits across
 * two ids.
 *
 * Here that shows up in the live session's ANTERIOR column and its weight pre-fill: a
 * client who squatted 100 kg last week under the twin id gets offered the routine's target
 * instead, as if they had never done the exercise. On the apps it also cost the trend chart
 * and the PR — that is the report (#1111) this comes from.
 *
 * ## Why the match is computed from the LOG
 *
 * Every `workout_logs` document freezes its own `templateSnapshot`, and that snapshot
 * carries, per exercise, the id AND the name AND the metric. So a log already contains
 * everything needed to answer "was this the same exercise?" — no extra reads, and no
 * dependency on the exercise documents still existing.
 *
 * ## The key is ENGLISH
 *
 * It is compared against names frozen months ago by another surface; a locale-dependent key
 * would match or not depending on who is looking. Same normalization the routine picker's
 * dedup uses (lowercase, strip accents, collapse non-alphanumerics), so the three surfaces
 * hold ONE opinion about when two exercises are the same.
 *
 * Metrics are never merged: time and reps are not comparable numbers.
 */

/** The metric half of the key. Wire values, matching `ExerciseMetric` on the apps. */
export type IdentityMetric = "reps" | "time";

/** One entry of a log's frozen `templateSnapshot`, reduced to identity. */
export interface IdentitySnapshotEntry {
  exerciseId: string;
  /** The ENGLISH name frozen at snapshot time. */
  nameEN: string;
  /**
   * The trainer's per-template metric override. `null` = not overridden, which must NOT be
   * read as "reps": it cascades, so it cannot disqualify a match on its own.
   */
  metric?: IdentityMetric | null;
}

/** Lowercased, accent-folded, non-alphanumerics collapsed to single spaces. */
export function normalizedExerciseName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalized identity of an exercise: English name + metric.
 *
 * Returns `null` for a blank name — an exercise with no name cannot be identified by name,
 * and a key of `"|reps"` would collapse every unnamed exercise into one history.
 */
export function exerciseIdentityKey(
  nameEN: string,
  metric: IdentityMetric,
): string | null {
  const normalized = normalizedExerciseName(nameEN);
  if (!normalized) return null;
  return `${normalized}|${metric}`;
}

/**
 * The exercise ids **inside one log** that are the target exercise.
 *
 * @param accepted ids already known to be the target. Always matched.
 * @param targetKey the target's key from {@link exerciseIdentityKey}; `null` disables the
 *   name fallback, which is the pre-#1111 behavior.
 * @param snapshot the log's frozen exercises.
 */
export function matchingExerciseIds(
  accepted: ReadonlySet<string>,
  targetKey: string | null,
  snapshot: readonly IdentitySnapshotEntry[],
): Set<string> {
  const result = new Set(accepted);
  if (!targetKey) return result;
  const targetMetric: IdentityMetric = targetKey.endsWith("|time") ? "time" : "reps";
  for (const entry of snapshot) {
    if (result.has(entry.exerciseId)) continue;
    const entryKey = exerciseIdentityKey(entry.nameEN, entry.metric ?? targetMetric);
    if (entryKey === targetKey) result.add(entry.exerciseId);
  }
  return result;
}

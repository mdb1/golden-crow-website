// muscle-group-display.ts
// #480 — TypeScript twin of the coarse muscle-group mapping + attribution
// weighting used by the Progress-tab muscle-group charts.
//
// SOURCE OF TRUTH (keep in sync, line-for-line):
//   - iOS:     gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/
//              Progress/MuscleGroupProgress.swift  (enum MuscleGroupDisplay)
//              + ProgressPhotosViewModel.coarseWeights(for:)
//   - Android: android/core/src/main/kotlin/com/goldencrow/fitness/core/
//              algorithms/MuscleGroupDisplay.kt
//
// The exercise library tags with the fine 17-item `MUSCLE_GROUPS` vocabulary;
// the charts roll those up into a handful of big COARSE groups so the selector
// stays short and the overlaid lines stay legible.
//
// ATTRIBUTION MODEL (product decision — identical on all three surfaces):
// A logged (non-warmup) set is attributed to every COARSE group its exercise
// trains, weighted 1.0 for the PRIMARY mover and 0.5 for each SECONDARY mover
// (fractional counting — best predicts hypertrophy across a 67-study analysis).
// Because each group is drawn as its own overlaid series there is no
// double-counting problem.

/** Display order in the selector (matches the product spec). */
export const COARSE_MUSCLE_GROUPS: readonly string[] = [
  "back",
  "chest",
  "biceps",
  "triceps",
  "shoulders",
  "legs",
  "core",
] as const;

/** Groups checked by default on first open (espalda, pecho, piernas). */
export const DEFAULT_SELECTED_MUSCLE_GROUPS: readonly string[] = [
  "back",
  "chest",
  "legs",
] as const;

/**
 * Roll a fine canonical muscle tag up to its coarse bucket, or null when it
 * isn't surfaced in the coarse view (arms / forearms / full_body / cardio /
 * flexibility — niche or ambiguous for a major-group breakdown).
 */
export function coarseGroup(fine: string): string | null {
  switch (fine.toLowerCase()) {
    case "back":
      return "back";
    case "chest":
      return "chest";
    case "biceps":
      return "biceps";
    case "triceps":
      return "triceps";
    case "shoulders":
      return "shoulders";
    case "legs":
    case "quadriceps":
    case "hamstrings":
    case "glutes":
    case "calves":
      return "legs";
    case "core":
    case "abs":
      return "core";
    default:
      return null;
  }
}

/**
 * Roll a free-text ANATOMY muscle name (from `Exercise.secondaryMuscles`, e.g.
 * "Triceps brachii", "Anterior deltoid", "Biceps femoris") up to a coarse
 * bucket via lenient substring matching. Used to identify which of an
 * exercise's coarse groups are SECONDARY movers (weighted 0.5) when the doc
 * carries no explicit `primaryMuscleGroup`.
 *
 * Order is load-bearing: leg-flexor names ("biceps femoris") must be caught as
 * legs before the generic "biceps" test, and deltoid names before "lat"/"back".
 */
export function coarseGroupFromAnatomy(raw: string): string | null {
  const s = raw.toLowerCase();
  if (
    s.includes("hamstring") ||
    s.includes("femoris") ||
    s.includes("quadricep") ||
    s.includes("quad") ||
    s.includes("glute") ||
    s.includes("calf") ||
    s.includes("calves") ||
    s.includes("soleus") ||
    s.includes("gastrocnemius") ||
    s.includes("adductor") ||
    s.includes("abductor")
  ) {
    return "legs";
  }
  if (s.includes("tricep")) return "triceps";
  if (s.includes("bicep")) return "biceps";
  if (s.includes("delt") || s.includes("shoulder")) return "shoulders";
  if (s.includes("pec") || s.includes("chest")) return "chest";
  if (
    s.includes("lat") ||
    s.includes("trap") ||
    s.includes("rhom") ||
    s.includes("teres") ||
    s.includes("erector") ||
    s.includes("back")
  ) {
    return "back";
  }
  if (
    s.includes("abdom") ||
    s.includes("oblique") ||
    s.includes("core") ||
    s.includes("serratus")
  ) {
    return "core";
  }
  return null;
}

export interface CoarseWeightsInput {
  /** The exercise's fine `muscleGroups` tags (e.g. ["chest", "triceps"]). */
  muscleGroups: string[];
  /** Explicit primary mover (a fine tag), when the doc carries one. */
  primaryMuscleGroup?: string | null;
  /** Free-text anatomy names (FEXD enrichment), the legacy fallback signal. */
  secondaryMuscles?: string[];
}

/**
 * Coarse group → attribution weight (1.0 primary, 0.5 secondary) for an
 * exercise. Twin of `ProgressPhotosViewModel.coarseWeights(for:)`.
 *
 * Prefers the explicit `primaryMuscleGroup` (the coarse group it maps to is
 * primary; every OTHER coarse group in `muscleGroups` is secondary). Falls back
 * to the anatomy-name heuristic over `secondaryMuscles` when no explicit
 * primary is set (legacy / seeded docs). When neither signal is present every
 * coarse group stays primary (1.0).
 *
 * Returns an empty map when the exercise maps to no surfaced coarse group.
 */
export function coarseWeights(input: CoarseWeightsInput): Record<string, number> {
  const allCoarse = new Set<string>();
  for (const fine of input.muscleGroups) {
    const c = coarseGroup(fine);
    if (c) allCoarse.add(c);
  }
  if (allCoarse.size === 0) return {};

  let secondaryCoarse: Set<string>;
  const primaryToken = input.primaryMuscleGroup;
  const primaryCoarse = primaryToken ? coarseGroup(primaryToken) : null;
  if (primaryCoarse) {
    secondaryCoarse = new Set(
      Array.from(allCoarse).filter((g) => g !== primaryCoarse),
    );
  } else {
    secondaryCoarse = new Set<string>();
    for (const name of input.secondaryMuscles ?? []) {
      const c = coarseGroupFromAnatomy(name);
      if (c) secondaryCoarse.add(c);
    }
  }

  const weights: Record<string, number> = {};
  for (const group of allCoarse) {
    weights[group] = secondaryCoarse.has(group) ? 0.5 : 1.0;
  }
  return weights;
}

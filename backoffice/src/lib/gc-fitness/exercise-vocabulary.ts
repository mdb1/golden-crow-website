// exercise-vocabulary.ts
// TypeScript twin of the canonical exercise vocabulary defined in
//   gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Vocabulary.swift
//
// SAME-SOURCE-OF-TRUTH CONTRACT (.planning/schemas/exercises.md):
// Any change to either list MUST update three files in the SAME commit:
//   1. Vocabulary.swift (the canonical source)
//   2. This file (exercise-vocabulary.ts)
//   3. .planning/schemas/exercises.md (the documentation)
// VocabularyTests + (future) Jest parity check fail the build on drift.
//
// LIST INVARIANTS (must mirror Vocabulary.swift exactly):
//  - alphabetical
//  - all lowercase [a-z_]+
//  - no duplicates
//  - no empty strings
//  - muscleGroups: 16 items (Pitfall 5 ceiling: ≤24)
//  - equipment: 13 items
//
// CONSUMERS:
//  - backoffice Zod schema for `exercises` documents (planned P03-05)
//  - wger seed-script ingestion mapper (planned P03-04)
//  - UI chip / filter rendering on the trainer surface

export const MUSCLE_GROUPS = [
  "abs",
  "arms",
  "back",
  "biceps",
  "calves",
  "cardio",
  "chest",
  "core",
  "flexibility",
  "forearms",
  "glutes",
  "hamstrings",
  "legs",
  "quadriceps",
  "shoulders",
  "triceps",
] as const;

export const EQUIPMENT = [
  "barbell",
  "bench",
  "bodyweight",
  "cable",
  "dumbbell",
  "kettlebell",
  "machine",
  "medicine_ball",
  "none",
  "pull_up_bar",
  "resistance_band",
  "rope",
  "swiss_ball",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type EquipmentItem = (typeof EQUIPMENT)[number];

export function isMuscleGroup(s: string): s is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(s);
}

export function isEquipment(s: string): s is EquipmentItem {
  return (EQUIPMENT as readonly string[]).includes(s);
}

/**
 * SF Symbol fallback for the hero placeholder when an exercise has no mediaURL.
 *
 * Mirrors `Vocabulary.fallbackSymbol(for:)` in Vocabulary.swift. Lookup is on
 * the PRIMARY muscle group (`exercise.muscleGroups[0]`). Any unrecognized input
 * — including empty string — returns the generic `figure.mixed.cardio` so the
 * UI NEVER renders a broken-image icon (UI-SPEC Surface A rule).
 *
 * The backoffice doesn't currently render SF Symbols (those are iOS-only), but
 * this helper is exposed for future use (e.g. preview cards in the trainer
 * surface that emoji-fall-back consistently with iOS).
 */
export function fallbackSymbol(muscleGroup: string): string {
  switch (muscleGroup.toLowerCase()) {
    case "chest":
    case "shoulders":
    case "arms":
    case "back":
    case "legs":
    case "glutes":
    case "quadriceps":
    case "hamstrings":
    case "biceps":
    case "triceps":
    case "forearms":
    case "calves":
      return "figure.strengthtraining.traditional";
    case "cardio":
      return "figure.run";
    case "flexibility":
    case "mobility":
      return "figure.flexibility";
    case "core":
    case "abs":
      return "figure.core.training";
    case "cooldown":
    case "stretching":
      return "figure.cooldown";
    default:
      return "figure.mixed.cardio";
  }
}

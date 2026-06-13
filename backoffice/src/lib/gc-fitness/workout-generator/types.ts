// workout-generator/types.ts
//
// Shared types for the deterministic Workout Generator engine. The engine is
// PURE and framework-free (no Firebase, no React) so it can be exhaustively
// unit-tested in isolation. The trainer surface injects the exercise library
// (already fetched via `useExercisesQuery`) as a plain array of
// `GeneratorExercise` rows.
//
// GUARANTEE the issue (#296) calls out explicitly: an exercise that requires
// equipment the trainer did NOT select must never appear in the generated
// workout NOR in any replacement pill. That rule lives in `engine.ts`
// (`isEquipmentAllowed`) and is locked by the test suite.

/** Minimal shape the engine needs from an exercise library row. Structurally
 *  satisfied by `ExerciseRow` from `exercises-listener.ts` (extra fields are
 *  ignored), so the UI passes its rows straight through. */
export interface GeneratorExercise {
  id: string;
  name: { en: string; es: string };
  /** Canonical muscle groups from `MUSCLE_GROUPS`. */
  muscleGroups: string[];
  /** Canonical equipment items from `EQUIPMENT`. Empty is treated as
   *  `["bodyweight"]` (mirrors the exercise schema normalization). */
  equipment: string[];
  /** Per-exercise prescription kind. Defaults to "reps" when absent. */
  metric?: "reps" | "time" | null;
  /** Optional preview media (passed through to the UI, ignored by the engine). */
  gifUrl?: string | null;
  thumbnailURL?: string | null;
  mediaURL?: string | null;
  imageUrl?: string | null;
}

/** How the trainer expressed workout size. */
export type VolumeMode = "count" | "time";

export interface GeneratorInput {
  /** Selected equipment items (already expanded from any group toggles). */
  equipment: string[];
  /** Selected muscle groups (already expanded from any preset toggles). */
  muscleGroups: string[];
  /** Either a fixed exercise count or a time budget drives the size. */
  volumeMode: VolumeMode;
  /** Required when volumeMode === "count". */
  exerciseCount?: number;
  /** Required when volumeMode === "time" (minutes). */
  timeMinutes?: number;
  /** Workout-type preset id (see `workout-type-presets.ts`). */
  workoutType: string;
  /** Optional seed for deterministic selection. When omitted the engine
   *  derives a stable seed from the input so the same inputs always yield the
   *  same workout; bump it to "regenerate" a fresh variation. */
  seed?: number;
  /** Optional human label used to build the default workout name (e.g. the
   *  muscle-preset label the trainer picked, "Push"). */
  focusLabel?: { en: string; es: string };
}

/** A candidate swap for a generated slot. Always equipment-eligible. */
export interface ReplacementOption {
  exerciseId: string;
  name: { en: string; es: string };
  primaryMuscle: string;
}

export interface GeneratedExercise {
  exerciseId: string;
  name: { en: string; es: string };
  /** The selected muscle group this slot is covering (for grouping/labels). */
  primaryMuscle: string;
  metric: "reps" | "time";
  sets: number;
  reps: number;
  rest_seconds: number;
  transition_rest_seconds: number;
  /** Present when metric === "time". */
  durationSeconds?: number;
  /** Equipment-eligible alternatives for the same muscle, excluding exercises
   *  already used in the workout. */
  replacements: ReplacementOption[];
}

export interface GeneratedWorkout {
  name: { en: string; es: string };
  exercises: GeneratedExercise[];
  estimatedDurationMinutes: number;
  /** Diagnostics surfaced by the UI when the pool can't satisfy the request. */
  requestedCount: number;
  /** Number of exercises in the library that passed equipment + muscle
   *  filters (the size of the pool the engine drew from). */
  eligiblePoolSize: number;
}

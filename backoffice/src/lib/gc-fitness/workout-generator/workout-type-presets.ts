// workout-generator/workout-type-presets.ts
//
// Workout-type presets (issue #296 step 4: "Select workout type. Example:
// resistance, muscle growth, hypertrophy, beginner, etc. this will be used by
// the workout generator engine to decide which exercises, rest timers, etc").
//
// Each preset is a prescription template the engine stamps onto every generated
// exercise: sets, reps, rest, transition rest, and — for time-based exercises
// (planks, holds, carries) — a per-set hold duration. All values respect the
// `exerciseRefSchema` bounds (sets 1-10, reps 0-50, rest 0-600, duration
// 5-1800) so a generated workout always passes `createWorkoutTemplate`'s Zod
// gate. `workout-type-presets.test.ts` asserts that invariant.

import {
  ESTIMATED_SECONDS_PER_REP,
  ESTIMATED_SETUP_SECONDS_PER_SET,
} from "../workout-duration-estimate";

export interface WorkoutTypePreset {
  id: string;
  label: { en: string; es: string };
  description: { en: string; es: string };
  sets: number;
  /** Reps prescribed for reps-based exercises. */
  reps: number;
  rest_seconds: number;
  transition_rest_seconds: number;
  /** Hold (seconds) prescribed for time-based exercises (metric === "time"). */
  durationSeconds: number;
}

export const WORKOUT_TYPE_PRESETS: readonly WorkoutTypePreset[] = [
  {
    id: "strength",
    label: { en: "Strength", es: "Fuerza" },
    description: {
      en: "Heavy, low reps, long rest.",
      es: "Pesado, pocas reps, descanso largo.",
    },
    sets: 5,
    reps: 5,
    rest_seconds: 180,
    transition_rest_seconds: 120,
    durationSeconds: 30,
  },
  {
    id: "hypertrophy",
    label: { en: "Hypertrophy", es: "Hipertrofia" },
    description: {
      en: "Moderate reps, moderate rest — muscle growth.",
      es: "Reps moderadas, descanso moderado — crecimiento muscular.",
    },
    sets: 4,
    reps: 10,
    rest_seconds: 75,
    transition_rest_seconds: 60,
    durationSeconds: 40,
  },
  {
    id: "muscle_growth",
    label: { en: "Muscle growth", es: "Volumen" },
    description: {
      en: "Higher volume, short-ish rest.",
      es: "Más volumen, descanso corto.",
    },
    sets: 4,
    reps: 12,
    rest_seconds: 60,
    transition_rest_seconds: 60,
    durationSeconds: 45,
  },
  {
    id: "endurance",
    label: { en: "Endurance", es: "Resistencia" },
    description: {
      en: "High reps, minimal rest.",
      es: "Muchas reps, descanso mínimo.",
    },
    sets: 3,
    reps: 18,
    rest_seconds: 40,
    transition_rest_seconds: 45,
    durationSeconds: 50,
  },
  {
    id: "beginner",
    label: { en: "Beginner", es: "Principiante" },
    description: {
      en: "Approachable volume, comfortable rest.",
      es: "Volumen accesible, descanso cómodo.",
    },
    sets: 3,
    reps: 12,
    rest_seconds: 75,
    transition_rest_seconds: 60,
    durationSeconds: 30,
  },
  {
    id: "power",
    label: { en: "Power", es: "Potencia" },
    description: {
      en: "Explosive, very low reps, full recovery.",
      es: "Explosivo, muy pocas reps, recuperación completa.",
    },
    sets: 4,
    reps: 3,
    rest_seconds: 180,
    transition_rest_seconds: 150,
    durationSeconds: 20,
  },
  {
    id: "circuit",
    label: { en: "Circuit", es: "Circuito" },
    description: {
      en: "Fast pace, minimal rest, keep moving.",
      es: "Ritmo rápido, descanso mínimo, sin parar.",
    },
    sets: 3,
    reps: 15,
    rest_seconds: 30,
    transition_rest_seconds: 20,
    durationSeconds: 40,
  },
];

export function getWorkoutTypePreset(id: string): WorkoutTypePreset {
  return (
    WORKOUT_TYPE_PRESETS.find((p) => p.id === id) ??
    WORKOUT_TYPE_PRESETS.find((p) => p.id === "hypertrophy")!
  );
}

/** Rough whole-second estimate of one exercise under a given type preset,
 *  used to size a time-budgeted workout into an exercise count. Mirrors the
 *  per-set formula in `workout-duration-estimate.ts` (active + rest + setup)
 *  and adds the inter-exercise transition once. */
export function estimateSecondsPerExercise(
  preset: WorkoutTypePreset,
  metric: "reps" | "time" = "reps",
): number {
  const active =
    metric === "time"
      ? preset.durationSeconds
      : preset.reps * ESTIMATED_SECONDS_PER_REP;
  const perSet = active + preset.rest_seconds + ESTIMATED_SETUP_SECONDS_PER_SET;
  return perSet * preset.sets + preset.transition_rest_seconds;
}

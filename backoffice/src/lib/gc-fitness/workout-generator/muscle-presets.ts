// workout-generator/muscle-presets.ts
//
// Muscle "focus" presets the trainer can one-tap (issue #296 step 2: "Select
// muscles of workout. Example: push, chest, full body, legs. This should be
// customizable."). Each preset expands to a subset of the canonical
// `MUSCLE_GROUPS` vocabulary; individual groups stay independently selectable
// so a trainer can hand-pick "biceps, triceps, and back".
//
// Every id in `muscles` MUST exist in `MUSCLE_GROUPS` — `muscle-presets.test.ts`
// asserts this against the vocab.

import { MUSCLE_GROUPS } from "../exercise-vocabulary";

export interface MusclePreset {
  id: string;
  label: { en: string; es: string };
  muscles: string[];
}

export const MUSCLE_PRESETS: readonly MusclePreset[] = [
  {
    id: "full_body",
    label: { en: "Full body", es: "Cuerpo completo" },
    muscles: [
      "chest",
      "back",
      "shoulders",
      "quadriceps",
      "hamstrings",
      "glutes",
      "core",
    ],
  },
  {
    id: "push",
    label: { en: "Push", es: "Empuje" },
    muscles: ["chest", "shoulders", "triceps"],
  },
  {
    id: "pull",
    label: { en: "Pull", es: "Tracción" },
    muscles: ["back", "biceps", "forearms"],
  },
  {
    id: "legs",
    label: { en: "Legs", es: "Piernas" },
    muscles: ["quadriceps", "hamstrings", "glutes", "calves"],
  },
  {
    id: "upper",
    label: { en: "Upper body", es: "Tren superior" },
    muscles: ["chest", "back", "shoulders", "biceps", "triceps"],
  },
  {
    id: "lower",
    label: { en: "Lower body", es: "Tren inferior" },
    muscles: ["quadriceps", "hamstrings", "glutes", "calves"],
  },
  {
    id: "arms",
    label: { en: "Arms", es: "Brazos" },
    muscles: ["biceps", "triceps", "forearms"],
  },
  {
    id: "core",
    label: { en: "Core", es: "Core" },
    muscles: ["abs", "core"],
  },
  {
    id: "flexibility",
    label: { en: "Stretching / Mobility", es: "Estiramiento / Movilidad" },
    muscles: ["flexibility"],
  },
];

/** Expand a set of selected preset ids into the union of their muscle groups. */
export function expandMusclePresets(presetIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of presetIds) {
    const preset = MUSCLE_PRESETS.find((p) => p.id === id);
    if (!preset) continue;
    for (const m of preset.muscles) out.add(m);
  }
  return Array.from(out);
}

/** Validate that every preset only references real `MUSCLE_GROUPS` vocab ids. */
export function musclePresetsReferenceValidVocab(): boolean {
  const vocab = new Set<string>(MUSCLE_GROUPS as readonly string[]);
  return MUSCLE_PRESETS.every((p) => p.muscles.every((m) => vocab.has(m)));
}

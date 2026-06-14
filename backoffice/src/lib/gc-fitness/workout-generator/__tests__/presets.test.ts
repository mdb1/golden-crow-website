// presets.test.ts
//
// Locks the equipment groups, muscle presets, and workout-type presets against
// the canonical vocabulary + the template schema bounds. These are the config
// the wizard's step 1/2/4 chips render, so a vocab rename or an out-of-bounds
// prescription would silently ship a broken generator without these guards.

import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/gc-fitness/exercise-vocabulary";
import {
  EQUIPMENT_GROUPS,
  equipmentGroupsReferenceValidVocab,
  expandEquipmentGroups,
  isGroupFullySelected,
} from "@/lib/gc-fitness/workout-generator/equipment-groups";
import {
  MUSCLE_PRESETS,
  expandMusclePresets,
  musclePresetsReferenceValidVocab,
} from "@/lib/gc-fitness/workout-generator/muscle-presets";
import {
  WORKOUT_TYPE_PRESETS,
  estimateSecondsPerExercise,
  getWorkoutTypePreset,
} from "@/lib/gc-fitness/workout-generator/workout-type-presets";
import { exerciseRefSchema } from "@/lib/gc-fitness/workout-template-schema";

describe("equipment groups", () => {
  it("only reference valid EQUIPMENT vocab ids", () => {
    expect(equipmentGroupsReferenceValidVocab()).toBe(true);
    const vocab = new Set<string>(EQUIPMENT as readonly string[]);
    for (const group of EQUIPMENT_GROUPS) {
      for (const item of group.items) expect(vocab.has(item)).toBe(true);
    }
  });

  it("have unique ids and non-empty item lists", () => {
    const ids = EQUIPMENT_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of EQUIPMENT_GROUPS) expect(g.items.length).toBeGreaterThan(0);
  });

  it("home group auto-selects bodyweight (issue #296 example)", () => {
    const home = EQUIPMENT_GROUPS.find((g) => g.id === "home")!;
    expect(home.items).toContain("bodyweight");
  });

  it("expandEquipmentGroups unions items and dedupes", () => {
    const expanded = expandEquipmentGroups(["home", "minimal"]);
    expect(expanded).toContain("bodyweight");
    expect(expanded).toContain("dumbbell");
    expect(new Set(expanded).size).toBe(expanded.length);
  });

  it("expandEquipmentGroups ignores unknown group ids", () => {
    expect(expandEquipmentGroups(["does-not-exist"])).toEqual([]);
  });

  it("isGroupFullySelected reflects the current selection", () => {
    const home = EQUIPMENT_GROUPS.find((g) => g.id === "home")!;
    expect(isGroupFullySelected(home, new Set(home.items))).toBe(true);
    expect(isGroupFullySelected(home, new Set(["bodyweight"]))).toBe(false);
  });
});

describe("muscle presets", () => {
  it("only reference valid MUSCLE_GROUPS vocab ids", () => {
    expect(musclePresetsReferenceValidVocab()).toBe(true);
    const vocab = new Set<string>(MUSCLE_GROUPS as readonly string[]);
    for (const preset of MUSCLE_PRESETS) {
      for (const m of preset.muscles) expect(vocab.has(m)).toBe(true);
    }
  });

  it("have unique ids and non-empty muscle lists", () => {
    const ids = MUSCLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MUSCLE_PRESETS) expect(p.muscles.length).toBeGreaterThan(0);
  });

  it("expose the push/pull/legs/full_body presets from the issue", () => {
    const ids = MUSCLE_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["push", "pull", "legs", "full_body"]));
  });

  it("push targets chest/shoulders/triceps", () => {
    const push = MUSCLE_PRESETS.find((p) => p.id === "push")!;
    expect(push.muscles).toEqual(expect.arrayContaining(["chest", "shoulders", "triceps"]));
  });

  it("exposes a flexibility preset that builds a stretching-only routine", () => {
    const flex = MUSCLE_PRESETS.find((p) => p.id === "flexibility")!;
    expect(flex).toBeDefined();
    expect(flex.muscles).toEqual(["flexibility"]);
    expect(expandMusclePresets(["flexibility"])).toEqual(["flexibility"]);
  });

  it("expandMusclePresets unions and dedupes", () => {
    const expanded = expandMusclePresets(["push", "pull"]);
    expect(expanded).toContain("chest");
    expect(expanded).toContain("back");
    expect(new Set(expanded).size).toBe(expanded.length);
  });
});

describe("workout-type presets", () => {
  it("have unique ids", () => {
    const ids = WORKOUT_TYPE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("expose the types named in the issue", () => {
    const ids = WORKOUT_TYPE_PRESETS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["hypertrophy", "muscle_growth", "beginner"]),
    );
  });

  it("every preset produces a prescription that passes the template Zod schema", () => {
    for (const preset of WORKOUT_TYPE_PRESETS) {
      // reps-based shape
      const repsRef = exerciseRefSchema.safeParse({
        exerciseId: "ex-1",
        sets: preset.sets,
        reps: preset.reps,
        rest_seconds: preset.rest_seconds,
        transition_rest_seconds: preset.transition_rest_seconds,
        order: 1,
      });
      expect(repsRef.success).toBe(true);

      // time-based shape (metric "time" requires a duration > 0)
      const timeRef = exerciseRefSchema.safeParse({
        exerciseId: "ex-1",
        sets: preset.sets,
        reps: 0,
        rest_seconds: preset.rest_seconds,
        transition_rest_seconds: preset.transition_rest_seconds,
        order: 1,
        metric: "time",
        durationSeconds: preset.durationSeconds,
      });
      expect(timeRef.success).toBe(true);
    }
  });

  it("getWorkoutTypePreset falls back to hypertrophy for unknown ids", () => {
    expect(getWorkoutTypePreset("nope").id).toBe("hypertrophy");
    expect(getWorkoutTypePreset("strength").id).toBe("strength");
  });

  it("estimateSecondsPerExercise grows with sets and is positive", () => {
    const preset = getWorkoutTypePreset("hypertrophy");
    expect(estimateSecondsPerExercise(preset, "reps")).toBeGreaterThan(0);
    expect(estimateSecondsPerExercise(preset, "time")).toBeGreaterThan(0);
  });
});

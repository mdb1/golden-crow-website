// __tests__/muscle-group-display.test.ts
// #480 — parity tests for the coarse muscle-group mapping + primary/secondary
// attribution weighting. Mirrors the iOS (MuscleGroupProgress.swift +
// ProgressPhotosViewModel.coarseWeights) and Android (MuscleGroupDisplay.kt)
// twins — same inputs must yield the same outputs on all three surfaces.

import {
  COARSE_MUSCLE_GROUPS,
  DEFAULT_SELECTED_MUSCLE_GROUPS,
  coarseGroup,
  coarseGroupFromAnatomy,
  coarseWeights,
} from "../muscle-group-display";

describe("muscle-group-display", () => {
  it("exposes the canonical coarse group order + defaults", () => {
    expect(COARSE_MUSCLE_GROUPS).toEqual([
      "back",
      "chest",
      "biceps",
      "triceps",
      "shoulders",
      "legs",
      "core",
    ]);
    expect(DEFAULT_SELECTED_MUSCLE_GROUPS).toEqual(["back", "chest", "legs"]);
  });

  it("rolls fine tags up to coarse buckets", () => {
    expect(coarseGroup("quadriceps")).toBe("legs");
    expect(coarseGroup("hamstrings")).toBe("legs");
    expect(coarseGroup("glutes")).toBe("legs");
    expect(coarseGroup("calves")).toBe("legs");
    expect(coarseGroup("abs")).toBe("core");
    expect(coarseGroup("chest")).toBe("chest");
    // Not surfaced in the coarse view.
    expect(coarseGroup("forearms")).toBeNull();
    expect(coarseGroup("cardio")).toBeNull();
    expect(coarseGroup("full_body")).toBeNull();
  });

  it("anatomy heuristic order is load-bearing (femoris → legs, not biceps)", () => {
    expect(coarseGroupFromAnatomy("Biceps femoris")).toBe("legs");
    expect(coarseGroupFromAnatomy("Triceps brachii")).toBe("triceps");
    expect(coarseGroupFromAnatomy("Biceps brachii")).toBe("biceps");
    expect(coarseGroupFromAnatomy("Anterior deltoid")).toBe("shoulders");
    expect(coarseGroupFromAnatomy("Pectoralis major")).toBe("chest");
    expect(coarseGroupFromAnatomy("Latissimus dorsi")).toBe("back");
    expect(coarseGroupFromAnatomy("Rectus abdominis")).toBe("core");
    expect(coarseGroupFromAnatomy("Brachioradialis")).toBeNull();
  });

  it("bench press: chest primary (1.0), triceps/shoulders secondary (0.5)", () => {
    const w = coarseWeights({
      muscleGroups: ["chest", "triceps", "shoulders"],
      primaryMuscleGroup: "chest",
    });
    expect(w).toEqual({ chest: 1.0, triceps: 0.5, shoulders: 0.5 });
  });

  it("falls back to the anatomy heuristic when no explicit primary", () => {
    const w = coarseWeights({
      muscleGroups: ["chest", "triceps", "shoulders"],
      secondaryMuscles: ["Triceps brachii", "Anterior deltoid"],
    });
    expect(w).toEqual({ chest: 1.0, triceps: 0.5, shoulders: 0.5 });
  });

  it("every group stays primary when no secondary signal exists", () => {
    const w = coarseWeights({ muscleGroups: ["chest", "triceps"] });
    expect(w).toEqual({ chest: 1.0, triceps: 1.0 });
  });

  it("collapses fine leg tags into a single weighted legs group", () => {
    const w = coarseWeights({
      muscleGroups: ["quadriceps", "glutes", "hamstrings"],
      primaryMuscleGroup: "quadriceps",
    });
    // All three roll up to `legs`; the primary maps to legs so legs is primary.
    expect(w).toEqual({ legs: 1.0 });
  });

  it("returns an empty map for exercises with no surfaced coarse group", () => {
    expect(coarseWeights({ muscleGroups: ["cardio", "full_body"] })).toEqual({});
  });

  it("#529 anatomy echoing the primary muscle does not demote a sole group", () => {
    // Seeded leg doc: no explicit primary, secondaryMuscles echo the exercise's
    // OWN primary anatomy → both map to `legs`, the only coarse group. It must
    // stay 1.0 (this demotion turned ~18 leg sets into 11.5 in issue #529).
    const w = coarseWeights({
      muscleGroups: ["legs"],
      secondaryMuscles: ["Quadriceps femoris", "Gluteus maximus"],
    });
    expect(w).toEqual({ legs: 1.0 });
  });

  it("#529 guard is scoped — a true secondary is still 0.5 when a primary remains", () => {
    const w = coarseWeights({
      muscleGroups: ["chest", "triceps"],
      secondaryMuscles: ["Triceps brachii"],
    });
    expect(w).toEqual({ chest: 1.0, triceps: 0.5 });
  });
});

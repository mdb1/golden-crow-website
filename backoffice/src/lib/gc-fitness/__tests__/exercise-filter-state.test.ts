/**
 * @jest-environment jsdom
 */

// exercise-filter-state.test.ts
//
// Phase 24-06 Task 2 — pure-function `applyFilters` (9 behavior cases) +
// `useExerciseFilters` hook Set-mutation-safety cases (2 cases).
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` and `renderHook` needs a DOM.
//
// Codex MEDIUM contract under test (cases 10 + 11):
//   Every state-update path on a Set field MUST return a NEW Set instance.
//   Mutating + returning the same reference (`prev.muscles.add(x); return
//   prev`) leaves React unable to detect the change and the chip click
//   appears unresponsive. The assertions are reference-identity checks
//   (`!==`), so a regression to in-place mutation fails immediately.

import "@testing-library/jest-dom";
import { act, renderHook } from "@testing-library/react";

import {
  applyFilters,
  useExerciseFilters,
  type ExerciseFilters,
} from "../exercise-filter-state";
import type { ExerciseRow } from "../exercises-listener";

function row(over: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: "x",
    name: { en: "", es: "" },
    description: { en: "", es: "" },
    muscleGroups: [],
    equipment: [],
    mediaURL: null,
    thumbnailURL: null,
    youtubeURL: null,
    source: "free-exercise-db",
    ownerId: null,
    version: 1,
    updatedAt: null,
    createdAt: null,
    deleted: false,
    deletedAt: null,
    mergedInto: null,
    imageUrl: null,
    endImageUrl: null,
    gifUrl: null,
    instructions: null,
    deletedReason: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    mechanic: null,
    level: null,
    category: null,
    force: null,
    ...over,
  };
}

const EMPTY_FILTERS: ExerciseFilters = {
  muscles: new Set(),
  equipment: new Set(),
  level: null,
  mechanic: null,
};

describe("applyFilters (Phase 24-06 Task 2)", () => {
  // Case 1 — empty filters means pass-through.
  it("Case 1: returns input unchanged when all filters are empty", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const out = applyFilters(rows, EMPTY_FILTERS);
    expect(out).toBe(rows);
    expect(out).toHaveLength(2);
  });

  // Case 2 — muscle filter matches via UNION of muscleGroups + primaryMuscles.
  it("Case 2: muscles filter matches against muscleGroups ∪ primaryMuscles", () => {
    const benchPress = row({
      id: "bench",
      muscleGroups: ["chest"],
      primaryMuscles: ["chest", "triceps"],
    });
    const squat = row({ id: "squat", muscleGroups: ["legs"] });
    const out = applyFilters([benchPress, squat], {
      ...EMPTY_FILTERS,
      muscles: new Set(["triceps"]),
    });
    // bench passes via primaryMuscles="triceps"; squat fails (no triceps anywhere).
    expect(out.map((r) => r.id)).toEqual(["bench"]);
  });

  // Case 3 — muscle filter is OR semantics within the set.
  it("Case 3: muscles filter uses OR semantics within the set", () => {
    const chest = row({ id: "chest", muscleGroups: ["chest"] });
    const back = row({ id: "back", muscleGroups: ["back"] });
    const legs = row({ id: "legs", muscleGroups: ["legs"] });
    const out = applyFilters([chest, back, legs], {
      ...EMPTY_FILTERS,
      muscles: new Set(["chest", "back"]),
    });
    expect(out.map((r) => r.id).sort()).toEqual(["back", "chest"]);
  });

  // Case 4 — equipment filter requires at least one matching item.
  it("Case 4: equipment filter requires at least one matching item", () => {
    const barbell = row({ id: "bb", equipment: ["barbell", "bench"] });
    const cable = row({ id: "cable", equipment: ["cable"] });
    const bodyweight = row({ id: "bw", equipment: ["bodyweight"] });
    const out = applyFilters([barbell, cable, bodyweight], {
      ...EMPTY_FILTERS,
      equipment: new Set(["barbell"]),
    });
    expect(out.map((r) => r.id)).toEqual(["bb"]);
  });

  // Case 5 — level filter is strict equality; nil row.level fails.
  it("Case 5: level filter strict-equality; nil row.level fails the filter", () => {
    const beginner = row({ id: "beg", level: "beginner" });
    const noLevel = row({ id: "nil", level: null });
    const intermediate = row({ id: "int", level: "intermediate" });
    const out = applyFilters([beginner, noLevel, intermediate], {
      ...EMPTY_FILTERS,
      level: "beginner",
    });
    expect(out.map((r) => r.id)).toEqual(["beg"]);
  });

  // Case 6 — mechanic filter is strict equality; nil row.mechanic fails.
  it("Case 6: mechanic filter strict-equality; nil row.mechanic fails the filter", () => {
    const compound = row({ id: "co", mechanic: "compound" });
    const noMech = row({ id: "nil", mechanic: null });
    const isolation = row({ id: "iso", mechanic: "isolation" });
    const out = applyFilters([compound, noMech, isolation], {
      ...EMPTY_FILTERS,
      mechanic: "compound",
    });
    expect(out.map((r) => r.id)).toEqual(["co"]);
  });

  // Case 7 — AND across categories.
  it("Case 7: chains AND across categories (muscles ∧ level)", () => {
    const chestBeginner = row({
      id: "cb",
      muscleGroups: ["chest"],
      level: "beginner",
    });
    const chestExpert = row({
      id: "ce",
      muscleGroups: ["chest"],
      level: "expert",
    });
    const backBeginner = row({
      id: "bb",
      muscleGroups: ["back"],
      level: "beginner",
    });
    const out = applyFilters([chestBeginner, chestExpert, backBeginner], {
      ...EMPTY_FILTERS,
      muscles: new Set(["chest"]),
      level: "beginner",
    });
    expect(out.map((r) => r.id)).toEqual(["cb"]);
  });

  // Case 8 — useExerciseFilters().clear() resets to empty.
  it("Case 8: useExerciseFilters().clear() resets all filters", () => {
    const { result } = renderHook(() => useExerciseFilters());
    act(() => {
      result.current.setFilters({
        muscles: new Set(["chest"]),
        equipment: new Set(["barbell"]),
        level: "beginner",
        mechanic: "compound",
      });
    });
    expect(result.current.filters.muscles.size).toBe(1);
    expect(result.current.isEmpty).toBe(false);

    act(() => {
      result.current.clear();
    });
    expect(result.current.filters.muscles.size).toBe(0);
    expect(result.current.filters.equipment.size).toBe(0);
    expect(result.current.filters.level).toBeNull();
    expect(result.current.filters.mechanic).toBeNull();
    expect(result.current.isEmpty).toBe(true);
  });

  // Case 9 — useExerciseFilters().isEmpty derived state.
  it("Case 9: useExerciseFilters().isEmpty tracks all-empty state", () => {
    const { result } = renderHook(() => useExerciseFilters());
    expect(result.current.isEmpty).toBe(true);

    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        muscles: new Set([...prev.muscles, "chest"]),
      }));
    });
    expect(result.current.isEmpty).toBe(false);

    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        muscles: new Set(),
      }));
    });
    expect(result.current.isEmpty).toBe(true);

    act(() => {
      result.current.setFilters((prev) => ({ ...prev, level: "beginner" }));
    });
    expect(result.current.isEmpty).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Codex MEDIUM — Set mutation safety.
  // -----------------------------------------------------------------------

  // Case 10 — adding to a Set returns a NEW instance.
  it("Case 10 (Codex MEDIUM): adding to muscles returns a NEW Set instance", () => {
    const { result } = renderHook(() => useExerciseFilters());
    const before = result.current.filters.muscles;

    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        muscles: new Set([...prev.muscles, "chest"]),
      }));
    });
    const after = result.current.filters.muscles;
    expect(after).not.toBe(before); // reference inequality — NEW instance
    expect(after.has("chest")).toBe(true);
    // The OLD Set must NOT have been mutated in place.
    expect(before.has("chest")).toBe(false);
  });

  // Case 11 — removing the last element returns a NEW empty Set, distinct
  // from the module-level EMPTY default.
  it("Case 11 (Codex MEDIUM): removing the last muscle returns a NEW empty Set", () => {
    const { result } = renderHook(() => useExerciseFilters());

    // Seed with one muscle.
    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        muscles: new Set([...prev.muscles, "chest"]),
      }));
    });
    const oneMuscle = result.current.filters.muscles;
    expect(oneMuscle.size).toBe(1);

    // Remove it via the immutable filter pattern.
    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        muscles: new Set(Array.from(prev.muscles).filter((v) => v !== "chest")),
      }));
    });
    const empty = result.current.filters.muscles;
    expect(empty).not.toBe(oneMuscle); // NEW instance
    expect(empty.size).toBe(0);
    // The OLD Set must NOT have been mutated to size 0.
    expect(oneMuscle.size).toBe(1);
  });
});

// __tests__/weight-diff.test.ts
// Unit tests for the pure weight-diff helper that decides WHEN a prescription
// write should bump the `prescriptionUpdatedAt` freshness anchor. This is
// sensitive logic — a false positive nags every client and resets their
// remembered weights; a false negative silently swallows a real coach change.

import {
  weightsDifferBetweenSnapshots,
  exercisesOf,
  type WeightComparableExercise,
} from "../weight-diff";

const ex = (
  exerciseId: string,
  weightBySetKg: number[] | undefined,
  extra: Record<string, unknown> = {},
): WeightComparableExercise => ({
  exerciseId,
  ...(weightBySetKg !== undefined ? { weightBySetKg } : {}),
  ...extra,
});

describe("weightsDifferBetweenSnapshots", () => {
  it("notes-only change → false", () => {
    const before = [ex("a", [20, 20], { notes: "old" })];
    const after = [ex("a", [20, 20], { notes: "totally different note" })];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(false);
  });

  it("identical weights with reps/rest changes → false", () => {
    const before = [ex("a", [40, 40], { reps: 8, rest_seconds: 90 })];
    const after = [ex("a", [40, 40], { reps: 12, rest_seconds: 120 })];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(false);
  });

  it("changed weight value → true", () => {
    const before = [ex("a", [20, 20])];
    const after = [ex("a", [20, 25])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("added a set (extra weight entry) → true", () => {
    const before = [ex("a", [20, 20])];
    const after = [ex("a", [20, 20, 20])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("removed a set (fewer weight entries) → true", () => {
    const before = [ex("a", [20, 20, 20])];
    const after = [ex("a", [20, 20])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("added a NEW weighted exercise → true", () => {
    const before = [ex("a", [20])];
    const after = [ex("a", [20]), ex("b", [30])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("added a new BODYWEIGHT exercise (no/empty weights) → false", () => {
    // A new exercise that carries no load doesn't change any weight.
    const before = [ex("a", [20])];
    const after = [ex("a", [20]), ex("b", [])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(false);
  });

  it("removed a weighted exercise → true", () => {
    const before = [ex("a", [20]), ex("b", [30])];
    const after = [ex("a", [20])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("reordering exercises with identical weights → false (matched by id)", () => {
    const before = [ex("a", [20]), ex("b", [30])];
    const after = [ex("b", [30]), ex("a", [20])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(false);
  });

  it("missing weightBySetKg ↔ empty array are equivalent → false", () => {
    const before = [ex("a", undefined)];
    const after = [ex("a", [])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(false);
  });

  it("missing weightBySetKg → non-empty weights → true", () => {
    const before = [ex("a", undefined)];
    const after = [ex("a", [20])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("both empty exercise lists → false", () => {
    expect(weightsDifferBetweenSnapshots([], [])).toBe(false);
    expect(weightsDifferBetweenSnapshots(undefined, undefined)).toBe(false);
  });

  it("exercises without ids are compared positionally (no collapse)", () => {
    const before = [ex("", [10]), ex("", [20])];
    const after = [ex("", [10]), ex("", [99])];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(true);
  });

  it("non-finite weight entries are normalized to 0 (no spurious diff)", () => {
    const before = [{ exerciseId: "a", weightBySetKg: [Number.NaN] }];
    const after = [{ exerciseId: "a", weightBySetKg: [0] }];
    expect(weightsDifferBetweenSnapshots(before, after)).toBe(false);
  });
});

describe("exercisesOf", () => {
  it("extracts the exercises array from a snapshot", () => {
    const snapshot = { name: "X", exercises: [ex("a", [10])] };
    expect(exercisesOf(snapshot)).toHaveLength(1);
  });

  it("returns [] for malformed / missing snapshots", () => {
    expect(exercisesOf(null)).toEqual([]);
    expect(exercisesOf(undefined)).toEqual([]);
    expect(exercisesOf({})).toEqual([]);
    expect(exercisesOf({ exercises: "nope" })).toEqual([]);
  });
});

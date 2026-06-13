// template-form-weight-clear.test.ts
//
// Regression for the "Front Raise saved as Sin peso" bug: clearing a per-set
// weight field truncated `weightBySetKg` to `[]` for set 1 (setIdx 0). An
// empty array is the reserved "Sin peso" (reps-only) sentinel, so a weighted
// exercise where the trainer typed reps×weight then cleared the weight got
// silently saved as reps-only (no PESO column). weightArrayAfterClear must
// instead zero-fill the cleared slot and NEVER return [].

import { weightArrayAfterClear } from "../template-form";

describe("weightArrayAfterClear", () => {
  it("clearing set 1 (idx 0) zero-fills instead of collapsing to [] (the bug)", () => {
    const out = weightArrayAfterClear([20, 20, 20], 0);
    expect(out).toEqual([0, 20, 20]);
    expect(out.length).toBeGreaterThan(0); // never the no-weight sentinel
  });

  it("clearing a middle set zeroes only that slot", () => {
    expect(weightArrayAfterClear([20, 25, 30], 1)).toEqual([20, 0, 30]);
  });

  it("clearing set 1 of a single-set exercise yields [0], not []", () => {
    expect(weightArrayAfterClear([20], 0)).toEqual([0]);
  });

  it("clearing when no weights were typed yet (empty current) yields [0], not []", () => {
    // current = [] (weightBySetKg was undefined). Must NOT stay [] — that
    // would be read as the explicit no-weight sentinel.
    const out = weightArrayAfterClear([], 0);
    expect(out).toEqual([0]);
    expect(out.length).toBe(1);
  });

  it("never returns an empty array for any reasonable set index", () => {
    for (let i = 0; i < 5; i++) {
      expect(weightArrayAfterClear([], i).length).toBeGreaterThan(0);
      expect(weightArrayAfterClear([10, 10], i).length).toBeGreaterThan(0);
    }
  });

  it("pads gaps with 0 when clearing a set beyond the current length", () => {
    expect(weightArrayAfterClear([20], 2)).toEqual([20, 0, 0]);
  });
});

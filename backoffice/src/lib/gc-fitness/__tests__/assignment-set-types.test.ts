// assignment-set-types.test.ts
//
// Issue #582: the assign-template modal showed no set-type marker AND wrote
// `sets` / `repsBySet` without ever realigning the template's inherited
// `setTypesBySet` — so removing a set slid the warm-up marker onto a different
// row. These lock the realignment rule shared by the assign-time override path
// and the assignment edit path.

import {
  alignSetTypes,
  normalizeSetTypesToCount,
  setTypesDiffer,
} from "../assignment-set-types";

describe("alignSetTypes", () => {
  it("pads a short array with normal", () => {
    expect(alignSetTypes(["warmup"], 3)).toEqual([
      "warmup",
      "normal",
      "normal",
    ]);
  });

  it("truncates a long array to the set count", () => {
    expect(
      alignSetTypes(["warmup", "normal", "normal", "dropset"], 2),
    ).toEqual(["warmup", "normal"]);
  });

  it("coerces unknown entries POSITIONALLY, never by filtering", () => {
    // The bad entry becomes "normal" AT ITS OWN INDEX — dropping it would
    // slide "dropset" from set 3 to set 2.
    expect(alignSetTypes(["warmup", "bogus", "dropset"], 3)).toEqual([
      "warmup",
      "normal",
      "dropset",
    ]);
  });

  it("treats an absent array as all-normal", () => {
    expect(alignSetTypes(undefined, 3)).toEqual([
      "normal",
      "normal",
      "normal",
    ]);
    expect(alignSetTypes(null, 2)).toEqual(["normal", "normal"]);
  });

  it("falls back to the source length when no count is given", () => {
    expect(alignSetTypes(["warmup", "failure"], 0)).toEqual([
      "warmup",
      "failure",
    ]);
    expect(alignSetTypes([], 0)).toEqual(["normal"]);
  });

  it("clamps to the 20-set ceiling", () => {
    expect(alignSetTypes(["warmup"], 999)).toHaveLength(20);
  });
});

describe("normalizeSetTypesToCount", () => {
  it("returns the aligned array when anything is non-normal", () => {
    expect(normalizeSetTypesToCount(["warmup", "normal"], 3)).toEqual([
      "warmup",
      "normal",
      "normal",
    ]);
  });

  it("returns null when everything came out normal — the DELETE signal", () => {
    expect(normalizeSetTypesToCount(["normal", "normal"], 2)).toBeNull();
    // The stale-array case: the only non-normal entry is past the new set
    // count, so nothing non-normal survives and the key must be dropped.
    expect(normalizeSetTypesToCount(["normal", "normal", "dropset"], 2)).toBeNull();
  });

  it("returns null for a non-array (nothing prescribed)", () => {
    expect(normalizeSetTypesToCount(undefined, 3)).toBeNull();
    expect(normalizeSetTypesToCount("warmup", 3)).toBeNull();
  });
});

describe("setTypesDiffer", () => {
  it("is false for identical arrays", () => {
    expect(setTypesDiffer(["warmup", "normal"], ["warmup", "normal"])).toBe(
      false,
    );
  });

  it("is true on a differing entry or a differing length", () => {
    expect(setTypesDiffer(["warmup", "normal"], ["normal", "normal"])).toBe(
      true,
    );
    expect(setTypesDiffer(["normal"], ["normal", "normal"])).toBe(true);
  });
});

describe("the #582 delete-a-set scenario", () => {
  // Template: 4 sets, set 1 is the warm-up. The coach removes set 1 while
  // assigning, leaving 3 sets — all of them normal working sets.
  const templateTypes = ["warmup", "normal", "normal", "normal"];

  it("registers as a change even though the coach never opened the picker", () => {
    // The surviving rows carried their own types with them (row-embedded).
    const finalTypes = alignSetTypes(["normal", "normal", "normal"], 3);
    const baseTypes = alignSetTypes(templateTypes, 3);
    expect(baseTypes).toEqual(["warmup", "normal", "normal"]);
    expect(setTypesDiffer(finalTypes, baseTypes)).toBe(true);
  });

  it("writes nothing non-normal, so the server drops the inherited array", () => {
    expect(normalizeSetTypesToCount(["normal", "normal", "normal"], 3)).toBeNull();
  });

  it("leaves an untouched assignment alone (no spurious override)", () => {
    const finalTypes = alignSetTypes(templateTypes, 4);
    const baseTypes = alignSetTypes(templateTypes, 4);
    expect(setTypesDiffer(finalTypes, baseTypes)).toBe(false);
  });

  it("keeps the warm-up when the coach removes a LATER set instead", () => {
    const finalTypes = alignSetTypes(["warmup", "normal", "normal"], 3);
    expect(normalizeSetTypesToCount(finalTypes, 3)).toEqual([
      "warmup",
      "normal",
      "normal",
    ]);
  });
});

// set-type.test.ts
//
// quick-260714-m57 (issue #403) — twin vectors for the Hevy-style per-set
// types (normal / warmup / failure / dropset). The SAME vectors run on:
//   - iOS:     GCFitnessCoreTests/SetTypeTests.swift
//   - Android: core/src/test/kotlin/.../schema/SetTypeTest.kt
// A drift between the three suites means the twins have diverged — fix the
// implementation, not the test.

import {
  SET_TYPES,
  type SetType,
  effectiveSetType,
  plannedSetType,
  setDisplayLabels,
  SET_TYPE_LETTERS,
} from "../set-type";

describe("SET_TYPES wire strings", () => {
  it("matches the canonical iOS raw values verbatim", () => {
    expect(SET_TYPES).toEqual(["normal", "warmup", "failure", "dropset"]);
  });
});

describe("effectiveSetType (reader-side decode)", () => {
  it("legacy set: no set_type + is_warmup true ⇒ warmup", () => {
    expect(effectiveSetType({ is_warmup: true })).toBe("warmup");
    expect(effectiveSetType({ isWarmup: true })).toBe("warmup");
  });

  it("legacy set: no set_type + is_warmup false/absent ⇒ normal", () => {
    expect(effectiveSetType({ is_warmup: false })).toBe("normal");
    expect(effectiveSetType({})).toBe("normal");
  });

  it("set_type 'failure' ⇒ failure regardless of is_warmup", () => {
    expect(effectiveSetType({ set_type: "failure", is_warmup: false })).toBe(
      "failure",
    );
    // Explicit non-warmup type overrides a stale warmup flag (sync invariant
    // means writers never produce this, but readers stay deterministic).
    expect(effectiveSetType({ set_type: "failure", is_warmup: true })).toBe(
      "failure",
    );
    // camelCase session shape too.
    expect(effectiveSetType({ setType: "dropset", isWarmup: false })).toBe(
      "dropset",
    );
  });

  it("unknown set_type 'xyz' ⇒ falls back to is_warmup", () => {
    expect(effectiveSetType({ set_type: "xyz", is_warmup: true })).toBe(
      "warmup",
    );
    expect(effectiveSetType({ set_type: "xyz", is_warmup: false })).toBe(
      "normal",
    );
  });

  it("set_type-only warmup (is_warmup absent) ⇒ warmup", () => {
    expect(effectiveSetType({ set_type: "warmup" })).toBe("warmup");
  });

  it("explicit set_type 'normal' behaves like absent (twin normalization)", () => {
    // iOS/Android normalize "normal" to nil/null and fall back to the flag.
    expect(effectiveSetType({ set_type: "normal", is_warmup: false })).toBe(
      "normal",
    );
    expect(effectiveSetType({ set_type: "normal", is_warmup: true })).toBe(
      "warmup",
    );
  });
});

describe("plannedSetType (template setTypesBySet resolution)", () => {
  const types = ["warmup", "xyz", "failure"];

  it("resolves known entries; unknown/short/missing coerce to normal", () => {
    expect(plannedSetType(0, types)).toBe("warmup");
    expect(plannedSetType(1, types)).toBe("normal"); // unknown raw
    expect(plannedSetType(2, types)).toBe("failure");
    expect(plannedSetType(3, types)).toBe("normal"); // short array
    expect(plannedSetType(0, null)).toBe("normal"); // missing array
    expect(plannedSetType(0, undefined)).toBe("normal");
    expect(plannedSetType(-1, types)).toBe("normal");
  });
});

describe("setDisplayLabels (Hevy numbering rule)", () => {
  it("[warmup, normal, normal, dropset, normal] ⇒ [W, 1, 2, D, 3]", () => {
    const input: SetType[] = ["warmup", "normal", "normal", "dropset", "normal"];
    expect(setDisplayLabels(input)).toEqual(["W", "1", "2", "D", "3"]);
  });

  it("edge cases", () => {
    expect(setDisplayLabels(["failure"])).toEqual(["F"]);
    expect(setDisplayLabels([])).toEqual([]);
    expect(setDisplayLabels(["normal", "normal"])).toEqual(["1", "2"]);
  });

  it("letters map: W / F / D, null for normal", () => {
    expect(SET_TYPE_LETTERS.warmup).toBe("W");
    expect(SET_TYPE_LETTERS.failure).toBe("F");
    expect(SET_TYPE_LETTERS.dropset).toBe("D");
    expect(SET_TYPE_LETTERS.normal).toBeNull();
  });
});

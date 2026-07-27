/** @jest-environment jsdom */
// muscle-group-preferences.test.ts — #578
//
// jsdom (the repo default is `node`) because the round-trip block exercises the
// real `window.localStorage`; the pure parsers below would run in either.
//
// Locks the restore semantics the chart depends on. The two that matter most
// (and that a future refactor would plausibly "simplify" away):
//   - a stored EMPTY array is a deliberate "untick everything", NOT a missing
//     value, so it must NOT fall back to the defaults;
//   - the stored selection is never intersected with the client's available
//     groups here — that intersection is the CHART's job, so walking the roster
//     can't erase a group from the preference.

import {
  DEFAULT_TARGET_MAX,
  DEFAULT_TARGET_MIN,
  MUSCLE_PREFERENCE_KEYS,
  clampTargetZone,
  parseSelectedMuscleGroups,
  parseTargetBound,
  readMusclePreferences,
  writeSelectedMuscleGroups,
  writeTargetZone,
} from "../muscle-group-preferences";

describe("parseSelectedMuscleGroups", () => {
  it("returns null when nothing is stored (caller seeds its defaults)", () => {
    expect(parseSelectedMuscleGroups(null)).toBeNull();
  });

  it("returns null for unparseable JSON", () => {
    expect(parseSelectedMuscleGroups("{not json")).toBeNull();
  });

  it("returns null when the stored value is not an array", () => {
    expect(parseSelectedMuscleGroups('{"back":true}')).toBeNull();
    expect(parseSelectedMuscleGroups('"back"')).toBeNull();
    expect(parseSelectedMuscleGroups("null")).toBeNull();
  });

  it("restores a full selection in canonical display order, not write order", () => {
    // Written in the order the coach happened to click them.
    const raw = JSON.stringify(["legs", "back", "core", "chest"]);
    expect(parseSelectedMuscleGroups(raw)).toEqual([
      "back",
      "chest",
      "legs",
      "core",
    ]);
  });

  it("restores an EMPTY selection as empty — not as the defaults", () => {
    expect(parseSelectedMuscleGroups("[]")).toEqual([]);
  });

  it("drops unknown / non-string entries", () => {
    const raw = JSON.stringify(["back", "quadriceps", 7, null, "chest"]);
    expect(parseSelectedMuscleGroups(raw)).toEqual(["back", "chest"]);
  });

  it("dedupes repeated entries", () => {
    expect(parseSelectedMuscleGroups('["back","back","back"]')).toEqual(["back"]);
  });
});

describe("parseTargetBound", () => {
  it("accepts a whole count, including 0", () => {
    expect(parseTargetBound("12")).toBe(12);
    expect(parseTargetBound("0")).toBe(0);
  });

  it("rejects absent, empty, non-numeric, negative, fractional and absurd values", () => {
    expect(parseTargetBound(null)).toBeNull();
    expect(parseTargetBound("")).toBeNull();
    expect(parseTargetBound("   ")).toBeNull();
    expect(parseTargetBound("abc")).toBeNull();
    expect(parseTargetBound("-3")).toBeNull();
    expect(parseTargetBound("12.5")).toBeNull();
    expect(parseTargetBound("100000")).toBeNull();
  });
});

describe("clampTargetZone", () => {
  it("passes an already-valid band through", () => {
    expect(clampTargetZone(12, 20)).toEqual({ min: 12, max: 20 });
  });

  it("un-inverts a band whose min exceeds its max", () => {
    expect(clampTargetZone(30, 20)).toEqual({ min: 20, max: 20 });
  });

  it("floors a negative edge at 0", () => {
    expect(clampTargetZone(-5, 20)).toEqual({ min: 0, max: 20 });
  });

  it("falls back to the defaults for a non-finite edge instead of going NaN", () => {
    expect(clampTargetZone(Number.NaN, 20)).toEqual({ min: 12, max: 20 });
    expect(clampTargetZone(8, Number.NaN)).toEqual({ min: 8, max: 20 });
    expect(clampTargetZone(Number.NaN, Number.NaN)).toEqual({
      min: DEFAULT_TARGET_MIN,
      max: DEFAULT_TARGET_MAX,
    });
  });
});

describe("localStorage round-trip", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads back nothing when the store is empty", () => {
    expect(readMusclePreferences()).toEqual({
      selected: null,
      targetMin: null,
      targetMax: null,
    });
  });

  it("round-trips a selection + target zone", () => {
    writeSelectedMuscleGroups(new Set(["shoulders", "back"]));
    writeTargetZone(10, 18);
    expect(readMusclePreferences()).toEqual({
      selected: ["back", "shoulders"],
      targetMin: 10,
      targetMax: 18,
    });
  });

  it("persists an empty selection as [] so it restores as empty", () => {
    writeSelectedMuscleGroups(new Set());
    expect(window.localStorage.getItem(MUSCLE_PREFERENCE_KEYS.selected)).toBe("[]");
    expect(readMusclePreferences().selected).toEqual([]);
  });

  it("stores the selection in canonical order regardless of insertion order", () => {
    writeSelectedMuscleGroups(["core", "chest", "back"]);
    expect(window.localStorage.getItem(MUSCLE_PREFERENCE_KEYS.selected)).toBe(
      JSON.stringify(["back", "chest", "core"]),
    );
  });

  it("ignores unknown groups on write", () => {
    writeSelectedMuscleGroups(["back", "not-a-group"]);
    expect(readMusclePreferences().selected).toEqual(["back"]);
  });

  it("degrades to no-preference when the stored value is corrupt", () => {
    window.localStorage.setItem(MUSCLE_PREFERENCE_KEYS.selected, "¯\\_(ツ)_/¯");
    window.localStorage.setItem(MUSCLE_PREFERENCE_KEYS.targetMin, "twelve");
    expect(readMusclePreferences()).toEqual({
      selected: null,
      targetMin: null,
      targetMax: null,
    });
  });

  it("survives a localStorage that throws (Safari private mode / blocked site data)", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      expect(readMusclePreferences()).toEqual({
        selected: null,
        targetMin: null,
        targetMax: null,
      });
      expect(() => writeSelectedMuscleGroups(["back"])).not.toThrow();
      expect(() => writeTargetZone(12, 20)).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

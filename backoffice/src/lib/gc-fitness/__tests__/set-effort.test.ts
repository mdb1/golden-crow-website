// set-effort.test.ts
//
// gc-fitness #1623 — twin vectors for the forgiving per-set RPE read. The SAME
// vectors run on the iOS (GCFitnessCore) and Android (core) `normalizedRpe`
// twins. A drift means the twins diverged — fix the implementation.

import { formatRpe, normalizedRpe, rirFromRpe, rpeField } from "../set-effort";
import vectors from "./twin-vectors/set-effort-vectors.json";

describe("normalizedRpe", () => {
  it.each([
    ["absent", undefined],
    ["null", null],
    ["a string", "8"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a boolean", true],
    ["5.7 (rounds to 5.5, below range)", 5.7],
    ["11 (above range)", 11],
    ["10.3 (rounds to 10.5, above range)", 10.3],
    ["0", 0],
    ["-8", -8],
  ])("drops %s", (_label, raw) => {
    expect(normalizedRpe(raw)).toBeUndefined();
  });

  it.each([
    [5.9, 6],
    [6, 6],
    [7.3, 7.5],
    [7.2, 7],
    [8, 8],
    [8.5, 8.5],
    [9.74, 9.5],
    [10, 10],
    [10.2, 10],
  ])("normalizes %p → %p", (raw, expected) => {
    expect(normalizedRpe(raw)).toBe(expected);
  });
});

describe("rpeField", () => {
  it("carries a valid RPE and omits the key otherwise", () => {
    expect(rpeField(8.4)).toEqual({ rpe: 8.5 });
    expect(rpeField(undefined)).toEqual({});
    expect("rpe" in rpeField("9")).toBe(false);
  });
});

describe("rirFromRpe", () => {
  it("is 10 − RPE", () => {
    expect(rirFromRpe(10)).toBe(0);
    expect(rirFromRpe(8)).toBe(2);
    expect(rirFromRpe(7.5)).toBe(2.5);
    expect(rirFromRpe(6)).toBe(4);
  });
});

describe("formatRpe", () => {
  it("prints integers without a decimal", () => {
    expect(formatRpe(8, "es")).toBe("8");
    expect(formatRpe(8, "en")).toBe("8");
    expect(formatRpe(10, "es")).toBe("10");
  });

  it("uses the locale's decimal separator for halves", () => {
    expect(formatRpe(8.5, "es")).toBe("8,5");
    expect(formatRpe(8.5, "en")).toBe("8.5");
  });
});

// ── Shared vectors (`twin-vectors/set-effort-vectors.json`, pinned copy of
// gc-fitness `twin-vectors/`) — the SAME file Swift and Kotlin run. The coach
// always reads RPE, so only the RPE display cases apply here.

describe("set-effort twin vectors", () => {
  it.each(vectors.normalizedRpe.map((c) => [JSON.stringify(c.raw), c.raw, c.expected] as const))(
    "normalizedRpe(%s)",
    (_label, raw, expected) => {
      expect(normalizedRpe(raw)).toBe(expected ?? undefined);
      expect(rpeField(raw)).toEqual(expected === null ? {} : { rpe: expected });
    },
  );

  it.each(
    vectors.display
      .filter((c) => c.mode === "rpe")
      .map((c) => [c.rpe, c.locale, c.expected] as const),
  )("formatRpe(%s, %s)", (rpe, locale, expected) => {
    expect(formatRpe(rpe, locale)).toBe(expected);
  });

  it.each(
    vectors.display
      .filter((c) => c.mode === "rir")
      .map((c) => [c.rpe, c.locale, c.expected] as const),
  )("RIR of %s in %s", (rpe, locale, expected) => {
    expect(formatRpe(rirFromRpe(rpe), locale)).toBe(expected);
  });
});

// __tests__/fexd-vocabulary-map.test.ts
//
// Unit tests for plan 24-01 Task 1 — the pure-function FEXD → GC canonical
// vocabulary mapper. Covers the locked 17-key mapping defined in
// 24-PATTERNS.md (Pattern 5) and the dedupe / passthrough / empty contracts.
//
// No firebase-admin imports — this module is Foundation-equivalent TS.
// The GC canonical MUSCLE_GROUPS list is copied inline so this test does
// NOT couple to backoffice/src/lib/gc-fitness/exercise-vocabulary.ts (the
// scripts/ + backoffice/ packages share no module resolution path).

import { mapFexdMuscles, FEXD_TO_GC_MUSCLE } from "../fexd-vocabulary-map";

// GC canonical MUSCLE_GROUPS — 16 items, inlined verbatim from
// backoffice/src/lib/gc-fitness/exercise-vocabulary.ts (alphabetical).
// If the canonical list changes, both this literal AND the values in
// FEXD_TO_GC_MUSCLE need updating in lockstep (same-source-of-truth
// contract documented in 24-PATTERNS.md Pattern 5).
const GC_MUSCLE_GROUPS = new Set([
  "abs",
  "arms",
  "back",
  "biceps",
  "calves",
  "cardio",
  "chest",
  "core",
  "flexibility",
  "forearms",
  "glutes",
  "hamstrings",
  "legs",
  "quadriceps",
  "shoulders",
  "triceps",
]);

describe("FEXD_TO_GC_MUSCLE coverage", () => {
  it("covers exactly 17 known FEXD muscle names", () => {
    expect(Object.keys(FEXD_TO_GC_MUSCLE)).toHaveLength(17);
  });

  it("every mapped value is a member of GC canonical MUSCLE_GROUPS", () => {
    for (const [fexd, gc] of Object.entries(FEXD_TO_GC_MUSCLE)) {
      expect(GC_MUSCLE_GROUPS.has(gc)).toBe(true);
      // Improve diagnostic when a value drifts:
      if (!GC_MUSCLE_GROUPS.has(gc)) {
        throw new Error(
          `FEXD_TO_GC_MUSCLE['${fexd}'] = '${gc}' is not a canonical GC muscle group`,
        );
      }
    }
  });
});

describe("mapFexdMuscles", () => {
  it("maps abdominals → abs, lats/middle back → back, dedupes overlap", () => {
    expect(mapFexdMuscles(["abdominals", "lats", "middle back"])).toEqual([
      "abs",
      "back",
    ]);
  });

  it("passes unknown values through unchanged (caller can detect drift)", () => {
    expect(mapFexdMuscles(["unknown-thing"])).toEqual(["unknown-thing"]);
  });

  it("returns [] for empty input", () => {
    expect(mapFexdMuscles([])).toEqual([]);
  });
});

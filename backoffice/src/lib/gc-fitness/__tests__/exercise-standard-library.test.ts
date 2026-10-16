// __tests__/exercise-standard-library.test.ts
//
// The generated standard library (`std-*` exercises) is what
// `scripts/sync-standard-exercise-library.ts` writes to production, keyed by
// `exerciseId`. Two properties matter more than any single entry:
//   - ids are UNIQUE (a duplicate silently overwrites another exercise's doc);
//   - ids are STABLE (a rename orphans the old doc and every workout that points
//     at it — the "twin id splits history" incident class, gc-fitness #1111).
// Plus the vocabulary contract with iOS/Android (muscle groups, equipment,
// metric) and the shape the sync script relies on.

import { createHash } from "node:crypto";

import {
  RETIRED_STANDARD_LIBRARY_IDS,
  STANDARD_LIBRARY_EXERCISES,
  STANDARD_LIBRARY_SOURCE,
  STANDARD_LIBRARY_TAG,
  standardLibraryPreviewTitle,
} from "../exercise-standard-library";
import { EQUIPMENT, MUSCLE_GROUPS } from "../exercise-vocabulary";

const ids = STANDARD_LIBRARY_EXERCISES.map((e) => e.exerciseId);

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))].sort();
}

describe("standard exercise library", () => {
  it("exports the source/tag constants the sync script stamps on docs", () => {
    expect(STANDARD_LIBRARY_TAG).toBe("standard-library");
    expect(STANDARD_LIBRARY_SOURCE).toBe("wger");
  });

  it("every exerciseId is unique", () => {
    expect(duplicates(ids)).toEqual([]);
  });

  it("ids are pinned: 289 entries, stable list (renames orphan production docs)", () => {
    // If you ADD exercises, update both numbers. If this fails without an
    // intentional add, an id changed — that orphans the existing Firestore doc.
    // #451: 303 → 289 — the 14 exact twins in RETIRED_STANDARD_LIBRARY_IDS
    // were removed (only removals; no surviving id changed).
    expect(ids.length).toBe(289);
    expect(createHash("sha256").update(ids.join("\n")).digest("hex")).toBe(
      "b47c8867a45fd3c21cb7849002b53f90a16475d168492e6ac177dde157a0d28d",
    );
  });

  it("ids are std-<group>-<slug>, safe as Firestore doc ids", () => {
    const bad = ids.filter(
      (id) => !/^std-[a-z0-9_]+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.includes("/") || /^__.*__$/.test(id),
    );
    expect(bad).toEqual([]);
  });

  it("id is derived from the base name + equipment (diacritics/punctuation slugged)", () => {
    const first = STANDARD_LIBRARY_EXERCISES[0];
    expect(first.exerciseId).toBe("std-chest-bench-press-barbell");
    expect(first.name).toEqual({ en: "Bench Press (Barbell)", es: "Press de banca (Barra)" });
    expect(first.equipment).toEqual(["barbell"]);
    expect(first.bodyParts).toEqual(["CHEST"]);
    // "Step-Up" / "Pull-up Bar" style names collapse punctuation to single dashes.
    expect(ids.every((id) => !id.includes("--"))).toBe(true);
  });

  it("every entry uses only the shared muscle-group / equipment vocabulary", () => {
    const groups = new Set<string>(MUSCLE_GROUPS);
    const equipment = new Set<string>(EQUIPMENT);
    const bad = STANDARD_LIBRARY_EXERCISES.filter(
      (e) =>
        e.muscleGroups.length === 0 ||
        e.muscleGroups.some((g) => !groups.has(g)) ||
        e.equipment.length !== 1 ||
        e.equipment.some((q) => !equipment.has(q)),
    ).map((e) => e.exerciseId);
    expect(bad).toEqual([]);
  });

  it("metric is reps or time (30 timed holds/warm-ups), and every entry is tagged", () => {
    expect(new Set(STANDARD_LIBRARY_EXERCISES.map((e) => e.metric))).toEqual(new Set(["reps", "time"]));
    expect(STANDARD_LIBRARY_EXERCISES.filter((e) => e.metric === "time")).toHaveLength(30);
    expect(STANDARD_LIBRARY_EXERCISES.every((e) => e.tags.length === 1 && e.tags[0] === STANDARD_LIBRARY_TAG)).toBe(true);
  });

  it("every entry has content: bilingual name, overview, target muscles", () => {
    const bad = STANDARD_LIBRARY_EXERCISES.filter(
      (e) => !e.name.en.trim() || !e.name.es.trim() || !e.overview.trim() || e.targetMuscles.length === 0,
    ).map((e) => e.exerciseId);
    expect(bad).toEqual([]);
  });

  it("keywords are trimmed, non-empty, unique, and include both base names + equipment combos", () => {
    for (const e of STANDARD_LIBRARY_EXERCISES) {
      expect(e.keywords.every((k) => k === k.trim() && k.length > 0)).toBe(true);
      expect(duplicates(e.keywords)).toEqual([]);
    }
    const first = STANDARD_LIBRARY_EXERCISES[0];
    expect(first.keywords.slice(0, 6)).toEqual([
      "Bench Press",
      "Press de banca",
      "Bench Press Barbell",
      "Barbell Bench Press",
      "Press de banca Barra",
      "Barra Press de banca",
    ]);
  });

  it("standardLibraryPreviewTitle is the English name", () => {
    expect(standardLibraryPreviewTitle(STANDARD_LIBRARY_EXERCISES[0])).toBe("Bench Press (Barbell)");
  });

  // Regression (#451): the same exercise was generated under two group slugs,
  // so the library held two DIFFERENT ids with the SAME display name (19 English
  // names) — a coach picking either one split the client's history/PRs between
  // twin ids (the #1111 class). Exact twins were removed from the source (see
  // RETIRED_STANDARD_LIBRARY_IDS); genuinely different exercises that shared a
  // name (chest vs triceps dip; timed warm-up vs rep drill) got display names.
  it("retired twin ids are gone from the source and point at a surviving canonical id", () => {
    const live = new Set(ids);
    const retired = Object.entries(RETIRED_STANDARD_LIBRARY_IDS);
    expect(retired).toHaveLength(14);
    for (const [gone, canonical] of retired) {
      expect(live.has(gone)).toBe(false);
      expect(live.has(canonical)).toBe(true);
    }
  });

  it("display-name overrides keep the id derived from baseEn", () => {
    const byId = new Map(STANDARD_LIBRARY_EXERCISES.map((e) => [e.exerciseId, e]));
    expect(byId.get("std-chest-dip-bodyweight")?.name).toEqual({
      en: "Chest Dip (Bodyweight)",
      es: "Fondo para pecho (Peso corporal)",
    });
    expect(byId.get("std-triceps-dip-machine")?.name.en).toBe("Triceps Dip (Machine)");
    expect(byId.get("std-warmup-high-knees-bodyweight")?.name.en).toBe("High Knees Warm-up (Bodyweight)");
    expect(byId.get("std-cardio-high-knees-bodyweight")?.name.en).toBe("High Knees (Bodyweight)");
    // The old base name stays searchable.
    expect(byId.get("std-chest-dip-bodyweight")?.keywords).toEqual(expect.arrayContaining(["Dip", "Chest Dip"]));
  });

  it("no two standard exercises share a Spanish display name either", () => {
    expect(duplicates(STANDARD_LIBRARY_EXERCISES.map((e) => e.name.es))).toEqual([]);
  });

  it("no two standard exercises share a display name", () => {
    expect(duplicates(STANDARD_LIBRARY_EXERCISES.map((e) => e.name.en))).toEqual([]);
  });
});

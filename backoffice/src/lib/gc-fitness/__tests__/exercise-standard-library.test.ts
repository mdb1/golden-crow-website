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

  it("ids are pinned: 303 entries, stable list (renames orphan production docs)", () => {
    // If you ADD exercises, update both numbers. If this fails without an
    // intentional add, an id changed — that orphans the existing Firestore doc.
    expect(ids.length).toBe(303);
    expect(createHash("sha256").update(ids.join("\n")).digest("hex")).toBe(
      "be423490a09d31b3840e0eb467c64f4f5a994f4bf7e094a679635e73e2f24db3",
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

  // FINDING: the same exercise is generated under two group slugs, so the
  // library holds two DIFFERENT ids with the SAME display name — e.g.
  // "Front Squat (Barbell)" exists as both std-legs-… and std-quadriceps-…
  // (19 English names, 18 Spanish). A coach picking either one splits the
  // client's history/PRs between twin ids (the #1111 class). Pinned here so a
  // de-duplication is noticed; flip to `it` once the library is deduplicated.
  it("CURRENT: 19 English display names are shared by two ids", () => {
    expect(duplicates(STANDARD_LIBRARY_EXERCISES.map((e) => e.name.en))).toHaveLength(19);
    const frontSquat = STANDARD_LIBRARY_EXERCISES.filter((e) => e.name.en === "Front Squat (Barbell)").map(
      (e) => e.exerciseId,
    );
    expect(frontSquat).toHaveLength(2);
  });

  it.failing("no two standard exercises share a display name", () => {
    expect(duplicates(STANDARD_LIBRARY_EXERCISES.map((e) => e.name.en))).toEqual([]);
  });
});

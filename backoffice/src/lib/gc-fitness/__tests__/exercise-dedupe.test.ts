// __tests__/exercise-dedupe.test.ts
//
// dedupeExercisesByDisplayName collapses the double-seeded standard-library
// duplicates (numeric-id doc + its broken-media `std-*` twin) to one row per
// display name, preferring the doc whose media will actually render.

import {
  dedupeExercisesByDisplayName,
  type DedupeExerciseRow,
} from "../exercise-dedupe";

interface RowSpec {
  id: string;
  en: string;
  es?: string | null;
  gifUrl?: string | null;
  imageUrl?: string | null;
  thumbnailURL?: string | null;
  mediaURL?: string | null;
  ownerId?: string | null;
  updatedAt?: string | null;
}

function row(p: RowSpec): DedupeExerciseRow {
  return {
    id: p.id,
    name: { en: p.en, es: p.es ?? null },
    gifUrl: p.gifUrl ?? null,
    imageUrl: p.imageUrl ?? null,
    thumbnailURL: p.thumbnailURL ?? null,
    mediaURL: p.mediaURL ?? null,
    ownerId: p.ownerId ?? null,
    updatedAt: p.updatedAt ?? null,
  };
}

describe("dedupeExercisesByDisplayName", () => {
  it("keeps the renderable-media numeric doc over its broken gs:// std-* twin", () => {
    const numeric = row({
      id: "1167",
      en: "Chest Stretch (Bodyweight)",
      gifUrl:
        "https://firebasestorage.googleapis.com/v0/b/x/o/library-gifs%2F1167.gif?alt=media&token=abc",
    });
    const stdTwin = row({
      id: "std-flexibility-chest-stretch-bodyweight",
      en: "Chest Stretch (Bodyweight)",
      gifUrl: "gs://x.firebasestorage.app/exercises/library-gifs/1167.gif",
    });

    // Order-independent: std-* first OR numeric first → numeric always wins.
    expect(dedupeExercisesByDisplayName([stdTwin, numeric]).map((r) => r.id)).toEqual([
      "1167",
    ]);
    expect(dedupeExercisesByDisplayName([numeric, stdTwin]).map((r) => r.id)).toEqual([
      "1167",
    ]);
  });

  it("matches case- and whitespace-insensitively", () => {
    const a = row({ id: "1", en: "Cat-Cow (Bodyweight)", gifUrl: "https://a/g.gif" });
    const b = row({ id: "std-cat-cow", en: "  cat-cow (bodyweight) " });
    expect(dedupeExercisesByDisplayName([a, b])).toHaveLength(1);
  });

  it("keeps unique std-* exercises that have no numeric twin", () => {
    const unique = row({
      id: "std-flexibility-butterfly-stretch-bodyweight",
      en: "Butterfly Stretch (Bodyweight)",
      gifUrl: "gs://x/butterfly.gif",
    });
    const other = row({ id: "0327", en: "Chest-Supported Row (Dumbbell)" });
    const out = dedupeExercisesByDisplayName([unique, other]);
    expect(out.map((r) => r.id).sort()).toEqual([
      "0327",
      "std-flexibility-butterfly-stretch-bodyweight",
    ]);
  });

  it("never hides a trainer's own exercise behind a same-named library doc", () => {
    const owned = row({ id: "own-1", en: "My Stretch", ownerId: "trainer-1" });
    const library = row({ id: "1259", en: "My Stretch", gifUrl: "https://a/g.gif" });
    expect(dedupeExercisesByDisplayName([library, owned]).map((r) => r.id)).toEqual([
      "own-1",
    ]);
  });

  it("falls back to recency when media + id family tie", () => {
    const older = row({ id: "0100", en: "Squat", updatedAt: "2026-01-01" });
    const newer = row({ id: "0200", en: "Squat", updatedAt: "2026-06-01" });
    expect(dedupeExercisesByDisplayName([older, newer]).map((r) => r.id)).toEqual([
      "0200",
    ]);
  });

  it("is a no-op when there are no duplicates", () => {
    const rows = [
      row({ id: "a", en: "A" }),
      row({ id: "b", en: "B" }),
      row({ id: "c", en: "C" }),
    ];
    expect(dedupeExercisesByDisplayName(rows).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

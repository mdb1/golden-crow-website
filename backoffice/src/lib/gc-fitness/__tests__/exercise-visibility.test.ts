// exercise-visibility.test.ts (legacy exercise retirement)
//
// Unit coverage for `isPickableExercise` — the single source of truth for
// which exercises appear in the backoffice choice surfaces (picker,
// multi-add dialog, library page).
//
// The CRITICAL case is the `standard_alias` shape: snapToRow maps ANY unknown
// wire `source` (including `"standard_alias"`, 24 such alias docs in prod) to
// `"trainer"`. A bare `source === "trainer"` branch would WRONGLY keep those
// alias docs pickable. All 24 alias docs have `ownerId: null`; all 38 genuine
// trainer-authored docs have `ownerId` set — hence the `ownerId != null` guard.

import {
  isPickableExercise,
  STANDARD_LIBRARY_TAG,
} from "@/lib/gc-fitness/exercise-visibility";

describe("isPickableExercise", () => {
  it("exposes the standard-library tag constant", () => {
    expect(STANDARD_LIBRARY_TAG).toBe("standard-library");
  });

  it("keeps trainer-authored exercises (source trainer, ownerId set)", () => {
    expect(
      isPickableExercise({
        deleted: false,
        source: "trainer",
        ownerId: "uid-1",
        tags: [],
      }),
    ).toBe(true);
  });

  it("keeps standard-library-tagged exercises even on a wger source", () => {
    expect(
      isPickableExercise({
        deleted: false,
        source: "wger",
        ownerId: null,
        tags: [STANDARD_LIBRARY_TAG],
      }),
    ).toBe(true);
  });

  it("hides legacy wger exercises without the standard-library tag", () => {
    expect(
      isPickableExercise({
        deleted: false,
        source: "wger",
        ownerId: null,
        tags: [],
      }),
    ).toBe(false);
  });

  it("hides legacy free-exercise-db exercises without the standard-library tag", () => {
    expect(
      isPickableExercise({
        deleted: false,
        source: "free-exercise-db",
        ownerId: null,
        tags: [],
      }),
    ).toBe(false);
  });

  it("hides standard_alias docs (snapToRow → source trainer, ownerId null)", () => {
    // This is exactly how a `standard_alias` wire doc surfaces post-snapToRow:
    // the unknown source coerces to "trainer" but the alias never has an owner.
    expect(
      isPickableExercise({
        deleted: false,
        source: "trainer",
        ownerId: null,
        tags: [],
      }),
    ).toBe(false);
  });

  it("hides a deleted exercise even when it carries the standard-library tag", () => {
    expect(
      isPickableExercise({
        deleted: true,
        source: "wger",
        ownerId: null,
        tags: [STANDARD_LIBRARY_TAG],
      }),
    ).toBe(false);
  });

  it("hides a deleted trainer exercise", () => {
    expect(
      isPickableExercise({
        deleted: true,
        source: "trainer",
        ownerId: "uid-1",
        tags: [],
      }),
    ).toBe(false);
  });

  it("hides a non-trainer row with undefined tags", () => {
    expect(
      isPickableExercise({
        deleted: false,
        source: "free-exercise-db",
        ownerId: null,
        tags: undefined,
      }),
    ).toBe(false);
  });
});

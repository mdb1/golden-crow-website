import {
  EMPTY_FAVORITES,
  favoriteIdSet,
  favoritesFieldForKind,
  filterFavoritesOnly,
  isFavorite,
  normalizeFavorites,
  sortFavoritesFirst,
  type CoachFavorites,
} from "../favorites";

const FAVS: CoachFavorites = {
  exerciseIds: ["ex-2", "ex-5"],
  workoutTemplateIds: ["wkt-1"],
  habitTemplateIds: [],
};

interface Row {
  id: string;
}
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));
const getId = (r: Row) => r.id;

describe("favoritesFieldForKind", () => {
  it("maps each kind to its array field", () => {
    expect(favoritesFieldForKind("exercise")).toBe("exerciseIds");
    expect(favoritesFieldForKind("workoutTemplate")).toBe("workoutTemplateIds");
    expect(favoritesFieldForKind("habitTemplate")).toBe("habitTemplateIds");
  });
});

describe("normalizeFavorites", () => {
  it("defaults missing/invalid arrays to empty and drops non-strings", () => {
    expect(normalizeFavorites(null)).toEqual(EMPTY_FAVORITES);
    expect(
      normalizeFavorites({
        exerciseIds: ["a", 3, null, "b"],
        workoutTemplateIds: "nope",
      }),
    ).toEqual({
      exerciseIds: ["a", "b"],
      workoutTemplateIds: [],
      habitTemplateIds: [],
    });
  });
});

describe("favoriteIdSet / isFavorite", () => {
  it("returns membership for the right kind", () => {
    const set = favoriteIdSet(FAVS, "exercise");
    expect(set.has("ex-2")).toBe(true);
    expect(set.has("ex-1")).toBe(false);
    expect(isFavorite(FAVS, "exercise", "ex-5")).toBe(true);
    expect(isFavorite(FAVS, "workoutTemplate", "wkt-1")).toBe(true);
    expect(isFavorite(FAVS, "habitTemplate", "anything")).toBe(false);
  });
});

describe("sortFavoritesFirst", () => {
  const favIds = new Set(["ex-5", "ex-2"]);

  it("moves favorites ahead, preserving original order within each group (stable)", () => {
    const input = rows("ex-1", "ex-2", "ex-3", "ex-5", "ex-4");
    expect(sortFavoritesFirst(input, getId, favIds).map(getId)).toEqual([
      // favorites keep input order (ex-2 before ex-5), not favIds order
      "ex-2",
      "ex-5",
      // rest keep input order
      "ex-1",
      "ex-3",
      "ex-4",
    ]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = rows("ex-1", "ex-2");
    const out = sortFavoritesFirst(input, getId, favIds);
    expect(out).not.toBe(input);
    expect(input.map(getId)).toEqual(["ex-1", "ex-2"]);
  });

  it("is a no-op ordering when nothing is favorited", () => {
    const input = rows("a", "b", "c");
    expect(sortFavoritesFirst(input, getId, new Set()).map(getId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("filterFavoritesOnly", () => {
  const favIds = new Set(["ex-2", "ex-5"]);
  const input = rows("ex-1", "ex-2", "ex-3", "ex-5");

  it("returns all rows when disabled", () => {
    expect(filterFavoritesOnly(input, getId, favIds, false).map(getId)).toEqual([
      "ex-1",
      "ex-2",
      "ex-3",
      "ex-5",
    ]);
  });

  it("keeps only favorites when enabled", () => {
    expect(filterFavoritesOnly(input, getId, favIds, true).map(getId)).toEqual([
      "ex-2",
      "ex-5",
    ]);
  });
});

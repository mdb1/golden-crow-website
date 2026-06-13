// favorites.ts
//
// PURE helpers + shared types for coach favorites (#297). No Firebase, no React
// — so the sort/filter behavior is unit-testable in isolation and reusable
// across every list/search surface (exercises, workout templates, habit
// templates) AND the workout generator.
//
// A coach's favorites live in one doc `coach_favorites/{trainerUid}` with three
// id arrays. The server action layer (`favorites-actions.ts`) reads/writes that
// doc; the UI consumes it through the `useFavorites()` hook; these helpers do
// the ordering/filtering the lists need.

/** The three entity kinds a coach can favorite. */
export type FavoriteKind = "exercise" | "workoutTemplate" | "habitTemplate";

/** Wire shape of `coach_favorites/{trainerUid}` (sans `updatedAt`). */
export interface CoachFavorites {
  exerciseIds: string[];
  workoutTemplateIds: string[];
  habitTemplateIds: string[];
}

export const EMPTY_FAVORITES: CoachFavorites = {
  exerciseIds: [],
  workoutTemplateIds: [],
  habitTemplateIds: [],
};

/** The array field on `CoachFavorites` that backs a given kind. */
export function favoritesFieldForKind(
  kind: FavoriteKind,
): keyof CoachFavorites {
  switch (kind) {
    case "exercise":
      return "exerciseIds";
    case "workoutTemplate":
      return "workoutTemplateIds";
    case "habitTemplate":
      return "habitTemplateIds";
  }
}

/** Normalize a possibly-partial/untrusted favorites payload into the full shape. */
export function normalizeFavorites(
  raw: Partial<Record<keyof CoachFavorites, unknown>> | null | undefined,
): CoachFavorites {
  const pick = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    exerciseIds: pick(raw?.exerciseIds),
    workoutTemplateIds: pick(raw?.workoutTemplateIds),
    habitTemplateIds: pick(raw?.habitTemplateIds),
  };
}

/** The favorited id set for a given kind — O(1) membership tests for the UI. */
export function favoriteIdSet(
  favorites: CoachFavorites,
  kind: FavoriteKind,
): Set<string> {
  return new Set(favorites[favoritesFieldForKind(kind)]);
}

export function isFavorite(
  favorites: CoachFavorites,
  kind: FavoriteKind,
  id: string,
): boolean {
  return favorites[favoritesFieldForKind(kind)].includes(id);
}

/**
 * STABLE "favorites first" ordering: favorited rows keep their original relative
 * order and move ahead of the rest (which also keep their original order).
 * Implemented by partition + concat so it's stable regardless of engine sort.
 */
export function sortFavoritesFirst<T>(
  rows: readonly T[],
  getId: (row: T) => string,
  favIds: ReadonlySet<string>,
): T[] {
  const favs: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    if (favIds.has(getId(row))) favs.push(row);
    else rest.push(row);
  }
  return [...favs, ...rest];
}

/**
 * When `enabled`, keep only favorited rows; otherwise return the input
 * unchanged. Order is preserved (callers typically sort-first beforehand).
 */
export function filterFavoritesOnly<T>(
  rows: readonly T[],
  getId: (row: T) => string,
  favIds: ReadonlySet<string>,
  enabled: boolean,
): T[] {
  if (!enabled) return [...rows];
  return rows.filter((row) => favIds.has(getId(row)));
}

// use-favorites.ts
//
// React-Query bridge for coach favorites (#297). Wraps the `listFavorites` /
// `toggleFavorite` Server Actions (`favorites-actions.ts`) and exposes a small
// surface every list/search uses:
//   - `favorites` (the three id arrays, empty until loaded)
//   - `isFavorite(kind, id)` for the star fill state
//   - `toggle(kind, id)` mutation with OPTIMISTIC update + rollback, so the star
//     flips instantly and the row re-sorts without waiting on the round-trip.
//
// One cache slot (`["gc-fitness", "favorites"]`) is shared across surfaces, so a
// star toggled on the exercises page is already reflected when the picker opens.

"use client";

import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { listFavorites, toggleFavorite } from "./favorites-actions";
import {
  EMPTY_FAVORITES,
  favoritesFieldForKind,
  isFavorite as isFavoriteIn,
  type CoachFavorites,
  type FavoriteKind,
} from "./favorites";

export const FAVORITES_QUERY_KEY = ["gc-fitness", "favorites"] as const;

/** Apply a toggle to a favorites object immutably (for optimistic cache writes). */
function applyToggle(
  current: CoachFavorites,
  kind: FavoriteKind,
  id: string,
  next: boolean,
): CoachFavorites {
  const field = favoritesFieldForKind(kind);
  const set = new Set(current[field]);
  if (next) set.add(id);
  else set.delete(id);
  return { ...current, [field]: Array.from(set) };
}

export interface UseFavoritesResult {
  favorites: CoachFavorites;
  isLoading: boolean;
  isFavorite: (kind: FavoriteKind, id: string) => boolean;
  /** Flip the favorite state for an entity (optimistic). */
  toggle: (kind: FavoriteKind, id: string) => void;
  isToggling: boolean;
}

export function useFavorites(): UseFavoritesResult {
  const queryClient = useQueryClient();

  const query = useQuery<CoachFavorites>({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: () => listFavorites(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const favorites = query.data ?? EMPTY_FAVORITES;

  const mutation = useMutation<
    CoachFavorites,
    Error,
    { kind: FavoriteKind; id: string; next: boolean },
    { previous: CoachFavorites | undefined }
  >({
    mutationFn: ({ kind, id, next }) => toggleFavorite(kind, id, next),
    onMutate: async ({ kind, id, next }) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_QUERY_KEY });
      const previous =
        queryClient.getQueryData<CoachFavorites>(FAVORITES_QUERY_KEY);
      queryClient.setQueryData<CoachFavorites>(
        FAVORITES_QUERY_KEY,
        applyToggle(previous ?? EMPTY_FAVORITES, kind, id, next),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(FAVORITES_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (server) => {
      // Reconcile with the authoritative server state (covers concurrent
      // toggles from another tab/device).
      queryClient.setQueryData(FAVORITES_QUERY_KEY, server);
    },
  });

  const isFavorite = useCallback(
    (kind: FavoriteKind, id: string) => isFavoriteIn(favorites, kind, id),
    [favorites],
  );

  const toggle = useCallback(
    (kind: FavoriteKind, id: string) => {
      const next = !isFavoriteIn(favorites, kind, id);
      mutation.mutate({ kind, id, next });
    },
    [favorites, mutation],
  );

  return {
    favorites,
    isLoading: query.isLoading,
    isFavorite,
    toggle,
    isToggling: mutation.isPending,
  };
}

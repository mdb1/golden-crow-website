// exercises-listener.ts
//
// React-Query feed for the trainer Exercise list view + the exercise pickers.
//
// The filename keeps the `-listener` suffix only to avoid churning the ~10
// import sites. It has not been a live listener since 260529, and since #1104
// it does not touch the browser Firestore SDK at all.
//
// TWO CONVERSIONS, BOTH LOAD-BEARING — do not undo either:
//
//  1. 260529 (COST) — `onSnapshot` → one-shot read. The live subscription sat
//     on the SHARED `exercises` collection, so ANY trainer editing ANY
//     exercise re-charged a full-collection re-read on EVERY other trainer's
//     open listener, and every picker mount opened another subscription.
//
//  2. 2026-09-15 / #1104 (REACHABILITY) — browser Firestore SDK → Server
//     Action. The client SDK needs a Firebase-Auth session persisted in the
//     browser, which is a DIFFERENT credential from the `GcFitnessAuthToken`
//     cookie that authenticates every other read in this backoffice. Privacy
//     browsers evict or partition the IndexedDB that session lives in — Brave
//     on mobile above all — so `auth.currentUser` came back `null` on a
//     perfectly valid session and `allow read: if isSignedIn()` denied the
//     read. The coach saw "No se pudieron cargar los ejercicios" on a page
//     that had just rendered fine. See `exercise-list-actions.ts`.
//
// REFRESH CONTRACT (replaces the listener's automatic live updates):
//   - Own edits refresh INSTANTLY: every exercise mutation site calls
//     `queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY })`
//     (ExerciseForm create/update/duplicate, exercises/client.tsx
//     soft-delete, exercise-quick-create). Invalidation marks every scoped
//     cache stale and refetches active observers immediately.
//   - OTHER trainers' edits surface on the next mount once the 5-min cache
//     goes stale. Acceptable for a near-static shared library.

"use client";

import { useQuery } from "@tanstack/react-query";

import { listExercisesForViewer } from "./exercise-list-actions";
import type { ExerciseRow } from "./exercise-row";

// Re-exported so the ~10 existing `import { type ExerciseRow } from
// "./exercises-listener"` call sites keep working. New code should import
// from `./exercise-row` directly.
export type { ExerciseRow } from "./exercise-row";
export { snapToRow, canTrainerAccessExercise } from "./exercise-row";

// Re-exported from a firebase-free module so non-listener call sites (e.g.
// ExerciseForm) can import the key without pulling this hook.
export { EXERCISES_QUERY_KEY } from "./exercises-query-key";
import { EXERCISES_QUERY_KEY } from "./exercises-query-key";
const EXERCISES_SCOPE_ALL = "all";

/**
 * Exercises feed for the trainer list view + the exercise pickers.
 *
 * `trainerUidProp` no longer filters anything — the viewer scope is applied
 * SERVER-SIDE from the verified cookie session (that is the whole point of
 * #1104; a uid read out of the browser SDK could be `null` on a signed-in
 * coach). It is still accepted, and still part of the cache key, so the
 * library page keeps a per-coach cache slot.
 *
 * `hasSnapshot` is retained for call-site compatibility (the pickers gate
 * their loading copy on it) and maps to React-Query's `isFetched`.
 */
export function useExercisesQuery(trainerUidProp?: string | null) {
  const scopeKey = trainerUidProp ?? EXERCISES_SCOPE_ALL;
  const queryKey = [...EXERCISES_QUERY_KEY, scopeKey] as const;

  const exercisesQuery = useQuery<ExerciseRow[]>({
    queryKey,
    queryFn: async () => {
      const { exercises } = await listExercisesForViewer();
      return exercises;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...exercisesQuery,
    hasSnapshot: exercisesQuery.isFetched,
  };
}

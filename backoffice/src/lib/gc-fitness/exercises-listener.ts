// exercises-listener.ts
//
// React-Query + Firestore onSnapshot bridge for the trainer Exercise list view.
//
// Why a custom hook instead of `useQuery` against a one-shot fetch:
//   - Trainers expect the table to update live when another collaborator
//     edits a doc (matches the iOS Firestore listener UX).
//   - React-Query gives us:
//       * shared cache across the route ({ list, count, fetched-at })
//       * `isLoading` / `error` boundaries the page handles uniformly
//       * `queryKey` invalidation when a Server Action mutates a doc
//         (call `queryClient.invalidateQueries({ queryKey: KEY })` from the
//         form on save).
//   - Firestore's `onSnapshot` callback delivers the live updates; we use
//     `setQueryData` to push every snapshot into the React-Query cache, so
//     subscribers re-render via the standard `useQuery` selector.
//
// Filtering: `deleted !== true` is applied client-side (Firestore index on
// `(deleted, updatedAt)` exists from 03-03; we use it server-side in the
// `query` below to avoid downloading soft-deleted docs).
// Sorting: `updatedAt desc` server-side (index from 03-03 row 3).
//
// CONTRACT NOTE: This file is OWNED BY PLAN 03-06. It mounts inside a
// `'use client'` component (`client.tsx`) and uses the named gc-fitness
// Firebase app from `gc-fitness-client.ts` (P02-11).

"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { getGCFitnessAuth } from "@/lib/firebase/gc-fitness-client";

export interface ExerciseRow {
  id: string;
  name: { en: string; es: string };
  description: { en: string; es: string };
  muscleGroups: string[];
  equipment: string[];
  mediaURL?: string | null;
  thumbnailURL?: string | null;
  youtubeURL?: string | null;
  source: "wger" | "trainer";
  ownerId: string | null;
  version: number;
  /** ISO string — converted from Firestore Timestamp at read time so React
   *  state stays serializable across SSR boundaries. */
  updatedAt: string | null;
  createdAt: string | null;
  deleted?: boolean;
}

export const EXERCISES_QUERY_KEY = ["gc-fitness", "exercises"] as const;

function snapToRow(d: QueryDocumentSnapshot<DocumentData>): ExerciseRow {
  const data = d.data();
  const toIso = (v: unknown): string | null => {
    if (
      v &&
      typeof (v as { toDate?: () => Date }).toDate === "function"
    ) {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof v === "string") return v;
    return null;
  };
  return {
    id: d.id,
    name: data.name ?? { en: "(untitled)", es: "" },
    description: data.description ?? { en: "", es: "" },
    muscleGroups: Array.isArray(data.muscleGroups) ? data.muscleGroups : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
    mediaURL: data.mediaURL ?? null,
    thumbnailURL: data.thumbnailURL ?? null,
    youtubeURL: data.youtubeURL ?? null,
    source: data.source === "wger" ? "wger" : "trainer",
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    version: typeof data.version === "number" ? data.version : 1,
    updatedAt: toIso(data.updatedAt),
    createdAt: toIso(data.createdAt),
    deleted: data.deleted === true,
  };
}

/**
 * Live-updating exercises feed for the trainer list view.
 *
 * The query subscribes once on mount and unsubscribes on unmount. React-Query
 * caches the most-recent snapshot under `EXERCISES_QUERY_KEY` so other
 * components (e.g. a future sidebar exercise count) can read from the same
 * cache without spinning up a duplicate listener.
 */
export function useExercisesQuery() {
  const queryClient = useQueryClient();

  // Mount the Firestore listener exactly once per component instance. The
  // initial-load `Promise` is resolved by the first snapshot via
  // `queryClient.setQueryData`; subsequent snapshots also push through
  // `setQueryData` so the cache + UI stay in sync.
  useEffect(() => {
    const auth = getGCFitnessAuth();
    const db = getFirestore(auth.app);
    const q = query(
      collection(db, "exercises"),
      where("deleted", "!=", true),
      orderBy("deleted"),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map(snapToRow);
        queryClient.setQueryData(EXERCISES_QUERY_KEY, rows);
      },
      (err) => {
        // Push the error into the cache so `useQuery` surfaces it.
        queryClient.setQueryData(EXERCISES_QUERY_KEY, () => {
          throw err;
        });
      },
    );

    return () => unsubscribe();
  }, [queryClient]);

  return useQuery<ExerciseRow[]>({
    queryKey: EXERCISES_QUERY_KEY,
    // The Firestore listener pushes via `setQueryData`. This `queryFn` only
    // runs if the cache is empty AND the listener hasn't yielded yet — it
    // resolves to an empty list so `isLoading` flips to false quickly. The
    // listener will overwrite the cache with the real rows shortly after.
    queryFn: () => Promise.resolve<ExerciseRow[]>([]),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

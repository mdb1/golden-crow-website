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
// Filtering (260522-hi5 Task B): server-side `deletedAt == null` filters the
// curation-pass soft-deleted wger-* docs (the Task B script writes a
// Timestamp into deletedAt). The downstream `deleted !== true` filter in
// client.tsx + exercise-picker-popover.tsx is retained to also drop the
// legacy trainer-authored `deleted: true` Bool sentinel that the P03
// `softDeleteExercise` Server Action still writes. Both filters are needed
// — Firestore can't express the union in one server-side query.
// Sorting: `updatedAt desc` server-side. Requires the composite index
// `(deletedAt ASC, updatedAt DESC)` (added to firestore.indexes.json by
// Task B and deployed to gcfitness-3476b).
//
// CONTRACT NOTE: This file is OWNED BY PLAN 03-06. It mounts inside a
// `'use client'` component (`client.tsx`) and uses the named gc-fitness
// Firebase app from `gc-fitness-client.ts` (P02-11).

"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  type QuerySnapshot,
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
  /** ISO string — curation-pass soft-delete marker (260522-hi5 Task B). Null
   *  when the doc is alive. */
  deletedAt?: string | null;
  /** For dedupe-loser wger-* docs — the surviving canonical exercise id. */
  mergedInto?: string | null;
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
    deletedAt: toIso(data.deletedAt),
    mergedInto: typeof data.mergedInto === "string" ? data.mergedInto : null,
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
  const [hasSnapshot, setHasSnapshot] = useState(false);

  // Mount the Firestore listener exactly once per component instance. The
  // initial-load `Promise` is resolved by the first snapshot via
  // `queryClient.setQueryData`; subsequent snapshots also push through
  // `setQueryData` so the cache + UI stay in sync.
  useEffect(() => {
    const auth = getGCFitnessAuth();
    const db = getFirestore(auth.app);
    const q = query(
      collection(db, "exercises"),
      where("deletedAt", "==", null),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        setHasSnapshot(true);
        const rows = snap.docs.map(snapToRow);
        queryClient.setQueryData(EXERCISES_QUERY_KEY, rows);
      },
      (err: unknown) => {
        setHasSnapshot(true);
        // Push the error into the cache so `useQuery` surfaces it.
        queryClient.setQueryData(EXERCISES_QUERY_KEY, () => {
          throw err;
        });
      },
    );

    return () => unsubscribe();
  }, [queryClient]);

  const exercisesQuery = useQuery<ExerciseRow[]>({
    queryKey: EXERCISES_QUERY_KEY,
    // The Firestore listener pushes via `setQueryData`. This `queryFn` only
    // runs if the cache is empty AND the listener hasn't yielded yet — it
    // resolves to an empty list so `isLoading` flips to false quickly. The
    // listener will overwrite the cache with the real rows shortly after.
    queryFn: () => Promise.resolve<ExerciseRow[]>([]),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    ...exercisesQuery,
    hasSnapshot,
  };
}

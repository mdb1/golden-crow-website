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
// Filtering (debug session picker-empty-deletedat, 2026-05-22): the prior
// server-side `where("deletedAt", "==", null)` filter (commit f10302d) was
// removed because Firestore's `==` predicate does NOT match docs where the
// field is ABSENT. The 260522-hi5 curation script (curate-exercise-library.ts)
// only writes `deletedAt: Timestamp` on the 222 dropped/dedupe-loser docs and
// leaves the field absent on the 78 survivors + the trainer-authored doc —
// so the server-side filter matched zero rows and the picker rendered an
// empty list. We now fetch the full collection ordered by `updatedAt desc`
// and filter `!r.deletedAt` client-side; this naturally handles both the
// absent-field case (survivors) and the Timestamp-present case (curation-
// soft-deleted) via JS truthiness on the snapToRow-normalized ISO string.
// The downstream `deleted !== true` filter in `client.tsx` +
// `exercise-picker-popover.tsx` is retained to also drop the legacy
// trainer-authored `deleted: true` Bool sentinel.
//
// FOLLOW-UP (not done here): a backfill script could write
// `deletedAt: null` on every absent doc + update the curation script to set
// `deletedAt: null` on survivors, after which the server-side filter could
// be restored. Tracked as Strategy B in the debug session — out of scope for
// this unblock.
//
// Sorting: `updatedAt desc` server-side. No composite index needed now that
// the equality predicate is gone (a single `orderBy` is served by Firestore's
// automatic single-field index).
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
   *  when the doc is alive. Filtered client-side in `useExercisesQuery`. */
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
 *
 * Curation-soft-deleted docs (`deletedAt != null`) are filtered CLIENT-SIDE
 * here — see the file header for why the server-side filter was removed.
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
    // Fetch ALL exercises ordered by recency; client-side filter drops the
    // curation-soft-deleted ones. See file header for rationale.
    const q = query(
      collection(db, "exercises"),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        setHasSnapshot(true);
        const rows = snap.docs
          .map(snapToRow)
          // `deletedAt` is a normalized ISO string here (or null). Drop any
          // doc with a non-null `deletedAt` — that catches curation-pass
          // Timestamps. Survivors (field absent on Firestore) decode to
          // `null` via `toIso` and pass through. The downstream
          // `deleted !== true` filter in the consumers (client.tsx,
          // exercise-picker-popover.tsx) drops the legacy trainer-authored
          // Bool sentinel.
          .filter((r) => !r.deletedAt);
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

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
  /**
   * 260522-mo2 Revision fix #1 (Blocker): 3-way union — `"free-exercise-db"`
   * is the on-the-wire source value seeded by Task C. PRIOR to 260522-mo2
   * this was a 2-way union `"wger" | "trainer"` and the snapToRow ternary
   * silently coerced any non-"wger" wire value to "trainer" — including
   * the new fexd value. Both surfaces were fixed together; do not collapse
   * either back to the 2-way shape.
   */
  source: "wger" | "trainer" | "free-exercise-db";
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
  /** 260522-mo2 — soft-delete cause (e.g. "superseded-by-fexd"). */
  deletedReason?: string | null;
  /** 260522-mo2 — Firebase Storage URL for the start frame. */
  imageUrl?: string | null;
  /** 260522-mo2 — Firebase Storage URL for the end frame. */
  endImageUrl?: string | null;
  /** 260522-mo2 — Firebase Storage URL for the 2-frame ping-pong preview.gif. */
  gifUrl?: string | null;
  /** 260522-mo2 — bilingual exercise step list. */
  instructions?: { en?: string[] | null; es?: string[] | null } | null;
  /**
   * Phase 24-06 — FEXD raw primary muscle tags (vocabulary distinct from
   * GC canonical `muscleGroups`). Empty array on legacy wger docs that
   * predate the FEXD enrichment, on trainer-authored docs, and on any
   * wire shape where the field is absent or malformed. Mirrors
   * `Exercise.primaryMuscles` on iOS (Phase 24-05).
   */
  primaryMuscles?: string[];
  /** Phase 24-06 — FEXD raw secondary muscle tags (e.g. "triceps"). */
  secondaryMuscles?: string[];
  /** Phase 24-06 — Exercise mechanic ("compound" | "isolation" | null). */
  mechanic?: string | null;
  /** Phase 24-06 — Difficulty level ("beginner" | "intermediate" | "expert" | null). */
  level?: string | null;
  /** Phase 24-06 — FEXD category ("strength" | "powerlifting" | "stretching" | ...). */
  category?: string | null;
  /** Phase 24-06 — Force vector ("push" | "pull" | "static" | null). */
  force?: string | null;
  /**
   * Phase 26-02 — Per-exercise prescription kind. Mirrors the iOS
   * `ExerciseMetric` enum (`Exercise.swift`) and the Zod
   * `metricSchema` (`exercise-schema.ts`). Forgiving fallback to
   * `"reps"` on absent / unknown wire values keeps every legacy doc
   * (wger seed, fexd seed, pre-26-01 trainer doc) rendering as
   * reps-based until a trainer explicitly flips it via the metric
   * chooser shipped in Plan 26-02. Consumers branch on this to render
   * the `⏱` list badge + (eventually) the time-based template /
   * active-workout UIs in 26-03 / 26-04.
   */
  metric: "reps" | "time";
}

export const EXERCISES_QUERY_KEY = ["gc-fitness", "exercises"] as const;
const EXERCISES_SCOPE_ALL = "all";

function canTrainerAccessExercise(
  row: Pick<ExerciseRow, "source" | "ownerId">,
  trainerUid: string | null,
): boolean {
  if (row.source === "wger" || row.source === "free-exercise-db") return true;
  if (!trainerUid) return false;
  return row.ownerId === trainerUid;
}

export function snapToRow(d: QueryDocumentSnapshot<DocumentData>): ExerciseRow {
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
  // 260522-mo2 Revision fix #1 — 3-way source discrimination. The prior
  // 2-way ternary (`data.source === "wger" ? "wger" : "trainer"`) silently
  // coerced the new `"free-exercise-db"` wire value to `"trainer"`, which
  // broke license-badge rendering + source filtering downstream. The
  // explicit 3-way ternary below preserves the conservative `"trainer"`
  // fallback for genuinely-unknown rawValues (Codable forgiving-decoder
  // mirror in Exercise.swift falls back to `.wger`; we pick `"trainer"`
  // here to avoid silently misattributing unknown sources as wger media).
  const rawSource = data.source;
  const source: ExerciseRow["source"] =
    rawSource === "wger"
      ? "wger"
      : rawSource === "free-exercise-db"
        ? "free-exercise-db"
        : "trainer";
  const instructions =
    data.instructions && typeof data.instructions === "object"
      ? {
          en: Array.isArray(
            (data.instructions as { en?: unknown }).en,
          )
            ? ((data.instructions as { en: string[] }).en)
            : null,
          es: Array.isArray(
            (data.instructions as { es?: unknown }).es,
          )
            ? ((data.instructions as { es: string[] }).es)
            : null,
        }
      : null;
  return {
    id: d.id,
    name: data.name ?? { en: "(untitled)", es: "" },
    description: data.description ?? { en: "", es: "" },
    muscleGroups: Array.isArray(data.muscleGroups) ? data.muscleGroups : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
    mediaURL: data.mediaURL ?? null,
    thumbnailURL: data.thumbnailURL ?? null,
    youtubeURL: data.youtubeURL ?? null,
    source,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    version: typeof data.version === "number" ? data.version : 1,
    updatedAt: toIso(data.updatedAt),
    createdAt: toIso(data.createdAt),
    deleted: data.deleted === true,
    deletedAt: toIso(data.deletedAt),
    mergedInto: typeof data.mergedInto === "string" ? data.mergedInto : null,
    deletedReason:
      typeof data.deletedReason === "string" ? data.deletedReason : null,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    endImageUrl:
      typeof data.endImageUrl === "string" ? data.endImageUrl : null,
    gifUrl: typeof data.gifUrl === "string" ? data.gifUrl : null,
    instructions,
    // Phase 24-06 — FEXD enrichment fields. Defensive reads mirror the
    // existing pattern above: arrays via Array.isArray (string-instead-of-
    // array regression returns []), strings via typeof === "string"
    // (number/object/bool/array regression returns null). NEVER coerce
    // unknown shapes — Pattern S5 from 24-PATTERNS.md.
    primaryMuscles: Array.isArray(data.primaryMuscles)
      ? data.primaryMuscles
      : [],
    secondaryMuscles: Array.isArray(data.secondaryMuscles)
      ? data.secondaryMuscles
      : [],
    mechanic: typeof data.mechanic === "string" ? data.mechanic : null,
    level: typeof data.level === "string" ? data.level : null,
    category: typeof data.category === "string" ? data.category : null,
    force: typeof data.force === "string" ? data.force : null,
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
export function useExercisesQuery(trainerUidProp?: string | null) {
  const queryClient = useQueryClient();
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const auth = getGCFitnessAuth();
  const trainerUid = trainerUidProp ?? auth.currentUser?.uid ?? null;
  const scopeKey = trainerUid ?? EXERCISES_SCOPE_ALL;
  const queryKey = [...EXERCISES_QUERY_KEY, scopeKey] as const;

  // Mount the Firestore listener exactly once per component instance. The
  // initial-load `Promise` is resolved by the first snapshot via
  // `queryClient.setQueryData`; subsequent snapshots also push through
  // `setQueryData` so the cache + UI stay in sync.
  useEffect(() => {
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
          .filter((r) => !r.deletedAt)
          .filter((r) => canTrainerAccessExercise(r, trainerUid));
        queryClient.setQueryData([...EXERCISES_QUERY_KEY, scopeKey], rows);
      },
      (err: unknown) => {
        setHasSnapshot(true);
        // Push the error into the cache so `useQuery` surfaces it.
        queryClient.setQueryData([...EXERCISES_QUERY_KEY, scopeKey], () => {
          throw err;
        });
      },
    );

    return () => unsubscribe();
  }, [queryClient, auth.app, trainerUid, scopeKey]);

  const exercisesQuery = useQuery<ExerciseRow[]>({
    queryKey,
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

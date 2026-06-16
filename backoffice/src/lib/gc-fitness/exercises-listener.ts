// exercises-listener.ts
//
// React-Query one-shot feed for the trainer Exercise list view + pickers.
//
// 260529 — was a Firestore `onSnapshot` bridge; converted to a one-shot
// `getDocs` to kill cross-trainer full-collection re-read amplification on
// the SHARED `exercises` collection. See the `useExercisesQuery` doc-comment
// below for the cost rationale + the invalidation-based refresh contract.
// The filename keeps the `-listener` suffix only to avoid churning the ~6
// import sites; it is no longer a live listener.
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

import { useQuery } from "@tanstack/react-query";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
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
  /** Search aliases and alternate names, used for fuzzy discovery. */
  keywords?: string[];
  /** Semantic tags such as `standard-library`. */
  tags?: string[];
  /** Alternate movement names / variations surfaced in the preview page. */
  variations?: string[];
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
  /**
   * Phase 26-09 — bodyweight authoring default. `false` means the exercise is
   * prescribed "reps without weight" (push-ups, pull-ups…). The template
   * builder reads this on ADD to seed the per-set "Sin peso" sentinel
   * (`weightBySetKg: []`). Absent / non-false → `true` (tracks external
   * weight) so every legacy exercise keeps the weight column. The mobile
   * clients ignore this field; they read the resolved `weightBySetKg`.
   * Optional on the row type so legacy fixtures decode without it; only an
   * explicit `=== false` opts out (see `exerciseNoWeightById`).
   */
  tracksWeight?: boolean;
}

// Re-exported from a firebase-free module so non-listener call sites (e.g.
// ExerciseForm) can import the key without pulling the firebase client SDK.
export { EXERCISES_QUERY_KEY } from "./exercises-query-key";
import { EXERCISES_QUERY_KEY } from "./exercises-query-key";
const EXERCISES_SCOPE_ALL = "all";

function canTrainerAccessExercise(
  row: Pick<ExerciseRow, "source" | "ownerId">,
  trainerUid: string | null,
): boolean {
  if (row.source !== "trainer") return true;
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
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    variations: Array.isArray(data.variations) ? data.variations : [],
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
    // Phase 26-02 — forgiving fallback to "reps" on absent/unknown wire value.
    metric: data.metric === "time" ? "time" : "reps",
    // Phase 26-09 — bodyweight default; only an explicit `false` opts out of
    // the weight column (legacy docs without the field track weight).
    tracksWeight: data.tracksWeight === false ? false : true,
  };
}

/**
 * Exercises feed for the trainer list view + the exercise pickers.
 *
 * 260529 COST — converted from a full-collection `onSnapshot` listener to a
 * ONE-SHOT `getDocs` wrapped in React-Query. The old listener held a LIVE
 * subscription on the SHARED `exercises` collection, so ANY trainer editing
 * ANY exercise re-charged a full-collection re-read on EVERY other trainer's
 * open listener (cross-trainer read amplification) — and every picker mount
 * opened another live subscription. A one-shot read pays the full-collection
 * cost once per cache window (`staleTime` 5 min, no window-focus refetch).
 *
 * REFRESH CONTRACT (replaces the listener's automatic live updates):
 *   - Own edits refresh INSTANTLY: every exercise mutation site calls
 *     `queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY })`
 *     (ExerciseForm create/update/duplicate, exercises/client.tsx
 *     soft-delete, exercise-quick-create). Invalidation marks every scoped
 *     cache stale and refetches active observers immediately.
 *   - OTHER trainers' edits surface on the next mount once the 5-min cache
 *     goes stale. Acceptable for a near-static shared library.
 *
 * Curation-soft-deleted docs (`deletedAt != null`) are filtered CLIENT-SIDE
 * here — see the file header for why the server-side filter was removed.
 *
 * `hasSnapshot` is retained for call-site compatibility (the pickers gate
 * their loading copy on it) and now maps to React-Query's `isFetched`.
 */
export function useExercisesQuery(trainerUidProp?: string | null) {
  const auth = getGCFitnessAuth();
  const trainerUid = trainerUidProp ?? auth.currentUser?.uid ?? null;
  const scopeKey = trainerUid ?? EXERCISES_SCOPE_ALL;
  const queryKey = [...EXERCISES_QUERY_KEY, scopeKey] as const;

  const exercisesQuery = useQuery<ExerciseRow[]>({
    queryKey,
    queryFn: async () => {
      const db = getFirestore(auth.app);
      // Fetch ALL exercises ordered by recency; client-side filters drop the
      // curation-soft-deleted docs (`deletedAt` non-null) + apply per-trainer
      // access scoping. Mirrors the old listener's projection exactly.
      const snap = await getDocs(
        query(collection(db, "exercises"), orderBy("updatedAt", "desc")),
      );
      return snap.docs
        .map(snapToRow)
        .filter((r) => !r.deletedAt)
        .filter((r) => canTrainerAccessExercise(r, trainerUid));
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...exercisesQuery,
    hasSnapshot: exercisesQuery.isFetched,
  };
}

// exercise-dedupe.ts
//
// Collapse same-display-name duplicate exercises in CHOICE surfaces (the
// exercise pickers + the workout-generator pool).
//
// WHY: the prod standard library is double-seeded. Every curated exercise
// exists BOTH as a numeric-id doc (e.g. `1259` — the canonical family the
// standard workout templates reference, with working https media) AND as a
// `std-<slug>` twin (e.g. `std-flexibility-chest-stretch-bench`) whose media is
// a non-renderable `gs://` URL. Both carry the `standard-library` tag, so every
// exercise shows up TWICE in pickers and the generator — the second copy with a
// broken/placeholder thumbnail.
//
// This is a RENDER-LEVEL safety net (no Firestore writes): keep ONE row per
// display name, preferring the doc whose media will actually render and the
// trainer's own authored exercise over a same-named library doc. The underlying
// duplicate docs stay in Firestore; a separate server-side cleanup can remove
// them later. Applied only where a trainer PICKS an exercise — not on the
// library-management surface, which must still show every doc for curation.

export interface DedupeExerciseRow {
  id: string;
  name: { en?: string | null; es?: string | null };
  gifUrl?: string | null;
  imageUrl?: string | null;
  thumbnailURL?: string | null;
  mediaURL?: string | null;
  ownerId?: string | null;
  updatedAt?: string | null;
}

const RENDERABLE_URL = /^https?:\/\//i;

/**
 * 2 = has a directly renderable http(s) media URL; 1 = has some media URL but
 * not directly renderable (e.g. `gs://`); 0 = no media at all.
 */
function mediaRank(r: DedupeExerciseRow): 0 | 1 | 2 {
  const url = r.gifUrl ?? r.imageUrl ?? r.thumbnailURL ?? r.mediaURL ?? null;
  if (url && RENDERABLE_URL.test(url)) return 2;
  if (url) return 1;
  return 0;
}

/** Normalized display key — same name (case/space-insensitive) = duplicate. */
function displayKey(r: DedupeExerciseRow): string {
  const en = (r.name?.en ?? "").trim().toLowerCase();
  if (en) return en;
  const es = (r.name?.es ?? "").trim().toLowerCase();
  if (es) return es;
  return `__id:${r.id}`;
}

/**
 * True when `a` is a better representative of a duplicate cluster than `b`.
 * Priority: (1) the trainer's own authored exercise is never hidden by a
 * same-named library doc; (2) renderable media; (3) canonical (non `std-*`) id;
 * (4) most recently updated.
 */
function isBetter(a: DedupeExerciseRow, b: DedupeExerciseRow): boolean {
  const aOwned = a.ownerId != null;
  const bOwned = b.ownerId != null;
  if (aOwned !== bOwned) return aOwned;

  const ra = mediaRank(a);
  const rb = mediaRank(b);
  if (ra !== rb) return ra > rb;

  const aStd = a.id.startsWith("std-");
  const bStd = b.id.startsWith("std-");
  if (aStd !== bStd) return !aStd;

  const ua = a.updatedAt ?? "";
  const ub = b.updatedAt ?? "";
  if (ua !== ub) return ua > ub;

  return false;
}

/**
 * Keep one row per normalized display name, choosing the best representative
 * (see {@link isBetter}). Rows are emitted in first-seen order so a caller that
 * pre-sorted the input keeps that ordering; callers that re-rank afterwards
 * (searchExercises) are unaffected.
 */
export function dedupeExercisesByDisplayName<T extends DedupeExerciseRow>(
  rows: readonly T[],
): T[] {
  const best = new Map<string, T>();
  const order: string[] = [];
  for (const row of rows) {
    const key = displayKey(row);
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      order.push(key);
      continue;
    }
    if (isBetter(row, current)) best.set(key, row);
  }
  return order.map((key) => best.get(key)!);
}

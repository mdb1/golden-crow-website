// exercise-visibility.ts
//
// SINGLE SOURCE OF TRUTH for which exercises are pickable in the backoffice
// choice surfaces (the single-add picker, the multi-add dialog, and the
// exercises library page). See `docs/legacy-exercise-retirement.md` for the
// full decision record, audited prod counts, and the safe hard-removal
// checklist.
//
// WHY A PREDICATE INSTEAD OF DATA WRITES — legacy catalog exercises (fexd-*,
// wger-*, alias-*) are hidden CODE-SIDE only. We NEVER set `deleted: true` or
// `mergedInto` to hide them: the 2026-06-12 dangling-mergedInto incident showed
// that mutating those fields breaks the iOS exercise-detail screen (it filters
// on `deleted` / chases `mergedInto`) AND broke prod. Legacy docs stay alive in
// Firestore so ~600 historical templates / assignments / logs that reference
// their ids keep resolving names + thumbnails.
//
// CLASSIFICATION (2026-06-12 audit, project gcfitness-3476b):
//   PICKABLE = NEW standard library (`tags` contains "standard-library", 272
//   docs) OR genuine coach-authored exercise (`source === "trainer"` AND
//   `ownerId != null`, 38 docs).
//   HIDDEN   = 400 legacy live docs (237 free-exercise-db + 139 wger + 24
//   standard_alias) with no standard-library tag.
//
// ⚠️ THE ownerId GUARD IS LOAD-BEARING. `snapToRow` (exercises-listener.ts)
// coerces ANY unknown wire `source` — including the 24 `"standard_alias"` docs
// — to `"trainer"`. A bare `source === "trainer"` check would therefore WRONGLY
// keep those alias docs pickable. All 24 alias docs have `ownerId: null`; all
// 38 genuine trainer docs have `ownerId` set. The `ownerId != null` guard is
// what separates them post-snapToRow.

import type { ExerciseRow } from "./exercises-listener";

/**
 * Semantic tag marking a doc as part of the NEW curated standard library.
 *
 * Declared LOCALLY (not imported from exercise-standard-library.ts) on purpose:
 * importing from that module would pull the whole generated exercise array into
 * every client bundle that consumes the predicate. The literal lives here as
 * the wire contract; the seeded docs carry the matching `tags` entry.
 */
export const STANDARD_LIBRARY_TAG = "standard-library";

/**
 * Whether an exercise row should appear in a choice surface.
 *
 * Precedence (deleted → standard-library tag → trainer-with-owner → hidden):
 *   1. `deleted === true` → never pickable (even if standard-library-tagged).
 *   2. carries the standard-library tag → pickable (the new curated library).
 *   3. `source === "trainer"` AND `ownerId != null` → pickable (coach-authored;
 *      the ownerId guard rejects snapToRow-coerced `standard_alias` docs).
 *   4. otherwise hidden (legacy fexd / wger / alias catalog docs).
 */
export function isPickableExercise(
  row: Pick<ExerciseRow, "deleted" | "source" | "tags" | "ownerId">,
): boolean {
  if (row.deleted === true) return false;
  if (row.tags?.includes(STANDARD_LIBRARY_TAG)) return true;
  return row.source === "trainer" && row.ownerId != null;
}

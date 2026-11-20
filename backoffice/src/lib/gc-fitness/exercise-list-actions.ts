// exercise-list-actions.ts
//
// Server-side read of the global `exercises` collection for the coach portal.
//
// WHY THIS EXISTS (#1104). Every other list in this backoffice is read by a
// Server Action authenticated with the `GcFitnessAuthToken` cookie
// (`listWorkoutTemplates`, the habits feed, the roster…). The exercise library
// was the LAST surface still reading Firestore with the BROWSER SDK, which
// needs a live Firebase-Auth session inside the browser — a completely
// different credential from the cookie that got the coach onto the page.
//
// Privacy browsers break exactly that credential and nothing else. Brave on
// mobile (and Safari ITP, and any private window) partitions or evicts the
// IndexedDB where the Auth SDK persists its session, so `auth.currentUser`
// resolves to `null` while the cookie session is perfectly valid — the coach
// is demonstrably signed in, the page renders, and only the exercise list
// fails with `permission-denied` against `allow read: if isSignedIn()`. That
// is the "No se pudieron cargar los ejercicios" report.
//
// Reading server-side removes the browser-side credential from the picture
// entirely, and as a bonus the viewer uid now comes from the verified token
// instead of `auth.currentUser?.uid` — so a coach's OWN authored exercises
// can no longer silently vanish from the pickers when that SDK is asleep.
//
// ⚠️ ONLY async functions may be exported from a `"use server"` module —
// `next build` fails otherwise (and Jest does NOT catch it; see
// backoffice/README.md → Tests). Types and pure helpers live in
// `exercise-row.ts`.

"use server";

import { unstable_cache } from "next/cache";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentGCFitnessUser } from "./auth-helpers";
import {
  mergeViewerExercises,
  projectSharedCatalog,
  SHARED_EXERCISE_SOURCES,
  STANDARD_EXERCISES_CACHE_TAG,
  type ExerciseRow,
} from "./exercise-row";

const COLLECTION = "exercises";

/**
 * #495 — the shared catalog, cached across requests and coaches. Not exported
 * (a `"use server"` module may only export async functions, and this must not
 * be browser-callable: the auth check happens in the caller, BEFORE the cache).
 * The value is `ExerciseRow[]` — ISO strings only, so it serializes.
 *
 * `in` on one field with no orderBy needs no composite index.
 */
const readSharedCatalog = unstable_cache(
  async (): Promise<ExerciseRow[]> => {
    const snap = await gcFitnessFirestore()
      .collection(COLLECTION)
      .where("source", "in", [...SHARED_EXERCISE_SOURCES])
      .get();
    return projectSharedCatalog(snap.docs);
  },
  ["gc-fitness-shared-exercise-catalog-v1"],
  { tags: [STANDARD_EXERCISES_CACHE_TAG], revalidate: 3600 },
);

/**
 * Returns the exercise library as the CALLING coach is allowed to see it:
 * the shared catalog plus their own authored exercises, minus the
 * curation-soft-deleted docs, ordered `updatedAt desc`.
 *
 * Auth mirrors the Firestore rule this replaces (`allow read: if isSignedIn()`)
 * — any authenticated Corvo user may read the catalog; the per-row
 * ownership scope is applied in `mergeViewerExercises` /
 * `projectExercisesForViewer`. Admins who are not also trainers keep their
 * access, which the client-SDK read gave them.
 *
 * #495: two reads instead of a full-collection scan — the cached shared
 * catalog and an uncached `ownerId == uid` equality (automatic single-field
 * index). See the block comment above `SHARED_EXERCISE_SOURCES` for why the
 * merged result equals the old scan, and why `deletedAt` is not a `where`.
 */
export async function listExercisesForViewer(): Promise<{
  exercises: ExerciseRow[];
}> {
  const viewer = await getCurrentGCFitnessUser();

  const [shared, ownSnap] = await Promise.all([
    readSharedCatalog(),
    gcFitnessFirestore()
      .collection(COLLECTION)
      .where("ownerId", "==", viewer.uid)
      .get(),
  ]);

  return { exercises: mergeViewerExercises(shared, ownSnap.docs, viewer.uid) };
}

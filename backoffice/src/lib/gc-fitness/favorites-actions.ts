"use server";

// favorites-actions.ts
//
// Server Actions for coach favorites (#297). A coach stars exercises, workout
// templates, and habit templates; the starred ids live in ONE per-trainer doc
// `coach_favorites/{trainerUid}` with three arrays. This mirrors the
// `habit_template_hidden` per-trainer pattern (`habit-actions.ts`):
//   - `trainerUid` ALWAYS comes from `getCurrentTrainer().uid` (never trusted
//     from input) — a coach can only read/write their OWN favorites.
//   - writes use `arrayUnion`/`arrayRemove` + `set(..., {merge:true})` so two
//     concurrent toggles on different kinds don't clobber each other and the
//     same star twice is idempotent.
//   - one `get` fetches all of a coach's favorites for the lists/generator.

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import {
  EMPTY_FAVORITES,
  favoritesFieldForKind,
  normalizeFavorites,
  type CoachFavorites,
  type FavoriteKind,
} from "./favorites";

const FAVORITES_COLLECTION = FirestoreCollections.coachFavorites;

/**
 * Returns the calling trainer's favorites (empty arrays if they have none yet).
 * One read on `coach_favorites/{uid}`.
 */
export async function listFavorites(): Promise<CoachFavorites> {
  const trainer = await getCurrentTrainer();
  const snap = await gcFitnessFirestore()
    .collection(FAVORITES_COLLECTION)
    .doc(trainer.uid)
    .get();
  if (!snap.exists) return { ...EMPTY_FAVORITES };
  return normalizeFavorites(snap.data());
}

/**
 * Stars (`next: true`) or un-stars (`next: false`) one entity for the calling
 * trainer. Idempotent — re-starring an already-favorited id is a harmless
 * arrayUnion no-op. Writes ONLY the affected array (merge), so a star on an
 * exercise never touches the trainer's workout/habit favorites.
 *
 * Returns the up-to-date favorites so the client can reconcile its cache.
 */
export async function toggleFavorite(
  kind: FavoriteKind,
  id: string,
  next: boolean,
): Promise<CoachFavorites> {
  const trainer = await getCurrentTrainer();
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("BadRequest: id is required.");
  }

  const field = favoritesFieldForKind(kind);
  const db = gcFitnessFirestore();
  const ref = db.collection(FAVORITES_COLLECTION).doc(trainer.uid);

  await ref.set(
    {
      [field]: next
        ? FieldValue.arrayUnion(id)
        : FieldValue.arrayRemove(id),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const snap = await ref.get();
  return snap.exists ? normalizeFavorites(snap.data()) : { ...EMPTY_FAVORITES };
}

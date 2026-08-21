// coach-name.ts — issue #970.
//
// The coach's display name, resolved the same way everywhere.
//
// It exists because the name is now in the SUBJECT LINE of an email to a
// third party ("Fede te invitó a entrenar en GC Fitness"). `provisionClient`
// already resolved it via its private `trainerProfile`, but that helper lives
// inside a `"use server"` file, where exporting it would turn it into a Server
// Action. Rather than duplicate the fallback rule and let the two drift, the
// rule lives here and `trainerProfile` calls it.
//
// Split from `trainerProfile` rather than extracted wholesale: that helper also
// hits Firebase Auth for the photo URL, and the invite path has no use for a
// photo — one Auth round-trip per email is a cost with no reader.

import "server-only";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { FirestoreCollections } from "../collections";

/** `nombre@dominio` → `nombre`. The name a coach who never set one gets. */
export function coachNameFallback(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart || email;
}

export async function resolveCoachDisplayName(
  uid: string,
  email: string,
): Promise<string> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(uid)
    .get();
  const name = snap.exists ? snap.get("displayName") : undefined;
  return typeof name === "string" && name.trim().length > 0
    ? name.trim()
    : coachNameFallback(email);
}

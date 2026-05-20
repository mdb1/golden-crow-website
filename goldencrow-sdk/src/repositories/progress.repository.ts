import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import { UserProgress } from "../types/sdk.types.js";

// user_progress schema defined authoritatively by this SDK — the web app stubs never wrote real data.
// If collection is empty, this correctly returns null.

/**
 * Fetch the user_progress document for the given uid.
 * Returns null if the document does not exist.
 */
export async function getUserProgress(
  uid: string
): Promise<UserProgress | null> {
  const snap = await adminDb.collection("user_progress").doc(uid).get();

  if (!snap.exists) {
    return null;
  }

  return { uid: snap.id, ...snap.data() } as UserProgress;
}

// admin-coach-activity-reader.ts — #541: reads `coach_activity` for the admin page.
// Server-only, NOT "use server" (page-only; no action endpoint). Admin-gated.
//
// Reads: ONE query — `orderBy(occurredAt desc).limit(N)` (single-field index) or, with a
// coach filter, `trainerId == uid` + `occurredAt desc` (existing composite index) — plus
// the names of the coaches / clients on the page via documentId `in` chunks of 30 (no getAll).

import "server-only";

import { FieldPath } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { decodeCoachActivityLog, type AdminCoachActivityLogRow } from "./admin-coach-activity-model";
import { getCurrentAdmin } from "./auth-helpers";
import { COACH_ACTIVITY_COLLECTION } from "./coach-activity-log";
import { FirestoreCollections } from "./collections";
import { chunkList } from "./map-in-batches";

export async function listCoachActivityLogForAdmin(
  options: { coachUid?: string | null; limit?: number } = {},
): Promise<AdminCoachActivityLogRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const limit = Math.max(1, Math.min(options.limit ?? 150, 300));
  let q = db.collection(COACH_ACTIVITY_COLLECTION) as FirebaseFirestore.Query;
  if (options.coachUid) q = q.where("trainerId", "==", options.coachUid);
  const snap = await q.orderBy("occurredAt", "desc").limit(limit).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));

  const ids = new Set<string>();
  for (const { data } of docs) {
    if (typeof data.trainerId === "string" && data.trainerId) ids.add(data.trainerId);
    if (typeof data.clientId === "string" && data.clientId) ids.add(data.clientId);
  }
  const names = new Map<string, string>();
  const snaps = await Promise.all(
    chunkList([...ids], 30).map((chunk) =>
      db
        .collection(FirestoreCollections.users)
        .where(FieldPath.documentId(), "in", chunk)
        .select("displayName", "email")
        .get()
        .catch(() => null),
    ),
  );
  for (const s of snaps) {
    s?.docs.forEach((d) => {
      const name = d.get("displayName") || d.get("email");
      if (typeof name === "string" && name) names.set(d.id, name);
    });
  }
  return decodeCoachActivityLog(docs, names);
}

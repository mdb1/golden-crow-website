"use server";

// admin-coachless-actions.ts
//
// God-mode admin actions for the "coach-less users" surface (#374 follow-up):
//   • listCoachlessUsersWithStats — dashboard scan (role=client, no coach) with
//     per-user content counts + subscription status.
//   • setUserEntitlementTier       — manual grant/revoke of premium (admin override).
//   • deleteCoachlessUser          — full cascade delete (Storage binaries +
//     Firestore + Auth), reusing the tested `deleteClientCascade`.
//
// Every action is admin-gated (getCurrentAdmin throws "Forbidden" otherwise) and
// mutations are logged to `admin_operations`. Pure shaping/parse logic lives in
// the firebase-free `coachless-user-model.ts` (unit-tested).

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { deleteClientCascade } from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  firestoreValueToISO,
  toEntitlementInfo,
  isCoachlessClientRow,
  type CoachlessUserStats,
  type EntitlementInfo,
} from "@/lib/gc-fitness/coachless-user-model";
import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";

export interface CoachlessUserRow {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAtISO: string | null;
  entitlement: EntitlementInfo | null;
  stats: CoachlessUserStats;
}

/**
 * Scan `/users` for coach-less clients and attach per-user content counts +
 * subscription status. Admin-only. Aggregation `.count()` queries keep the
 * per-user cost cheap; the coach-less segment is small, so a full projected
 * scan + parallel per-user counts is fine (mirrors `searchUsersByEmailForAdmin`).
 */
export async function listCoachlessUsersWithStats(): Promise<CoachlessUserRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();

  const snap = await db
    .collection(FirestoreCollections.users)
    .select("email", "displayName", "role", "photoURL", "deleted", "coachId", "entitlement", "createdAt")
    .get();

  const candidates = snap.docs.filter((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return isCoachlessClientRow({
      role: typeof d.role === "string" ? d.role : null,
      coachId: typeof d.coachId === "string" ? d.coachId : null,
      deleted: d.deleted === true,
    });
  });

  const rows = await Promise.all(
    candidates.map(async (doc) => {
      const d = doc.data() as Record<string, unknown>;
      const uid = doc.id;

      // A coach-less user never has coach-assigned content, so a single
      // clientId/trainerId equality per collection is enough (no composite
      // index needed). Habits carry `clientOwned` only on client-created docs,
      // set in-memory (backoffice never writes it), so fetch + filter.
      const [routinesAgg, habitsSnap, photosAgg, logsAgg] = await Promise.all([
        db
          .collection(FirestoreCollections.workoutTemplates)
          .where("trainerId", "==", uid)
          .count()
          .get(),
        db
          .collection(FirestoreCollections.habits)
          .where("clientId", "==", uid)
          .select("clientOwned")
          .get(),
        db
          .collection(FirestoreCollections.progressPhotos)
          .where("clientId", "==", uid)
          .count()
          .get(),
        db
          .collection(FirestoreCollections.workoutLogs)
          .where("clientId", "==", uid)
          .count()
          .get(),
      ]);

      const stats: CoachlessUserStats = {
        routines: routinesAgg.data().count,
        habits: habitsSnap.docs.filter((h) => h.get("clientOwned") === true).length,
        progressPhotos: photosAgg.data().count,
        workoutLogs: logsAgg.data().count,
      };

      return {
        uid,
        email: typeof d.email === "string" ? d.email : "",
        displayName: typeof d.displayName === "string" ? d.displayName : "",
        photoURL: typeof d.photoURL === "string" ? d.photoURL : null,
        createdAtISO: firestoreValueToISO(d.createdAt),
        entitlement: toEntitlementInfo(d.entitlement),
        stats,
      } satisfies CoachlessUserRow;
    }),
  );

  rows.sort((a, b) => a.email.localeCompare(b.email));
  return rows;
}

const setEntitlementSchema = z.object({
  uid: z.string().trim().min(6).max(128),
  tier: z.enum(["premium", "free"]),
});

/**
 * Manually set a user's entitlement tier (god-mode override). Overwrites the
 * whole `entitlement` map so a stale productId/expiresAt can't leak; marks
 * `source: "admin"` so it's distinguishable from a RevenueCat-written one. NOTE:
 * a later real RevenueCat webhook event will overwrite this (server truth wins),
 * and a coached user is premium regardless of this field.
 */
export async function setUserEntitlementTier(
  input: unknown,
): Promise<{ ok: true; uid: string; tier: "premium" | "free" }> {
  const admin = await getCurrentAdmin();
  const { uid, tier } = setEntitlementSchema.parse(input);
  const db = gcFitnessFirestore();

  await db
    .collection(FirestoreCollections.users)
    .doc(uid)
    .set(
      {
        entitlement: {
          tier,
          source: "admin",
          productId: null,
          expiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

  await db.collection(FirestoreCollections.adminOperations).add({
    actorUid: admin.uid,
    kind: "set_entitlement",
    mode: "execute",
    targetUid: uid,
    status: "success",
    summary: { tier, source: "admin" },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, uid, tier };
}

const deleteCoachlessSchema = z.object({
  uid: z.string().trim().min(6).max(128),
  emailConfirmation: z.string().trim().min(1),
});

/**
 * Full cascade delete of a coach-less client: Storage progress-photo binaries
 * (best-effort) + all Firestore data + Auth user (via the tested
 * `deleteClientCascade`). Guards: refuses non-coach-less / non-client accounts,
 * and requires the typed email to match the target's email.
 */
export async function deleteCoachlessUser(
  input: unknown,
): Promise<{ ok: true; deletedDocsApprox: number }> {
  await getCurrentAdmin();
  const { uid, emailConfirmation } = deleteCoachlessSchema.parse(input);
  const db = gcFitnessFirestore();

  const userDoc = await db.collection(FirestoreCollections.users).doc(uid).get();
  if (!userDoc.exists) {
    throw new Error("User not found.");
  }
  const data = userDoc.data() as Record<string, unknown>;

  // Safety: this god-mode tool only deletes COACH-LESS CLIENT accounts. Deleting
  // a coach (cascade of all their clients) must go through the coach delete tool.
  const role = typeof data.role === "string" ? data.role : null;
  const coachId = typeof data.coachId === "string" ? data.coachId : null;
  if (!isCoachlessClientRow({ role, coachId, deleted: data.deleted === true })) {
    throw new Error(
      "Refusing to delete: target is not an active coach-less client.",
    );
  }

  // Typed-email confirmation (case-insensitive) — a strong destructive guard.
  const email = typeof data.email === "string" ? data.email : "";
  if (email.trim().toLowerCase() !== emailConfirmation.trim().toLowerCase()) {
    throw new Error("Email confirmation does not match the target user.");
  }

  // Best-effort Storage cleanup — the Firestore cascade only removes the
  // progress_photos METADATA docs, not the binaries under progress_photos/{uid}/.
  try {
    await gcFitnessStorage()
      .bucket()
      .deleteFiles({ prefix: `${FirestoreCollections.progressPhotos}/${uid}/` });
  } catch {
    // Never block the account delete on a storage cleanup failure.
  }

  // Reuse the tested Firestore + Auth cascade (writes its own admin_operations log).
  const result = await deleteClientCascade({
    clientUid: uid,
    confirmation: "DELETE CLIENT",
    mode: "execute",
  });

  return { ok: true, deletedDocsApprox: result.deletedDocsApprox };
}

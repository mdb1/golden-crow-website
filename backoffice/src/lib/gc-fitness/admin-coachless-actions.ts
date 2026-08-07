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
import {
  listClientAppDevices,
  type ClientAppDevice,
} from "@/lib/gc-fitness/client-app-devices";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  bilingualText,
  firestoreValueToISO,
  summarizeCoachlessActivity,
  toEntitlementInfo,
  isCoachlessClientRow,
  type CoachlessActivitySummary,
  type CoachlessUserStats,
  type EntitlementInfo,
} from "@/lib/gc-fitness/coachless-user-model";
import {
  gcFitnessAuth,
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

/** One self-authored workout template (a "routine" in the client app). */
export interface CoachlessRoutineRow {
  id: string;
  name: string;
  exerciseCount: number;
  tags: string[];
  createdAtISO: string | null;
  updatedAtISO: string | null;
  deleted: boolean;
}

/** One body-weight check-in. */
export interface CoachlessWeightRow {
  id: string;
  valueKg: number | null;
  recordedAtISO: string | null;
}

/** Firebase Auth facts a Firestore doc can't answer (how they sign in, when). */
export interface CoachlessAuthInfo {
  providers: string[];
  emailVerified: boolean;
  disabled: boolean;
  lastSignInISO: string | null;
  creationISO: string | null;
}

export interface CoachlessUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAtISO: string | null;
  timezone: string | null;
  birthDate: string | null;
  locale: string | null;
  entitlement: EntitlementInfo | null;
  stats: CoachlessUserStats;
  activity: CoachlessActivitySummary;
  auth: CoachlessAuthInfo | null;
  routines: CoachlessRoutineRow[];
  recentWeights: CoachlessWeightRow[];
  /** #785 — which app build(s) this person is actually running. */
  devices: ClientAppDevice[];
}

/**
 * How many newest docs per stream we pull to compute the 7d/30d activity
 * buckets. Generous enough that a heavy user's last 30 days always fit; the
 * displayed TOTALS come from `.count()` aggregations, so this cap can never
 * under-report them.
 */
const ACTIVITY_WINDOW_LIMIT = 400;

/**
 * Everything the god-mode profile page shows for ONE coach-less user: identity,
 * Firebase Auth facts, subscription, content counts, an activity summary, their
 * self-authored routines and recent body-weight entries.
 *
 * Admin-only, and REFUSES a target that isn't an active coach-less client — a
 * coached client has their own drill-down under
 * `/admin/coaches/{coachId}/clients/{uid}`, which stays the single surface for
 * coach-owned data.
 */
export async function getCoachlessUserProfile(
  uid: string,
): Promise<CoachlessUserProfile> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();

  const userSnap = await db.collection(FirestoreCollections.users).doc(uid).get();
  if (!userSnap.exists) {
    throw new Error("User not found.");
  }
  const d = userSnap.data() as Record<string, unknown>;
  if (
    !isCoachlessClientRow({
      role: typeof d.role === "string" ? d.role : null,
      coachId: typeof d.coachId === "string" ? d.coachId : null,
      deleted: d.deleted === true,
    })
  ) {
    throw new Error("Not a coach-less client.");
  }

  const [
    templatesSnap,
    habitsSnap,
    photosSnap,
    logsSnap,
    habitLogsSnap,
    weightsSnap,
    logsCountAgg,
    photosCountAgg,
    authRecord,
    devices,
  ] = await Promise.all([
    // Self-authored templates: no orderBy, so no composite index is needed and
    // client-created docs missing `deleted` aren't filtered out (see the
    // client-created-habits equality trap).
    db
      .collection(FirestoreCollections.workoutTemplates)
      .where("trainerId", "==", uid)
      .limit(200)
      .get(),
    db.collection(FirestoreCollections.habits).where("clientId", "==", uid).limit(200).get(),
    // Bounded, newest-first windows — they feed the 7d/30d activity buckets,
    // NOT the totals (the counts below stay exact).
    db
      .collection(FirestoreCollections.progressPhotos)
      .where("clientId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(ACTIVITY_WINDOW_LIMIT)
      .get(),
    db
      .collection(FirestoreCollections.workoutLogs)
      .where("clientId", "==", uid)
      .orderBy("startedAt", "desc")
      .limit(ACTIVITY_WINDOW_LIMIT)
      .get(),
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", uid)
      .orderBy("civilDate", "desc")
      .limit(ACTIVITY_WINDOW_LIMIT)
      .get(),
    db
      .collection(FirestoreCollections.users)
      .doc(uid)
      .collection("body_weight_logs")
      .orderBy("recordedAt", "desc")
      .limit(50)
      .get(),
    db
      .collection(FirestoreCollections.workoutLogs)
      .where("clientId", "==", uid)
      .count()
      .get(),
    db
      .collection(FirestoreCollections.progressPhotos)
      .where("clientId", "==", uid)
      .count()
      .get(),
    // Auth is a separate service — never let its outage 500 the whole page.
    gcFitnessAuth()
      .getUser(uid)
      .catch(() => null),
    // #785 — which app build(s) this person is on. Reads the push-token
    // subcollection every signed-in device writes; fail-soft like Auth above.
    listClientAppDevices(db, uid),
  ]);

  const routines: CoachlessRoutineRow[] = templatesSnap.docs
    .map((doc) => {
      const t = doc.data() as Record<string, unknown>;
      const rawTags = Array.isArray(t.tags) ? t.tags : [];
      const tags = rawTags.filter((tag): tag is string => typeof tag === "string");
      if (tags.length === 0 && typeof t.tag === "string") tags.push(t.tag);
      return {
        id: doc.id,
        name: bilingualText(t.name, "Untitled"),
        exerciseCount: Array.isArray(t.exercises) ? t.exercises.length : 0,
        tags,
        createdAtISO: firestoreValueToISO(t.createdAt),
        updatedAtISO: firestoreValueToISO(t.updatedAt),
        deleted: t.deleted === true,
      } satisfies CoachlessRoutineRow;
    })
    // Active first, then most recently touched.
    .sort((a, b) => {
      if (a.deleted !== b.deleted) return Number(a.deleted) - Number(b.deleted);
      return (b.updatedAtISO ?? "").localeCompare(a.updatedAtISO ?? "");
    });

  const recentWeights: CoachlessWeightRow[] = weightsSnap.docs.map((doc) => {
    const w = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      valueKg: typeof w.valueKg === "number" ? w.valueKg : null,
      recordedAtISO: firestoreValueToISO(w.recordedAt),
    } satisfies CoachlessWeightRow;
  });

  const stats: CoachlessUserStats = {
    routines: routines.filter((r) => !r.deleted).length,
    habits: habitsSnap.docs.filter((h) => h.get("clientOwned") === true).length,
    progressPhotos: photosCountAgg.data().count,
    workoutLogs: logsCountAgg.data().count,
  };

  const activity = summarizeCoachlessActivity({
    nowMs: Date.now(),
    workoutDates: logsSnap.docs.map((doc) =>
      firestoreValueToISO(doc.get("startedAt") ?? doc.get("createdAt")),
    ),
    // Only completed check-ins count as activity (habits are binary-only).
    habitLogDates: habitLogsSnap.docs
      .filter((doc) => doc.get("deleted") !== true && doc.get("value") === true)
      .map((doc) =>
        typeof doc.get("civilDate") === "string"
          ? (doc.get("civilDate") as string)
          : firestoreValueToISO(doc.get("loggedAt")),
      ),
    photoDates: photosSnap.docs.map((doc) => firestoreValueToISO(doc.get("createdAt"))),
    weightDates: recentWeights.map((w) => w.recordedAtISO),
  });

  return {
    uid,
    email: typeof d.email === "string" ? d.email : "",
    displayName: typeof d.displayName === "string" ? d.displayName : "",
    photoURL: typeof d.photoURL === "string" ? d.photoURL : null,
    createdAtISO: firestoreValueToISO(d.createdAt),
    timezone: typeof d.timezone === "string" ? d.timezone : null,
    birthDate: typeof d.birthDate === "string" ? d.birthDate : null,
    locale: typeof d.locale === "string" ? d.locale : null,
    entitlement: toEntitlementInfo(d.entitlement),
    stats,
    activity,
    auth: authRecord
      ? {
          providers: authRecord.providerData.map((p) => p.providerId),
          emailVerified: authRecord.emailVerified,
          disabled: authRecord.disabled,
          lastSignInISO: authRecord.metadata.lastSignInTime
            ? new Date(authRecord.metadata.lastSignInTime).toISOString()
            : null,
          creationISO: authRecord.metadata.creationTime
            ? new Date(authRecord.metadata.creationTime).toISOString()
            : null,
        }
      : null,
    routines,
    recentWeights,
    devices,
  } satisfies CoachlessUserProfile;
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

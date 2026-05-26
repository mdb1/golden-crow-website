"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessAuth, gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export interface CoachAdminRow {
  uid: string;
  email: string;
  displayName: string;
  roles: string[];
  clientsCount: number;
  customWorkoutsCount: number;
  customExercisesCount: number;
}

const emailSchema = z.string().trim().toLowerCase().email();

function rolesFromClaims(claims: Record<string, unknown> | undefined): string[] {
  const result = new Set<string>();
  if (!claims) return [];
  const role = claims.role;
  if (typeof role === "string" && role.trim().length > 0) {
    result.add(role.trim().toLowerCase());
  }
  const roles = claims.roles;
  if (Array.isArray(roles)) {
    for (const value of roles) {
      if (typeof value === "string" && value.trim().length > 0) {
        result.add(value.trim().toLowerCase());
      }
    }
  }
  if (claims.admin === true) {
    result.add("admin");
  }
  return Array.from(result);
}

export async function listCoachesForAdmin(): Promise<CoachAdminRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const coachesSnap = await db
    .collection(FirestoreCollections.users)
    .where("role", "==", "trainer")
    .where("deleted", "==", false)
    .get();

  const rows = await Promise.all(
    coachesSnap.docs.map(async (doc) => {
      const data = doc.data();
      const uid = doc.id;
      const [clientsSnap, workoutsAgg, exercisesAgg, authUser] = await Promise.all([
        db.collection(FirestoreCollections.users).where("coachId", "==", uid).get(),
        db.collection(FirestoreCollections.workoutTemplates).where("trainerId", "==", uid).count().get(),
        db.collection(FirestoreCollections.exercises).where("trainerId", "==", uid).count().get(),
        gcFitnessAuth().getUser(uid).catch(() => null),
      ]);

      return {
        uid,
        email: (data.email as string | undefined) ?? "",
        displayName: (data.displayName as string | undefined) ?? "",
        roles: rolesFromClaims(authUser?.customClaims as Record<string, unknown> | undefined),
        clientsCount: clientsSnap.docs.filter((d) => d.get("deleted") !== true).length,
        customWorkoutsCount: workoutsAgg.data().count,
        customExercisesCount: exercisesAgg.data().count,
      } satisfies CoachAdminRow;
    }),
  );

  rows.sort((a, b) => a.email.localeCompare(b.email));
  return rows;
}

export async function addCoachEmailToAllowlist(input: unknown): Promise<{ ok: true; email: string }> {
  const admin = await getCurrentAdmin();
  const email = emailSchema.parse(input);
  const db = gcFitnessFirestore();
  await db
    .collection(FirestoreCollections.coachAllowlist)
    .doc(email)
    .set(
      {
        email,
        enabled: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: admin.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      },
      { merge: true },
    );
  return { ok: true, email };
}

const promoteAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  keepTrainer: z.boolean().default(true),
});

export async function promoteUserToAdmin(input: unknown): Promise<{ ok: true; uid: string }> {
  await getCurrentAdmin();
  const parsed = promoteAdminSchema.parse(input);
  const user = await gcFitnessAuth().getUserByEmail(parsed.email);
  const current = (user.customClaims ?? {}) as Record<string, unknown>;
  const roles = new Set<string>(rolesFromClaims(current));
  roles.add("admin");
  if (parsed.keepTrainer) {
    roles.add("trainer");
  }

  await gcFitnessAuth().setCustomUserClaims(user.uid, {
    ...current,
    role: roles.has("trainer") ? "trainer" : "admin",
    roles: Array.from(roles),
    admin: true,
  });

  return { ok: true, uid: user.uid };
}

async function deleteDocsByQuery(
  query: FirebaseFirestore.Query,
): Promise<number> {
  const snap = await query.get();
  if (snap.empty) return 0;
  const db = gcFitnessFirestore();
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return snap.size;
}

async function deleteClientCascadeInternal(clientUid: string): Promise<number> {
  const db = gcFitnessFirestore();
  let deletedDocs = 0;

  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.workoutAssignments).where("clientId", "==", clientUid),
  );
  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.workoutLogs).where("clientId", "==", clientUid),
  );
  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.habits).where("clientId", "==", clientUid),
  );
  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.habitLogs).where("clientId", "==", clientUid),
  );
  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.progressPhotos).where("clientId", "==", clientUid),
  );
  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.clientGoals).where("clientId", "==", clientUid),
  );
  deletedDocs += await deleteDocsByQuery(
    db.collection(FirestoreCollections.clientNotes).where("clientId", "==", clientUid),
  );

  const chatRef = db.collection(FirestoreCollections.chats).doc(clientUid);
  await db.recursiveDelete(chatRef);
  const userRef = db.collection(FirestoreCollections.users).doc(clientUid);
  await db.recursiveDelete(userRef);
  deletedDocs += 2;

  try {
    await gcFitnessAuth().deleteUser(clientUid);
  } catch {
    // idempotent delete
  }
  return deletedDocs;
}

const deleteClientSchema = z.object({
  clientUid: z.string().trim().min(6).max(128),
  confirmation: z.literal("DELETE CLIENT"),
});

export async function deleteClientCascade(
  input: unknown,
): Promise<{ ok: true; deletedDocsApprox: number }> {
  await getCurrentAdmin();
  const parsed = deleteClientSchema.parse(input);
  const deletedDocsApprox = await deleteClientCascadeInternal(parsed.clientUid);
  return { ok: true, deletedDocsApprox };
}

const deleteCoachSchema = z.object({
  coachUid: z.string().trim().min(6).max(128),
  confirmation: z.literal("DELETE COACH"),
});

export async function deleteCoachCascade(
  input: unknown,
): Promise<{ ok: true; deletedClients: number; deletedDocsApprox: number }> {
  await getCurrentAdmin();
  const parsed = deleteCoachSchema.parse(input);
  const db = gcFitnessFirestore();

  let deletedDocsApprox = 0;
  const clientsSnap = await db
    .collection(FirestoreCollections.users)
    .where("coachId", "==", parsed.coachUid)
    .get();

  for (const clientDoc of clientsSnap.docs) {
    deletedDocsApprox += await deleteClientCascadeInternal(clientDoc.id);
  }

  deletedDocsApprox += await deleteDocsByQuery(
    db.collection(FirestoreCollections.workoutTemplates).where("trainerId", "==", parsed.coachUid),
  );
  deletedDocsApprox += await deleteDocsByQuery(
    db.collection(FirestoreCollections.exercises).where("trainerId", "==", parsed.coachUid),
  );
  deletedDocsApprox += await deleteDocsByQuery(
    db.collection(FirestoreCollections.userMirror).where("coachId", "==", parsed.coachUid),
  );

  const coachChatSnap = await db
    .collection(FirestoreCollections.chats)
    .where("coachId", "==", parsed.coachUid)
    .get();
  for (const doc of coachChatSnap.docs) {
    await db.recursiveDelete(doc.ref);
    deletedDocsApprox += 1;
  }

  const coachRef = db.collection(FirestoreCollections.users).doc(parsed.coachUid);
  await db.recursiveDelete(coachRef);
  deletedDocsApprox += 1;
  try {
    await gcFitnessAuth().deleteUser(parsed.coachUid);
  } catch {
    // idempotent delete
  }

  return { ok: true, deletedClients: clientsSnap.size, deletedDocsApprox };
}

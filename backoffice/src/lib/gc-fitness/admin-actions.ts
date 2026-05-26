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

type OperationMode = "dry_run" | "execute";

export interface CoachLinkedClientRow {
  uid: string;
  email: string;
  displayName: string;
  deleted: boolean;
}

export interface AdminOperationRow {
  id: string;
  kind: string;
  mode: string;
  status: string;
  createdAtISO: string | null;
  errorMessage: string | null;
}

export interface CoachAdminDetail {
  coach: CoachAdminRow;
  workoutAssignmentsCount: number;
  habitsCount: number;
  chatsCount: number;
  linkedClients: CoachLinkedClientRow[];
  recentOperations: AdminOperationRow[];
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

export async function getCoachAdminDetail(coachUid: string): Promise<CoachAdminDetail | null> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const coachDoc = await db.collection(FirestoreCollections.users).doc(coachUid).get();
  if (!coachDoc.exists) {
    return null;
  }
  const baseList = await listCoachesForAdmin();
  const coach = baseList.find((row) => row.uid === coachUid);
  if (!coach) {
    return null;
  }

  const [assignmentsAgg, habitsAgg, chatsAgg, linkedClientsSnap] = await Promise.all([
    db.collection(FirestoreCollections.workoutAssignments).where("trainerId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.habits).where("trainerId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.chats).where("coachId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.users).where("coachId", "==", coachUid).get(),
  ]);

  const linkedClients: CoachLinkedClientRow[] = linkedClientsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: (data.email as string | undefined) ?? "",
      displayName: (data.displayName as string | undefined) ?? "",
      deleted: data.deleted === true,
    };
  });
  linkedClients.sort((a, b) => a.email.localeCompare(b.email));

  let recentOperations: AdminOperationRow[] = [];
  try {
    const opsSnap = await db
      .collection(FirestoreCollections.adminOperations)
      .where("targetUid", "==", coachUid)
      .orderBy("createdAt", "desc")
      .limit(15)
      .get();
    recentOperations = opsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        kind: String(data.kind ?? ""),
        mode: String(data.mode ?? ""),
        status: String(data.status ?? ""),
        createdAtISO:
          data.createdAt && typeof data.createdAt.toDate === "function"
            ? data.createdAt.toDate().toISOString()
            : null,
        errorMessage:
          typeof data.errorMessage === "string" && data.errorMessage.length > 0
            ? data.errorMessage
            : null,
      };
    });
  } catch {
    // Fail-soft: if the composite index is missing, keep detail page usable.
    recentOperations = [];
  }

  return {
    coach,
    workoutAssignmentsCount: assignmentsAgg.data().count,
    habitsCount: habitsAgg.data().count,
    chatsCount: chatsAgg.data().count,
    linkedClients,
    recentOperations,
  };
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

async function writeAdminOperationLog(args: {
  actorUid: string;
  kind: "delete_client_cascade" | "delete_coach_cascade";
  mode: OperationMode;
  targetUid: string;
  status: "success" | "failed";
  summary: Record<string, unknown>;
  errorMessage?: string;
}) {
  const db = gcFitnessFirestore();
  await db.collection(FirestoreCollections.adminOperations).add({
    actorUid: args.actorUid,
    kind: args.kind,
    mode: args.mode,
    targetUid: args.targetUid,
    status: args.status,
    summary: args.summary,
    errorMessage: args.errorMessage ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
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

async function buildClientCascadePlan(clientUid: string): Promise<{
  workoutAssignments: number;
  workoutLogs: number;
  habits: number;
  habitLogs: number;
  progressPhotos: number;
  clientGoals: number;
  clientNotes: number;
  chatDocExists: boolean;
  userDocExists: boolean;
  totalApprox: number;
}> {
  const db = gcFitnessFirestore();
  const [
    workoutAssignments,
    workoutLogs,
    habits,
    habitLogs,
    progressPhotos,
    clientGoals,
    clientNotes,
    chatDoc,
    userDoc,
  ] = await Promise.all([
    db.collection(FirestoreCollections.workoutAssignments).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.workoutLogs).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.habits).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.habitLogs).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.progressPhotos).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.clientGoals).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.clientNotes).where("clientId", "==", clientUid).count().get(),
    db.collection(FirestoreCollections.chats).doc(clientUid).get(),
    db.collection(FirestoreCollections.users).doc(clientUid).get(),
  ]);

  const counts = {
    workoutAssignments: workoutAssignments.data().count,
    workoutLogs: workoutLogs.data().count,
    habits: habits.data().count,
    habitLogs: habitLogs.data().count,
    progressPhotos: progressPhotos.data().count,
    clientGoals: clientGoals.data().count,
    clientNotes: clientNotes.data().count,
    chatDocExists: chatDoc.exists,
    userDocExists: userDoc.exists,
  };
  const totalApprox =
    counts.workoutAssignments +
    counts.workoutLogs +
    counts.habits +
    counts.habitLogs +
    counts.progressPhotos +
    counts.clientGoals +
    counts.clientNotes +
    (counts.chatDocExists ? 1 : 0) +
    (counts.userDocExists ? 1 : 0);
  return { ...counts, totalApprox };
}

const deleteClientSchema = z.object({
  clientUid: z.string().trim().min(6).max(128),
  confirmation: z.literal("DELETE CLIENT"),
  mode: z.enum(["dry_run", "execute"]),
});

export async function deleteClientCascade(
  input: unknown,
): Promise<{ ok: true; mode: OperationMode; deletedDocsApprox: number }> {
  const admin = await getCurrentAdmin();
  const parsed = deleteClientSchema.parse(input);
  try {
    const plan = await buildClientCascadePlan(parsed.clientUid);
    if (parsed.mode === "dry_run") {
      await writeAdminOperationLog({
        actorUid: admin.uid,
        kind: "delete_client_cascade",
        mode: "dry_run",
        targetUid: parsed.clientUid,
        status: "success",
        summary: plan,
      });
      return { ok: true, mode: "dry_run", deletedDocsApprox: plan.totalApprox };
    }

    const deletedDocsApprox = await deleteClientCascadeInternal(parsed.clientUid);
    await writeAdminOperationLog({
      actorUid: admin.uid,
      kind: "delete_client_cascade",
      mode: "execute",
      targetUid: parsed.clientUid,
      status: "success",
      summary: { plan, deletedDocsApprox },
    });
    return { ok: true, mode: "execute", deletedDocsApprox };
  } catch (error) {
    await writeAdminOperationLog({
      actorUid: admin.uid,
      kind: "delete_client_cascade",
      mode: parsed.mode,
      targetUid: parsed.clientUid,
      status: "failed",
      summary: {},
      errorMessage: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

const deleteCoachSchema = z.object({
  coachUid: z.string().trim().min(6).max(128),
  confirmation: z.literal("DELETE COACH"),
  mode: z.enum(["dry_run", "execute"]),
});

async function buildCoachCascadePlan(coachUid: string): Promise<{
  clients: number;
  workoutTemplates: number;
  exercises: number;
  userMirror: number;
  chats: number;
  coachUserDocExists: boolean;
  totalApprox: number;
}> {
  const db = gcFitnessFirestore();
  const [clients, workoutTemplates, exercises, userMirror, chats, coachDoc] = await Promise.all([
    db.collection(FirestoreCollections.users).where("coachId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.workoutTemplates).where("trainerId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.exercises).where("trainerId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.userMirror).where("coachId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.chats).where("coachId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.users).doc(coachUid).get(),
  ]);
  const counts = {
    clients: clients.data().count,
    workoutTemplates: workoutTemplates.data().count,
    exercises: exercises.data().count,
    userMirror: userMirror.data().count,
    chats: chats.data().count,
    coachUserDocExists: coachDoc.exists,
  };
  const totalApprox =
    counts.clients +
    counts.workoutTemplates +
    counts.exercises +
    counts.userMirror +
    counts.chats +
    (counts.coachUserDocExists ? 1 : 0);
  return { ...counts, totalApprox };
}

export async function deleteCoachCascade(
  input: unknown,
): Promise<{ ok: true; mode: OperationMode; deletedClients: number; deletedDocsApprox: number }> {
  const admin = await getCurrentAdmin();
  const parsed = deleteCoachSchema.parse(input);
  const db = gcFitnessFirestore();
  try {
    const plan = await buildCoachCascadePlan(parsed.coachUid);
    if (parsed.mode === "dry_run") {
      await writeAdminOperationLog({
        actorUid: admin.uid,
        kind: "delete_coach_cascade",
        mode: "dry_run",
        targetUid: parsed.coachUid,
        status: "success",
        summary: plan,
      });
      return {
        ok: true,
        mode: "dry_run",
        deletedClients: plan.clients,
        deletedDocsApprox: plan.totalApprox,
      };
    }

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

    await writeAdminOperationLog({
      actorUid: admin.uid,
      kind: "delete_coach_cascade",
      mode: "execute",
      targetUid: parsed.coachUid,
      status: "success",
      summary: { plan, deletedClients: clientsSnap.size, deletedDocsApprox },
    });
    return { ok: true, mode: "execute", deletedClients: clientsSnap.size, deletedDocsApprox };
  } catch (error) {
    await writeAdminOperationLog({
      actorUid: admin.uid,
      kind: "delete_coach_cascade",
      mode: parsed.mode,
      targetUid: parsed.coachUid,
      status: "failed",
      summary: {},
      errorMessage: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

export async function previewClientCascade(
  clientUid: string,
): Promise<Awaited<ReturnType<typeof buildClientCascadePlan>>> {
  await getCurrentAdmin();
  return buildClientCascadePlan(clientUid);
}

export async function previewCoachCascade(
  coachUid: string,
): Promise<Awaited<ReturnType<typeof buildCoachCascadePlan>>> {
  await getCurrentAdmin();
  return buildCoachCascadePlan(coachUid);
}

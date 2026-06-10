"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessAuth, gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { emailMatchesQuery, normalizeSearchQuery } from "@/lib/gc-fitness/admin-user-search";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { recurrenceLabel } from "@/lib/gc-fitness/coach-activity-log";

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

export interface PendingCoachClientRow {
  email: string;
  displayName: string;
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
  pendingClients: PendingCoachClientRow[];
  recentOperations: AdminOperationRow[];
}

export interface CoachAllowlistRow {
  email: string;
  enabled: boolean;
  updatedAtISO: string | null;
}

export interface CoachActivityRow {
  id: string;
  kind:
    | "habit_assigned"
    | "workout_template_created"
    | "workout_assigned"
    | "client_pre_provisioned"
    | "client_first_login";
  coachUid: string;
  coachName: string;
  coachEmail: string;
  clientUid: string | null;
  clientEmail: string | null;
  occurredAtISO: string | null;
  summary: string;
  recurrenceLabel: string | null;
  occurrences: number | null;
  recurrenceSeriesId: string | null;
}

export interface DeletionTargetInfo {
  exists: boolean;
  role: string | null;
  email: string | null;
  displayName: string | null;
}

const emailSchema = z.string().trim().toLowerCase().email();

function toIsoMaybe(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function recurrenceLabelFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === "daily") return "daily";
  if (kind === "weekly" || kind === "weekly_days") return "weekly";
  if (kind === "monthly") return "monthly";
  if (kind === "every_n_days") return "every_n_days";
  return null;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Admin user-email search (GitHub issue #163)
//
// Finds ANY user (client / coach / admin) by an email prefix. Runs through the
// Admin SDK, which BYPASSES firestore.rules — so no rules change and no
// composite index is needed (the single-field `email` index is always present).
// Role is merged from the user doc `role` PLUS the custom claims (`admin` lives
// only in claims, never in the doc), so an admin-only user surfaces correctly.
// ─────────────────────────────────────────────────────────────────────────────

export interface UserSearchResultRow {
  uid: string;
  email: string;
  displayName: string;
  roles: string[];
  photoURL: string | null;
  deleted: boolean;
  coachId: string | null;
}

export async function searchUsersByEmailForAdmin(
  rawQuery: string,
  limit = 25,
): Promise<UserSearchResultRow[]> {
  // (1) Admin gate FIRST — throws Error("Forbidden") for non-admins.
  await getCurrentAdmin();

  // (2) Empty / whitespace query → no query, empty result.
  const q = normalizeSearchQuery(rawQuery);
  if (q.length === 0) return [];

  // (3) CONTAINS search: Firestore has no substring operator (a prefix range
  // misses "carba" → ncarballal@…), so scan the users collection with a field
  // projection and filter in memory. Admin-only tool over a small user base —
  // the projected scan is cheap, and the per-user Auth lookup below only runs
  // on the capped matches.
  const db = gcFitnessFirestore();
  const cappedLimit = Math.min(Math.max(limit, 1), 50);
  const snap = await db
    .collection(FirestoreCollections.users)
    .select("email", "displayName", "role", "photoURL", "deleted", "coachId")
    .get();

  const matches = snap.docs
    .filter((doc) => emailMatchesQuery(doc.get("email"), q))
    .sort((a, b) =>
      String(a.get("email") ?? "").localeCompare(String(b.get("email") ?? "")),
    )
    .slice(0, cappedLimit);

  // (4) Map each doc; merge doc.role with claim roles. Tolerant — a single bad
  // doc never throws (missing field → "" / null / false; getUser failure → []).
  const rows = await Promise.all(
    matches.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>;
      const uid = doc.id;
      const authUser = await gcFitnessAuth().getUser(uid).catch(() => null);

      const roles = new Set<string>(
        rolesFromClaims(authUser?.customClaims as Record<string, unknown> | undefined),
      );
      const docRole = data.role;
      if (typeof docRole === "string" && docRole.trim().length > 0) {
        roles.add(docRole.trim().toLowerCase());
      }

      return {
        uid,
        email: typeof data.email === "string" ? data.email : "",
        displayName: typeof data.displayName === "string" ? data.displayName : "",
        roles: Array.from(roles),
        photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
        deleted: data.deleted === true,
        coachId: typeof data.coachId === "string" ? data.coachId : null,
      } satisfies UserSearchResultRow;
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

  const [assignmentsAgg, habitsAgg, chatsAgg, linkedClientsSnap, pendingSnap] = await Promise.all([
    db.collection(FirestoreCollections.workoutAssignments).where("trainerId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.habits).where("trainerId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.chats).where("coachId", "==", coachUid).count().get(),
    db.collection(FirestoreCollections.users).where("coachId", "==", coachUid).get(),
    db.collection(FirestoreCollections.userMirror).where("coachId", "==", coachUid).get(),
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

  const pendingClients: PendingCoachClientRow[] = pendingSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      email: (data.email as string | undefined) ?? doc.id,
      displayName: (data.displayName as string | undefined) ?? "",
    };
  });
  pendingClients.sort((a, b) => a.email.localeCompare(b.email));

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
    pendingClients,
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

export async function listCoachAllowlist(): Promise<CoachAllowlistRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const [snap, trainersSnap] = await Promise.all([
    db.collection(FirestoreCollections.coachAllowlist).orderBy("email", "asc").get(),
    db
      .collection(FirestoreCollections.users)
      .where("role", "==", "trainer")
      .where("deleted", "==", false)
      .get(),
  ]);
  const trainerEmails = new Set(
    trainersSnap.docs
      .map((d) => (d.get("email") as string | undefined)?.toLowerCase())
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );

  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        email: (data.email as string | undefined) ?? doc.id,
        enabled: data.enabled !== false,
        updatedAtISO:
        data.updatedAt && typeof data.updatedAt.toDate === "function"
          ? data.updatedAt.toDate().toISOString()
          : null,
      };
    })
    .filter((row) => !trainerEmails.has(row.email.toLowerCase()));
}

export async function listRecentCoachActivity(limit = 80): Promise<CoachActivityRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();

  const trainerSnap = await db
    .collection(FirestoreCollections.users)
    .where("role", "==", "trainer")
    .where("deleted", "==", false)
    .get();

  const coachByUid = new Map<
    string,
    { email: string; displayName: string }
  >();
  for (const doc of trainerSnap.docs) {
    const data = doc.data() as { email?: string; displayName?: string };
    coachByUid.set(doc.id, {
      email: data.email ?? "",
      displayName: data.displayName ?? data.email ?? doc.id,
    });
  }

  const [habitsSnap, templatesSnap, assignmentsSnap, mirrorSnap, usersSnap] =
    await Promise.all([
      db
        .collection(FirestoreCollections.habits)
        .orderBy("createdAt", "desc")
        .limit(120)
        .get(),
      db
        .collection(FirestoreCollections.workoutTemplates)
        .orderBy("createdAt", "desc")
        .limit(120)
        .get(),
      db
        .collection(FirestoreCollections.workoutAssignments)
        .orderBy("createdAt", "desc")
        .limit(120)
        .get(),
      db
        .collection(FirestoreCollections.userMirror)
        .orderBy("createdAt", "desc")
        .limit(120)
        .get(),
      db
        .collection(FirestoreCollections.users)
        .orderBy("createdAt", "desc")
        .limit(160)
        .get(),
    ]);

  const clientEmailByUid = new Map<string, string>();
  for (const doc of usersSnap.docs) {
    const data = doc.data() as { email?: string; role?: string };
    if (data.role === "client" && typeof data.email === "string" && data.email.length > 0) {
      clientEmailByUid.set(doc.id, data.email);
    }
  }

  const rows: CoachActivityRow[] = [];

  for (const doc of habitsSnap.docs) {
    const data = doc.data() as {
      trainerId?: string;
      clientId?: string;
      pendingEmail?: string;
      createdAt?: unknown;
      title?: string;
      name?: unknown;
    };
    const coachUid = data.trainerId ?? "";
    const coach = coachByUid.get(coachUid);
    if (!coach) continue;
    let habitName = "";
    if (typeof data.title === "string") habitName = data.title;
    else if (data.name && typeof data.name === "object") {
      const raw = data.name as Record<string, unknown>;
      if (typeof raw.es === "string") habitName = raw.es;
      else if (typeof raw.en === "string") habitName = raw.en;
    }
    const clientUid = typeof data.clientId === "string" ? data.clientId : null;
    const pendingEmail =
      typeof data.pendingEmail === "string" && data.pendingEmail.length > 0
        ? data.pendingEmail
        : null;
    rows.push({
      id: `habit:${doc.id}`,
      kind: "habit_assigned",
      coachUid,
      coachName: coach.displayName,
      coachEmail: coach.email,
      clientUid,
      clientEmail: pendingEmail ?? (clientUid ? (clientEmailByUid.get(clientUid) ?? null) : null),
      occurredAtISO: toIsoMaybe(data.createdAt),
      summary: `Assigned habit${habitName ? `: ${habitName}` : ""}`,
      recurrenceLabel: null,
      occurrences: null,
      recurrenceSeriesId: null,
    });
  }

  for (const doc of templatesSnap.docs) {
    const data = doc.data() as {
      trainerId?: string;
      createdAt?: unknown;
      name?: unknown;
    };
    const coachUid = data.trainerId ?? "";
    const coach = coachByUid.get(coachUid);
    if (!coach) continue;
    let templateName = "";
    if (typeof data.name === "string") templateName = data.name;
    else if (
      data.name &&
      typeof data.name === "object" &&
      typeof (data.name as Record<string, unknown>).es === "string"
    ) {
      templateName = String((data.name as Record<string, unknown>).es);
    }
    rows.push({
      id: `template:${doc.id}`,
      kind: "workout_template_created",
      coachUid,
      coachName: coach.displayName,
      coachEmail: coach.email,
      clientUid: null,
      clientEmail: null,
      occurredAtISO: toIsoMaybe(data.createdAt),
      summary: `Created workout template${templateName ? `: ${templateName}` : ""}`,
      recurrenceLabel: null,
      occurrences: null,
      recurrenceSeriesId: null,
    });
  }

  const assignmentRows: CoachActivityRow[] = [];
  for (const doc of assignmentsSnap.docs) {
    const data = doc.data() as {
      trainerId?: string;
      clientId?: string;
      pendingEmail?: string;
      createdAt?: unknown;
      templateSnapshot?: { name?: unknown };
      recurrence?: unknown;
      seriesId?: unknown;
    };
    const coachUid = data.trainerId ?? "";
    const coach = coachByUid.get(coachUid);
    if (!coach) continue;
    const nameRaw = data.templateSnapshot?.name;
    let templateName = "";
    if (typeof nameRaw === "string") templateName = nameRaw;
    else if (nameRaw && typeof nameRaw === "object") {
      const raw = nameRaw as Record<string, unknown>;
      if (typeof raw.es === "string") templateName = raw.es;
      else if (typeof raw.en === "string") templateName = raw.en;
    }
    const clientUid = typeof data.clientId === "string" ? data.clientId : null;
    const pendingEmail =
      typeof data.pendingEmail === "string" && data.pendingEmail.length > 0
        ? data.pendingEmail
        : null;
    assignmentRows.push({
      id: `assignment:${doc.id}`,
      kind: "workout_assigned",
      coachUid,
      coachName: coach.displayName,
      coachEmail: coach.email,
      clientUid,
      clientEmail: pendingEmail ?? (clientUid ? (clientEmailByUid.get(clientUid) ?? null) : null),
      occurredAtISO: toIsoMaybe(data.createdAt),
      summary: `Assigned workout${templateName ? `: ${templateName}` : ""}`,
      recurrenceLabel: recurrenceLabelFromRaw(data.recurrence),
      occurrences: 1,
      recurrenceSeriesId: typeof data.seriesId === "string" ? data.seriesId : null,
    });
  }

  const assignmentGroup = new Map<string, CoachActivityRow>();
  for (const row of assignmentRows) {
    const sourceDocId = row.id.replace("assignment:", "");
    const recurrenceKey =
      row.recurrenceLabel && row.recurrenceSeriesId
        ? `series:${row.coachUid}:${row.recurrenceSeriesId}`
        : `single:${sourceDocId}`;
    const existing = assignmentGroup.get(recurrenceKey);
    if (!existing) {
      assignmentGroup.set(recurrenceKey, row);
      continue;
    }
    const nextCount = (existing.occurrences ?? 1) + 1;
    existing.occurrences = nextCount;
    const left = existing.occurredAtISO ?? "";
    const right = row.occurredAtISO ?? "";
    if (right > left) {
      existing.occurredAtISO = row.occurredAtISO;
    }
  }
  for (const row of assignmentGroup.values()) {
    if (row.recurrenceLabel && (row.occurrences ?? 1) > 1) {
      const readable =
        row.recurrenceLabel === "daily"
          ? "daily"
          : row.recurrenceLabel === "weekly"
            ? "weekly"
            : row.recurrenceLabel === "monthly"
              ? "monthly"
              : "every n days";
      row.summary = `${row.summary} (recurring: ${readable})`;
    }
    rows.push(row);
  }

  for (const doc of mirrorSnap.docs) {
    const data = doc.data() as {
      coachId?: string;
      email?: string;
      createdAt?: unknown;
      pre_created?: boolean;
    };
    const coachUid = data.coachId ?? "";
    const coach = coachByUid.get(coachUid);
    if (!coach || data.pre_created !== true) continue;
    rows.push({
      id: `mirror:${doc.id}`,
      kind: "client_pre_provisioned",
      coachUid,
      coachName: coach.displayName,
      coachEmail: coach.email,
      clientUid: null,
      clientEmail: (data.email ?? doc.id) as string,
      occurredAtISO: toIsoMaybe(data.createdAt),
      summary: "Pre-provisioned pending client",
      recurrenceLabel: null,
      occurrences: null,
      recurrenceSeriesId: null,
    });
  }

  for (const doc of usersSnap.docs) {
    const data = doc.data() as {
      role?: string;
      coachId?: string;
      email?: string;
      createdAt?: unknown;
      deleted?: boolean;
    };
    if (data.role !== "client") continue;
    if (data.deleted === true) continue;
    const coachUid = data.coachId ?? "";
    const coach = coachByUid.get(coachUid);
    if (!coach) continue;
    rows.push({
      id: `first-login:${doc.id}`,
      kind: "client_first_login",
      coachUid,
      coachName: coach.displayName,
      coachEmail: coach.email,
      clientUid: doc.id,
      clientEmail: data.email ?? null,
      occurredAtISO: toIsoMaybe(data.createdAt),
      summary: "Client completed first login",
      recurrenceLabel: null,
      occurrences: null,
      recurrenceSeriesId: null,
    });
  }

  rows.sort((a, b) => {
    const ta = a.occurredAtISO ?? "";
    const tb = b.occurredAtISO ?? "";
    return tb.localeCompare(ta);
  });

  return rows.slice(0, Math.max(1, Math.min(limit, 200)));
}

const removeAllowlistSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function removeCoachEmailFromAllowlist(input: unknown): Promise<{ ok: true }> {
  await getCurrentAdmin();
  const parsed = removeAllowlistSchema.parse(input);
  const db = gcFitnessFirestore();
  await db.collection(FirestoreCollections.coachAllowlist).doc(parsed.email).delete();
  return { ok: true };
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
  kind: "delete_client_cascade" | "delete_coach_cascade" | "transfer_client";
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

export async function getDeletionTargetInfo(uid: string): Promise<DeletionTargetInfo> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const snap = await db.collection(FirestoreCollections.users).doc(uid).get();
  if (!snap.exists) {
    return { exists: false, role: null, email: null, displayName: null };
  }
  return {
    exists: true,
    role: (snap.get("role") as string | undefined) ?? null,
    email: (snap.get("email") as string | undefined) ?? null,
    displayName: (snap.get("displayName") as string | undefined) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin god-mode (READ-ONLY): a client's workout assignments + habits.
// Verifies the client belongs to {coachUid} so the URL can't be edited to read
// a client outside the coach being inspected (same gate as the recent-logs /
// progress-photo admin readers).
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminClientAssignmentRow {
  id: string;
  title: string;
  /** First scheduled date in the (possibly recurring) series. */
  firstDate: string;
  /** Last scheduled date — equals firstDate for a one-off. */
  lastDate: string;
  scheduledTime: string | null;
  /** Status for a one-off; for a series the UI shows completedCount/occurrences. */
  status: string;
  /** Spanish recurrence label (e.g. "cada 2 días"); null for a one-off. */
  recurrenceLabel: string | null;
  /** Scheduled dates collapsed into this row (1 for a one-off). */
  occurrences: number;
  /** How many of those dates are completed. */
  completedCount: number;
}

export interface AdminClientHabitRow {
  id: string;
  name: string;
  cadence: string | null;
  scheduleType: string | null;
  reminderEnabled: boolean;
  deleted: boolean;
}

async function assertClientBelongsToCoach(
  db: FirebaseFirestore.Firestore,
  coachUid: string,
  clientId: string,
): Promise<void> {
  const snap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachUid) {
    throw new Error("Not found");
  }
}

/** Workout assignments for a client, with recurring series COLLAPSED into a
 *  single row (one row per `seriesId`, with a recurrence label + occurrence
 *  count) instead of one row per generated date. */
export async function listClientAssignmentsForAdmin(
  coachUid: string,
  clientId: string,
): Promise<AdminClientAssignmentRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  await assertClientBelongsToCoach(db, coachUid, clientId);

  // Fetch the full window: a recurring schedule explodes into one doc per date,
  // so a tight limit would split a series. Collapse by seriesId below.
  const snap = await db
    .collection(FirestoreCollections.workoutAssignments)
    .where("clientId", "==", clientId)
    .orderBy("scheduledFor", "desc")
    .limit(1000)
    .get();

  // The workout title lives on the denormalized templateSnapshot.name, which is
  // a bilingual { en, es } object (or a bare string on older docs).
  const resolveTitle = (data: Record<string, unknown>): string => {
    const snapshot = data.templateSnapshot as { name?: unknown } | undefined;
    const rawName = snapshot?.name;
    if (typeof rawName === "string" && rawName.trim().length > 0) return rawName;
    const obj = rawName as { en?: unknown; es?: unknown } | undefined;
    const es = typeof obj?.es === "string" ? obj.es : "";
    const en = typeof obj?.en === "string" ? obj.en : "";
    return es || en || "Workout";
  };

  interface Group {
    title: string;
    dates: string[];
    times: Array<string | null>;
    statuses: string[];
    recurrence: unknown;
  }
  const groups = new Map<string, Group>();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const seriesId = typeof data.seriesId === "string" ? data.seriesId : null;
    const key = seriesId ?? doc.id;
    const scheduledFor =
      typeof data.scheduledFor === "string" ? data.scheduledFor : "";
    const time =
      typeof data.scheduledTime === "string" ? data.scheduledTime : null;
    const status = typeof data.status === "string" ? data.status : "scheduled";

    const existing = groups.get(key);
    if (existing) {
      existing.dates.push(scheduledFor);
      existing.times.push(time);
      existing.statuses.push(status);
      if (!existing.recurrence && data.recurrence) {
        existing.recurrence = data.recurrence;
      }
    } else {
      groups.set(key, {
        title: resolveTitle(data),
        dates: [scheduledFor],
        times: [time],
        statuses: [status],
        recurrence: data.recurrence ?? null,
      });
    }
  }

  const rows: AdminClientAssignmentRow[] = Array.from(groups.entries()).map(
    ([key, g]) => {
      const dates = g.dates.filter((d) => d.length > 0).sort();
      const firstDate = dates[0] ?? "";
      const lastDate = dates[dates.length - 1] ?? firstDate;
      const occurrences = g.dates.length;
      const label = recurrenceLabel(g.recurrence);
      return {
        id: key,
        title: g.title,
        firstDate,
        lastDate,
        scheduledTime: g.times.find((t) => t != null) ?? null,
        status: g.statuses[0] ?? "scheduled",
        // A series shows a recurrence pill; fall back to "recurrente" if the
        // recurrence object is missing but multiple dates share a seriesId.
        recurrenceLabel: occurrences > 1 ? label ?? "recurrente" : label,
        occurrences,
        completedCount: g.statuses.filter((s) => s === "completed").length,
      };
    },
  );

  // Most recent series / one-off first.
  rows.sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
  return rows;
}

/** All of a client's habits (active first, soft-deleted shown for context). */
export async function listClientHabitsForAdmin(
  coachUid: string,
  clientId: string,
): Promise<AdminClientHabitRow[]> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  await assertClientBelongsToCoach(db, coachUid, clientId);

  const snap = await db
    .collection(FirestoreCollections.habits)
    .where("clientId", "==", clientId)
    .limit(100)
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const name = data.name as { en?: unknown; es?: unknown } | undefined;
      const es = typeof name?.es === "string" ? name.es : "";
      const en = typeof name?.en === "string" ? name.en : "";
      return {
        id: doc.id,
        name: es || en || "—",
        cadence:
          typeof data.scheduleCadence === "string"
            ? data.scheduleCadence
            : null,
        scheduleType:
          typeof data.scheduleType === "string" ? data.scheduleType : null,
        reminderEnabled: data.reminderEnabled === true,
        deleted: data.deleted === true,
      };
    })
    .sort((a, b) => Number(a.deleted) - Number(b.deleted));
}

const deactivateClientSchema = z.object({
  coachUid: z.string().trim().min(6).max(128),
  clientUid: z.string().trim().min(6).max(128),
});

export async function deactivateClientForCoach(input: unknown): Promise<{ ok: true }> {
  const admin = await getCurrentAdmin();
  const parsed = deactivateClientSchema.parse(input);
  const db = gcFitnessFirestore();
  const ref = db.collection(FirestoreCollections.users).doc(parsed.clientUid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Client not found.");
  }
  if (snap.get("coachId") !== parsed.coachUid) {
    throw new Error("Client does not belong to this coach.");
  }

  await ref.update({
    deleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    deactivatedBy: admin.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  try {
    await gcFitnessAuth().updateUser(parsed.clientUid, { disabled: true });
  } catch {
    // fail-soft
  }
  await writeAdminOperationLog({
    actorUid: admin.uid,
    kind: "delete_client_cascade",
    mode: "execute",
    targetUid: parsed.clientUid,
    status: "success",
    summary: { action: "deactivate_client", coachUid: parsed.coachUid },
  });
  return { ok: true };
}

const transferClientSchema = z.object({
  clientUid: z.string().trim().min(6).max(128),
  newCoachUid: z.string().trim().min(6).max(128),
});

/**
 * Move a client from their current coach to a different one. Built for the
 * App Store review fallback: brand-new sign-ups with no mirror are auto-attached
 * to a default coach (see DEFAULT_FALLBACK_COACH_ID in the functions repo), and
 * an admin uses this to re-home them onto the correct coach.
 *
 * Re-points the canonical client doc (coachId + denormalized coachDisplayName /
 * coachPhotoURL), moves the 1:1 chat doc to the new coach, and resyncs the
 * client's `coachId` custom claim (fail-soft — the Firestore doc is the source
 * of truth; the claim catches up on the client's next token refresh).
 *
 * NOTE: historical content authored by the OLD coach (workout_assignments /
 * habits tagged with the old trainerId) is intentionally left in place — the
 * client keeps seeing it, the new coach authors fresh content going forward.
 */
export async function transferClientToCoach(
  input: unknown,
): Promise<{ ok: true; clientUid: string; newCoachUid: string }> {
  const admin = await getCurrentAdmin();
  const parsed = transferClientSchema.parse(input);
  const db = gcFitnessFirestore();

  const clientRef = db.collection(FirestoreCollections.users).doc(parsed.clientUid);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    throw new Error("Client not found.");
  }
  if (clientSnap.get("role") === "trainer") {
    throw new Error("That user is a coach, not a client — cannot transfer.");
  }
  const currentCoachId = (clientSnap.get("coachId") as string | undefined) ?? null;
  if (currentCoachId === parsed.newCoachUid) {
    throw new Error("Client is already linked to this coach.");
  }

  const newCoachRef = db.collection(FirestoreCollections.users).doc(parsed.newCoachUid);
  const newCoachSnap = await newCoachRef.get();
  if (!newCoachSnap.exists) {
    throw new Error("Destination coach not found.");
  }
  if (newCoachSnap.get("role") !== "trainer") {
    throw new Error("Destination user is not a coach.");
  }

  const newCoachDisplayName =
    (newCoachSnap.get("displayName") as string | undefined)?.trim() ||
    ((newCoachSnap.get("email") as string | undefined) ?? "").split("@")[0] ||
    "";
  const newCoachPhotoURL =
    (newCoachSnap.get("photoURL") as string | undefined) ?? null;

  const chatRef = db.collection(FirestoreCollections.chats).doc(parsed.clientUid);
  const chatSnap = await chatRef.get();

  const batch = db.batch();
  batch.update(clientRef, {
    coachId: parsed.newCoachUid,
    coachDisplayName: newCoachDisplayName,
    coachPhotoURL: newCoachPhotoURL,
    // Transferring counts as triage — drop the "NEW" auto-assigned flag so the
    // destination coach's roster doesn't keep flagging it.
    autoAssignedCoach: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (chatSnap.exists) {
    batch.update(chatRef, {
      coachId: parsed.newCoachUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  // Keep the custom claim in sync (firestore.rules compare
  // request.auth.token.coachId). Fail-soft — the doc write above already
  // re-homed the client; the claim resyncs on the client's next token refresh.
  try {
    const authUser = await gcFitnessAuth().getUser(parsed.clientUid);
    const current = (authUser.customClaims ?? {}) as Record<string, unknown>;
    await gcFitnessAuth().setCustomUserClaims(parsed.clientUid, {
      ...current,
      role: "client",
      coachId: parsed.newCoachUid,
    });
  } catch {
    // fail-soft
  }

  await writeAdminOperationLog({
    actorUid: admin.uid,
    kind: "transfer_client",
    mode: "execute",
    targetUid: parsed.clientUid,
    status: "success",
    summary: {
      action: "transfer_client",
      fromCoachId: currentCoachId,
      toCoachId: parsed.newCoachUid,
    },
  });

  return { ok: true, clientUid: parsed.clientUid, newCoachUid: parsed.newCoachUid };
}

const removePendingSchema = z.object({
  coachUid: z.string().trim().min(6).max(128),
  email: z.string().trim().toLowerCase().email(),
});

export async function removePendingClientForCoach(input: unknown): Promise<{ ok: true }> {
  const admin = await getCurrentAdmin();
  const parsed = removePendingSchema.parse(input);
  const db = gcFitnessFirestore();
  const ref = db.collection(FirestoreCollections.userMirror).doc(parsed.email);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  if (snap.get("coachId") !== parsed.coachUid) {
    throw new Error("Pending client does not belong to this coach.");
  }
  await ref.delete();
  await writeAdminOperationLog({
    actorUid: admin.uid,
    kind: "delete_client_cascade",
    mode: "execute",
    targetUid: parsed.coachUid,
    status: "success",
    summary: { action: "remove_pending_client", email: parsed.email },
  });
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// App version config (force-update gate)
//
// Single doc `/app_config/mobile` holding the per-platform minimum supported
// native build + store URLs that the iOS/Android apps read at launch to force
// out-of-date clients to update. This backoffice is the SOLE writer (the
// firestore.rules `/app_config/{docId}` block denies every client-SDK write);
// these Admin-SDK writes bypass the rules. Read is public on the doc so the
// app gate works pre-sign-in.
//
// `minBuild` is the gate the app actually compares against (native
// CFBundleVersion / versionCode — a monotonic integer, unambiguous). The
// `latestVersion` marketing string is display-only (shown in the "please
// update" copy). The Swift consumer is `AppConfig` / `ForceUpdatePolicy` in
// GCFitnessCore.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppVersionPlatformConfig {
  /** Minimum acceptable native build. `0` disables the gate for the platform. */
  minBuild: number;
  /** Marketing version of the minimum release (display-only), e.g. "1.2.0". */
  latestVersion: string;
  /** Store listing URL the app's update button opens. */
  storeUrl: string;
}

export interface AppVersionConfig {
  ios: AppVersionPlatformConfig;
  android: AppVersionPlatformConfig;
  updatedAtISO: string | null;
  updatedBy: string | null;
}

const APP_CONFIG_DOC_ID = "mobile";

const EMPTY_PLATFORM_CONFIG: AppVersionPlatformConfig = {
  minBuild: 0,
  latestVersion: "",
  storeUrl: "",
};

// storeUrl: empty (gate not yet published) OR an http(s) URL. latestVersion:
// empty OR a dotted version (1, 1.2, 1.2.0). minBuild: non-negative int.
const platformConfigSchema = z.object({
  minBuild: z.coerce.number().int().min(0).max(2_147_483_647),
  latestVersion: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^\d+(\.\d+){0,3}$/.test(v), {
      message: "Use a dotted version like 1.2.0 (or leave blank).",
    }),
  storeUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), {
      message: "Must be an http(s) URL (or leave blank).",
    }),
});

const updateAppVersionConfigSchema = z.object({
  ios: platformConfigSchema,
  android: platformConfigSchema,
});

export type UpdateAppVersionConfigInput = z.input<
  typeof updateAppVersionConfigSchema
>;

function coercePlatform(raw: unknown): AppVersionPlatformConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const minBuildRaw = obj.minBuild;
  const minBuild =
    typeof minBuildRaw === "number" && Number.isFinite(minBuildRaw)
      ? Math.max(0, Math.trunc(minBuildRaw))
      : 0;
  return {
    minBuild,
    latestVersion: typeof obj.latestVersion === "string" ? obj.latestVersion : "",
    storeUrl: typeof obj.storeUrl === "string" ? obj.storeUrl : "",
  };
}

/**
 * Reads the current `/app_config/mobile` document. Admin-gated. Returns
 * zeroed defaults when the doc has never been written so the form renders a
 * disabled gate (minBuild 0) instead of throwing.
 */
export async function getAppVersionConfig(): Promise<AppVersionConfig> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.appConfig)
    .doc(APP_CONFIG_DOC_ID)
    .get();

  if (!snap.exists) {
    return {
      ios: { ...EMPTY_PLATFORM_CONFIG },
      android: { ...EMPTY_PLATFORM_CONFIG },
      updatedAtISO: null,
      updatedBy: null,
    };
  }

  const updatedAt = snap.get("updatedAt");
  const updatedAtISO =
    updatedAt && typeof updatedAt.toDate === "function"
      ? updatedAt.toDate().toISOString()
      : null;
  const updatedBy = snap.get("updatedBy");

  return {
    ios: coercePlatform(snap.get("ios")),
    android: coercePlatform(snap.get("android")),
    updatedAtISO,
    updatedBy: typeof updatedBy === "string" ? updatedBy : null,
  };
}

/**
 * Writes the `/app_config/mobile` document. Admin-gated + Zod-validated BEFORE
 * any write (defense in depth — the rules already deny client writes, but the
 * Admin SDK bypasses them, so validation here is the real guard). Records the
 * acting admin email + server timestamp for the audit trail.
 */
export async function updateAppVersionConfig(
  input: unknown,
): Promise<{ ok: true }> {
  const admin = await getCurrentAdmin();
  const parsed = updateAppVersionConfigSchema.parse(input);

  const db = gcFitnessFirestore();
  await db
    .collection(FirestoreCollections.appConfig)
    .doc(APP_CONFIG_DOC_ID)
    .set(
      {
        ios: parsed.ios,
        android: parsed.android,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.email,
      },
      { merge: true },
    );

  return { ok: true };
}

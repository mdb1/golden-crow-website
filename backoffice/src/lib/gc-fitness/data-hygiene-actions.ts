"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { gcFitnessFirestore, gcFitnessStorage } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentAdmin } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { deleteClientCascade, deleteCoachCascade } from "./admin-actions";

const PAGE_SIZE = 20;
const SCAN_LIMIT = 120;

export type DataHygieneKind =
  | "user"
  | "chat"
  | "photo"
  | "template"
  | "assignment"
  | "log"
  | "exercise";

export interface DataHygieneRow {
  id: string;
  kind: DataHygieneKind;
  title: string;
  detail: string;
  issue: string;
  sortAtISO: string | null;
  userId?: string;
  userRole?: string | null;
  chatId?: string;
  clientId?: string | null;
  coachId?: string | null;
  photoId?: string;
  storagePath?: string | null;
  templateId?: string;
  assignmentId?: string;
  logId?: string;
  exerciseId?: string;
  ownerId?: string | null;
  source?: string | null;
}

export interface DataHygienePage {
  rows: DataHygieneRow[];
  nextOffset: number | null;
  hasMore: boolean;
  summary: Record<DataHygieneKind, number>;
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Firestore rejects document IDs matching `/^__.*__$/` ("reserved"). The shared
 * standard workout templates use the `__standard__` sentinel as their owner
 * (`trainerId: "__standard__"`), so resolving one through
 * `db.collection('users').doc(trainerId)` throws
 *   `INVALID_ARGUMENT: Resource id "__standard__" is invalid because it is reserved`
 * — which previously killed the ENTIRE hygiene scan (all four loaders run under
 * one `Promise.all`).
 *
 * Treat any reserved owner/reference id as a VALID system owner: never
 * point-read it (that throws) and never flag it as an orphan (a `__standard__`
 * template is legitimately system-owned, not structurally broken).
 */
function isReservedId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^__.+__$/.test(value);
}

/**
 * Resolve a referenced user by id through `cache`, falling back to a single
 * point read (cached). Returns the sentinel `"reserved"` for Firestore reserved
 * ids (e.g. `__standard__`) so callers skip the existence/role validation
 * instead of point-reading (which throws) or false-flagging it as missing.
 */
async function resolveUserRef(
  db: FirebaseFirestore.Firestore,
  cache: Map<string, Record<string, unknown> | null>,
  id: string,
): Promise<Record<string, unknown> | null | "reserved"> {
  if (isReservedId(id)) return "reserved";
  if (cache.has(id)) return cache.get(id) ?? null;
  const snap = await db.collection(FirestoreCollections.users).doc(id).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  cache.set(id, data);
  return data;
}

function normalizeScanSort(iso: string | null): string {
  return iso ?? "";
}

function summarize(rows: DataHygieneRow[]): Record<DataHygieneKind, number> {
  const summary: Record<DataHygieneKind, number> = {
    user: 0,
    chat: 0,
    photo: 0,
    template: 0,
    assignment: 0,
    log: 0,
    exercise: 0,
  };
  for (const row of rows) {
    summary[row.kind] += 1;
  }
  return summary;
}

/**
 * Run `task` over `items` with a bounded number of concurrent in-flight
 * promises. Used to parallelize the per-photo Storage existence checks in the
 * hygiene scan: doing them sequentially made the page-load scan grow O(n) in
 * round-trips (~400ms each) and blow the Vercel serverless timeout once enough
 * progress photos accumulated (260604 — a 23-photo scan took ~9s of storage
 * round-trips alone → 504 on page open). A cap keeps us from firing hundreds of
 * Storage requests at once when the photo count is large.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function deleteStorageObjectIfPresent(storagePath?: string | null): Promise<void> {
  if (!storagePath) return;
  const path = storagePath.trim();
  if (path.length === 0) return;
  try {
    await gcFitnessStorage().bucket().file(path).delete({ ignoreNotFound: true });
  } catch {
    // Best-effort cleanup.
  }
}

async function hardDeleteQueryDocs(
  collectionName: string,
  field: string,
  value: string,
): Promise<number> {
  const db = gcFitnessFirestore();
  const snap = await db.collection(collectionName).where(field, "==", value).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return snap.size;
}

async function loadUserAnomalies(): Promise<DataHygieneRow[]> {
  const db = gcFitnessFirestore();
  const usersSnap = await db.collection(FirestoreCollections.users).limit(SCAN_LIMIT).get();
  const liveByUid = new Map<string, { role: string | null; deleted: boolean } | null>();
  for (const doc of usersSnap.docs) {
    liveByUid.set(doc.id, {
      role: safeString((doc.data() as { role?: string }).role),
      deleted: doc.get("deleted") === true,
    });
  }

  const rows: DataHygieneRow[] = [];
  for (const doc of usersSnap.docs) {
    const data = doc.data() as { role?: string };
    const role = safeString(data.role);
    const displayName = safeString(doc.get("displayName")) ?? "Unnamed user";
    const email = safeString(doc.get("email")) ?? "No email";
    const coachId = safeString(doc.get("coachId"));
    const deleted = doc.get("deleted") === true;
    const issues: string[] = [];

    if (!role || (role !== "client" && role !== "trainer")) {
      issues.push("Invalid role");
    }
    if (role === "client") {
      if (!coachId) {
        issues.push("Missing coachId");
      } else if (!isReservedId(coachId)) {
        let coach = liveByUid.get(coachId);
        if (!coach) {
          const coachSnap = await db.collection(FirestoreCollections.users).doc(coachId).get();
          coach = coachSnap.exists
            ? {
                role: safeString((coachSnap.data() as Record<string, unknown>).role),
                deleted: coachSnap.get("deleted") === true,
              }
            : null;
        liveByUid.set(coachId, coach);
        }
        if (!coach || coach.role !== "trainer" || coach.deleted) {
          issues.push("Coach doc missing");
        }
      }
    }
    if (role === "trainer" && deleted) {
      const dependentClientCount = usersSnap.docs.filter(
        (candidate) => candidate.get("coachId") === doc.id && candidate.get("deleted") !== true,
      ).length;
      if (dependentClientCount > 0) {
        issues.push(`Deleted trainer still has ${dependentClientCount} client(s)`);
      }
    }

    if (issues.length === 0) continue;

    rows.push({
      id: `user:${doc.id}`,
      kind: "user",
      title: displayName,
      detail: `${email} · ${role ?? "unknown"} · ${doc.id}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(doc.get("updatedAt")) ?? toIso(doc.get("createdAt"))),
      userId: doc.id,
      userRole: role,
      clientId: role === "client" ? doc.id : undefined,
      coachId,
    });
  }

  return rows;
}

async function loadChatAnomalies(): Promise<DataHygieneRow[]> {
  const db = gcFitnessFirestore();
  const [chatsSnap, usersSnap] = await Promise.all([
    db.collection(FirestoreCollections.chats).limit(SCAN_LIMIT).get(),
    db.collection(FirestoreCollections.users).limit(SCAN_LIMIT).get(),
  ]);

  const userMap = new Map<string, Record<string, unknown> | null>();
  for (const doc of usersSnap.docs) {
    userMap.set(doc.id, doc.data() as Record<string, unknown>);
  }

  const rows: DataHygieneRow[] = [];
  for (const doc of chatsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const clientId = safeString(data.clientId);
    const coachId = safeString(data.coachId);
    const issues: string[] = [];

    if (doc.id !== clientId) {
      issues.push("Chat doc id does not match clientId");
    }
    if (!clientId) {
      issues.push("Missing clientId");
    } else {
      const clientDoc = await resolveUserRef(db, userMap, clientId);
      if (clientDoc !== "reserved") {
        if (!clientDoc) {
          issues.push("Client doc missing");
        } else if (clientDoc.role !== "client") {
          issues.push("Client doc has the wrong role");
        }
      }
    }
    if (!coachId) {
      issues.push("Missing coachId");
    } else {
      const coachDoc = await resolveUserRef(db, userMap, coachId);
      if (coachDoc !== "reserved") {
        if (!coachDoc) {
          issues.push("Coach doc missing");
        } else if (coachDoc.role !== "trainer") {
          issues.push("Coach doc has the wrong role");
        }
      }
    }
    if (!safeString(data.createdAt) && !toIso(data.createdAt)) {
      issues.push("Missing createdAt");
    }

    if (issues.length === 0) continue;

    rows.push({
      id: `chat:${doc.id}`,
      kind: "chat",
      title: clientId ?? doc.id,
      detail: `chatId=${doc.id} · coachId=${coachId ?? "—"} · clientId=${clientId ?? "—"}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(data.updatedAt) ?? toIso(data.lastMessageAt) ?? toIso(data.createdAt)),
      chatId: doc.id,
      clientId,
      coachId,
    });
  }

  return rows;
}

async function loadPhotoAnomalies(): Promise<DataHygieneRow[]> {
  const db = gcFitnessFirestore();
  const [photosSnap, usersSnap] = await Promise.all([
    db.collection(FirestoreCollections.progressPhotos).limit(SCAN_LIMIT).get(),
    db.collection(FirestoreCollections.users).limit(SCAN_LIMIT).get(),
  ]);
  const userMap = new Map<string, Record<string, unknown> | null>();
  for (const doc of usersSnap.docs) {
    userMap.set(doc.id, doc.data() as Record<string, unknown>);
  }

  // Pre-resolve every photo's Storage existence IN PARALLEL (bounded) before
  // building rows. Sequential `.exists()` calls dominated the scan wall-clock
  // and timed the page out (see mapWithConcurrency). Each result is one of
  // "ok" (exists), "missing", or "failed" (the check itself errored).
  const bucket = gcFitnessStorage().bucket();
  type StorageState = "ok" | "missing" | "failed";
  const storageStateByPath = new Map<string, StorageState>();
  const pathsToCheck = Array.from(
    new Set(
      photosSnap.docs
        .map((doc) => safeString((doc.data() as Record<string, unknown>).storagePath))
        .filter((p): p is string => p !== null),
    ),
  );
  const states = await mapWithConcurrency(pathsToCheck, 12, async (path): Promise<StorageState> => {
    try {
      const [exists] = await bucket.file(path).exists();
      return exists ? "ok" : "missing";
    } catch {
      return "failed";
    }
  });
  pathsToCheck.forEach((path, index) => storageStateByPath.set(path, states[index]));

  const rows: DataHygieneRow[] = [];
  for (const doc of photosSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const clientId = safeString(data.clientId);
    const storagePath = safeString(data.storagePath);
    const issues: string[] = [];

    if (!clientId) {
      issues.push("Missing clientId");
    } else {
      const clientDoc = await resolveUserRef(db, userMap, clientId);
      if (clientDoc !== "reserved") {
        if (!clientDoc) {
          issues.push("Client doc missing");
        } else if (clientDoc.role !== "client") {
          issues.push("Client doc has the wrong role");
        }
      }
    }
    if (!storagePath) {
      issues.push("Missing storagePath");
    } else {
      const state = storageStateByPath.get(storagePath);
      if (state === "missing") {
        issues.push("Storage object missing");
      } else if (state === "failed") {
        issues.push("Storage object check failed");
      }
    }

    if (issues.length === 0) continue;

    rows.push({
      id: `photo:${doc.id}`,
      kind: "photo",
      title: safeString(data.caption) ?? doc.id,
      detail: `clientId=${clientId ?? "—"} · storagePath=${storagePath ?? "—"}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(data.createdAt) ?? toIso(data.takenAt)),
      photoId: doc.id,
      clientId,
      storagePath,
    });
  }

  return rows;
}

async function loadWorkoutAnomalies(): Promise<DataHygieneRow[]> {
  const db = gcFitnessFirestore();
  const [templatesSnap, assignmentsSnap, logsSnap, exercisesSnap, usersSnap] = await Promise.all([
    db.collection(FirestoreCollections.workoutTemplates).limit(SCAN_LIMIT).get(),
    db.collection(FirestoreCollections.workoutAssignments).limit(SCAN_LIMIT).get(),
    db.collection(FirestoreCollections.workoutLogs).limit(SCAN_LIMIT).get(),
    db.collection(FirestoreCollections.exercises).limit(SCAN_LIMIT).get(),
    db.collection(FirestoreCollections.users).limit(SCAN_LIMIT).get(),
  ]);

  const userMap = new Map<string, Record<string, unknown> | null>();
  for (const doc of usersSnap.docs) {
    userMap.set(doc.id, doc.data() as Record<string, unknown>);
  }

  const rows: DataHygieneRow[] = [];

  for (const doc of templatesSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const trainerId = safeString(data.trainerId);
    const issues: string[] = [];
    if (!trainerId) {
      issues.push("Missing trainerId");
    } else {
      const trainerDoc = await resolveUserRef(db, userMap, trainerId);
      // "reserved" → the `__standard__` system owner of a shared standard
      // template; legitimately not a real trainer doc, so not an anomaly.
      if (trainerDoc !== "reserved") {
        if (!trainerDoc) {
          issues.push("Trainer doc missing");
        } else if (trainerDoc.role !== "trainer") {
          issues.push("Trainer doc has the wrong role");
        }
      }
    }
    if (issues.length === 0) continue;
    rows.push({
      id: `template:${doc.id}`,
      kind: "template",
      title: safeString((data.name as Record<string, string> | undefined)?.en) ?? doc.id,
      detail: `trainerId=${trainerId ?? "—"} · deleted=${data.deleted === true ? "yes" : "no"}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(data.updatedAt) ?? toIso(data.createdAt)),
      templateId: doc.id,
      coachId: trainerId,
    });
  }

  for (const doc of assignmentsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const trainerId = safeString(data.trainerId);
    const clientId = safeString(data.clientId);
    const issues: string[] = [];
    if (!trainerId) {
      issues.push("Missing trainerId");
    } else {
      const trainerDoc = await resolveUserRef(db, userMap, trainerId);
      if (trainerDoc !== "reserved") {
        if (!trainerDoc) {
          issues.push("Trainer doc missing");
        } else if (trainerDoc.role !== "trainer") {
          issues.push("Trainer doc has the wrong role");
        }
      }
    }
    if (!clientId) {
      issues.push("Missing clientId");
    } else {
      const clientDoc = await resolveUserRef(db, userMap, clientId);
      if (clientDoc !== "reserved") {
        if (!clientDoc) {
          issues.push("Client doc missing");
        } else if (clientDoc.role !== "client") {
          issues.push("Client doc has the wrong role");
        }
      }
    }
    if (issues.length === 0) continue;
    rows.push({
      id: `assignment:${doc.id}`,
      kind: "assignment",
      title: safeString((data.templateSnapshot as { name?: { en?: string } } | undefined)?.name?.en) ?? doc.id,
      detail: `trainerId=${trainerId ?? "—"} · clientId=${clientId ?? "—"} · status=${safeString(data.status) ?? "unknown"}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(data.updatedAt) ?? toIso(data.createdAt) ?? toIso(data.scheduledFor)),
      assignmentId: doc.id,
      clientId,
      coachId: trainerId,
    });
  }

  for (const doc of logsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const trainerId = safeString(data.trainerId);
    const clientId = safeString(data.clientId);
    const assignmentId = safeString(data.assignmentId) ?? safeString(data.assignment_id);
    const issues: string[] = [];
    if (!trainerId) {
      issues.push("Missing trainerId");
    } else {
      const trainerDoc = await resolveUserRef(db, userMap, trainerId);
      if (trainerDoc !== "reserved") {
        if (!trainerDoc) {
          issues.push("Trainer doc missing");
        } else if (trainerDoc.role !== "trainer") {
          issues.push("Trainer doc has the wrong role");
        }
      }
    }
    if (!clientId) {
      issues.push("Missing clientId");
    } else if (isReservedId(clientId)) {
      // System sentinel owner — not an anomaly.
    } else if (!userMap.has(clientId)) {
      issues.push("Client doc missing");
    } else if (userMap.get(clientId)?.role !== "client") {
      issues.push("Client doc has the wrong role");
    }
    if (!assignmentId) {
      issues.push("Missing assignmentId");
    } else {
      const assignmentExists = assignmentsSnap.docs.some((assignment) => assignment.id === assignmentId);
      if (!assignmentExists) {
        issues.push("Assignment doc missing");
      }
    }
    if (issues.length === 0) continue;
    rows.push({
      id: `log:${doc.id}`,
      kind: "log",
      title: safeString((data.templateSnapshot as { name?: { en?: string } } | undefined)?.name?.en) ?? doc.id,
      detail: `logId=${doc.id} · assignmentId=${assignmentId ?? "—"} · clientId=${clientId ?? "—"}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(data.updatedAt) ?? toIso(data.completedAt) ?? toIso(data.startedAt)),
      logId: doc.id,
      assignmentId: assignmentId ?? undefined,
      clientId,
      coachId: trainerId,
    });
  }

  for (const doc of exercisesSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const source = safeString(data.source);
    const ownerId = safeString(data.ownerId);
    const issues: string[] = [];
    if (source && source !== "trainer" && source !== "wger" && source !== "free-exercise-db") {
      issues.push("Invalid source");
    }
    if (source === "trainer") {
      if (!ownerId) {
        issues.push("Missing ownerId");
      } else if (isReservedId(ownerId)) {
        // System/standard-library sentinel owner — not an anomaly.
      } else if (!userMap.has(ownerId)) {
        issues.push("Trainer doc missing");
      } else if (userMap.get(ownerId)?.role !== "trainer") {
        issues.push("Trainer doc has the wrong role");
      }
    }
    if (issues.length === 0) continue;
    rows.push({
      id: `exercise:${doc.id}`,
      kind: "exercise",
      title: safeString((data.name as { en?: string } | undefined)?.en) ?? doc.id,
      detail: `exerciseId=${doc.id} · source=${source ?? "unknown"} · ownerId=${ownerId ?? "—"}`,
      issue: issues.join(" · "),
      sortAtISO: normalizeScanSort(toIso(data.updatedAt) ?? toIso(data.createdAt)),
      exerciseId: doc.id,
      ownerId,
      source,
    });
  }

  return rows;
}

async function loadAllDataHygieneRows(): Promise<DataHygieneRow[]> {
  const [users, chats, photos, workouts] = await Promise.all([
    loadUserAnomalies(),
    loadChatAnomalies(),
    loadPhotoAnomalies(),
    loadWorkoutAnomalies(),
  ]);

  return [...users, ...chats, ...photos, ...workouts].sort((a, b) => {
    const ta = a.sortAtISO ?? "";
    const tb = b.sortAtISO ?? "";
    return tb.localeCompare(ta) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
  });
}

export async function listDataHygienePage(
  offset = 0,
  pageSize = PAGE_SIZE,
): Promise<DataHygienePage> {
  await getCurrentAdmin();
  const rows = await loadAllDataHygieneRows();
  const clampedOffset = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0);
  const clampedPageSize = Math.max(1, Math.min(50, Math.floor(pageSize)));
  const pageRows = rows.slice(clampedOffset, clampedOffset + clampedPageSize);
  const nextOffset = clampedOffset + clampedPageSize;
  return {
    rows: pageRows,
    nextOffset: nextOffset < rows.length ? nextOffset : null,
    hasMore: nextOffset < rows.length,
    summary: summarize(rows),
  };
}

export async function purgeDataHygieneItem(formData: FormData): Promise<void> {
  await getCurrentAdmin();

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const redirectKind = kind || "item";

  if (!kind || !id) {
    throw new Error("Missing purge target.");
  }

  const db = gcFitnessFirestore();
  switch (kind as DataHygieneKind) {
    case "user": {
      const role = String(formData.get("role") ?? "");
      const userId = String(formData.get("userId") ?? id);
      if (role === "trainer") {
        await deleteCoachCascade({
          coachUid: userId,
          confirmation: "DELETE COACH",
          mode: "execute",
        });
      } else {
        await deleteClientCascade({
          clientUid: userId,
          confirmation: "DELETE CLIENT",
          mode: "execute",
        });
      }
      break;
    }
    case "chat": {
      const chatId = String(formData.get("chatId") ?? id.replace(/^chat:/, ""));
      await db.recursiveDelete(db.collection(FirestoreCollections.chats).doc(chatId));
      break;
    }
    case "photo": {
      const photoId = String(formData.get("photoId") ?? id.replace(/^photo:/, ""));
      const storagePath = String(formData.get("storagePath") ?? "");
      await deleteStorageObjectIfPresent(storagePath);
      await db.collection(FirestoreCollections.progressPhotos).doc(photoId).delete();
      break;
    }
    case "template": {
      const templateId = String(formData.get("templateId") ?? id.replace(/^template:/, ""));
      await db.collection(FirestoreCollections.workoutTemplates).doc(templateId).delete();
      break;
    }
    case "assignment": {
      const assignmentId = String(formData.get("assignmentId") ?? id.replace(/^assignment:/, ""));
      await hardDeleteQueryDocs(FirestoreCollections.workoutLogs, "assignmentId", assignmentId);
      await hardDeleteQueryDocs(FirestoreCollections.workoutLogs, "assignment_id", assignmentId);
      await db.collection(FirestoreCollections.workoutAssignments).doc(assignmentId).delete();
      break;
    }
    case "log": {
      const logId = String(formData.get("logId") ?? id.replace(/^log:/, ""));
      await db.collection(FirestoreCollections.workoutLogs).doc(logId).delete();
      break;
    }
    case "exercise": {
      const exerciseId = String(formData.get("exerciseId") ?? id.replace(/^exercise:/, ""));
      await db.collection(FirestoreCollections.exercises).doc(exerciseId).delete();
      break;
    }
    default:
      throw new Error(`Unsupported purge kind: ${redirectKind}`);
  }

  revalidatePath("/gc-fitness/admin/hygiene");
  redirect(`/gc-fitness/admin/hygiene?op=${encodeURIComponent(kind)}&ok=1`);
}

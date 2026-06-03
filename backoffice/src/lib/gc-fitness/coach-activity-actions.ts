"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { COACH_ACTIVITY_COLLECTION } from "@/lib/gc-fitness/coach-activity-log";

export type CoachActivityKind =
  | "workout_template"
  | "exercise"
  | "workout_assignment"
  | "habit_assignment"
  | "note"
  | "chat";

export interface MyCoachActivityRow {
  id: string;
  kind: CoachActivityKind;
  occurredAt: string | null;
  title: string;
  detail: string | null;
  clientId: string | null;
  clientName: string | null;
  /** True when this row represents a DELETION (e.g. the coach removed a habit
   *  from a client). The UI styles these distinctly (trash icon + red tone). */
  deleted?: boolean;
}

export interface MyCoachActivityPage {
  rows: MyCoachActivityRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function cursorDate(cursor: string | null | undefined): Date | null {
  if (!cursor) return null;
  const date = new Date(cursor);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localizedName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (typeof raw.es === "string" && raw.es.trim()) return raw.es;
    if (typeof raw.en === "string" && raw.en.trim()) return raw.en;
  }
  return "";
}

export async function listMyCoachActivityPage(
  cursor: string | null = null,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<MyCoachActivityPage> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const clientNameById = new Map<string, string>();
  const safePageSize = Math.max(1, Math.min(pageSize, 100));
  // Fetch FAR more docs per source than we show as rows. Recurring/bulk
  // assignments write one doc per (client, date) — a single "19 fechas" series
  // is 19 docs that collapse to ONE row (see assignment grouping below) — so a
  // tight per-source limit would let one series crowd out everything else and
  // drop the rest of the day. A generous window guarantees a full day's worth
  // of activity is present in the merge before we slice to the page.
  const queryLimit = Math.max(safePageSize + 1, 250);
  const before = cursorDate(cursor);

  async function scopedRecentQuery(collectionName: string, ownerField: "trainerId" | "coachId") {
    let query = db
      .collection(collectionName)
      .where(ownerField, "==", trainer.uid)
      .orderBy("createdAt", "desc")
      .limit(queryLimit);
    if (before) {
      query = query.where("createdAt", "<", before);
    }
    return query.get().catch((error) => {
      console.warn(
        `[gc-fitness/my-activity] ordered ${collectionName} query failed; using bounded fallback`,
        error,
      );
      if (before) return null;
      return db
        .collection(collectionName)
        .where(ownerField, "==", trainer.uid)
        .limit(queryLimit)
        .get()
        .catch(() => null);
    });
  }

  // Surfaces DELETIONS for soft-deleted collections (habits, workout templates):
  // the doc still exists with `deleted: true`, and the delete bumps `updatedAt`,
  // so a deleted doc's `updatedAt` is effectively its deletion time. Ordered by
  // `updatedAt` (the `(trainerId, deleted, updatedAt DESC)` composite index
  // already exists for both collections). Hard-deleted collections (e.g.
  // workout_assignments) leave no doc, so deletions there can't be recovered
  // without a dedicated audit log.
  async function deletedScopedQuery(collectionName: string) {
    let query = db
      .collection(collectionName)
      .where("trainerId", "==", trainer.uid)
      .where("deleted", "==", true)
      .orderBy("updatedAt", "desc")
      .limit(queryLimit);
    if (before) {
      query = query.where("updatedAt", "<", before);
    }
    return query.get().catch((error) => {
      console.warn(
        `[gc-fitness/my-activity] deleted ${collectionName} query failed; skipping deletion rows`,
        error,
      );
      return null;
    });
  }

  async function notesQuery() {
    let query = db
      .collection(FirestoreCollections.clientNotes)
      .where("coachId", "==", trainer.uid)
      .orderBy("updatedAt", "desc")
      .limit(queryLimit);
    if (before) {
      query = query.where("updatedAt", "<", before);
    }
    return query.get().catch((error) => {
      console.warn(
        "[gc-fitness/my-activity] ordered client notes query failed; using bounded fallback",
        error,
      );
      if (before) return null;
      return db
        .collection(FirestoreCollections.clientNotes)
        .where("coachId", "==", trainer.uid)
        .limit(queryLimit)
        .get()
        .catch(() => null);
    });
  }

  async function sentMessagesQuery() {
    let query = db
      .collectionGroup(FirestoreCollections.messages)
      .where("senderId", "==", trainer.uid)
      .orderBy("createdAt", "desc")
      .limit(queryLimit);
    if (before) {
      query = query.where("createdAt", "<", before);
    }
    return query.get().catch((error) => {
      console.warn(
        "[gc-fitness/my-activity] ordered sent messages query failed; skipping chat rows for this page",
        error,
      );
      return null;
    });
  }

  // Assignments are read from the `coach_activity` event log (one event per
  // assign ACTION) — NOT from raw `workout_assignments`, where a single
  // recurring assignment writes one doc per (client, date) and thousands of
  // occurrence docs made the old fan-out drop whole assignments. The log query
  // is `where(trainerId).orderBy(occurredAt desc)` over a tiny, complete set.
  async function coachActivityQuery() {
    let query = db
      .collection(COACH_ACTIVITY_COLLECTION)
      .where("trainerId", "==", trainer.uid)
      .orderBy("occurredAt", "desc")
      .limit(queryLimit);
    if (before) {
      query = query.where("occurredAt", "<", before);
    }
    return query.get().catch((error) => {
      console.warn(
        "[gc-fitness/my-activity] coach_activity query failed; assignment rows skipped this page",
        error,
      );
      return null;
    });
  }

  const [
    clientsSnap,
    templatesSnap,
    exercisesSnap,
    coachActivitySnap,
    habitsSnap,
    notesSnap,
    messagesSnap,
    deletedHabitsSnap,
    deletedTemplatesSnap,
  ] = await Promise.all([
    db.collection(FirestoreCollections.users).where("coachId", "==", trainer.uid).get(),
    scopedRecentQuery(FirestoreCollections.workoutTemplates, "trainerId"),
    scopedRecentQuery(FirestoreCollections.exercises, "trainerId"),
    coachActivityQuery(),
    scopedRecentQuery(FirestoreCollections.habits, "trainerId"),
    notesQuery(),
    sentMessagesQuery(),
    deletedScopedQuery(FirestoreCollections.habits),
    deletedScopedQuery(FirestoreCollections.workoutTemplates),
  ]);

  for (const doc of clientsSnap.docs) {
    const data = doc.data() as { displayName?: string; email?: string };
    clientNameById.set(doc.id, data.displayName ?? data.email ?? doc.id);
  }

  const rows: MyCoachActivityRow[] = [];

  for (const doc of templatesSnap?.docs ?? []) {
    const data = doc.data() as { createdAt?: unknown; updatedAt?: unknown; name?: unknown; deleted?: boolean };
    if (data.deleted === true) continue; // soft-deleted templates are not activity
    const name = localizedName(data.name);
    rows.push({
      id: `template:${doc.id}`,
      kind: "workout_template",
      occurredAt: toIso(data.createdAt ?? data.updatedAt),
      title: name ? `Workout creado: ${name}` : "Workout creado",
      detail: null,
      clientId: null,
      clientName: null,
    });
  }

  for (const doc of exercisesSnap?.docs ?? []) {
    const data = doc.data() as { createdAt?: unknown; updatedAt?: unknown; name?: unknown; title?: unknown; deleted?: boolean; deletedAt?: unknown };
    if (data.deleted === true || data.deletedAt) continue; // soft-deleted (trainer flag or curation tombstone)
    const name = localizedName(data.name) || localizedName(data.title);
    rows.push({
      id: `exercise:${doc.id}`,
      kind: "exercise",
      occurredAt: toIso(data.createdAt ?? data.updatedAt),
      title: name ? `Ejercicio creado: ${name}` : "Ejercicio creado",
      detail: null,
      clientId: null,
      clientName: null,
    });
  }

  // Assignment activity — one row per logged assign ACTION (create or delete).
  for (const doc of coachActivitySnap?.docs ?? []) {
    const data = doc.data() as {
      kind?: string;
      title?: string;
      detail?: string | null;
      clientId?: string;
      pendingEmail?: string;
      deleted?: boolean;
      occurredAt?: unknown;
    };
    const clientId = typeof data.clientId === "string" ? data.clientId : null;
    const deleted = data.deleted === true;
    let title = typeof data.title === "string" ? data.title : "Workout asignado";
    if (deleted) title = title.replace("Workout asignado:", "Workout eliminado:");
    rows.push({
      id: `coachevt:${doc.id}`,
      kind: "workout_assignment",
      deleted: deleted || undefined,
      occurredAt: toIso(data.occurredAt),
      title,
      detail: typeof data.detail === "string" ? data.detail : null,
      clientId,
      clientName: clientId
        ? clientNameById.get(clientId) ?? clientId
        : data.pendingEmail ?? null,
    });
  }

  for (const doc of habitsSnap?.docs ?? []) {
    const data = doc.data() as {
      createdAt?: unknown;
      updatedAt?: unknown;
      clientId?: string;
      pendingEmail?: string;
      name?: unknown;
      title?: unknown;
      deleted?: boolean;
    };
    if (data.deleted === true) continue; // soft-deleted habit (e.g. "Mate") is not activity
    const clientId = typeof data.clientId === "string" ? data.clientId : null;
    const name = localizedName(data.name) || localizedName(data.title);
    rows.push({
      id: `habit:${doc.id}`,
      kind: "habit_assignment",
      occurredAt: toIso(data.createdAt ?? data.updatedAt),
      title: name ? `Hábito asignado: ${name}` : "Hábito asignado",
      detail: null,
      clientId,
      clientName: clientId ? clientNameById.get(clientId) ?? clientId : data.pendingEmail ?? null,
    });
  }

  for (const doc of notesSnap?.docs ?? []) {
    const data = doc.data() as { updatedAt?: unknown; clientId?: string; entries?: Array<{ createdAt?: string; body?: string }> };
    const clientId = typeof data.clientId === "string" ? data.clientId : doc.id.replace(`${trainer.uid}_`, "");
    for (const [index, entry] of (data.entries ?? []).entries()) {
      rows.push({
        id: `note:${doc.id}:${entry.createdAt ?? index}`,
        kind: "note",
        occurredAt: toIso(entry.createdAt) ?? toIso(data.updatedAt),
        title: "Nota agregada",
        detail: typeof entry.body === "string" ? entry.body.slice(0, 120) : null,
        clientId,
        clientName: clientNameById.get(clientId) ?? clientId,
      });
    }
  }

  for (const messageDoc of messagesSnap?.docs ?? []) {
    const data = messageDoc.data() as { createdAt?: unknown; kind?: string; text?: string };
    const chatDoc = messageDoc.ref.parent.parent;
    const chatId = chatDoc?.id ?? null;
    rows.push({
      id: `chat:${chatId ?? "unknown"}:${messageDoc.id}`,
      kind: "chat",
      occurredAt: toIso(data.createdAt),
      title: data.kind === "voice" ? "Audio enviado" : data.kind === "image" ? "Imagen enviada" : "Mensaje enviado",
      detail: typeof data.text === "string" && data.text.trim() ? data.text.slice(0, 120) : null,
      clientId: chatId,
      clientName: chatId ? clientNameById.get(chatId) ?? chatId : null,
    });
  }

  // Deletion events — a soft-deleted habit/template is surfaced as a "deleted"
  // row at its deletion time (updatedAt), NOT as a stale "assigned"/"created"
  // row (those are skipped above). This is what lets a coach see, e.g., "Hábito
  // eliminado: Mate" after removing a habit from a client.
  for (const doc of deletedHabitsSnap?.docs ?? []) {
    const data = doc.data() as {
      updatedAt?: unknown;
      clientId?: string;
      pendingEmail?: string;
      name?: unknown;
      title?: unknown;
    };
    const clientId = typeof data.clientId === "string" ? data.clientId : null;
    const name = localizedName(data.name) || localizedName(data.title);
    rows.push({
      id: `habit-deleted:${doc.id}`,
      kind: "habit_assignment",
      deleted: true,
      occurredAt: toIso(data.updatedAt),
      title: name ? `Hábito eliminado: ${name}` : "Hábito eliminado",
      detail: null,
      clientId,
      clientName: clientId ? clientNameById.get(clientId) ?? clientId : data.pendingEmail ?? null,
    });
  }

  for (const doc of deletedTemplatesSnap?.docs ?? []) {
    const data = doc.data() as { updatedAt?: unknown; name?: unknown };
    const name = localizedName(data.name);
    rows.push({
      id: `template-deleted:${doc.id}`,
      kind: "workout_template",
      deleted: true,
      occurredAt: toIso(data.updatedAt),
      title: name ? `Workout eliminado: ${name}` : "Workout eliminado",
      detail: null,
      clientId: null,
      clientName: null,
    });
  }

  rows.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  const pageRows = rows.slice(0, safePageSize);
  return {
    rows: pageRows,
    nextCursor: pageRows.length === safePageSize ? pageRows[pageRows.length - 1].occurredAt : null,
    hasMore: rows.length > safePageSize,
  };
}

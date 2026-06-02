"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

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

function recurrenceLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.kind === "daily") return "diaria";
  if (rec.kind === "weekly") return "semanal";
  if (rec.kind === "weekly_days") return "semanal";
  if (rec.kind === "monthly") return "mensual";
  if (rec.kind === "every_n_days") {
    const everyN = Number(rec.everyN ?? 0);
    return Number.isFinite(everyN) && everyN > 0 ? `cada ${everyN} días` : "cada N días";
  }
  return null;
}

export async function listMyCoachActivityPage(
  cursor: string | null = null,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<MyCoachActivityPage> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const clientNameById = new Map<string, string>();
  const safePageSize = Math.max(1, Math.min(pageSize, 20));
  const queryLimit = safePageSize + 1;
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

  const [
    clientsSnap,
    templatesSnap,
    exercisesSnap,
    assignmentsSnap,
    habitsSnap,
    notesSnap,
    messagesSnap,
  ] = await Promise.all([
    db.collection(FirestoreCollections.users).where("coachId", "==", trainer.uid).get(),
    scopedRecentQuery(FirestoreCollections.workoutTemplates, "trainerId"),
    scopedRecentQuery(FirestoreCollections.exercises, "trainerId"),
    scopedRecentQuery(FirestoreCollections.workoutAssignments, "trainerId"),
    scopedRecentQuery(FirestoreCollections.habits, "trainerId"),
    notesQuery(),
    sentMessagesQuery(),
  ]);

  for (const doc of clientsSnap.docs) {
    const data = doc.data() as { displayName?: string; email?: string };
    clientNameById.set(doc.id, data.displayName ?? data.email ?? doc.id);
  }

  const rows: MyCoachActivityRow[] = [];

  for (const doc of templatesSnap?.docs ?? []) {
    const data = doc.data() as { createdAt?: unknown; updatedAt?: unknown; name?: unknown };
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
    const data = doc.data() as { createdAt?: unknown; updatedAt?: unknown; name?: unknown; title?: unknown };
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

  const assignmentRows: Array<MyCoachActivityRow & {
    scheduledFor: string | null;
    recurrenceLabel: string | null;
    seriesId: string | null;
  }> = [];
  for (const doc of assignmentsSnap?.docs ?? []) {
    const data = doc.data() as {
      createdAt?: unknown;
      updatedAt?: unknown;
      scheduledFor?: string;
      clientId?: string;
      pendingEmail?: string;
      templateSnapshot?: { name?: unknown };
      recurrence?: unknown;
      seriesId?: unknown;
    };
    const clientId = typeof data.clientId === "string" ? data.clientId : null;
    const name = localizedName(data.templateSnapshot?.name);
    const scheduledFor = typeof data.scheduledFor === "string" ? data.scheduledFor : null;
    assignmentRows.push({
      id: `assignment:${doc.id}`,
      kind: "workout_assignment",
      occurredAt: toIso(data.createdAt ?? data.updatedAt),
      title: name ? `Workout asignado: ${name}` : "Workout asignado",
      detail: scheduledFor ? `Fecha: ${scheduledFor}` : null,
      clientId,
      clientName: clientId ? clientNameById.get(clientId) ?? clientId : data.pendingEmail ?? null,
      scheduledFor,
      recurrenceLabel: recurrenceLabel(data.recurrence),
      seriesId: typeof data.seriesId === "string" && data.seriesId.length > 0 ? data.seriesId : null,
    });
  }
  const assignmentGroups = new Map<string, typeof assignmentRows>();
  for (const row of assignmentRows) {
    const key =
      row.recurrenceLabel && row.seriesId
        ? `series:${row.seriesId}:${row.clientId ?? row.clientName ?? "pending"}`
        : `single:${row.id}`;
    const group = assignmentGroups.get(key);
    if (group) group.push(row);
    else assignmentGroups.set(key, [row]);
  }
  for (const group of assignmentGroups.values()) {
    if (group.length === 1 || !group[0].recurrenceLabel) {
      const { scheduledFor: _scheduledFor, recurrenceLabel: _recurrenceLabel, seriesId: _seriesId, ...row } = group[0];
      rows.push(row);
      continue;
    }
    const sortedByDate = [...group].sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
    const newest = [...group].sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))[0];
    const firstDate = sortedByDate[0]?.scheduledFor;
    const lastDate = sortedByDate[sortedByDate.length - 1]?.scheduledFor;
    const recurrence = newest.recurrenceLabel;
    const detailParts = [
      recurrence ? `Recurrencia: ${recurrence}` : null,
      `${group.length} fechas`,
      firstDate && lastDate && firstDate !== lastDate
        ? `${firstDate} a ${lastDate}`
        : firstDate
          ? `desde ${firstDate}`
          : null,
    ].filter((part): part is string => Boolean(part));
    rows.push({
      id: `assignment-series:${newest.seriesId}`,
      kind: "workout_assignment",
      occurredAt: newest.occurredAt,
      title: newest.title,
      detail: detailParts.join(" · "),
      clientId: newest.clientId,
      clientName: newest.clientName,
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
    };
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

  rows.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  const pageRows = rows.slice(0, safePageSize);
  return {
    rows: pageRows,
    nextCursor: pageRows.length === safePageSize ? pageRows[pageRows.length - 1].occurredAt : null,
    hasMore: rows.length > safePageSize,
  };
}

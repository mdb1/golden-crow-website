"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { COACH_ACTIVITY_COLLECTION } from "@/lib/gc-fitness/coach-activity-log";

export type CoachActivityKind =
  | "workout_template"
  | "exercise"
  | "workout_assignment"
  | "workout_rest_edited"
  | "habit_assignment"
  | "note"
  | "progress_photo_request"
  | "weight_request"
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


export async function listMyCoachActivityPage(
  cursor: string | null = null,
  pageSize = DEFAULT_PAGE_SIZE,
  clientId: string | null = null,
  kind: string | null = null,
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
  const kindFilter = kind && kind !== "all" ? kind : null;
  const wantChat = !kindFilter || kindFilter === "chat";
  const wantLog = !kindFilter || kindFilter !== "chat";

  // `coach_activity` is the single source of truth for EVERY coach action
  // except chat (workout templates, exercises, habit assignments, workout
  // assignments, notes) — one durable event per action. Filters compose
  // server-side: `clientId` is the most selective, so it's applied in-query;
  // `kind` is applied in-query only when no clientId is set (so we don't need a
  // 4-field composite index) — otherwise kind is filtered in memory below.
  async function coachActivityQuery() {
    if (!wantLog) return null;
    let q = db
      .collection(COACH_ACTIVITY_COLLECTION)
      .where("trainerId", "==", trainer.uid) as FirebaseFirestore.Query;
    if (clientId) {
      q = q.where("clientId", "==", clientId);
    } else if (kindFilter && kindFilter !== "chat") {
      q = q.where("kind", "==", kindFilter);
    }
    q = q.orderBy("occurredAt", "desc").limit(queryLimit);
    if (before) q = q.where("occurredAt", "<", before);
    return q.get().catch((error) => {
      console.warn("[gc-fitness/my-activity] coach_activity query failed", error);
      return null;
    });
  }

  // Chat is NOT logged to coach_activity (it would double every message write);
  // it's read live from the messages collection group and merged in.
  async function sentMessagesQuery() {
    if (!wantChat) return null;
    let query = db
      .collectionGroup(FirestoreCollections.messages)
      .where("senderId", "==", trainer.uid)
      .orderBy("createdAt", "desc")
      .limit(queryLimit);
    if (before) {
      query = query.where("createdAt", "<", before);
    }
    return query.get().catch((error) => {
      console.warn("[gc-fitness/my-activity] sent messages query failed", error);
      return null;
    });
  }

  const [clientsSnap, coachActivitySnap, messagesSnap] = await Promise.all([
    db.collection(FirestoreCollections.users).where("coachId", "==", trainer.uid).get(),
    coachActivityQuery(),
    sentMessagesQuery(),
  ]);

  for (const doc of clientsSnap.docs) {
    const data = doc.data() as { displayName?: string; email?: string };
    clientNameById.set(doc.id, data.displayName ?? data.email ?? doc.id);
  }

  const rows: MyCoachActivityRow[] = [];

  // Every non-chat action — one row per logged event (create / assign / delete).
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
    const evKind = (typeof data.kind === "string" ? data.kind : "workout_assignment") as CoachActivityKind;
    // When BOTH clientId and kind filters are set, clientId was applied
    // server-side; apply kind here in memory.
    if (clientId && kindFilter && kindFilter !== "chat" && evKind !== kindFilter) {
      continue;
    }
    const rowClientId = typeof data.clientId === "string" ? data.clientId : null;
    const deleted = data.deleted === true;
    let title = typeof data.title === "string" ? data.title : "Actividad";
    if (deleted) {
      title = title
        .replace("Workout asignado:", "Workout eliminado:")
        .replace("Workout creado:", "Workout eliminado:")
        .replace("Ejercicio creado:", "Ejercicio eliminado:")
        .replace("Hábito asignado:", "Hábito eliminado:");
    }
    rows.push({
      id: `coachevt:${doc.id}`,
      kind: evKind,
      deleted: deleted || undefined,
      occurredAt: toIso(data.occurredAt),
      title,
      detail: typeof data.detail === "string" ? data.detail : null,
      clientId: rowClientId,
      clientName: rowClientId
        ? clientNameById.get(rowClientId) ?? rowClientId
        : data.pendingEmail ?? null,
    });
  }

  for (const messageDoc of messagesSnap?.docs ?? []) {
    const data = messageDoc.data() as { createdAt?: unknown; kind?: string; text?: string };
    const chatId = messageDoc.ref.parent.parent?.id ?? null;
    if (clientId && chatId !== clientId) continue; // chat client filter (in memory)
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

export interface MyActivityClientOption {
  id: string;
  name: string;
}

/** The calling trainer's clients (for the My Activity client filter). */
export async function listMyActivityClients(): Promise<MyActivityClientOption[]> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.users)
    .where("coachId", "==", trainer.uid)
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data() as { displayName?: string; email?: string };
      return { id: d.id, name: x.displayName ?? x.email ?? d.id };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

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

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
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

export async function listMyCoachActivity(limit = 120): Promise<MyCoachActivityRow[]> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const clientNameById = new Map<string, string>();

  const [
    clientsSnap,
    templatesSnap,
    exercisesSnap,
    assignmentsSnap,
    habitsSnap,
    notesSnap,
    chatsSnap,
  ] = await Promise.all([
    db.collection(FirestoreCollections.users).where("coachId", "==", trainer.uid).get(),
    db.collection(FirestoreCollections.workoutTemplates).where("trainerId", "==", trainer.uid).get(),
    db.collection(FirestoreCollections.exercises).where("trainerId", "==", trainer.uid).get(),
    db.collection(FirestoreCollections.workoutAssignments).where("trainerId", "==", trainer.uid).get(),
    db.collection(FirestoreCollections.habits).where("trainerId", "==", trainer.uid).get(),
    db.collection(FirestoreCollections.clientNotes).where("coachId", "==", trainer.uid).get(),
    db.collection(FirestoreCollections.chats).where("coachId", "==", trainer.uid).get(),
  ]);

  for (const doc of clientsSnap.docs) {
    const data = doc.data() as { displayName?: string; email?: string };
    clientNameById.set(doc.id, data.displayName ?? data.email ?? doc.id);
  }

  const rows: MyCoachActivityRow[] = [];

  for (const doc of templatesSnap.docs) {
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

  for (const doc of exercisesSnap.docs) {
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

  for (const doc of assignmentsSnap.docs) {
    const data = doc.data() as {
      createdAt?: unknown;
      updatedAt?: unknown;
      scheduledFor?: string;
      clientId?: string;
      pendingEmail?: string;
      templateSnapshot?: { name?: unknown };
    };
    const clientId = typeof data.clientId === "string" ? data.clientId : null;
    const name = localizedName(data.templateSnapshot?.name);
    rows.push({
      id: `assignment:${doc.id}`,
      kind: "workout_assignment",
      occurredAt: toIso(data.createdAt ?? data.updatedAt),
      title: name ? `Workout asignado: ${name}` : "Workout asignado",
      detail: data.scheduledFor ? `Fecha: ${data.scheduledFor}` : null,
      clientId,
      clientName: clientId ? clientNameById.get(clientId) ?? clientId : data.pendingEmail ?? null,
    });
  }

  for (const doc of habitsSnap.docs) {
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

  for (const doc of notesSnap.docs) {
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

  const messageSnaps = await Promise.all(
    chatsSnap.docs.map((chatDoc) =>
      chatDoc.ref
        .collection(FirestoreCollections.messages)
        .where("senderId", "==", trainer.uid)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get()
        .catch(() => null),
    ),
  );
  chatsSnap.docs.forEach((chatDoc, chatIndex) => {
    const messages = messageSnaps[chatIndex];
    if (!messages) return;
    for (const messageDoc of messages.docs) {
      const data = messageDoc.data() as { createdAt?: unknown; kind?: string; text?: string };
      rows.push({
        id: `chat:${chatDoc.id}:${messageDoc.id}`,
        kind: "chat",
        occurredAt: toIso(data.createdAt),
        title: data.kind === "voice" ? "Audio enviado" : data.kind === "image" ? "Imagen enviada" : "Mensaje enviado",
        detail: typeof data.text === "string" && data.text.trim() ? data.text.slice(0, 120) : null,
        clientId: chatDoc.id,
        clientName: clientNameById.get(chatDoc.id) ?? chatDoc.id,
      });
    }
  });

  rows.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  return rows.slice(0, Math.max(1, Math.min(limit, 200)));
}

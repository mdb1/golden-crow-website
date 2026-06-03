"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { recordCoachActivityEvent, noteAddedEvent } from "./coach-activity-log";
import { FirestoreCollections } from "./collections";

const updateClientNotesSchema = z.object({
  clientId: z.string().trim().min(1).max(160),
  date: z.string().trim().min(10).max(10).optional(),
  notes: z.string().max(10000),
});

function noteDocId(coachId: string, clientId: string): string {
  return `${coachId}_${clientId}`;
}

async function assertOwnsClient(
  coachId: string,
  clientId: string,
): Promise<void> {
  if (clientId.startsWith("mirror:")) {
    const mirrorId = clientId.slice("mirror:".length);
    const mirror = await gcFitnessFirestore()
      .collection(FirestoreCollections.userMirror)
      .doc(mirrorId)
      .get();
    if (!mirror.exists || mirror.get("coachId") !== coachId) {
      throw new Error("Forbidden");
    }
    return;
  }

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachId) {
    throw new Error("Forbidden");
  }
}

export interface ClientNoteEntry {
  date: string;
  notes: string;
  createdAt: string | null;
}

export async function getClientNotes(clientId: string): Promise<{
  notes: string;
  updatedAt: string | null;
  entries: ClientNoteEntry[];
}> {
  const trainer = await getCurrentTrainer();
  await assertOwnsClient(trainer.uid, clientId);

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.clientNotes)
    .doc(noteDocId(trainer.uid, clientId))
    .get();
  if (!snap.exists) return { notes: "", updatedAt: null, entries: [] };

  const notes = snap.get("notes");
  const updatedAt = snap.get("updatedAt");
  const entries = Array.isArray(snap.get("entries"))
    ? (snap.get("entries") as Array<Record<string, unknown>>).map((entry) => ({
        date: typeof entry.date === "string" ? entry.date : "",
        notes: typeof entry.notes === "string" ? entry.notes : "",
        createdAt: (() => {
          const value = entry.createdAt as
            | { toDate?: () => Date }
            | string
            | null
            | undefined;
          if (value && typeof value === "object" && typeof value.toDate === "function") {
            return value.toDate().toISOString();
          }
          if (typeof value === "string") {
            return value;
          }
          return null;
        })(),
      }))
    : [];
  return {
    notes: typeof notes === "string" ? notes : "",
    updatedAt:
      updatedAt && typeof updatedAt.toDate === "function"
        ? updatedAt.toDate().toISOString()
        : null,
    entries,
  };
}

export async function updateClientNotes(input: unknown): Promise<{
  ok: true;
  updatedAt: string;
}> {
  const trainer = await getCurrentTrainer();
  const parsed = updateClientNotesSchema.parse(input);
  await assertOwnsClient(trainer.uid, parsed.clientId);

  const db = gcFitnessFirestore();
  const docId = noteDocId(trainer.uid, parsed.clientId);
  const ref = db
    .collection(FirestoreCollections.clientNotes)
    .doc(docId);
  const now = FieldValue.serverTimestamp();
  const entryCreatedAt = new Date().toISOString();
  const snap = await ref.get();
  const entry = {
    date: parsed.date ?? new Date().toISOString().slice(0, 10),
    notes: parsed.notes,
    createdAt: entryCreatedAt,
  };
  const existingEntries = snap.exists && Array.isArray(snap.get("entries"))
    ? snap.get("entries")
    : [];
  await ref.set(
    {
      coachId: trainer.uid,
      clientId: parsed.clientId,
      notes: parsed.notes,
      entries: [...existingEntries, entry],
      createdAt: snap.exists ? snap.get("createdAt") : now,
      updatedAt: now,
    },
    { merge: true },
  );

  await recordCoachActivityEvent(
    db,
    noteAddedEvent({
      trainerId: trainer.uid,
      noteDocId: docId,
      entryKey: entryCreatedAt,
      body: parsed.notes,
      clientId: parsed.clientId,
      occurredAt: new Date(entryCreatedAt),
    }),
  );

  return { ok: true, updatedAt: new Date().toISOString() };
}

// Edit/delete target a single entry. Entries have no stable id, but each
// carries a per-write ISO `createdAt` string (set on append above) that is
// unique in practice, so we identify the target by its (createdAt, date) pair —
// no data migration needed. The `client_notes` update rule already permits
// mutating `entries` + `updatedAt` (affectedKeys hasOnly ['notes','entries',
// 'updatedAt']), so rewriting the trimmed/edited array via `{ merge: true }`
// (touching only `entries` + `updatedAt`) stays within the rule. No rules change.

const editClientNoteSchema = z.object({
  clientId: z.string().trim().min(1).max(160),
  entryCreatedAt: z.string().trim().min(1),
  entryDate: z.string().trim().min(10).max(10),
  notes: z.string().trim().min(1).max(10000),
});

const deleteClientNoteSchema = z.object({
  clientId: z.string().trim().min(1).max(160),
  entryCreatedAt: z.string().trim().min(1),
  entryDate: z.string().trim().min(10).max(10),
});

/** True when a raw entry matches the (createdAt, date) identity. */
function noteEntryMatches(
  entry: Record<string, unknown>,
  createdAt: string,
  date: string,
): boolean {
  const entryCreatedAt =
    typeof entry.createdAt === "string" ? entry.createdAt : "";
  const entryDate = typeof entry.date === "string" ? entry.date : "";
  return entryCreatedAt === createdAt && entryDate === date;
}

export async function editClientNote(input: unknown): Promise<{
  ok: true;
  updatedAt: string;
}> {
  const trainer = await getCurrentTrainer();
  const parsed = editClientNoteSchema.parse(input);
  await assertOwnsClient(trainer.uid, parsed.clientId);

  const ref = gcFitnessFirestore()
    .collection(FirestoreCollections.clientNotes)
    .doc(noteDocId(trainer.uid, parsed.clientId));

  const snap = await ref.get();
  if (!snap.exists) throw new Error("Note not found.");

  const existing = Array.isArray(snap.get("entries"))
    ? (snap.get("entries") as Array<Record<string, unknown>>)
    : [];
  let found = false;
  const next = existing.map((entry) => {
    if (
      !found &&
      noteEntryMatches(entry, parsed.entryCreatedAt, parsed.entryDate)
    ) {
      found = true;
      return { ...entry, notes: parsed.notes };
    }
    return entry;
  });
  if (!found) throw new Error("Note not found.");

  await ref.set(
    { entries: next, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return { ok: true, updatedAt: new Date().toISOString() };
}

export async function deleteClientNote(input: unknown): Promise<{
  ok: true;
  updatedAt: string;
}> {
  const trainer = await getCurrentTrainer();
  const parsed = deleteClientNoteSchema.parse(input);
  await assertOwnsClient(trainer.uid, parsed.clientId);

  const ref = gcFitnessFirestore()
    .collection(FirestoreCollections.clientNotes)
    .doc(noteDocId(trainer.uid, parsed.clientId));

  const snap = await ref.get();
  if (!snap.exists) throw new Error("Note not found.");

  const existing = Array.isArray(snap.get("entries"))
    ? (snap.get("entries") as Array<Record<string, unknown>>)
    : [];
  const next = existing.filter(
    (entry) =>
      !noteEntryMatches(entry, parsed.entryCreatedAt, parsed.entryDate),
  );
  if (next.length === existing.length) throw new Error("Note not found.");

  await ref.set(
    { entries: next, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return { ok: true, updatedAt: new Date().toISOString() };
}

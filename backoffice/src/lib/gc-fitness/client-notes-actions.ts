"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
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

  const ref = gcFitnessFirestore()
    .collection(FirestoreCollections.clientNotes)
    .doc(noteDocId(trainer.uid, parsed.clientId));
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

  return { ok: true, updatedAt: new Date().toISOString() };
}

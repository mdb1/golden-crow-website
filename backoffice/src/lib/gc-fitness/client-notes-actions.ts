"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const updateClientNotesSchema = z.object({
  clientId: z.string().trim().min(1).max(160),
  notes: z.string().max(10000),
});

function noteDocId(coachId: string, clientId: string): string {
  return `${coachId}_${clientId}`;
}

async function assertOwnsClient(
  coachId: string,
  clientId: string,
): Promise<void> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachId) {
    throw new Error("Forbidden");
  }
}

export async function getClientNotes(clientId: string): Promise<{
  notes: string;
  updatedAt: string | null;
}> {
  const trainer = await getCurrentTrainer();
  await assertOwnsClient(trainer.uid, clientId);

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.clientNotes)
    .doc(noteDocId(trainer.uid, clientId))
    .get();
  if (!snap.exists) return { notes: "", updatedAt: null };

  const notes = snap.get("notes");
  const updatedAt = snap.get("updatedAt");
  return {
    notes: typeof notes === "string" ? notes : "",
    updatedAt:
      updatedAt && typeof updatedAt.toDate === "function"
        ? updatedAt.toDate().toISOString()
        : null,
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
  const snap = await ref.get();
  await ref.set(
    {
      coachId: trainer.uid,
      clientId: parsed.clientId,
      notes: parsed.notes,
      createdAt: snap.exists ? snap.get("createdAt") : now,
      updatedAt: now,
    },
    { merge: true },
  );

  return { ok: true, updatedAt: new Date().toISOString() };
}

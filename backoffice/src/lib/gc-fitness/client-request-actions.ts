"use server";

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import {
  recordCoachActivityEvent,
  progressPhotoRequestedEvent,
  weightRequestedEvent,
} from "./coach-activity-log";
import { FirestoreCollections } from "./collections";
import { getClientRequestStatus, type ClientRequestKind } from "./client-request-state";

export interface ClientRequestResult {
  ok: true;
  skipped: boolean;
  requestedAt: string | null;
}

function requestField(kind: ClientRequestKind): string {
  return kind === "progressPhotos"
    ? "progressPhotosRequestedAt"
    : "bodyWeightRequestedAt";
}

async function assertOwnsClient(
  trainerUid: string,
  clientId: string,
): Promise<Record<string, unknown>> {
  const db = gcFitnessFirestore();
  const snap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  if (!snap.exists) {
    throw new Error("Forbidden");
  }
  const data = snap.data() as Record<string, unknown>;
  if (data.coachId !== trainerUid) {
    throw new Error("Forbidden");
  }
  return data;
}

export async function runClientRequest(
  clientId: string,
  kind: ClientRequestKind,
): Promise<ClientRequestResult> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const client = await assertOwnsClient(trainer.uid, clientId);
  const now = new Date();
  const current = getClientRequestStatus(client[requestField(kind)], now);
  if (current.isActive) {
    return {
      ok: true,
      skipped: true,
      requestedAt: current.requestedAt?.toISOString() ?? null,
    };
  }

  const requestedAt = now.toISOString();
  await db.collection(FirestoreCollections.users).doc(clientId).update({
    [requestField(kind)]: now,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recordCoachActivityEvent(
    db,
    kind === "progressPhotos"
      ? progressPhotoRequestedEvent({
          trainerId: trainer.uid,
          clientId,
          clientName:
            (typeof client.displayName === "string" && client.displayName.trim()) ||
            (typeof client.email === "string" && client.email.trim()) ||
            clientId,
          requestedAt: now,
        })
      : weightRequestedEvent({
          trainerId: trainer.uid,
          clientId,
          clientName:
            (typeof client.displayName === "string" && client.displayName.trim()) ||
            (typeof client.email === "string" && client.email.trim()) ||
            clientId,
          requestedAt: now,
        }),
  );

  return {
    ok: true,
    skipped: false,
    requestedAt,
  };
}

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

export const CLIENT_REQUEST_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export type ClientRequestKind = "progressPhotos" | "weight";

export interface ClientRequestStatus {
  requestedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

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

function requestLabel(kind: ClientRequestKind): string {
  return kind === "progressPhotos" ? "fotos de progreso" : "peso";
}

export function getClientRequestStatus(
  requestedAt: unknown,
  now: Date,
): ClientRequestStatus {
  const requestedDate = toDate(requestedAt);
  if (!requestedDate) {
    return { requestedAt: null, expiresAt: null, isActive: false };
  }
  const expiresAt = new Date(requestedDate.getTime() + CLIENT_REQUEST_TTL_MS);
  return {
    requestedAt: requestedDate,
    expiresAt,
    isActive: expiresAt.getTime() > now.getTime(),
  };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
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

export function formatClientRequestLabel(kind: ClientRequestKind): string {
  return requestLabel(kind);
}

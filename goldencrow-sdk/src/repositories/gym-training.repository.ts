import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import type {
  TrainingPlanRecord,
  TrainingPlanWeekDay,
} from "../types/gym.types.js";

const GYM_TRAINING_COLLECTION = "gym_training_plans";

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeTimestampToIso(value: unknown): string {
  if (value == null) {
    return new Date().toISOString();
  }
  // Firestore Timestamp has toDate()
  if (typeof value === "object" && "toDate" in (value as object)) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return new Date().toISOString();
}

function plansRef(uid: string) {
  return adminDb
    .collection(GYM_TRAINING_COLLECTION)
    .doc(uid)
    .collection("plans");
}

function toTrainingPlanRecord(
  id: string,
  data: Record<string, unknown>
): TrainingPlanRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    trainerName: normalizeOptionalString(data.trainerName) ?? "",
    name: normalizeOptionalString(data.name) ?? "",
    startDate: normalizeTimestampToIso(data.startDate),
    endDate: data.endDate ? normalizeTimestampToIso(data.endDate) : undefined,
    days: (data.days as TrainingPlanWeekDay[]) ?? [],
    createdAt: normalizeTimestampToIso(data.createdAt),
    updatedAt: normalizeTimestampToIso(data.updatedAt),
  };
}

export async function listTrainingPlans(
  uid: string
): Promise<TrainingPlanRecord[]> {
  const snapshot = await plansRef(uid).get();
  return snapshot.docs.map((doc) =>
    toTrainingPlanRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getTrainingPlan(
  uid: string,
  planId: string
): Promise<TrainingPlanRecord> {
  const doc = await plansRef(uid).doc(planId).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(
      `Training plan ${planId} not found for user ${uid}.`,
      404
    );
  }
  return toTrainingPlanRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createTrainingPlan(
  uid: string,
  data: {
    trainerName: string;
    name: string;
    startDate: string;
    endDate?: string;
    days: TrainingPlanWeekDay[];
    gymId?: string;
  }
): Promise<TrainingPlanRecord> {
  const docRef = plansRef(uid).doc();
  await docRef.set({
    userId: uid,
    gymId: data.gymId ?? "prolife360",
    trainerName: data.trainerName,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    days: data.days,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await docRef.get();
  return toTrainingPlanRecord(
    created.id,
    created.data() as Record<string, unknown>
  );
}

export async function updateTrainingPlan(
  uid: string,
  planId: string,
  data: {
    trainerName?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    days?: TrainingPlanWeekDay[];
  }
): Promise<TrainingPlanRecord> {
  const docRef = plansRef(uid).doc(planId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(
      `Training plan ${planId} not found for user ${uid}.`,
      404
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data.trainerName !== undefined) updates.trainerName = data.trainerName;
  if (data.name !== undefined) updates.name = data.name;
  if (data.startDate !== undefined) updates.startDate = data.startDate;
  if (data.endDate !== undefined) updates.endDate = data.endDate;
  if (data.days !== undefined) updates.days = data.days;

  await docRef.update(updates);
  const updated = await docRef.get();
  return toTrainingPlanRecord(
    updated.id,
    updated.data() as Record<string, unknown>
  );
}

export async function deleteTrainingPlan(
  uid: string,
  planId: string
): Promise<{ deleted: true }> {
  const docRef = plansRef(uid).doc(planId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(
      `Training plan ${planId} not found for user ${uid}.`,
      404
    );
  }
  await docRef.delete();
  return { deleted: true };
}

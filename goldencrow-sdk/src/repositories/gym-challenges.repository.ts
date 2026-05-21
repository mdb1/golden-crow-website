import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import type { ChallengeRecord, ChallengeType } from "../types/gym.types.js";

const GYM_CHALLENGES_COLLECTION = "gym_challenges";

const VALID_CHALLENGE_TYPES: ChallengeType[] = [
  "workoutCount",
  "attendanceStreak",
  "nutritionCompliance",
];

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimestampToIso(value: unknown): string {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return new Date().toISOString();
}

function normalizeChallengeType(value: unknown): ChallengeType {
  if (
    typeof value === "string" &&
    VALID_CHALLENGE_TYPES.includes(value as ChallengeType)
  ) {
    return value as ChallengeType;
  }
  return "workoutCount";
}

function toChallengeRecord(
  id: string,
  data: Record<string, unknown>
): ChallengeRecord {
  return {
    id,
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    name: normalizeOptionalString(data.name) ?? "",
    description: normalizeOptionalString(data.description) ?? "",
    targetValue: Number(data.targetValue ?? 1),
    deadline: normalizeTimestampToIso(data.deadline),
    type: normalizeChallengeType(data.type),
    createdAt: normalizeTimestampToIso(data.createdAt),
    updatedAt: normalizeTimestampToIso(data.updatedAt),
  };
}

export async function listChallenges(): Promise<ChallengeRecord[]> {
  const snapshot = await adminDb.collection(GYM_CHALLENGES_COLLECTION).get();
  return snapshot.docs.map((doc) =>
    toChallengeRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getChallenge(id: string): Promise<ChallengeRecord> {
  const doc = await adminDb.collection(GYM_CHALLENGES_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Challenge not found: ${id}`, 404);
  }
  return toChallengeRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createChallenge(data: {
  gymId?: string;
  name: string;
  description: string;
  targetValue: number;
  deadline: string;
  type: ChallengeType;
}): Promise<ChallengeRecord> {
  const ref = adminDb.collection(GYM_CHALLENGES_COLLECTION).doc();
  await ref.set({
    gymId: data.gymId ?? "prolife360",
    name: data.name,
    description: data.description,
    targetValue: data.targetValue,
    deadline: data.deadline,
    type: data.type,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return getChallenge(ref.id);
}

export async function updateChallenge(
  id: string,
  data: Partial<{
    gymId: string;
    name: string;
    description: string;
    targetValue: number;
    deadline: string;
    type: ChallengeType;
  }>
): Promise<ChallengeRecord> {
  const doc = await adminDb.collection(GYM_CHALLENGES_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Challenge not found: ${id}`, 404);
  }
  await adminDb
    .collection(GYM_CHALLENGES_COLLECTION)
    .doc(id)
    .update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  return getChallenge(id);
}

export async function deleteChallenge(id: string): Promise<{ deleted: true }> {
  const doc = await adminDb.collection(GYM_CHALLENGES_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Challenge not found: ${id}`, 404);
  }
  await adminDb.collection(GYM_CHALLENGES_COLLECTION).doc(id).delete();
  return { deleted: true };
}

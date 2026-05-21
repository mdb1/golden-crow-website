import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import type { AchievementRecord, AchievementTriggerType } from "../types/gym.types.js";

const GYM_ACHIEVEMENTS_COLLECTION = "gym_achievements";

const VALID_TRIGGER_TYPES: AchievementTriggerType[] = [
  "workoutCount",
  "attendanceStreak",
  "evaluationMilestone",
  "profileComplete",
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

function normalizeTriggerType(value: unknown): AchievementTriggerType {
  if (
    typeof value === "string" &&
    VALID_TRIGGER_TYPES.includes(value as AchievementTriggerType)
  ) {
    return value as AchievementTriggerType;
  }
  return "workoutCount";
}

function toAchievementRecord(
  id: string,
  data: Record<string, unknown>
): AchievementRecord {
  return {
    id,
    name: normalizeOptionalString(data.name) ?? "",
    description: normalizeOptionalString(data.description) ?? "",
    iconName: normalizeOptionalString(data.iconName) ?? "star.fill",
    xpReward: Number(data.xpReward ?? 0),
    triggerType: normalizeTriggerType(data.triggerType),
    triggerThreshold: Number(data.triggerThreshold ?? 1),
    createdAt: normalizeTimestampToIso(data.createdAt),
    updatedAt: normalizeTimestampToIso(data.updatedAt),
  };
}

export async function listAchievements(): Promise<AchievementRecord[]> {
  const snapshot = await adminDb.collection(GYM_ACHIEVEMENTS_COLLECTION).get();
  return snapshot.docs.map((doc) =>
    toAchievementRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getAchievement(id: string): Promise<AchievementRecord> {
  const doc = await adminDb.collection(GYM_ACHIEVEMENTS_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Achievement not found: ${id}`, 404);
  }
  return toAchievementRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createAchievement(data: {
  name: string;
  description: string;
  iconName: string;
  xpReward: number;
  triggerType: AchievementTriggerType;
  triggerThreshold: number;
}): Promise<AchievementRecord> {
  const ref = adminDb.collection(GYM_ACHIEVEMENTS_COLLECTION).doc();
  await ref.set({
    name: data.name,
    description: data.description,
    iconName: data.iconName,
    xpReward: data.xpReward,
    triggerType: data.triggerType,
    triggerThreshold: data.triggerThreshold,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return getAchievement(ref.id);
}

export async function updateAchievement(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    iconName: string;
    xpReward: number;
    triggerType: AchievementTriggerType;
    triggerThreshold: number;
  }>
): Promise<AchievementRecord> {
  const doc = await adminDb.collection(GYM_ACHIEVEMENTS_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Achievement not found: ${id}`, 404);
  }
  await adminDb
    .collection(GYM_ACHIEVEMENTS_COLLECTION)
    .doc(id)
    .update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  return getAchievement(id);
}

export async function deleteAchievement(id: string): Promise<{ deleted: true }> {
  const doc = await adminDb.collection(GYM_ACHIEVEMENTS_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Achievement not found: ${id}`, 404);
  }
  await adminDb.collection(GYM_ACHIEVEMENTS_COLLECTION).doc(id).delete();
  return { deleted: true };
}

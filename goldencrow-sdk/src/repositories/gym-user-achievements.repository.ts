import { adminDb } from "../config/firebase.js";
import type { UserAchievementRecord } from "../types/gym.types.js";

const GYM_USER_ACHIEVEMENTS_COLLECTION = "gym_user_achievements";

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

function toUserAchievementRecord(
  id: string,
  data: Record<string, unknown>
): UserAchievementRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    achievementId: normalizeOptionalString(data.achievementId) ?? "",
    earnedAt: normalizeTimestampToIso(data.earnedAt),
    xpEarned: typeof data.xpEarned === "number" ? data.xpEarned : 0,
  };
}

export async function listUserAchievements(uid: string): Promise<UserAchievementRecord[]> {
  const snapshot = await adminDb
    .collection(GYM_USER_ACHIEVEMENTS_COLLECTION)
    .where("userId", "==", uid)
    .orderBy("earnedAt", "desc")
    .get();
  return snapshot.docs.map(doc =>
    toUserAchievementRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

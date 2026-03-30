import { adminDb } from "../config/firebase.js";
import type { MealComplianceRecord, MealComplianceStatus } from "../types/gym.types.js";

const GYM_MEAL_COMPLIANCE_COLLECTION = "gym_meal_compliance";

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

function entriesRef(uid: string) {
  return adminDb
    .collection(GYM_MEAL_COMPLIANCE_COLLECTION)
    .doc(uid)
    .collection("entries");
}

function toMealComplianceRecord(
  id: string,
  data: Record<string, unknown>
): MealComplianceRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    planId: normalizeOptionalString(data.planId) ?? "",
    date: normalizeTimestampToIso(data.date),
    mealId: normalizeOptionalString(data.mealId) ?? "",
    status: (data.status as MealComplianceStatus) ?? "eaten",
    notes: normalizeOptionalString(data.notes),
    loggedAt: normalizeTimestampToIso(data.loggedAt),
  };
}

export async function listMealCompliance(
  uid: string
): Promise<MealComplianceRecord[]> {
  const snapshot = await entriesRef(uid).orderBy("loggedAt", "desc").get();
  return snapshot.docs.map(doc =>
    toMealComplianceRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

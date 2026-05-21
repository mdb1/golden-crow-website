import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import type { NutritionDay, NutritionPlanRecord } from "../types/gym.types.js";

const GYM_NUTRITION_COLLECTION = "gym_nutrition";

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

function plansRef(uid: string) {
  return adminDb.collection(GYM_NUTRITION_COLLECTION).doc(uid).collection("plans");
}

function toNutritionPlanRecord(id: string, data: Record<string, unknown>): NutritionPlanRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    nutritionistName: normalizeOptionalString(data.nutritionistName) ?? "",
    name: normalizeOptionalString(data.name) ?? "",
    startDate: normalizeTimestampToIso(data.startDate),
    endDate: data.endDate ? normalizeTimestampToIso(data.endDate) : undefined,
    days: Array.isArray(data.days) ? (data.days as NutritionDay[]) : [],
    createdAt: normalizeTimestampToIso(data.createdAt),
    updatedAt: normalizeTimestampToIso(data.updatedAt),
  };
}

export async function listNutritionPlans(uid: string): Promise<NutritionPlanRecord[]> {
  const snapshot = await plansRef(uid).orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc =>
    toNutritionPlanRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getNutritionPlan(
  uid: string,
  planId: string
): Promise<NutritionPlanRecord> {
  const doc = await plansRef(uid).doc(planId).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Nutrition plan not found: ${planId}`, 404);
  }
  return toNutritionPlanRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createNutritionPlan(
  uid: string,
  data: {
    nutritionistName: string;
    name: string;
    startDate: string;
    endDate?: string;
    days: NutritionDay[];
    gymId?: string;
  }
): Promise<NutritionPlanRecord> {
  const docData: Record<string, unknown> = {
    userId: uid,
    gymId: data.gymId ?? "prolife360",
    nutritionistName: data.nutritionistName,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    days: data.days,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await plansRef(uid).add(docData);
  const created = await docRef.get();
  return toNutritionPlanRecord(created.id, created.data() as Record<string, unknown>);
}

export async function updateNutritionPlan(
  uid: string,
  planId: string,
  data: {
    nutritionistName?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    days?: NutritionDay[];
  }
): Promise<NutritionPlanRecord> {
  const docRef = plansRef(uid).doc(planId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Nutrition plan not found: ${planId}`, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (data.nutritionistName !== undefined) updates.nutritionistName = data.nutritionistName;
  if (data.name !== undefined) updates.name = data.name;
  if (data.startDate !== undefined) updates.startDate = data.startDate;
  if (data.endDate !== undefined) updates.endDate = data.endDate;
  if (data.days !== undefined) updates.days = data.days;

  await docRef.update(updates);
  const updated = await docRef.get();
  return toNutritionPlanRecord(updated.id, updated.data() as Record<string, unknown>);
}

export async function deleteNutritionPlan(
  uid: string,
  planId: string
): Promise<{ deleted: true }> {
  const docRef = plansRef(uid).doc(planId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Nutrition plan not found: ${planId}`, 404);
  }

  await docRef.delete();
  return { deleted: true };
}

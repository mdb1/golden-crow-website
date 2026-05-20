import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { AdminRepositoryError } from "./admin-errors.js";
import type {
  AllergyRecord,
  ClinicalHistoryRecord,
  EmergencyContact,
  InjuryRecord,
  MedicalCondition,
  MedicationRecord,
} from "../types/gym.types.js";

const GYM_CLINICAL_HISTORIES_COLLECTION = "gym_clinical_histories";

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

function historiesRef(uid: string) {
  return adminDb
    .collection(GYM_CLINICAL_HISTORIES_COLLECTION)
    .doc(uid)
    .collection("histories");
}

function toClinicalHistoryRecord(
  id: string,
  data: Record<string, unknown>
): ClinicalHistoryRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    createdAt: normalizeTimestampToIso(data.createdAt),
    medicalConditions: Array.isArray(data.medicalConditions)
      ? (data.medicalConditions as MedicalCondition[])
      : [],
    injuries: Array.isArray(data.injuries) ? (data.injuries as InjuryRecord[]) : [],
    medications: Array.isArray(data.medications)
      ? (data.medications as MedicationRecord[])
      : [],
    allergies: Array.isArray(data.allergies) ? (data.allergies as AllergyRecord[]) : [],
    emergencyContact:
      data.emergencyContact !== null &&
      typeof data.emergencyContact === "object" &&
      !Array.isArray(data.emergencyContact)
        ? (data.emergencyContact as EmergencyContact)
        : undefined,
    additionalNotes: normalizeOptionalString(data.additionalNotes),
    isSigned: Boolean(data.isSigned),
    signatureAuditId: normalizeOptionalString(data.signatureAuditId),
  };
}

export async function listClinicalHistories(
  uid: string
): Promise<ClinicalHistoryRecord[]> {
  const snapshot = await historiesRef(uid).orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc =>
    toClinicalHistoryRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getClinicalHistory(
  uid: string,
  histId: string
): Promise<ClinicalHistoryRecord> {
  const doc = await historiesRef(uid).doc(histId).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Clinical history not found: ${histId}`, 404);
  }
  return toClinicalHistoryRecord(doc.id, doc.data() as Record<string, unknown>);
}

import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import { normalizeTimestampToIso } from "./gym-training.repository.js";
import type {
  PhysicalEvaluationRecord,
  StrengthAssessment,
  MobilityAssessment,
  AnthropometryAssessment,
  PainAssessment,
} from "../types/gym.types.js";

const GYM_EVALUATIONS_COLLECTION = "gym_evaluations";

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function evaluationsRef(uid: string) {
  return adminDb
    .collection(GYM_EVALUATIONS_COLLECTION)
    .doc(uid)
    .collection("evaluations");
}

function toEvaluationRecord(
  id: string,
  data: Record<string, unknown>
): PhysicalEvaluationRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    evaluatorName: normalizeOptionalString(data.evaluatorName) ?? "",
    date: normalizeTimestampToIso(data.date),
    clinicalHistoryId: normalizeOptionalString(data.clinicalHistoryId),
    strength: (data.strength as StrengthAssessment[]) ?? [],
    mobility: (data.mobility as MobilityAssessment[]) ?? [],
    anthropometry: data.anthropometry
      ? (data.anthropometry as AnthropometryAssessment)
      : undefined,
    pain: (data.pain as PainAssessment[]) ?? [],
    createdAt: normalizeTimestampToIso(data.createdAt),
    updatedAt: normalizeTimestampToIso(data.updatedAt),
  };
}

export async function listEvaluations(
  uid: string
): Promise<PhysicalEvaluationRecord[]> {
  const snapshot = await evaluationsRef(uid).get();
  return snapshot.docs.map((doc) =>
    toEvaluationRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getEvaluation(
  uid: string,
  evalId: string
): Promise<PhysicalEvaluationRecord> {
  const doc = await evaluationsRef(uid).doc(evalId).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(
      `Evaluation ${evalId} not found for user ${uid}.`,
      404
    );
  }
  return toEvaluationRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createEvaluation(
  uid: string,
  data: {
    evaluatorName: string;
    date: string;
    clinicalHistoryId?: string;
    strength?: StrengthAssessment[];
    mobility?: MobilityAssessment[];
    anthropometry?: AnthropometryAssessment;
    pain?: PainAssessment[];
    gymId?: string;
  }
): Promise<PhysicalEvaluationRecord> {
  const docRef = evaluationsRef(uid).doc();
  await docRef.set({
    userId: uid,
    gymId: data.gymId ?? "prolife360",
    evaluatorName: data.evaluatorName,
    date: data.date,
    clinicalHistoryId: data.clinicalHistoryId ?? null,
    strength: data.strength ?? [],
    mobility: data.mobility ?? [],
    anthropometry: data.anthropometry ?? null,
    pain: data.pain ?? [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await docRef.get();
  return toEvaluationRecord(
    created.id,
    created.data() as Record<string, unknown>
  );
}

export async function updateEvaluation(
  uid: string,
  evalId: string,
  data: Partial<{
    evaluatorName: string;
    date: string;
    clinicalHistoryId: string;
    strength: StrengthAssessment[];
    mobility: MobilityAssessment[];
    anthropometry: AnthropometryAssessment;
    pain: PainAssessment[];
    gymId: string;
  }>
): Promise<PhysicalEvaluationRecord> {
  const docRef = evaluationsRef(uid).doc(evalId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(
      `Evaluation ${evalId} not found for user ${uid}.`,
      404
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data.evaluatorName !== undefined) updates.evaluatorName = data.evaluatorName;
  if (data.date !== undefined) updates.date = data.date;
  if (data.clinicalHistoryId !== undefined) updates.clinicalHistoryId = data.clinicalHistoryId;
  if (data.strength !== undefined) updates.strength = data.strength;
  if (data.mobility !== undefined) updates.mobility = data.mobility;
  if (data.anthropometry !== undefined) updates.anthropometry = data.anthropometry;
  if (data.pain !== undefined) updates.pain = data.pain;
  if (data.gymId !== undefined) updates.gymId = data.gymId;

  await docRef.update(updates);
  const updated = await docRef.get();
  return toEvaluationRecord(
    updated.id,
    updated.data() as Record<string, unknown>
  );
}

export async function deleteEvaluation(
  uid: string,
  evalId: string
): Promise<{ deleted: true }> {
  const docRef = evaluationsRef(uid).doc(evalId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(
      `Evaluation ${evalId} not found for user ${uid}.`,
      404
    );
  }
  await docRef.delete();
  return { deleted: true };
}

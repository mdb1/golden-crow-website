import { adminDb } from "../config/firebase.js";
import type { GymDocumentRecord, GymDocumentType } from "../types/gym.types.js";

const GYM_DOCUMENTS_COLLECTION = "gym_documents";

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

function documentsRef(uid: string) {
  return adminDb
    .collection(GYM_DOCUMENTS_COLLECTION)
    .doc(uid)
    .collection("documents");
}

function toGymDocumentRecord(
  id: string,
  data: Record<string, unknown>
): GymDocumentRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
    name: normalizeOptionalString(data.name) ?? "",
    type: (data.type as GymDocumentType) ?? "other",
    uploadedAt: normalizeTimestampToIso(data.uploadedAt),
    expiresAt: data.expiresAt != null ? normalizeTimestampToIso(data.expiresAt) : undefined,
    storagePath: normalizeOptionalString(data.storagePath) ?? "",
    fileSize: typeof data.fileSize === "number" ? data.fileSize : 0,
  };
}

export async function listGymDocuments(uid: string): Promise<GymDocumentRecord[]> {
  const snapshot = await documentsRef(uid).orderBy("uploadedAt", "desc").get();
  return snapshot.docs.map(doc =>
    toGymDocumentRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

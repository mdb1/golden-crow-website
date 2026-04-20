import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { adminDb } from "../config/firebase.js";
import type { ModerationDocumentRecord } from "../types/sdk.types.js";

interface StoredFileDoc extends Record<string, unknown> {
  file_name?: string | null;
  creator_email?: string | null;
  linked_report_code?: string | null;
  linked_report_id?: string | null;
  file_type?: string | null;
  file_content?: string | null;
  creation_date?: unknown;
  last_modified_date?: unknown;
}

export class StoredFileValidationError extends Error {}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeUploadVersionCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "bigint" && value > 0n) {
    return Number(value);
  }

  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    const numberValue = value.toNumber();
    if (typeof numberValue === "number" && Number.isFinite(numberValue) && numberValue > 0) {
      return numberValue;
    }
  }

  return 1;
}

function normalizeDateValue(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  }

  if (typeof value === "number") {
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  }

  if (typeof value === "object") {
    if ("toDate" in value && typeof value.toDate === "function") {
      const timestamp = value.toDate();
      return timestamp instanceof Date && !Number.isNaN(timestamp.getTime())
        ? timestamp.toISOString()
        : undefined;
    }

    if ("_seconds" in value && typeof value._seconds === "number") {
      const seconds = value._seconds;
      const nanoseconds =
        "_nanoseconds" in value && typeof value._nanoseconds === "number"
          ? value._nanoseconds
          : 0;
      return new Date(seconds * 1000 + nanoseconds / 1_000_000).toISOString();
    }
  }

  return undefined;
}

function toSortableTimestamp(value: unknown): number {
  const normalized = normalizeDateValue(value);
  if (!normalized) {
    return 0;
  }

  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof GeoPoint) {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof DocumentReference) {
    return {
      path: value.path,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeValue(entry),
      ])
    );
  }

  return value;
}

function toRecord(
  docId: string,
  data: Record<string, unknown>
): ModerationDocumentRecord {
  return {
    id: docId,
    path: `file_storage/${docId}`,
    collection: "file_storage",
    data: serializeValue(data) as Record<string, unknown>,
  };
}

function normalizeSmartQuotes(value: string): string {
  return value
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"');
}

function compactJsonString(value: string): string {
  try {
    return JSON.stringify(JSON.parse(normalizeSmartQuotes(value)));
  } catch {
    throw new StoredFileValidationError("Stored file content must be valid JSON.");
  }
}

function sortStoredFileRecords(documents: ModerationDocumentRecord[]) {
  return [...documents].sort((left, right) => {
    const timestampDelta =
      toSortableTimestamp(right.data.last_modified_date ?? right.data.creation_date) -
      toSortableTimestamp(left.data.last_modified_date ?? left.data.creation_date);

    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

function resolveLinkedReportCode(data: StoredFileDoc): string | undefined {
  return normalizeString(data.linked_report_code) ?? normalizeString(data.linked_report_id);
}

function buildStoredFilePayload(
  nextData: StoredFileDoc,
  options?: {
    existingData?: StoredFileDoc;
    timestamp?: string;
  }
) {
  const nextTimestamp = options?.timestamp ?? new Date().toISOString();
  const nextContent = normalizeString(nextData.file_content) ?? "";

  const payload: StoredFileDoc = {
    ...nextData,
    file_name: normalizeString(nextData.file_name) ?? null,
    creator_email: normalizeString(nextData.creator_email)?.toLowerCase() ?? null,
    file_type: normalizeString(nextData.file_type)?.toLowerCase() ?? null,
    file_content: compactJsonString(nextContent),
    creation_date:
      normalizeDateValue(nextData.creation_date) ??
      normalizeDateValue(options?.existingData?.creation_date) ??
      nextTimestamp,
    last_modified_date: nextTimestamp,
  };

  if (normalizeString(payload.linked_report_code)) {
    delete payload.linked_report_id;
  } else if (payload.linked_report_id !== undefined) {
    payload.linked_report_id = normalizeString(payload.linked_report_id) ?? null;
  }

  return payload;
}

export async function listStoredFileDocuments(): Promise<ModerationDocumentRecord[]> {
  const snapshot = await adminDb.collection("file_storage").get();

  return sortStoredFileRecords(
    snapshot.docs.map((doc) => toRecord(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
  );
}

export async function getStoredFileDocument(
  fileId: string
): Promise<ModerationDocumentRecord | null> {
  const snapshot = await adminDb.collection("file_storage").doc(fileId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toRecord(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
}

export async function createStoredFileDocument(
  data: Record<string, unknown>
): Promise<{ document: ModerationDocumentRecord }> {
  const storedFileRef = adminDb.collection("file_storage").doc();
  const payload = buildStoredFilePayload(data as StoredFileDoc);

  await storedFileRef.set(payload as DocumentData, { merge: false });

  const snapshot = await storedFileRef.get();
  return {
    document: toRecord(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>),
  };
}

export async function updateStoredFileDocument(
  fileId: string,
  data: Record<string, unknown>
): Promise<{ document: ModerationDocumentRecord | null; linkedReportVersionBumped: boolean }> {
  const storedFileRef = adminDb.collection("file_storage").doc(fileId);
  const snapshot = await storedFileRef.get();

  if (!snapshot.exists) {
    return { document: null, linkedReportVersionBumped: false };
  }

  const existingData = (snapshot.data() ?? {}) as StoredFileDoc;
  const nextData = { ...existingData, ...data } as StoredFileDoc;
  const payload = buildStoredFilePayload(nextData, {
    existingData,
  });
  const nextTimestamp =
    normalizeDateValue(payload.last_modified_date) ?? new Date().toISOString();

  let linkedReportVersionBumped = false;

  await adminDb.runTransaction(async (transaction) => {
    transaction.set(storedFileRef, payload as DocumentData, { merge: false });

    const linkedReportCode = resolveLinkedReportCode(payload);
    if (!linkedReportCode) {
      return;
    }

    const reportCodeRef = adminDb.collection("report_codes").doc(linkedReportCode);
    const reportCodeSnapshot = await transaction.get(reportCodeRef);
    if (!reportCodeSnapshot.exists) {
      return;
    }

    const uploadedReportId = normalizeString(reportCodeSnapshot.data()?.uploaded_report_id);
    if (!uploadedReportId) {
      return;
    }

    const uploadedReportRef = adminDb.collection("uploaded_reports").doc(uploadedReportId);
    const uploadedReportSnapshot = await transaction.get(uploadedReportRef);
    if (!uploadedReportSnapshot.exists) {
      return;
    }

    transaction.set(
      uploadedReportRef,
      {
        ...(uploadedReportSnapshot.data() ?? {}),
        upload_version_count:
          normalizeUploadVersionCount(uploadedReportSnapshot.data()?.upload_version_count) + 1,
        date_modified: nextTimestamp,
      },
      { merge: false }
    );
    linkedReportVersionBumped = true;
  });

  return {
    document: await getStoredFileDocument(fileId),
    linkedReportVersionBumped,
  };
}

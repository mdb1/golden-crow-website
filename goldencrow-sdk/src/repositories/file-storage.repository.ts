import {
  DocumentReference,
  FieldPath,
  GeoPoint,
  type Query,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import {
  identifyPgiNativeModel,
  SUPPORTED_PGI_NATIVE_MODELS,
} from "../lib/pgi-native-schema.js";
import {
  serializedPgoObjectSchemaError,
  SUPPORTED_PGO_OBJECT_SCHEMA_TYPES,
} from "../lib/pgo-object-schema.js";
import type { ModerationDocumentRecord } from "../types/sdk.types.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");

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
export class StoredFileDeleteBlockedError extends Error {}
export class StoredFileUpdateBlockedError extends Error {}

export const MAX_STORED_FILE_CONTENT_BYTES = 900 * 1024;
export const FILE_STORAGE_REQUEST_BODY_LIMIT_BYTES = 6 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SUPPORTED_PGI_FILE_TYPES = new Set<string>(SUPPORTED_PGI_NATIVE_MODELS);
const SUPPORTED_PGO_FILE_TYPES = new Set<string>(
  SUPPORTED_PGO_OBJECT_SCHEMA_TYPES,
);
const CREATE_STORED_FILE_KEYS = new Set([
  "file_name",
  "creator_email",
  "file_type",
  "file_content",
]);

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

function normalizedStoredFileType(value: unknown): string {
  const fileType = normalizeString(value)?.toLowerCase();
  if (!fileType) {
    throw new StoredFileValidationError("Stored file type is required.");
  }
  return fileType;
}

function defaultStoredFileName(fileType: string): string {
  if (fileType === "mdm") {
    return "report.pgi1.json";
  }
  if (fileType === "ag") {
    return "report.pgi2.json";
  }
  if (fileType === "2pq") {
    return "report.pgi3.json";
  }
  return `${fileType.replace(/^pgo_/, "")}.pgo.json`;
}

function safeStoredFileTitleName(value: unknown): string | undefined {
  const title = normalizeString(value);
  if (!title) {
    return undefined;
  }
  const fileName = title
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
  return fileName || undefined;
}

function storedFileNameFromContentTitle(
  fileContent: string,
): string | undefined {
  try {
    const content = JSON.parse(fileContent) as unknown;
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      return undefined;
    }
    return safeStoredFileTitleName(
      (content as Record<string, unknown>).title,
    );
  } catch {
    return undefined;
  }
}

function normalizedStoredFileName(
  value: unknown,
  fileType: string,
  fileContent: string,
): string {
  const fileName =
    normalizeString(value) ??
    storedFileNameFromContentTitle(fileContent) ??
    defaultStoredFileName(fileType);
  if (
    fileName.length > 255 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw new StoredFileValidationError(
      "Stored file name must be a single safe file name up to 255 characters.",
    );
  }
  return fileName;
}

function normalizedCreatorEmail(value: unknown): string | null {
  const email = normalizeString(value)?.toLowerCase();
  if (!email) {
    return null;
  }
  if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StoredFileValidationError(
      "Stored file creator_email must be a valid email address.",
    );
  }
  return email;
}

export function validateStoredFileJsonContent(input: {
  fileType: unknown;
  fileContent: unknown;
}): { fileType: string; fileContent: string } {
  const fileType = normalizedStoredFileType(input.fileType);
  const rawContent = normalizeString(input.fileContent);
  if (!rawContent) {
    throw new StoredFileValidationError("Stored file content is required.");
  }
  const fileContent = compactJsonString(rawContent);
  const contentSizeBytes = Buffer.byteLength(fileContent, "utf8");
  if (contentSizeBytes > MAX_STORED_FILE_CONTENT_BYTES) {
    throw new StoredFileValidationError(
      `Stored file content exceeds the ${MAX_STORED_FILE_CONTENT_BYTES}-byte inline Firestore limit.`,
    );
  }
  const content = JSON.parse(fileContent) as unknown;

  if (SUPPORTED_PGI_FILE_TYPES.has(fileType)) {
    const identified = identifyPgiNativeModel(content);
    if (!identified.ok) {
      throw new StoredFileValidationError(identified.message);
    }
    if (identified.model !== fileType) {
      throw new StoredFileValidationError(
        `Stored file content matches ${identified.model}, not declared file_type ${fileType}.`,
      );
    }
    return { fileType, fileContent };
  }

  if (SUPPORTED_PGO_FILE_TYPES.has(fileType)) {
    const schemaError = serializedPgoObjectSchemaError(fileType, content);
    if (schemaError) {
      throw new StoredFileValidationError(
        `Stored file content does not match the ${fileType} schema: ${schemaError}.`,
      );
    }
    return { fileType, fileContent };
  }

  if (fileType.startsWith("pgo_")) {
    throw new StoredFileValidationError(
      `No runtime PGO schema is registered for file_type ${fileType}.`,
    );
  }

  throw new StoredFileValidationError(
    `Stored file type ${fileType} is not a supported JSON file type. Use mdm, ag, 2pq, or a registered pgo_* type.`,
  );
}

function isSupportedJsonFileType(fileType: string) {
  return (
    SUPPORTED_PGI_FILE_TYPES.has(fileType) ||
    SUPPORTED_PGO_FILE_TYPES.has(fileType)
  );
}

function unchangedLegacyFileContent(nextValue: unknown, previousValue: unknown) {
  if (nextValue === previousValue && typeof nextValue === "string") {
    return nextValue;
  }
  if (typeof nextValue !== "string" || typeof previousValue !== "string") {
    return null;
  }
  try {
    const nextContent = compactJsonString(nextValue);
    const previousContent = compactJsonString(previousValue);
    return nextContent === previousContent ? nextContent : null;
  } catch {
    return null;
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
    requireCreatorEmail?: boolean;
  }
) {
  const nextTimestamp = options?.timestamp ?? new Date().toISOString();
  const nextFileType = normalizedStoredFileType(nextData.file_type);
  let validatedContent: { fileType: string; fileContent: string };
  if (isSupportedJsonFileType(nextFileType)) {
    validatedContent = validateStoredFileJsonContent({
      fileType: nextFileType,
      fileContent: nextData.file_content,
    });
  } else {
    const existingFileType = options?.existingData
      ? normalizedStoredFileType(options.existingData.file_type)
      : undefined;
    const unchangedContent = options?.existingData
      ? unchangedLegacyFileContent(
          nextData.file_content,
          options.existingData.file_content,
        )
      : null;
    if (existingFileType === nextFileType && unchangedContent !== null) {
      validatedContent = {
        fileType: nextFileType,
        fileContent: unchangedContent,
      };
    } else {
      validatedContent = validateStoredFileJsonContent({
        fileType: nextFileType,
        fileContent: nextData.file_content,
      });
    }
  }

  const creatorEmail = normalizedCreatorEmail(nextData.creator_email);
  if (options?.requireCreatorEmail && !creatorEmail) {
    throw new StoredFileValidationError(
      "Stored file creator_email is required.",
    );
  }

  const payload: StoredFileDoc = {
    ...nextData,
    file_name: normalizedStoredFileName(
      nextData.file_name,
      validatedContent.fileType,
      validatedContent.fileContent,
    ),
    creator_email: creatorEmail,
    file_type: validatedContent.fileType,
    file_content: validatedContent.fileContent,
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

export async function listStoredFileDocuments(options: {
  cursor?: string;
  limit?: number;
} = {}): Promise<{
  documents: ModerationDocumentRecord[];
  nextCursor: string | null;
}> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(options.limit ?? DEFAULT_PAGE_SIZE)),
  );
  let query: Query = adminDb
    .collection("file_storage")
    .orderBy(FieldPath.documentId(), "desc");
  if (options.cursor) {
    query = query.startAfter(options.cursor);
  }
  const snapshot = await query.limit(pageSize + 1).get();
  const pageDocs = snapshot.docs.slice(0, pageSize);
  const documents = sortStoredFileRecords(
    pageDocs.map((doc) =>
      toRecord(doc.id, (doc.data() ?? {}) as Record<string, unknown>),
    ),
  );
  const lastPageDoc = pageDocs[pageDocs.length - 1];

  return {
    documents,
    nextCursor:
      snapshot.docs.length > pageSize && lastPageDoc ? lastPageDoc.id : null,
  };
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
  for (const key of Object.keys(data)) {
    if (!CREATE_STORED_FILE_KEYS.has(key)) {
      throw new StoredFileValidationError(
        `Unsupported file_storage create key ${key}. Use only file_name, creator_email, file_type, and file_content; links and timestamps are server-owned.`,
      );
    }
  }
  const payload = buildStoredFilePayload(
    {
      ...(data as StoredFileDoc),
      linked_object_code: null,
      linked_report_code: null,
    },
    { requireCreatorEmail: true },
  );
  delete payload.linked_report_id;

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
  const result = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(storedFileRef);
    if (!snapshot.exists) {
      return { found: false, linkedReportVersionBumped: false };
    }
    const existingData = (snapshot.data() ?? {}) as StoredFileDoc;
    const wrongCaseKey = Object.keys(data).find(
      (key) =>
        /[A-Z]/.test(key) &&
        (!(key in existingData) ||
          JSON.stringify(serializeValue(data[key])) !==
            JSON.stringify(serializeValue(existingData[key]))),
    );
    if (wrongCaseKey) {
      throw new StoredFileValidationError(
        `file_storage uses snake_case keys; ${wrongCaseKey} is not allowed.`,
      );
    }
    const linkedObjectCode = normalizeString(existingData.linked_object_code);
    if (linkedObjectCode) {
      throw new StoredFileUpdateBlockedError(
        `Stored file ${fileId} is linked to object code ${linkedObjectCode} and cannot be edited. Remove that object link first.`
      );
    }
    const uploadedObjectQuery = adminDb
      .collection("uploaded_objects")
      .where("linked_file_id", "==", fileId)
      .limit(1);
    const uploadedObjectSnapshot = await transaction.get(uploadedObjectQuery);
    if (!uploadedObjectSnapshot.empty) {
      throw new StoredFileUpdateBlockedError(
        `Stored file ${fileId} is still referenced by an uploaded object and cannot be edited. Remove that object link first.`
      );
    }

    const nextData = { ...existingData, ...data } as StoredFileDoc;
    const payload = buildStoredFilePayload(nextData, {
      existingData,
    });
    const nextTimestamp =
      normalizeDateValue(payload.last_modified_date) ?? new Date().toISOString();

    const linkedReportCode = resolveLinkedReportCode(payload);
    let uploadedReportRef: DocumentReference | undefined;
    let uploadedReportData: Record<string, unknown> | undefined;
    if (linkedReportCode) {
      const reportCodeRef = adminDb.collection("report_codes").doc(linkedReportCode);
      const reportCodeSnapshot = await transaction.get(reportCodeRef);
      const uploadedReportId = normalizeString(
        reportCodeSnapshot.data()?.uploaded_report_id
      );
      if (reportCodeSnapshot.exists && uploadedReportId) {
        uploadedReportRef = adminDb
          .collection("uploaded_reports")
          .doc(uploadedReportId);
        const uploadedReportSnapshot = await transaction.get(uploadedReportRef);
        if (uploadedReportSnapshot.exists) {
          uploadedReportData = uploadedReportSnapshot.data() ?? {};
        }
      }
    }

    transaction.set(storedFileRef, payload as DocumentData, { merge: false });
    if (uploadedReportRef && uploadedReportData) {
      transaction.set(
        uploadedReportRef,
        {
          ...uploadedReportData,
          upload_version_count:
            normalizeUploadVersionCount(uploadedReportData.upload_version_count) + 1,
          date_modified: nextTimestamp,
        },
        { merge: false }
      );
    }
    return {
      found: true,
      linkedReportVersionBumped: Boolean(uploadedReportRef && uploadedReportData),
    };
  });

  if (!result.found) {
    return { document: null, linkedReportVersionBumped: false };
  }

  return {
    document: await getStoredFileDocument(fileId),
    linkedReportVersionBumped: result.linkedReportVersionBumped,
  };
}

export async function deleteStoredFileDocument(fileId: string): Promise<boolean> {
  const storedFileRef = adminDb.collection("file_storage").doc(fileId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(storedFileRef);
    if (!snapshot.exists) {
      return false;
    }

    const existingData = (snapshot.data() ?? {}) as StoredFileDoc;
    const linkedObjectCode = normalizeString(existingData.linked_object_code);
    if (linkedObjectCode) {
      throw new StoredFileDeleteBlockedError(
        `Stored file ${fileId} is linked to object code ${linkedObjectCode}. Remove that object link before deleting this file.`
      );
    }
    const linkedReportCode = resolveLinkedReportCode(existingData);
    if (linkedReportCode) {
      throw new StoredFileDeleteBlockedError(
        `Stored file ${fileId} is linked to report code ${linkedReportCode}. Remove that report link before deleting this file.`
      );
    }

    const uploadedObjectQuery = adminDb
      .collection("uploaded_objects")
      .where("linked_file_id", "==", fileId)
      .limit(1);
    const uploadedReportQuery = adminDb
      .collection("uploaded_reports")
      .where("linked_file_id", "==", fileId)
      .limit(1);
    const [uploadedObjectSnapshot, uploadedReportSnapshot] = await Promise.all([
      transaction.get(uploadedObjectQuery),
      transaction.get(uploadedReportQuery),
    ]);
    if (!uploadedObjectSnapshot.empty) {
      throw new StoredFileDeleteBlockedError(
        `Stored file ${fileId} is still referenced by an uploaded object. Remove that object link before deleting this file.`
      );
    }
    if (!uploadedReportSnapshot.empty) {
      const uploadedReportData = uploadedReportSnapshot.docs[0]?.data() ?? {};
      const reportCode = normalizeString(uploadedReportData.report_code);
      throw new StoredFileDeleteBlockedError(
        reportCode
          ? `Stored file ${fileId} is still referenced by uploaded report ${reportCode}. Remove that link before deleting this file.`
          : `Stored file ${fileId} is still referenced by an uploaded report. Remove that link before deleting this file.`
      );
    }

    transaction.delete(storedFileRef);
    return true;
  });
}

import { FieldValue, type Query } from "firebase-admin/firestore";
import { adminDb } from "../config/firebase.js";
import type { DnaReport, SourceKey } from "../types/sdk.types.js";

interface ReportCodeDoc {
  owner_id?: string;
  uploaded_report_id?: string;
}

interface UploadedReportDoc {
  file_name?: string | null;
  report_code?: string;
  report_owner_id?: string;
  owner_community_user_id?: string;
  owner_public_profile_id?: string;
  owner_email?: string | null;
  owner_name?: string | null;
  provider_format?: string | null;
  provider_name?: string | null;
  tracking_progress_status?: string | null;
  download_url?: string | null;
  upload_version_count?: unknown;
  date_created?: unknown;
  date_modified?: unknown;
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

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function normalizeSource(uploadedReport?: UploadedReportDoc): SourceKey {
  const providerFormat = normalizeString(uploadedReport?.provider_format)?.toLowerCase();
  const providerName = normalizeString(uploadedReport?.provider_name)?.toLowerCase() ?? "";

  if (providerFormat === "ag" || providerName.includes("actyon")) {
    return "ActyonGenomics";
  }

  if (providerFormat === "vcf" || providerName.includes("vcf")) {
    return "vcf";
  }

  return "myDNAMap";
}

function resolveReportOwnerId(
  reportCode: ReportCodeDoc,
  uploadedReport?: UploadedReportDoc
): string {
  return (
    normalizeString(reportCode.owner_id) ??
    normalizeString(uploadedReport?.report_owner_id) ??
    normalizeString(uploadedReport?.owner_community_user_id) ??
    ""
  );
}

function toDnaReport(
  reportId: string,
  reportCode: ReportCodeDoc,
  uploadedReport?: UploadedReportDoc
): DnaReport {
  return {
    id: reportId,
    code: normalizeString(uploadedReport?.report_code) ?? reportId,
    source: normalizeSource(uploadedReport),
    userId: resolveReportOwnerId(reportCode, uploadedReport),
    downloadUrl: uploadedReport?.download_url ?? null,
    createdAt:
      normalizeDateValue(uploadedReport?.date_modified) ??
      normalizeDateValue(uploadedReport?.date_created),
    uploadedReportId: normalizeString(reportCode.uploaded_report_id),
    fileName: normalizeString(uploadedReport?.file_name) ?? null,
    providerFormat: normalizeString(uploadedReport?.provider_format) ?? null,
    providerName: normalizeString(uploadedReport?.provider_name) ?? null,
    trackingStatus: normalizeString(uploadedReport?.tracking_progress_status) ?? null,
    ownerName: normalizeString(uploadedReport?.owner_name) ?? null,
    ownerEmail: normalizeString(uploadedReport?.owner_email) ?? null,
    ownerCommunityUserId: normalizeString(uploadedReport?.owner_community_user_id) ?? null,
    ownerPublicProfileId: normalizeString(uploadedReport?.owner_public_profile_id) ?? null,
    uploadVersionCount: normalizeUploadVersionCount(uploadedReport?.upload_version_count),
  };
}

async function loadUploadedReports(
  reportCodes: Array<{ id: string; data: ReportCodeDoc }>
): Promise<Map<string, UploadedReportDoc>> {
  const uploadedReportIds = [
    ...new Set(
      reportCodes
        .map((reportCode) => normalizeString(reportCode.data.uploaded_report_id))
        .filter((uploadedReportId): uploadedReportId is string => Boolean(uploadedReportId))
    ),
  ];

  if (uploadedReportIds.length === 0) {
    return new Map();
  }

  const uploadedReportRefs = uploadedReportIds.map((uploadedReportId) =>
    adminDb.collection("uploaded_reports").doc(uploadedReportId)
  );
  const uploadedReportSnaps = await adminDb.getAll(...uploadedReportRefs);

  return new Map(
    uploadedReportSnaps
      .filter((uploadedReportSnap) => uploadedReportSnap.exists)
      .map((uploadedReportSnap) => [
        uploadedReportSnap.id,
        uploadedReportSnap.data() as UploadedReportDoc,
      ])
  );
}

function applyReportFilters(
  reports: DnaReport[],
  filters?: { userId?: string; source?: SourceKey }
) {
  return reports.filter((report) => {
    if (filters?.userId && report.userId !== filters.userId) {
      return false;
    }

    if (filters?.source && report.source !== filters.source) {
      return false;
    }

    return true;
  });
}

function sortReportsDescending(reports: DnaReport[]) {
  return [...reports].sort((left, right) => {
    const timestampDelta =
      toSortableTimestamp(right.createdAt) - toSortableTimestamp(left.createdAt);

    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

function sliceReportsFromCursor(reports: DnaReport[], startAfter?: string) {
  if (!startAfter) {
    return reports;
  }

  const startIndex = reports.findIndex((report) => report.id === startAfter);
  return startIndex >= 0 ? reports.slice(startIndex + 1) : reports;
}

/**
 * List DNA reports from report_codes, enriching each code with its linked uploaded_reports metadata.
 * The report_codes collection only stores the owner_id and uploaded_report_id link fields.
 */
export async function listReports(
  filters?: { userId?: string; source?: SourceKey },
  limit = 50,
  startAfter?: string
): Promise<{ reports: DnaReport[]; hasMore: boolean }> {
  let query: Query = adminDb.collection("report_codes");

  if (filters?.userId) {
    query = query.where("owner_id", "==", filters.userId);
  }

  const snapshot = await query.limit(filters?.userId ? limit + 150 : 500).get();
  const reportCodes = snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as ReportCodeDoc,
  }));
  const uploadedReports = await loadUploadedReports(reportCodes);

  const reports = sortReportsDescending(
    applyReportFilters(
      reportCodes.map(({ id, data }) =>
        toDnaReport(id, data, uploadedReports.get(data.uploaded_report_id ?? ""))
      ),
      filters
    )
  );
  const reportsAfterCursor = sliceReportsFromCursor(reports, startAfter);

  return {
    reports: reportsAfterCursor.slice(0, limit),
    hasMore: reportsAfterCursor.length > limit,
  };
}

/**
 * Fetch a single DNA report by report_codes document ID.
 * Returns null if the document does not exist.
 */
export async function getReportById(reportId: string): Promise<DnaReport | null> {
  const reportCodeSnap = await adminDb.collection("report_codes").doc(reportId).get();
  if (!reportCodeSnap.exists) {
    return null;
  }

  const reportCode = reportCodeSnap.data() as ReportCodeDoc;
  const uploadedReportId = normalizeString(reportCode.uploaded_report_id);
  const uploadedReportSnap = uploadedReportId
    ? await adminDb.collection("uploaded_reports").doc(uploadedReportId).get()
    : null;
  const uploadedReport =
    uploadedReportSnap?.exists ? (uploadedReportSnap.data() as UploadedReportDoc) : undefined;

  return toDnaReport(reportCodeSnap.id, reportCode, uploadedReport);
}

/**
 * Delete a DNA report Firestore document by ID.
 *
 * TODO: Add Storage file deletion once the upload flow confirms the Storage path structure.
 * Storage file deletion is intentionally skipped — the path (e.g. reports/{userId}/{reportId}
 * or reports/{code}) is unconfirmed pending the upload flow implementation.
 *
 * Returns { success: true, storageDeleted: false } on success.
 * Returns { success: false, storageDeleted: false } if Firestore delete throws.
 */
export async function deleteReport(
  reportId: string
): Promise<{ success: boolean; storageDeleted: boolean }> {
  try {
    const reportCodeRef = adminDb.collection("report_codes").doc(reportId);
    const reportCodeSnap = await reportCodeRef.get();

    if (!reportCodeSnap.exists) {
      return { success: false, storageDeleted: false };
    }

    const reportCode = reportCodeSnap.data() as ReportCodeDoc;
    const uploadedReportId = normalizeString(reportCode.uploaded_report_id);
    const ownerId = normalizeString(reportCode.owner_id);

    const batch = adminDb.batch();
    batch.delete(reportCodeRef);

    if (uploadedReportId) {
      batch.delete(adminDb.collection("uploaded_reports").doc(uploadedReportId));
    }

    if (ownerId && uploadedReportId) {
      batch.set(
        adminDb.collection("community_users").doc(ownerId),
        {
          owned_reports: FieldValue.arrayRemove(uploadedReportId),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return { success: true, storageDeleted: false };
  } catch (err) {
    console.error(`[deleteReport] Failed to delete report ${reportId}:`, err);
    return { success: false, storageDeleted: false };
  }
}

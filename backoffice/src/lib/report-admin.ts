import type { ModerationDocumentRecord } from "./moderation-types";
import { getBoolean, getString, pickFirstString } from "./moderation-utils";

export type ReportProviderFormat = "mdm" | "ag" | "vcf" | "pdf" | "2pq";
export type TrackingProgressStatusValue =
  | "waiting_on_patient"
  | "sample_taken"
  | "sample_processing"
  | "sample_stored"
  | "document_ready";

export const REPORT_PROVIDER_FORMAT_OPTIONS: ReportProviderFormat[] = [
  "mdm",
  "ag",
  "vcf",
  "pdf",
  "2pq",
];

export const TRACKING_PROGRESS_STATUS_OPTIONS: Array<{
  value: TrackingProgressStatusValue;
  label: string;
}> = [
  {
    value: "waiting_on_patient",
    label: "Waiting on patient",
  },
  {
    value: "sample_taken",
    label: "Sample taken",
  },
  {
    value: "sample_processing",
    label: "Sample processing",
  },
  {
    value: "sample_stored",
    label: "Sample stored",
  },
  {
    value: "document_ready",
    label: "Document ready",
  },
];

export interface UploadedReportRecord {
  id: string;
  fileName: string;
  downloadUrl: string;
  linkedFileId: string;
  uploadVersionCount: number;
  providerFormat: string;
  providerName: string;
  trackingProgressStatus: string;
  reportCode: string;
  reportOwnerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerCommunityUserId: string;
  ownerPublicProfileId: string;
  dateCreated?: string;
  dateModified?: string;
  sourceData: Record<string, unknown>;
}

export interface ReportOwnerRecord {
  id: string;
  acceptedTerms: boolean;
  acceptedTermsAt?: string;
  ownerCompany: string;
  ownerProfession: string;
  ownerBio: string;
  ownerContactNumber: string;
  ownerName: string;
  ownerContactEmail: string;
  updatedAt?: string;
  sourceData: Record<string, unknown>;
}

export interface ReportCodeRecord {
  id: string;
  ownerId: string;
  uploadedReportId: string;
  sourceData: Record<string, unknown>;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function parseUploadedReportRecord(
  document: ModerationDocumentRecord
): UploadedReportRecord {
  const data = document.data;

  return {
    id: document.id,
    fileName: getString(data.file_name) ?? document.id,
    downloadUrl: getString(data.download_url) ?? "",
    linkedFileId: getString(data.linked_file_id) ?? "",
    uploadVersionCount: getNumber(data.upload_version_count) ?? 1,
    providerFormat: getString(data.provider_format) ?? "",
    providerName: getString(data.provider_name) ?? "",
    trackingProgressStatus: getString(data.tracking_progress_status) ?? "",
    reportCode: getString(data.report_code) ?? "",
    reportOwnerId: getString(data.report_owner_id) ?? "",
    ownerName: getString(data.owner_name) ?? "",
    ownerEmail: getString(data.owner_email) ?? "",
    ownerCommunityUserId: getString(data.owner_community_user_id) ?? "",
    ownerPublicProfileId: getString(data.owner_public_profile_id) ?? "",
    dateCreated: getString(data.date_created),
    dateModified: getString(data.date_modified),
    sourceData: data,
  };
}

export function isReportReadyToDownload(report: UploadedReportRecord) {
  const trimmed = report.downloadUrl.trim().toLowerCase();
  return Boolean(trimmed) && trimmed !== "null";
}

export function resolveEditableReportOwnerId(report: UploadedReportRecord) {
  return report.ownerCommunityUserId || report.reportOwnerId;
}

export function normalizeProviderFormat(value: string): ReportProviderFormat {
  switch (value.trim().toLowerCase()) {
    case "ag":
      return "ag";
    case "mdm":
      return "mdm";
    case "pdf":
      return "pdf";
    case "2pq":
      return "2pq";
    default:
      return "vcf";
  }
}

export function parseReportOwnerRecord(
  document: ModerationDocumentRecord
): ReportOwnerRecord {
  const data = document.data;

  return {
    id: document.id,
    acceptedTerms: getBoolean(data.accepted_terms) ?? false,
    acceptedTermsAt: getString(data.accepted_terms_at),
    ownerCompany:
      pickFirstString(data, ["owner_company", "ownerCompany"]) ?? "",
    ownerProfession:
      pickFirstString(data, ["owner_profession", "ownerProfession"]) ?? "",
    ownerBio: pickFirstString(data, ["owner_bio", "ownerBio"]) ?? "",
    ownerContactNumber:
      pickFirstString(data, ["owner_contact_number", "ownerContactNumber"]) ?? "",
    ownerName: pickFirstString(data, ["owner_name", "ownerName"]) ?? "",
    ownerContactEmail:
      pickFirstString(data, ["owner_contact_email", "ownerContactEmail"]) ?? "",
    updatedAt: getString(data.updatedAt),
    sourceData: data,
  };
}

export function parseReportCodeRecord(
  document: ModerationDocumentRecord
): ReportCodeRecord {
  const data = document.data;

  return {
    id: document.id,
    ownerId: getString(data.owner_id) ?? "",
    uploadedReportId: getString(data.uploaded_report_id) ?? "",
    sourceData: data,
  };
}

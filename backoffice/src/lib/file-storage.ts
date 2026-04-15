import type { ModerationDocumentRecord } from "./moderation-types";
import { getString } from "./moderation-utils";

export type StoredFileFormat = "mdm" | "ag" | "vcf" | "pdf";

export interface StoredFileRecord {
  id: string;
  fileName: string;
  creatorEmail: string;
  linkedReportCode: string;
  legacyLinkedReportId: string;
  fileType: string;
  fileContent: string;
  creationDate?: string;
  lastModifiedDate?: string;
  sourceData: Record<string, unknown>;
}

export const STORED_FILE_JSON_FORMAT_OPTIONS: StoredFileFormat[] = ["mdm", "ag"];
export const STORED_FILE_ALL_FORMAT_OPTIONS: StoredFileFormat[] = [
  "mdm",
  "ag",
  "vcf",
  "pdf",
];

export function normalizeStoredFileContent(value: string): string {
  return value
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"');
}

export function formatStoredFileType(value?: string | null) {
  const normalized = getString(value)?.toLowerCase();
  if (!normalized) {
    return "Unknown";
  }

  switch (normalized) {
    case "mdm":
      return "MDM";
    case "ag":
      return "AG";
    case "vcf":
      return "VCF";
    case "pdf":
      return "PDF";
    default:
      return normalized.toUpperCase();
  }
}

export function isJsonBackedStoredFileType(value?: string | null) {
  const normalized = getString(value)?.toLowerCase();
  return normalized === "mdm" || normalized === "ag";
}

export function parseStoredFileRecord(
  document: ModerationDocumentRecord
): StoredFileRecord {
  const data = document.data;

  return {
    id: document.id,
    fileName: getString(data.file_name) ?? document.id,
    creatorEmail: getString(data.creator_email) ?? "",
    linkedReportCode: getString(data.linked_report_code) ?? "",
    legacyLinkedReportId: getString(data.linked_report_id) ?? "",
    fileType: getString(data.file_type) ?? "",
    fileContent: getString(data.file_content) ?? "",
    creationDate: getString(data.creation_date),
    lastModifiedDate: getString(data.last_modified_date),
    sourceData: data,
  };
}

export function getStoredFileLinkedReportKey(file: StoredFileRecord) {
  return file.linkedReportCode || file.legacyLinkedReportId;
}

export function isStoredFileOrphan(file: StoredFileRecord) {
  return !getStoredFileLinkedReportKey(file);
}

export function validateStoredFileJson(value: string) {
  try {
    JSON.parse(normalizeStoredFileContent(value));
    return true;
  } catch {
    return false;
  }
}

export function compactStoredFileJson(value: string) {
  return JSON.stringify(JSON.parse(normalizeStoredFileContent(value)));
}

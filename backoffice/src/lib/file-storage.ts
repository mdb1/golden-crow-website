import type { ModerationDocumentRecord } from "./moderation-types";
import { getString } from "./moderation-utils";

export const PGO_STORED_FILE_FORMATS = [
  "pgo_form",
  "pgo_bundle_of_symptoms",
  "pgo_bundle_of_candidate_genes",
  "pgo_informed_consent",
  "pgo_test_order",
  "pgo_collection_request",
  "pgo_blood_sample",
  "pgo_tissue_sample",
  "pgo_embryo_sample",
  "pgo_dna_sample",
  "pgo_sequence_reads",
  "pgo_sequence_data",
  "pgo_aligned_reads",
  "pgo_unannotated_vcf",
  "pgo_annotated_vcf",
  "pgo_interactive_report",
  "pgo_pdf_report",
  "pgo_image_bundle",
  "pgo_karyotype_result",
  "pgo_flow_cytometry_data",
] as const;

export type PgoStoredFileFormat = (typeof PGO_STORED_FILE_FORMATS)[number];
export type StoredFileFormat =
  | "mdm"
  | "ag"
  | "vcf"
  | "pdf"
  | "2pq"
  | PgoStoredFileFormat;

export interface StoredFileRecord {
  id: string;
  fileName: string;
  creatorEmail: string;
  linkedReportCode: string;
  legacyLinkedReportId: string;
  linkedObjectCode: string;
  fileType: string;
  fileContent: string;
  creationDate?: string;
  lastModifiedDate?: string;
  sourceData: Record<string, unknown>;
}

export const STORED_FILE_JSON_FORMAT_OPTIONS: StoredFileFormat[] = [
  "mdm",
  "ag",
  "2pq",
  ...PGO_STORED_FILE_FORMATS,
];
export const STORED_FILE_ALL_FORMAT_OPTIONS: StoredFileFormat[] = [
  "mdm",
  "ag",
  "vcf",
  "pdf",
  "2pq",
  ...PGO_STORED_FILE_FORMATS,
];

export const MAX_INLINE_STORED_FILE_BYTES = 900 * 1024;

export function storedFileContentByteLength(value: string) {
  const normalized = normalizeStoredFileContent(value);
  let measured = normalized;
  try {
    measured = JSON.stringify(JSON.parse(normalized));
  } catch {
    // Syntax validation reports the malformed JSON separately; size still has a safe fallback.
  }
  return typeof TextEncoder === "undefined"
    ? new Blob([measured]).size
    : new TextEncoder().encode(measured).byteLength;
}

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
    case "2pq":
      return "2PQ";
    default:
      return normalized.startsWith("pgo_")
        ? normalized
            .slice(4)
            .split("_")
            .map((part) =>
              ["dna", "pdf", "vcf"].includes(part)
                ? part.toUpperCase()
                : part.charAt(0).toUpperCase() + part.slice(1),
            )
            .join(" ")
        : normalized.toUpperCase();
  }
}

export function isJsonBackedStoredFileType(value?: string | null) {
  const normalized = getString(value)?.toLowerCase();
  return STORED_FILE_JSON_FORMAT_OPTIONS.some((option) => option === normalized);
}

export function defaultStoredFileName(fileType: string, role?: string) {
  const normalized = fileType.trim().toLowerCase();
  if (normalized === "mdm") return "report.pgi1.json";
  if (normalized === "ag") return "report.pgi2.json";
  if (normalized === "2pq") return "report.pgi3.json";
  if (normalized.startsWith("pgo_")) {
    return `${role?.trim() || normalized.slice(4)}.pgo.json`;
  }
  return "stored-file.json";
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
    linkedObjectCode: getString(data.linked_object_code) ?? "",
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

export function getStoredFileLinkedObjectCode(file: StoredFileRecord) {
  return file.linkedObjectCode;
}

export function isStoredFileOrphan(file: StoredFileRecord) {
  return !getStoredFileLinkedReportKey(file) && !getStoredFileLinkedObjectCode(file);
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

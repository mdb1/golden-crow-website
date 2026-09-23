import { createHash, randomInt } from "node:crypto";
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import {
  FaviconExtractionError,
  fetchWithValidatedRedirects,
  readLimitedResponse,
} from "../lib/favicon.js";
import { identifyPgiNativeModel } from "../lib/pgi-native-schema.js";
import { serializedPgoObjectSchemaError } from "../lib/pgo-object-schema.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");
const FEED_ORGANIZATIONS_COLLECTION = "feed_organizations";
const FEED_INDIVIDUALS_COLLECTION = "feed_individuals";
const SERVICE_OFFERS_COLLECTION = "service_offers";
const SERVICE_TRANSACTIONS_COLLECTION = "service_transactions";
const SERVICE_TRANSACTION_IDEMPOTENCY_COLLECTION =
  "service_transaction_idempotency";
const OBJECT_CODES_COLLECTION = "object_codes";
const UPLOADED_OBJECTS_COLLECTION = "uploaded_objects";
const UPLOADED_REPORTS_COLLECTION = "uploaded_reports";
const OBJECT_OWNERS_COLLECTION = "object_owners";
const FILE_STORAGE_COLLECTION = "file_storage";
const COMMUNITY_USERS_COLLECTION = "community_users";
const REQUESTED_TRANSACTIONS_FIELD = "requestedServiceTransactions";
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const FILTERED_BATCH_LIMIT = MAX_PAGE_SIZE;
const MAX_FILTERED_SCAN = MAX_PAGE_SIZE * 3;
const OUTPUT_OBJECT_DOWNLOAD_MAX_BYTES = 5 * 1024 * 1024;
const OUTPUT_OBJECT_DOWNLOAD_TIMEOUT_MS = 10_000;
const OUTPUT_OBJECT_CODE_CANDIDATE_COUNT = 12;
const MAX_OBJECT_REVISION_HISTORY_RECORDS = 100;

export const SUPPORT_SERVICE_STAGES = [
  "test_planning",
  "wet_lab",
  "bioinformatics",
] as const;

export const SUPPORT_SERVICE_OFFER_STATUSES = [
  "draft",
  "active",
  "inactive",
  "archived",
] as const;

export const SUPPORT_SERVICE_OBJECT_TYPES = [
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

export const SUPPORT_SERVICE_TRANSACTION_STATUSES = [
  "received",
  "validating",
  "awaiting_input",
  "accepted",
  "queued",
  "running",
  "delivered",
  "rejected",
  "failed",
  "cancelled",
] as const;

export type SupportServiceStage = (typeof SUPPORT_SERVICE_STAGES)[number];
export type SupportServiceOfferStatus =
  (typeof SUPPORT_SERVICE_OFFER_STATUSES)[number];
export type SupportServiceTransactionStatus =
  (typeof SUPPORT_SERVICE_TRANSACTION_STATUSES)[number];
export type SupportServiceObjectType =
  (typeof SUPPORT_SERVICE_OBJECT_TYPES)[number];
export type SupportServiceProviderKind = "organization" | "individual";
export type SupportServicePricingModel =
  | "not_specified"
  | "free"
  | "fixed"
  | "calculated_after_submission";

type ListOptions = {
  cursor?: string;
  limit?: unknown;
  query?: string;
  status?: string;
};

type OfferListOptions = ListOptions & {
  stage?: string;
  serviceId?: string;
};

type TransactionListOptions = ListOptions & {
  serviceId?: string;
};

export interface SupportServiceOfferInput {
  serviceId?: string;
  serviceVersion?: number;
  name?: string;
  serviceCategory?: string;
  providerKind?: SupportServiceProviderKind;
  providerId?: string;
  providerName?: string;
  stages?: string[];
  status?: SupportServiceOfferStatus;
  isHiddenFromSearch?: boolean;
  description?: string;
  shortContract?: string;
  providerWork?: string;
  formShape?: Record<string, unknown>;
  inputSlots?: Record<string, unknown>[];
  outputSlots?: Record<string, unknown>[];
  acceptedConditions?: string[];
  scopeRules?: string[];
  commercialTerms?: Record<string, unknown>;
}

export interface SupportServiceOfferRecord {
  id: string;
  schemaVersion: number;
  serviceId: string;
  serviceVersion: number;
  name: string;
  serviceCategory: string;
  providerKind: SupportServiceProviderKind;
  providerId: string;
  providerName: string;
  stages: SupportServiceStage[];
  status: SupportServiceOfferStatus;
  isHiddenFromSearch: boolean;
  description: string;
  shortContract: string;
  providerWork: string;
  formShape?: Record<string, unknown>;
  inputSlots: Record<string, unknown>[];
  outputSlots: Record<string, unknown>[];
  acceptedConditions: string[];
  scopeRules: string[];
  commercialTerms?: Record<string, unknown>;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
  complianceWarnings: string[];
}

export interface SupportServiceTransactionsInputRef {
  objectId: string;
  revision: number;
}

export interface SupportServiceTransactionInputSlot {
  role: string;
  objectRef: SupportServiceTransactionsInputRef;
  objectType: SupportServiceObjectType;
  objectSnapshot: Record<string, unknown>;
  objectCode?: string;
  uploadedObjectId?: string;
  fileStorageId?: string;
  objectOwnerId?: string;
}

export interface SupportServiceTransactionOutputObjectSnapshot {
  role: string;
  objectType: SupportServiceObjectType;
  objectCode: string;
}

export interface SupportServiceTransactionOutputReportSnapshot {
  reportCode: string;
}

export type SupportServiceOutputObjectUploadInput =
  | {
      role: string;
      downloadUrl: string;
      fileStorageId?: never;
    }
  | {
      role: string;
      fileStorageId: string;
      downloadUrl?: never;
    };

type SupportServiceOutputObjectUploadRecordBase = {
  id: string;
  role: string;
  objectCode: string;
  objectType: SupportServiceObjectType;
  fileName: string;
  status: "ready";
};

export type SupportServiceOutputObjectUploadRecord =
  SupportServiceOutputObjectUploadRecordBase &
    (
      | { downloadUrl: string; fileStorageId?: never }
      | { fileStorageId: string; downloadUrl?: never }
    );

export interface SupportServiceTransactionInput {
  requestId?: string;
  offerId?: string;
  serviceId?: string;
  serviceVersion?: number;
  providerId?: string;
  providerKind?: SupportServiceProviderKind;
  status?: SupportServiceTransactionStatus;
  requestedByUserId?: string;
  requestedByUserEmail?: string;
  requestedAt?: string;
  requestedAtClient?: string;
  requestRevision?: number;
  idempotencyKey?: string;
  inputs?: SupportServiceTransactionInputSlot[];
  outputObjects?: SupportServiceTransactionOutputObjectSnapshot[];
  outputReports?: SupportServiceTransactionOutputReportSnapshot[];
  missingRequiredInputRoles?: string[];
  issues?: unknown[];
  offerSnapshot?: Record<string, unknown>;
  providerSnapshot?: Record<string, unknown>;
  contractSource?: string;
  attachmentsPending?: boolean;
}

export interface SupportServiceTransactionRecord {
  id: string;
  schemaVersion: number;
  requestId: string;
  offerId: string;
  serviceId: string;
  serviceVersion: number;
  providerId: string;
  providerKind: SupportServiceProviderKind;
  status: SupportServiceTransactionStatus;
  requestedByUserId: string;
  requestedByUserEmail?: string;
  requestedAt?: string;
  requestedAtClient?: string;
  requestRevision: number;
  idempotencyKey: string;
  inputs: SupportServiceTransactionInputSlot[];
  outputObjects: SupportServiceTransactionOutputObjectSnapshot[];
  outputReports: SupportServiceTransactionOutputReportSnapshot[];
  missingRequiredInputRoles: string[];
  issues: unknown[];
  offerSnapshot: Record<string, unknown>;
  providerSnapshot: Record<string, unknown>;
  contractSource: string;
  attachmentsPending: boolean;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
  complianceWarnings: string[];
}

export interface SupportServiceOffersPage {
  offers: SupportServiceOfferRecord[];
  nextCursor?: string;
}

export interface SupportServiceTransactionsPage {
  transactions: SupportServiceTransactionRecord[];
  nextCursor?: string;
}

const STAGE_SET = new Set<string>(SUPPORT_SERVICE_STAGES);
const OFFER_STATUS_SET = new Set<string>(SUPPORT_SERVICE_OFFER_STATUSES);
const TRANSACTION_STATUS_SET = new Set<string>(
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
);
const PROVIDER_KIND_SET = new Set<string>(["organization", "individual"]);
const PRICING_MODEL_SET = new Set<string>([
  "not_specified",
  "free",
  "fixed",
  "calculated_after_submission",
]);
const OBJECT_TYPE_SET = new Set<string>(SUPPORT_SERVICE_OBJECT_TYPES);
const FORM_FIELD_TYPE_SET = new Set([
  "text",
  "long_text",
  "email",
  "phone",
  "url",
  "address",
  "postal_code",
  "country_code",
  "identifier",
  "number",
  "integer",
  "positive_integer",
  "percentage",
  "boolean",
  "date",
  "datetime",
  "time",
  "enum",
  "multi_enum",
  "string_list",
  "integer_list",
  "number_list",
]);
const ISO_COUNTRY_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  ),
);
const PUBLISHED_OFFER_STATUSES = new Set<SupportServiceOfferStatus>([
  "active",
  "inactive",
  "archived",
]);
const TERMINAL_TRANSACTION_STATUSES = new Set<SupportServiceTransactionStatus>([
  "delivered",
  "rejected",
  "failed",
  "cancelled",
]);
const ALLOWED_TRANSACTION_STATUS_TRANSITIONS: Record<
  Exclude<
    SupportServiceTransactionStatus,
    "delivered" | "rejected" | "failed" | "cancelled"
  >,
  ReadonlySet<SupportServiceTransactionStatus>
> = {
  received: new Set([
    "validating",
    "awaiting_input",
    "accepted",
    "rejected",
    "failed",
    "cancelled",
  ]),
  validating: new Set([
    "awaiting_input",
    "accepted",
    "rejected",
    "failed",
    "cancelled",
  ]),
  awaiting_input: new Set([
    "validating",
    "accepted",
    "rejected",
    "failed",
    "cancelled",
  ]),
  accepted: new Set([
    "awaiting_input",
    "queued",
    "running",
    "rejected",
    "failed",
    "cancelled",
  ]),
  queued: new Set(["awaiting_input", "running", "failed", "cancelled"]),
  running: new Set(["awaiting_input", "delivered", "failed", "cancelled"]),
};
const ISSUE_REQUIRED_STATUSES = new Set<SupportServiceTransactionStatus>([
  "awaiting_input",
  "rejected",
  "failed",
  "cancelled",
]);
const FORM_OBJECT_TYPE = "pgo_form";
const FORBIDDEN_TRANSACTION_ROOT_KEYS = [
  "request_id",
  "offer_id",
  "service_id",
  "service_version",
  "provider_id",
  "provider_kind",
  "requested_by_user_id",
  "requested_by_user_email",
  "requested_at",
  "requested_at_client",
  "request_revision",
  "idempotency_key",
  "output_objects",
  "output_reports",
  "missing_required_input_roles",
  "offer_snapshot",
  "provider_snapshot",
  "contract_source",
  "attachments_pending",
] as const;
// Historical iOS requests wrote empty snake-case output arrays. They are not
// aliases: stored reads ignore them and default missing canonical arrays to [].
const FORBIDDEN_STORED_TRANSACTION_ROOT_KEYS =
  FORBIDDEN_TRANSACTION_ROOT_KEYS.filter(
    (key) => key !== "output_objects" && key !== "output_reports",
  );
const FORBIDDEN_OFFER_ROOT_KEYS = [
  "service_id",
  "service_version",
  "service_category",
  "provider_id",
  "provider_kind",
  "provider_name",
  "is_hidden_from_search",
  "short_contract",
  "provider_work",
  "form_shape",
  "input_slots",
  "output_slots",
  "accepted_conditions",
  "scope_rules",
  "commercial_terms",
] as const;

type DocumentReader = (
  reference: DocumentReference,
) => Promise<DocumentSnapshot>;

function rejectForbiddenKeys(
  record: Record<string, unknown>,
  forbiddenKeys: readonly string[],
  context: string,
  namingStyle = "snake-case",
) {
  const found = forbiddenKeys.filter((key) =>
    Object.prototype.hasOwnProperty.call(record, key),
  );
  if (found.length > 0) {
    throw new AdminRepositoryError(
      `${context} uses forbidden ${namingStyle} field${found.length === 1 ? "" : "s"}: ${found.join(", ")}.`,
      400,
    );
  }
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new AdminRepositoryError(
      `${context} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`,
      400,
    );
  }
}

function requireGodMode(context: AdminContext) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE);
}

function timestampToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
  }

  return undefined;
}

function dateFromUnknown(
  value: unknown,
  label: string,
  required = false,
): Date | undefined {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (required || (value !== undefined && value !== null && value !== "")) {
    throw new AdminRepositoryError(`${label} must be a valid date-time.`, 400);
  }
  return undefined;
}

type ServiceListCursor = {
  id: string;
};

function parseListCursor(cursor?: string): ServiceListCursor | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const value = optionalRecord(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    const id = cleanString(value.id);
    if (!id || id.includes("/")) {
      throw new Error("invalid cursor");
    }
    return { id };
  } catch (error) {
    if (error instanceof AdminRepositoryError) {
      throw error;
    }
    throw new AdminRepositoryError("Invalid service list cursor.", 400);
  }
}

function serviceListCursor(doc: QueryDocumentSnapshot) {
  return Buffer.from(JSON.stringify({ id: doc.id }), "utf8").toString(
    "base64url",
  );
}

function withoutUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new AdminRepositoryError(`${label} must be an object.`, 400);
}

function booleanValue(value: unknown, allowLegacyMissing = false) {
  if (allowLegacyMissing && (value === undefined || value === null)) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new AdminRepositoryError("isHiddenFromSearch must be a boolean.", 400);
  }
  return value;
}

function strictBoolean(value: unknown, label: string, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new AdminRepositoryError(`${label} must be a boolean.`, 400);
  }
  return value;
}

function optionalRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanString).filter((item) => item.length > 0)
    : [];
}

function unknownArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function hasMeaningfulIssueContent(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulIssueContent);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      hasMeaningfulIssueContent,
    );
  }
  return false;
}

function assertTransactionStatusTransition(
  previousStatus: SupportServiceTransactionStatus,
  document: SupportServiceTransactionDocument,
) {
  if (
    ISSUE_REQUIRED_STATUSES.has(document.status) &&
    !document.issues.some(hasMeaningfulIssueContent)
  ) {
    throw new AdminRepositoryError(
      `Status ${document.status} requires at least one nonempty issue or reason.`,
      400,
    );
  }
  if (document.status === previousStatus) {
    return;
  }
  if (TERMINAL_TRANSACTION_STATUSES.has(previousStatus)) {
    throw new AdminRepositoryError(
      `Terminal service transaction status ${previousStatus} cannot transition to ${document.status}.`,
      409,
    );
  }
  const allowed = ALLOWED_TRANSACTION_STATUS_TRANSITIONS[
    previousStatus as keyof typeof ALLOWED_TRANSACTION_STATUS_TRANSITIONS
  ];
  if (!allowed?.has(document.status)) {
    throw new AdminRepositoryError(
      `Invalid service transaction status transition: ${previousStatus} -> ${document.status}.`,
      409,
    );
  }
}

function numericValue(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function versionNumber(value: unknown, fallback = 1) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  const text = cleanString(value);
  const match = text.match(/^([1-9]\d*)(?:\.0\.0)?$/);
  return match ? Number(match[1]) : fallback;
}

function stringValueArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanString).filter((item) => item.length > 0)
    : [];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) {
        result[key] = stableValue(item);
      }
      return result;
    }, {});
}

function stableString(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function comparableOutputObjects(value: readonly unknown[]) {
  return value
    .map((item) => {
      const record = optionalRecord(item);
      return {
        role: cleanString(record.role),
        objectType: cleanString(record.objectType),
        objectCode: cleanString(record.objectCode),
      };
    })
    .sort(
      (left, right) =>
        left.role.localeCompare(right.role) ||
        left.objectType.localeCompare(right.objectType) ||
        left.objectCode.localeCompare(right.objectCode),
    );
}

function normalizeFormShape(value: unknown) {
  const formShape = optionalRecord(value);
  const id = cleanString(formShape.id);

  if (!id && Object.keys(formShape).length === 0) {
    return undefined;
  }

  rejectForbiddenKeys(
    formShape,
    ["allow_unknown_fields"],
    "Service form shape",
  );
  if (!Array.isArray(formShape.fields)) {
    throw new AdminRepositoryError("Form shape fields must be an array.", 400);
  }
  const fields = (formShape.fields as unknown[]).map((value, index) => {
    const field = requireRecord(value, `Form shape field ${index + 1}`);
    rejectForbiddenKeys(
      field,
      ["help_info_text"],
      "Service form field",
    );
    if (typeof field.required !== "boolean") {
      throw new AdminRepositoryError(
        `Form field ${cleanString(field.key) || "(unknown)"} required must be a boolean.`,
        400,
      );
    }
    const type = cleanString(field.type);
    if (!FORM_FIELD_TYPE_SET.has(type)) {
      throw new AdminRepositoryError(
        `Form field ${cleanString(field.key) || "(unknown)"} has an unsupported type.`,
        400,
      );
    }
    const helpInfoText = cleanString(field.helpInfoText);
    if (
      field.helpInfoText != null &&
      (!helpInfoText || helpInfoText.length > 500)
    ) {
      throw new AdminRepositoryError(
        `Form field ${cleanString(field.key) || "(unknown)"} help info must contain 1 to 500 characters.`,
        400,
      );
    }
    const typeUsesOptions = type === "enum" || type === "multi_enum";
    const hasOptions = Object.prototype.hasOwnProperty.call(field, "options");
    if (hasOptions && !Array.isArray(field.options)) {
      throw new AdminRepositoryError(
        `Form field ${cleanString(field.key) || "(unknown)"} options must be an array.`,
        400,
      );
    }
    const options = hasOptions
      ? (field.options as unknown[]).map((value, optionIndex) => {
          const option = requireRecord(
            value,
            `Form field ${cleanString(field.key) || "(unknown)"} option ${optionIndex + 1}`,
          );
          return {
            value: cleanString(option.value),
            label: cleanString(option.label),
          };
        })
      : undefined;
    return withoutUndefined({
      key: cleanString(field.key),
      label: cleanString(field.label),
      type,
      required: field.required,
      ...(typeUsesOptions || hasOptions ? { options } : {}),
      helpInfoText: helpInfoText || undefined,
    });
  });
  if (typeof formShape.allowUnknownFields !== "boolean") {
    throw new AdminRepositoryError(
      "allowUnknownFields must be a boolean.",
      400,
    );
  }
  if (!Number.isInteger(formShape.version) || Number(formShape.version) < 1) {
    throw new AdminRepositoryError(
      "Form shape version must be a positive integer.",
      400,
    );
  }

  return {
    id,
    version: Number(formShape.version),
    allowUnknownFields: formShape.allowUnknownFields as boolean,
    fields,
  };
}

function normalizeOfferInputSlots(value: unknown) {
  return optionalRecordArray(value).map((slot) => {
    rejectForbiddenKeys(
      slot,
      ["object_type", "accepted_types"],
      "Service offer input slot",
    );
    const acceptedTypes = stringValueArray(slot.acceptedTypes);
    const objectType =
      cleanString(slot.objectType) || acceptedTypes[0] || "";
    return {
      role: cleanString(slot.role),
      objectType,
      acceptedTypes: objectType ? [objectType] : [],
      required: true,
      cardinality: { min: 1, max: 1 },
    };
  });
}

function normalizeOfferOutputSlots(value: unknown) {
  return optionalRecordArray(value).map((slot) => {
    rejectForbiddenKeys(
      slot,
      ["object_type", "mutation_mode", "same_identity_as_input"],
      "Service offer output slot",
    );
    const sameIdentityAsInput = cleanString(slot.sameIdentityAsInput);
    return {
      role: cleanString(slot.role),
      objectType: cleanString(slot.objectType),
      mutationMode:
        cleanString(slot.mutationMode) === "new_revision"
          ? "new_revision"
          : "new_object",
      ...(sameIdentityAsInput ? { sameIdentityAsInput } : {}),
    };
  });
}

function normalizeProviderKind(
  value: unknown,
  rejectUnsupported = false,
): SupportServiceProviderKind {
  const normalized = normalizeKey(cleanString(value));
  if (PROVIDER_KIND_SET.has(normalized)) {
    return normalized as SupportServiceProviderKind;
  }
  if (rejectUnsupported) {
    throw new AdminRepositoryError("Provider kind must be organization or individual.", 400);
  }
  return "organization";
}

function contractObjectTypeLabel(value: string) {
  return value.replace(/^pgo_/, "");
}

function inputRoleForObjectType(objectType: string) {
  return objectType === FORM_OBJECT_TYPE
    ? "form"
    : objectType.replace(/^pgo_/, "") || "input";
}

function supportServiceShortContract({
  inputSlots,
  outputSlots,
}: {
  inputSlots: ReturnType<typeof normalizeOfferInputSlots>;
  outputSlots: ReturnType<typeof normalizeOfferOutputSlots>;
}) {
  const inputs = inputSlots.map((slot) => {
    const objectType = slot.objectType || slot.acceptedTypes[0] || "object";
    return `${slot.role}:${contractObjectTypeLabel(objectType)}`;
  });
  const outputs = outputSlots.map((slot) => {
    const objectType = slot.objectType || "object";
    return `${slot.role}:${contractObjectTypeLabel(objectType)}`;
  });
  const left = inputs.length ? inputs.join(" + ") : "none";
  const right = outputs.length ? outputs.join(" + ") : "none";

  return `${left} -> ${right}`;
}

function normalizeCommercialTerms(value: unknown) {
  const terms = optionalRecord(value);
  rejectForbiddenKeys(
    terms,
    ["pricing_model"],
    "Service commercial terms",
  );
  const price = optionalRecord(terms.price);
  const rawPricingModel = normalizeKey(
    cleanString(terms.pricingModel),
  );
  const hasPrice = Object.keys(price).length > 0;
  const priceSummary = cleanString(price.summary);
  const pricingModel = PRICING_MODEL_SET.has(rawPricingModel)
    ? (rawPricingModel as SupportServicePricingModel)
    : priceSummary
      ? "calculated_after_submission"
    : hasPrice
      ? numericValue(price.amount, 0) === 0
        ? "free"
        : "fixed"
      : "not_specified";
  const turnaround = cleanString(terms.turnaround);

  if (pricingModel === "not_specified" && !turnaround && !priceSummary) {
    return undefined;
  }

  if (pricingModel === "fixed") {
    return withoutUndefined({
      pricingModel,
      price: withoutUndefined({
        amount: numericValue(price.amount, 0),
        currency: cleanString(price.currency).toUpperCase() || "ARS",
        summary: priceSummary || undefined,
      }),
      turnaround: turnaround || undefined,
    });
  }

  return withoutUndefined({
    pricingModel,
    price: priceSummary ? { summary: priceSummary } : undefined,
    turnaround: turnaround || undefined,
  });
}

function normalizeStage(value: unknown): SupportServiceStage | null {
  const normalized = normalizeKey(cleanString(value));
  return STAGE_SET.has(normalized)
    ? (normalized as SupportServiceStage)
    : null;
}

function normalizeStages(value: unknown): SupportServiceStage[] {
  const seen = new Set<SupportServiceStage>();
  const rawStages = Array.isArray(value) ? value : [value];

  for (const item of rawStages) {
    const stage = normalizeStage(item);
    if (stage) {
      seen.add(stage);
    }
  }

  return seen.size > 0 ? [...seen] : ["test_planning"];
}

function normalizeOfferStatus(
  value: unknown,
  rejectUnsupported = false,
): SupportServiceOfferStatus {
  const normalized = normalizeKey(cleanString(value));
  if (!normalized) {
    return "draft";
  }
  if (OFFER_STATUS_SET.has(normalized)) {
    return normalized as SupportServiceOfferStatus;
  }
  if (rejectUnsupported) {
    throw new AdminRepositoryError(
      `Unsupported service offer status: ${cleanString(value)}.`,
      400,
    );
  }
  return "draft";
}

function normalizeTransactionStatus(
  value: unknown,
  rejectUnsupported = false,
): SupportServiceTransactionStatus {
  const normalized = normalizeKey(cleanString(value));
  if (!normalized) {
    return "received";
  }
  if (TRANSACTION_STATUS_SET.has(normalized)) {
    return normalized as SupportServiceTransactionStatus;
  }
  if (rejectUnsupported) {
    throw new AdminRepositoryError(
      `Unsupported service transaction status: ${cleanString(value)}.`,
      400,
    );
  }
  return "received";
}

function objectRefFromUnknown(
  value: unknown,
  rejectMalformed = false,
): SupportServiceTransactionsInputRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (rejectMalformed) {
      throw new AdminRepositoryError("Transaction objectRef must be an object.", 400);
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  rejectForbiddenKeys(record, ["object_id"], "Transaction objectRef");
  const objectId = cleanString(record.objectId);
  const rawRevision = record.revision;
  const parsedRevision =
    typeof rawRevision === "number"
      ? rawRevision
      : typeof rawRevision === "string"
        ? Number(rawRevision)
        : NaN;

  if (
    !/^obj_[a-z0-9_]+$/.test(objectId) ||
    !Number.isInteger(parsedRevision) ||
    parsedRevision < 1
  ) {
    if (rejectMalformed) {
      throw new AdminRepositoryError(
        "Transaction objectRef requires an obj_* objectId and a positive integer revision.",
        400,
      );
    }
    return null;
  }

  return {
    objectId,
    revision: parsedRevision,
  };
}

function inputSlotsFromUnknown(
  value: unknown,
  rejectMalformed = false,
): SupportServiceTransactionInputSlot[] {
  if (!Array.isArray(value)) {
    if (rejectMalformed && value !== undefined) {
      throw new AdminRepositoryError("Transaction inputs must be an array.", 400);
    }
    return [];
  }

  const slots: SupportServiceTransactionInputSlot[] = [];
  value.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        if (rejectMalformed) {
          throw new AdminRepositoryError(
            `Transaction input ${index + 1} must be an object.`,
            400,
          );
        }
        return;
      }

      const record = item as Record<string, unknown>;
      rejectForbiddenKeys(
        record,
        [
          "object_ref",
          "object_type",
          "object_snapshot",
          "object_code",
          "uploaded_object_id",
          "file_storage_id",
          "object_owner_id",
        ],
        `Transaction input ${index + 1}`,
      );
      const role = cleanString(record.role);
      const objectRef = objectRefFromUnknown(record.objectRef, rejectMalformed);
      const objectType = cleanString(record.objectType);
      const rawSnapshot = record.objectSnapshot;
      const objectSnapshot =
        rawSnapshot && typeof rawSnapshot === "object" && !Array.isArray(rawSnapshot)
          ? (rawSnapshot as Record<string, unknown>)
          : {};

      if (!role || !objectRef || !objectType || !OBJECT_TYPE_SET.has(objectType)) {
        if (rejectMalformed) {
          throw new AdminRepositoryError(
            `Transaction input ${index + 1} requires role, objectRef, and a canonical objectType.`,
            400,
          );
        }
        if (!role || !objectRef) {
          return;
        }
      }
      if (rejectMalformed && Object.keys(objectSnapshot).length === 0) {
        throw new AdminRepositoryError(
          `Transaction input ${index + 1} requires an authoritative objectSnapshot.`,
          400,
        );
      }

      slots.push(withoutUndefined({
        role,
        objectRef,
        objectType: objectType as SupportServiceObjectType,
        objectSnapshot,
        objectCode: cleanString(record.objectCode) || undefined,
        uploadedObjectId: cleanString(record.uploadedObjectId) || undefined,
        fileStorageId: cleanString(record.fileStorageId) || undefined,
        objectOwnerId: cleanString(record.objectOwnerId) || undefined,
      }));
    });
  return slots;
}

function outputObjectsFromUnknown(
  value: unknown,
): SupportServiceTransactionOutputObjectSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AdminRepositoryError(
        `Output object snapshot ${index + 1} must be an object.`,
        400,
      );
    }

    const record = item as Record<string, unknown>;
    rejectForbiddenKeys(
      record,
      ["object_type", "object_code"],
      `Output object snapshot ${index + 1}`,
    );
    const role = cleanString(record.role);
    const objectType = cleanString(record.objectType);
    const objectCode = cleanString(record.objectCode);
    if (
      !role ||
      !objectType ||
      !OBJECT_TYPE_SET.has(objectType) ||
      !objectCode
    ) {
      throw new AdminRepositoryError(
        `Output object snapshot ${index + 1} requires role, object type, and object code.`,
        400,
      );
    }

    return {
      role,
      objectType: objectType as SupportServiceObjectType,
      objectCode,
    };
  });
}

function outputReportsFromUnknown(
  value: unknown,
): SupportServiceTransactionOutputReportSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AdminRepositoryError(
        `Output report snapshot ${index + 1} must be an object.`,
        400,
      );
    }

    const record = item as Record<string, unknown>;
    rejectForbiddenKeys(
      record,
      ["report_code"],
      `Output report snapshot ${index + 1}`,
    );
    const reportCode = cleanString(record.reportCode);
    if (!reportCode) {
      throw new AdminRepositoryError(
        `Output report snapshot ${index + 1} requires a report code.`,
        400,
      );
    }
    return { reportCode };
  });
}

function offerDocument(input: SupportServiceOfferInput) {
  rejectForbiddenKeys(
    input as Record<string, unknown>,
    ["is_hidden_from_search"],
    "Service offer",
  );
  const name = cleanString(input.name);
  const serviceId = cleanString(input.serviceId);
  const providerId = cleanString(input.providerId);
  const providerName = cleanString(input.providerName);
  const serviceVersion = versionNumber(input.serviceVersion);
  const stages = normalizeStages(input.stages);
  const inputSlots = normalizeOfferInputSlots(input.inputSlots);
  const outputSlots = normalizeOfferOutputSlots(input.outputSlots);
  const serviceCategory = cleanString(input.serviceCategory);

  return {
    schemaVersion: 1,
    serviceId,
    serviceVersion,
    name,
    serviceCategory,
    providerKind: normalizeProviderKind(input.providerKind, true),
    providerId,
    providerName,
    stages,
    status: normalizeOfferStatus(input.status),
    isHiddenFromSearch: booleanValue(input.isHiddenFromSearch),
    description: cleanString(input.description),
    shortContract: supportServiceShortContract({ inputSlots, outputSlots }),
    providerWork: cleanString(input.providerWork),
    formShape: normalizeFormShape(input.formShape),
    inputSlots,
    outputSlots,
    acceptedConditions: cleanStringArray(input.acceptedConditions),
    scopeRules: cleanStringArray(input.scopeRules),
    commercialTerms: normalizeCommercialTerms(input.commercialTerms),
    normalizedName: normalizeName(
      `${name} ${serviceId} ${serviceCategory} ${providerId} ${providerName}`,
    ),
  };
}

function transactionDocument(input: SupportServiceTransactionInput) {
  rejectForbiddenKeys(
    input as unknown as Record<string, unknown>,
    FORBIDDEN_TRANSACTION_ROOT_KEYS,
    "Service transaction",
  );
  const requestId = cleanString(input.requestId);
  const offerId = cleanString(input.offerId);
  const serviceId = cleanString(input.serviceId);
  const providerId = cleanString(input.providerId);
  const requestedByUserId = cleanString(input.requestedByUserId);
  const requestedByUserEmail = cleanString(
    input.requestedByUserEmail,
  ).toLowerCase();
  const requestedAt = dateFromUnknown(input.requestedAt, "requestedAt");
  const requestedAtClient = dateFromUnknown(
    input.requestedAtClient,
    "requestedAtClient",
    true,
  );
  const requestRevision = Number(input.requestRevision ?? 1);
  if (!Number.isInteger(requestRevision) || requestRevision < 1) {
    throw new AdminRepositoryError(
      "requestRevision must be a positive integer.",
      400,
    );
  }

  return withoutUndefined({
    schemaVersion: 1,
    requestId,
    offerId,
    serviceId,
    serviceVersion: versionNumber(input.serviceVersion),
    providerId,
    providerKind: normalizeProviderKind(input.providerKind, true),
    status: normalizeTransactionStatus(input.status, true),
    requestedByUserId,
    requestedByUserEmail: requestedByUserEmail || undefined,
    requestedAt,
    requestedAtClient,
    requestRevision,
    idempotencyKey: cleanString(input.idempotencyKey),
    inputs: inputSlotsFromUnknown(input.inputs, true),
    outputObjects: outputObjectsFromUnknown(input.outputObjects),
    outputReports: outputReportsFromUnknown(input.outputReports),
    missingRequiredInputRoles: cleanStringArray(input.missingRequiredInputRoles),
    issues: unknownArray(input.issues),
    offerSnapshot: requireRecord(input.offerSnapshot, "offerSnapshot"),
    providerSnapshot: requireRecord(input.providerSnapshot, "providerSnapshot"),
    contractSource: cleanString(input.contractSource),
    attachmentsPending: strictBoolean(
      input.attachmentsPending,
      "attachmentsPending",
    ),
    normalizedName: normalizeName(
      `${requestId} ${serviceId} ${requestedByUserId} ${requestedByUserEmail}`,
    ),
  });
}

type SupportServiceOfferDocument = ReturnType<typeof offerDocument>;

function comparableFormShape(formShape: SupportServiceOfferDocument["formShape"]) {
  if (!formShape) {
    return null;
  }

  const { version: _version, ...shape } = formShape;
  return shape;
}

function comparableOfferDefinition(document: SupportServiceOfferDocument) {
  const {
    serviceVersion: _serviceVersion,
    status: _status,
    isHiddenFromSearch: _isHiddenFromSearch,
    normalizedName: _normalizedName,
    formShape,
    ...definition
  } = document;

  return {
    ...definition,
    formShape: comparableFormShape(formShape),
  };
}

function applyOfferVersions(
  document: SupportServiceOfferDocument,
  previousDocument?: SupportServiceOfferDocument,
) {
  if (!previousDocument) {
    return {
      ...document,
      serviceVersion: 1,
      formShape: document.formShape
        ? { ...document.formShape, version: 1 }
        : undefined,
    };
  }

  const previousWasPublished = PUBLISHED_OFFER_STATUSES.has(
    previousDocument.status,
  );
  const serviceChanged =
    stableString(comparableOfferDefinition(document)) !==
    stableString(comparableOfferDefinition(previousDocument));
  const formShapeChanged =
    stableString(comparableFormShape(document.formShape)) !==
    stableString(comparableFormShape(previousDocument.formShape));

  return {
    ...document,
    serviceVersion:
      previousWasPublished && serviceChanged
        ? previousDocument.serviceVersion + 1
        : previousDocument.serviceVersion,
    formShape: document.formShape
      ? {
          ...document.formShape,
          version:
            previousWasPublished &&
            previousDocument.formShape &&
            formShapeChanged
              ? previousDocument.formShape.version + 1
              : previousDocument.formShape
                ? previousDocument.formShape.version
                : 1,
        }
      : undefined,
  };
}

type SupportServiceTransactionDocument = ReturnType<typeof transactionDocument>;

function applyTransactionOfferContract(
  document: SupportServiceTransactionDocument,
  offer: SupportServiceOfferRecord,
  providerSnapshot: Record<string, unknown>,
): SupportServiceTransactionDocument {
  const suppliedInputRoles = new Set(document.inputs.map((slot) => slot.role));
  const missingRequiredInputRoles = offer.inputSlots
    .filter((slot) => Boolean(slot.required))
    .map((slot) => cleanString(slot.role))
    .filter((role) => role && !suppliedInputRoles.has(role));

  return {
    ...document,
    offerId: offer.id,
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    providerId: offer.providerId,
    providerKind: offer.providerKind,
    missingRequiredInputRoles,
    offerSnapshot: offerSnapshotForTransaction(offer),
    providerSnapshot,
    attachmentsPending: missingRequiredInputRoles.length > 0,
  };
}

function offerSnapshotForTransaction(
  offer: SupportServiceOfferRecord,
): Record<string, unknown> {
  return withoutUndefined({
    offerId: offer.id,
    schemaVersion: offer.schemaVersion,
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    name: offer.name,
    serviceCategory: offer.serviceCategory || undefined,
    providerId: offer.providerId,
    providerKind: offer.providerKind,
    providerName: offer.providerName,
    status: offer.status,
    isHiddenFromSearch: offer.isHiddenFromSearch,
    description: offer.description,
    shortContract: offer.shortContract,
    providerWork: offer.providerWork,
    stages: offer.stages,
    formShape: offer.formShape,
    inputSlots: offer.inputSlots,
    outputSlots: offer.outputSlots,
    acceptedConditions: offer.acceptedConditions,
    scopeRules: offer.scopeRules,
    commercialTerms: offer.commercialTerms,
  });
}

function providerSnapshotForTransaction(
  offer: SupportServiceOfferRecord,
  providerData: Record<string, unknown>,
): Record<string, unknown> {
  const name =
    cleanString(providerData.name) ||
    cleanString(providerData.title) ||
    offer.providerName;
  return withoutUndefined({
    id: offer.providerId,
    kind: offer.providerKind,
    name,
    imageUrl: cleanString(providerData.imageUrl) || undefined,
    imageUploadDataUrl:
      cleanString(providerData.imageUploadDataUrl) || undefined,
  });
}

function providerOwnerCommunityUserId(
  offer: SupportServiceOfferRecord,
  providerData: Record<string, unknown>,
) {
  return (
    cleanString(providerData.ownerCommunityUserId) ||
    cleanString(providerData.communityUserId) ||
    cleanString(providerData.firebaseUid) ||
    cleanString(providerData.updatedByUserId) ||
    cleanString(providerData.createdByUserId) ||
    offer.providerId
  );
}

function assertActiveProviderData(providerData: Record<string, unknown>) {
  if (normalizeKey(cleanString(providerData.status)) !== "active") {
    throw new AdminRepositoryError(
      "Selected Discover provider must be active.",
      400,
    );
  }
}

async function resolveAuthoritativeProviderOwner(
  offer: SupportServiceOfferRecord,
  providerData: Record<string, unknown>,
  readDocument: DocumentReader,
  requireActive = true,
) {
  if (requireActive) {
    assertActiveProviderData(providerData);
  }
  const ownerCommunityUserId = providerOwnerCommunityUserId(
    offer,
    providerData,
  );
  const ownerRef = adminDb
    .collection(OBJECT_OWNERS_COLLECTION)
    .doc(ownerCommunityUserId);
  const communityUserRef = adminDb
    .collection(COMMUNITY_USERS_COLLECTION)
    .doc(ownerCommunityUserId);
  const [ownerSnapshot, communityUserSnapshot] = await Promise.all([
    readDocument(ownerRef),
    readDocument(communityUserRef),
  ]);
  if (!ownerSnapshot.exists || !communityUserSnapshot.exists) {
    throw new AdminRepositoryError(
      "Selected service provider has no authoritative object owner account.",
      400,
    );
  }
  if (requireActive) {
    for (const [data, label] of [
      [ownerSnapshot.data() ?? {}, "object owner"],
      [communityUserSnapshot.data() ?? {}, "provider community user"],
    ] as const) {
      const status = normalizeKey(cleanString(data.status));
      if (status && !["active", "approved"].includes(status)) {
        throw new AdminRepositoryError(
          `Selected service provider ${label} must be active.`,
          400,
        );
      }
    }
  }
  return ownerCommunityUserId;
}

function offerFromFrozenTransaction(
  transaction: SupportServiceTransactionRecord,
): SupportServiceOfferRecord {
  const snapshot = transaction.offerSnapshot;
  const snapshotOfferId = cleanString(snapshot.offerId);
  if (!snapshotOfferId || snapshotOfferId !== transaction.offerId) {
    throw new AdminRepositoryError(
      "Stored offerSnapshot does not match the transaction offerId.",
      400,
    );
  }
  if (
    !Number.isInteger(snapshot.schemaVersion) ||
    Number(snapshot.schemaVersion) < 1 ||
    !Number.isInteger(snapshot.serviceVersion) ||
    Number(snapshot.serviceVersion) < 1 ||
    snapshot.status !== "active" ||
    (snapshot.isHiddenFromSearch !== undefined &&
      typeof snapshot.isHiddenFromSearch !== "boolean") ||
    !PROVIDER_KIND_SET.has(cleanString(snapshot.providerKind)) ||
    !cleanString(snapshot.serviceId) ||
    !cleanString(snapshot.providerId) ||
    !cleanString(snapshot.name) ||
    !cleanString(snapshot.providerName) ||
    !cleanString(snapshot.description) ||
    !cleanString(snapshot.providerWork) ||
    !cleanString(snapshot.shortContract) ||
    !Array.isArray(snapshot.stages) ||
    snapshot.stages.length === 0 ||
    !Array.isArray(snapshot.outputSlots)
  ) {
    throw new AdminRepositoryError(
      "Stored offerSnapshot is not a complete frozen service contract.",
      400,
    );
  }
  const offer = toOfferRecord(snapshotOfferId, snapshot);
  if (
    offer.serviceId !== transaction.serviceId ||
    offer.serviceVersion !== transaction.serviceVersion ||
    offer.providerId !== transaction.providerId ||
    offer.providerKind !== transaction.providerKind
  ) {
    throw new AdminRepositoryError(
      "Stored offerSnapshot identity does not match the frozen transaction contract.",
      400,
    );
  }
  validateOfferDocument(offerDocument(offer));
  if (cleanString(snapshot.shortContract) !== offer.shortContract) {
    throw new AdminRepositoryError(
      "Stored offerSnapshot shortContract does not match its frozen slots.",
      400,
    );
  }
  return offer;
}

function validateOfferDocument(document: ReturnType<typeof offerDocument>) {
  if (!document.name) {
    throw new AdminRepositoryError("Service offer name is required.", 400);
  }
  if (!document.description) {
    throw new AdminRepositoryError("Service offer description is required.", 400);
  }
  if (!document.shortContract) {
    throw new AdminRepositoryError("Service offer contract is required.", 400);
  }
  if (!document.providerWork) {
    throw new AdminRepositoryError("Provider work is required.", 400);
  }
  if (!/^pgs_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]+$/.test(document.serviceId)) {
    throw new AdminRepositoryError(
      "Service ID must use the generated pgs_<provider_slug>_<n> convention.",
      400,
    );
  }
  if (!PROVIDER_KIND_SET.has(document.providerKind)) {
    throw new AdminRepositoryError("Provider kind is required.", 400);
  }
  if (!document.providerId) {
    throw new AdminRepositoryError(
      "Provider ID is required and must reference a Discover publisher.",
      400,
    );
  }
  if (!document.providerName) {
    throw new AdminRepositoryError("Provider name is required.", 400);
  }
  const formInputSlotCount = document.inputSlots.filter(
    (slot) => slot.objectType === FORM_OBJECT_TYPE,
  ).length;
  if (document.formShape) {
    const expectedFormShapeId = `pgfs_${document.serviceId.slice(4)}`;
    if (cleanString(document.formShape.id) !== expectedFormShapeId) {
      throw new AdminRepositoryError(
        `Form shape ID must be ${expectedFormShapeId}.`,
        400,
      );
    }
    if (document.formShape.allowUnknownFields) {
      throw new AdminRepositoryError(
        "Support service form shapes must reject unknown fields.",
        400,
      );
    }
    if (formInputSlotCount !== 1) {
      throw new AdminRepositoryError(
        "A form shape requires exactly one pgo_form input slot.",
        400,
      );
    }
    const fieldKeys = new Set<string>();
    for (const field of document.formShape.fields) {
      const key = cleanString(field.key);
      const label = cleanString(field.label);
      const type = cleanString(field.type);
      const hasOptions = Object.prototype.hasOwnProperty.call(field, "options");
      const options = hasOptions ? optionalRecordArray(field.options) : [];
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
        throw new AdminRepositoryError(
          "Form field keys must be lowercase identifier keys.",
          400,
        );
      }
      if (fieldKeys.has(key)) {
        throw new AdminRepositoryError(
          `Duplicate form field key: ${key}.`,
          400,
        );
      }
      fieldKeys.add(key);
      if (!label) {
        throw new AdminRepositoryError(
          `Form field ${key} needs a label.`,
          400,
        );
      }
      if (label.length > 120) {
        throw new AdminRepositoryError(
          `Form field ${key} label cannot exceed 120 characters.`,
          400,
        );
      }
      const helpInfoText = cleanString(field.helpInfoText);
      if (
        field.helpInfoText != null &&
        (!helpInfoText || helpInfoText.length > 500)
      ) {
        throw new AdminRepositoryError(
          `Form field ${key} help info must contain 1 to 500 characters.`,
          400,
        );
      }
      if (["enum", "multi_enum"].includes(type) && options.length === 0) {
        throw new AdminRepositoryError(
          `Form field ${key} needs enum options.`,
          400,
        );
      }
      if (!["enum", "multi_enum"].includes(type) && hasOptions) {
        throw new AdminRepositoryError(
          `Form field ${key} cannot declare options for type ${type}.`,
          400,
        );
      }
      const optionValues = options.map((option) => cleanString(option.value));
      if (options.length > 100) {
        throw new AdminRepositoryError(
          `Form field ${key} cannot declare more than 100 options.`,
          400,
        );
      }
      for (const option of options) {
        const value = cleanString(option.value);
        const optionLabel = cleanString(option.label);
        if (!value) {
          throw new AdminRepositoryError(
            `Form field ${key} option values must be nonblank.`,
            400,
          );
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
          throw new AdminRepositoryError(
            `Form field ${key} option values must use the canonical 1-to-128 character identifier format.`,
            400,
          );
        }
        if (!optionLabel) {
          throw new AdminRepositoryError(
            `Form field ${key} option labels must be nonblank.`,
            400,
          );
        }
        if (optionLabel.length > 120) {
          throw new AdminRepositoryError(
            `Form field ${key} option labels cannot exceed 120 characters.`,
            400,
          );
        }
      }
      if (new Set(optionValues).size !== optionValues.length) {
        throw new AdminRepositoryError(
          `Form field ${key} has duplicate option values.`,
          400,
        );
      }
    }
  } else if (formInputSlotCount > 0) {
    throw new AdminRepositoryError(
      "A pgo_form input slot requires a form shape.",
      400,
    );
  }

  const seenInputTypes = new Set<string>();
  const inputRoles = new Set<string>();
  const inputSlotByRole = new Map<string, (typeof document.inputSlots)[number]>();
  for (const slot of document.inputSlots) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.role)) {
      throw new AdminRepositoryError(
        "Input slot roles must be lowercase identifier keys.",
        400,
      );
    }
    if (!OBJECT_TYPE_SET.has(slot.objectType)) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} needs a registered Pocket Genes object type.`,
        400,
      );
    }
    if (slot.role !== inputRoleForObjectType(slot.objectType)) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} must use the generated role for ${slot.objectType}.`,
        400,
      );
    }
    if (inputRoles.has(slot.role)) {
      throw new AdminRepositoryError(
        `Duplicate input slot role: ${slot.role}.`,
        400,
      );
    }
    if (slot.acceptedTypes.length !== 1) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} must accept exactly one object type.`,
        400,
      );
    }
    if (slot.acceptedTypes[0] !== slot.objectType) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} acceptedTypes must match its object type.`,
        400,
      );
    }
    if (!slot.required || slot.cardinality.min !== 1 || slot.cardinality.max !== 1) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} must be required with 1:1 cardinality.`,
        400,
      );
    }
    if (seenInputTypes.has(slot.objectType)) {
      throw new AdminRepositoryError(
        `Duplicate input object type: ${slot.objectType}.`,
        400,
      );
    }
    seenInputTypes.add(slot.objectType);
    inputRoles.add(slot.role);
    inputSlotByRole.set(slot.role, slot);
  }

  const outputRoles = new Set<string>();
  for (const slot of document.outputSlots) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.role)) {
      throw new AdminRepositoryError(
        "Output slot roles must be lowercase identifier keys.",
        400,
      );
    }
    if (outputRoles.has(slot.role)) {
      throw new AdminRepositoryError(
        `Duplicate output slot role: ${slot.role}.`,
        400,
      );
    }
    outputRoles.add(slot.role);
    if (slot.mutationMode === "new_revision") {
      if (!slot.sameIdentityAsInput) {
        throw new AdminRepositoryError(
          `Output slot ${slot.role} must point to sameIdentityAsInput.`,
          400,
        );
      }
      if (!inputRoles.has(slot.sameIdentityAsInput)) {
        throw new AdminRepositoryError(
          `Output slot ${slot.role} references an unknown input role.`,
          400,
        );
      }
      if (inputSlotByRole.get(slot.sameIdentityAsInput)?.objectType === FORM_OBJECT_TYPE) {
        throw new AdminRepositoryError(
          `Output slot ${slot.role} cannot revise the request form input.`,
          400,
        );
      }
      if (slot.objectType !== `same_as:${slot.sameIdentityAsInput}`) {
        throw new AdminRepositoryError(
          `Output slot ${slot.role} must use same_as:${slot.sameIdentityAsInput}.`,
          400,
        );
      }
      continue;
    }
    if (slot.sameIdentityAsInput || slot.objectType.startsWith("same_as:")) {
      throw new AdminRepositoryError(
        `Output slot ${slot.role} can only use same_as for new_revision.`,
        400,
      );
    }
    if (!OBJECT_TYPE_SET.has(slot.objectType)) {
      throw new AdminRepositoryError(
        `Output slot ${slot.role} needs a registered Pocket Genes object type.`,
        400,
      );
    }
    if (slot.objectType === FORM_OBJECT_TYPE) {
      throw new AdminRepositoryError(
        "Output slots cannot produce request forms.",
        400,
      );
    }
  }

  if (document.commercialTerms?.pricingModel === "fixed") {
    const price = optionalRecord(document.commercialTerms.price);
    if (!Number.isFinite(price.amount)) {
      throw new AdminRepositoryError("Fixed price amount is required.", 400);
    }
    if (!cleanString(price.currency)) {
      throw new AdminRepositoryError("Fixed price currency is required.", 400);
    }
  }
  const turnaround = cleanString(document.commercialTerms?.turnaround);
  if (turnaround && !/^[1-9]\d*[wdhm]$/.test(turnaround)) {
    throw new AdminRepositoryError(
      "Turnaround must use a compact duration such as 2w, 1d, 3h, or 15m.",
      400,
    );
  }
}

function validateTransactionDocument(
  document: ReturnType<typeof transactionDocument>,
  offer?: SupportServiceOfferRecord,
  options: {
    preservedInputs?: readonly SupportServiceTransactionInputSlot[];
  } = {},
) {
  if (!/^pgr_[a-z0-9_]+$/.test(document.requestId)) {
    throw new AdminRepositoryError(
      "Request ID must use the pgr_* convention.",
      400,
    );
  }
  if (!/^pgs_[a-z0-9_]+$/.test(document.serviceId)) {
    throw new AdminRepositoryError(
      "Service ID must use the pgs_* convention.",
      400,
    );
  }
  if (!document.offerId) {
    throw new AdminRepositoryError("Offer ID is required.", 400);
  }
  if (!document.providerId || !PROVIDER_KIND_SET.has(document.providerKind)) {
    throw new AdminRepositoryError("Provider identity is required.", 400);
  }
  if (!document.requestedByUserId) {
    throw new AdminRepositoryError("Requester user ID is required.", 400);
  }
  if (!document.requestedAtClient) {
    throw new AdminRepositoryError("Client request timestamp is required.", 400);
  }
  if (!document.idempotencyKey) {
    throw new AdminRepositoryError("Idempotency key is required.", 400);
  }
  if (!document.contractSource) {
    throw new AdminRepositoryError("Contract source is required.", 400);
  }
  if (document.issues.some((issue) => !hasMeaningfulIssueContent(issue))) {
    throw new AdminRepositoryError(
      "Every transaction issue must contain nonblank reason content.",
      400,
    );
  }
  if (
    cleanString(document.offerSnapshot.offerId) !== document.offerId ||
    cleanString(document.offerSnapshot.serviceId) !== document.serviceId ||
    versionNumber(document.offerSnapshot.serviceVersion) !==
      document.serviceVersion ||
    cleanString(document.offerSnapshot.providerId) !== document.providerId ||
    normalizeProviderKind(document.offerSnapshot.providerKind, true) !==
      document.providerKind
  ) {
    throw new AdminRepositoryError(
      "offerSnapshot must match the frozen transaction identity.",
      400,
    );
  }
  if (
    cleanString(document.providerSnapshot.id) !== document.providerId ||
    normalizeProviderKind(document.providerSnapshot.kind, true) !==
      document.providerKind ||
    !cleanString(document.providerSnapshot.name)
  ) {
    throw new AdminRepositoryError(
      "providerSnapshot must contain the frozen provider id, kind, and name.",
      400,
    );
  }
  const offerInputRoles = new Set(
    offer?.inputSlots.map((slot) => cleanString(slot.role)) ?? [],
  );
  const offerOutputRoles = new Set(
    offer?.outputSlots.map((slot) => cleanString(slot.role)) ?? [],
  );
  const offerOutputSlots = new Map(
    offer?.outputSlots.map((slot) => [cleanString(slot.role), slot]) ?? [],
  );
  const formRole = cleanString(
    offer?.inputSlots.find((slot) => slot.objectType === FORM_OBJECT_TYPE)?.role,
  );
  const preservedInputsByRole = new Map(
    (options.preservedInputs ?? []).map((slot) => [slot.role, slot]),
  );
  const suppliedInputRoles = new Set<string>();
  for (const slot of document.inputs) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.role)) {
      throw new AdminRepositoryError(
        "Transaction slot roles must be lowercase identifier keys.",
        400,
      );
    }
    if (!/^obj_[a-z0-9_]+$/.test(slot.objectRef.objectId)) {
      throw new AdminRepositoryError(
        `Transaction slot ${slot.role} must reference an obj_* object ID.`,
        400,
      );
    }
    if (suppliedInputRoles.has(slot.role)) {
      throw new AdminRepositoryError(
        `Duplicate transaction input role: ${slot.role}.`,
        400,
      );
    }
    if (!OBJECT_TYPE_SET.has(slot.objectType)) {
      throw new AdminRepositoryError(
        `Transaction slot ${slot.role} uses an unregistered object type.`,
        400,
      );
    }
    if (offer && !offerInputRoles.has(slot.role)) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} is not declared by the selected service offer.`,
        400,
      );
    }
    const promisedInput = offer?.inputSlots.find(
      (candidate) => cleanString(candidate.role) === slot.role,
    );
    if (
      promisedInput &&
      cleanString(promisedInput.objectType) !== slot.objectType
    ) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} must be ${cleanString(promisedInput.objectType)}, not ${slot.objectType}.`,
        400,
      );
    }
    const preservedInput = preservedInputsByRole.get(slot.role);
    // A bound input is frozen evidence. Historical native transactions may
    // contain a serialized PGO payload inside that snapshot, including
    // snake-case file keys. Permit only the structurally identical snapshot
    // already stored on the transaction; every new or changed input
    // still goes through the current camel-case transaction contract below.
    if (
      !preservedInput ||
      stableString(slot) !== stableString(preservedInput)
    ) {
      validateTransactionInputSnapshot(slot, offer, document);
    }
    if (slot.objectType === FORM_OBJECT_TYPE) {
      if (
        slot.role !== "form" ||
        !/^\d{9}$/.test(slot.objectCode ?? "") ||
        !slot.uploadedObjectId ||
        !slot.fileStorageId ||
        !slot.objectOwnerId
      ) {
        throw new AdminRepositoryError(
          "The form input requires role form plus objectCode, uploadedObjectId, fileStorageId, and objectOwnerId.",
          400,
        );
      }
    }
    suppliedInputRoles.add(slot.role);
  }
  const suppliedOutputRoles = new Set<string>();
  for (const output of document.outputObjects) {
    if (!/^[a-z][a-z0-9_]*$/.test(output.role)) {
      throw new AdminRepositoryError(
        "Output object roles must be lowercase identifier keys.",
        400,
      );
    }
    if (suppliedOutputRoles.has(output.role)) {
      throw new AdminRepositoryError(
        `Duplicate output object role: ${output.role}.`,
        400,
      );
    }
    suppliedOutputRoles.add(output.role);
    if (!/^\d{9}$/.test(output.objectCode)) {
      throw new AdminRepositoryError(
        `Output object ${output.role} must use a 9-digit object code.`,
        400,
      );
    }
    if (!OBJECT_TYPE_SET.has(output.objectType)) {
      throw new AdminRepositoryError(
        `Output object ${output.role} must use a registered Pocket Genes object type.`,
        400,
      );
    }
    if (offer && !offerOutputRoles.has(output.role)) {
      throw new AdminRepositoryError(
        `Output object ${output.role} is not declared by the selected service offer.`,
        400,
      );
    }
    const promisedSlot = offerOutputSlots.get(output.role);
    if (promisedSlot) {
      const promisedType = resolvedOutputObjectType(promisedSlot, offer);
      if (output.objectType !== promisedType) {
        throw new AdminRepositoryError(
          `Output object ${output.role} must be ${promisedType}, not ${output.objectType}.`,
          400,
        );
      }
    }
  }
  const suppliedReportCodes = new Set<string>();
  for (const report of document.outputReports) {
    if (!/^[A-Z0-9]{6}$/.test(report.reportCode)) {
      throw new AdminRepositoryError(
        "Output reports must use an uppercase 6-character alphanumeric report code.",
        400,
      );
    }
    if (suppliedReportCodes.has(report.reportCode)) {
      throw new AdminRepositoryError(
        `Duplicate output report code: ${report.reportCode}.`,
        400,
      );
    }
    suppliedReportCodes.add(report.reportCode);
  }
  if (formRole && !suppliedInputRoles.has(formRole)) {
    throw new AdminRepositoryError(
      "Transactions for offers with a pgo_form slot must include the filled form object before creation.",
      400,
    );
  }
  for (const role of document.missingRequiredInputRoles) {
    if (!/^[a-z][a-z0-9_]*$/.test(role)) {
      throw new AdminRepositoryError(
        "Missing input roles must be lowercase identifier keys.",
        400,
      );
    }
    if (role === formRole) {
      throw new AdminRepositoryError(
        "The pgo_form input cannot be deferred through missingRequiredInputRoles.",
        400,
      );
    }
    if (offer && !offerInputRoles.has(role)) {
      throw new AdminRepositoryError(
        `Missing input role ${role} is not declared by the selected service offer.`,
        400,
      );
    }
  }
  const expectedMissingRoles = new Set(
    offer?.inputSlots
      .filter((slot) => Boolean(slot.required))
      .map((slot) => cleanString(slot.role))
      .filter((role) => role && !suppliedInputRoles.has(role)) ?? [],
  );
  if (
    document.missingRequiredInputRoles.length !== expectedMissingRoles.size ||
    document.missingRequiredInputRoles.some(
      (role) => !expectedMissingRoles.has(role),
    )
  ) {
    throw new AdminRepositoryError(
      "missingRequiredInputRoles must exactly match unresolved required offer inputs.",
      400,
    );
  }
  if (document.attachmentsPending !== (expectedMissingRoles.size > 0)) {
    throw new AdminRepositoryError(
      "attachmentsPending must match unresolved required offer inputs.",
      400,
    );
  }
  if (document.status === "delivered") {
    const expectedRoles = [...offerOutputRoles];
    if (document.outputObjects.length !== expectedRoles.length) {
      throw new AdminRepositoryError(
        "Delivered transactions require exactly one output object for every promised output slot.",
        400,
      );
    }
    for (const role of expectedRoles) {
      if (!suppliedOutputRoles.has(role)) {
        throw new AdminRepositoryError(
          `Delivered transaction is missing promised output role ${role}.`,
          400,
        );
      }
    }
  }
}

function resolvedOutputObjectType(
  slot: Record<string, unknown>,
  offer?: SupportServiceOfferRecord,
): SupportServiceObjectType {
  const objectType = cleanString(slot.objectType);
  const inputRole = cleanString(slot.sameIdentityAsInput) || objectType.slice(8);
  const resolved = objectType.startsWith("same_as:")
    ? cleanString(
      offer?.inputSlots.find((input) => cleanString(input.role) === inputRole)
        ?.objectType,
    )
    : objectType;
  if (!OBJECT_TYPE_SET.has(resolved)) {
    throw new AdminRepositoryError(
      `Output slot ${cleanString(slot.role) || "(unknown)"} cannot resolve a registered object type.`,
      400,
    );
  }
  return resolved as SupportServiceObjectType;
}

function isValidDateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidDateTime(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/,
  );
  return (
    Boolean(match) &&
    isValidDateOnly(match?.[1]) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isValidHttpsUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.includes("\\") ||
    !/^https:\/\/[^/?#\\\s]+(?:[/?#]|$)/i.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol.toLowerCase() === "https:" &&
      Boolean(parsed.hostname) &&
      !/\s/.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isValidTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

type NormalizedFormField = NonNullable<
  ReturnType<typeof normalizeFormShape>
>["fields"][number];

function formAnswerMatchesField(value: unknown, field: NormalizedFormField) {
  const options = field.options ?? [];
  const optionValues = new Set(options.map((option) => option.value));
  switch (field.type) {
    case "text":
    case "long_text":
    case "address":
      return typeof value === "string" && cleanString(value).length > 0;
    case "email":
      return (
        typeof value === "string" &&
        /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
          value,
        )
      );
    case "phone":
      return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
    case "url":
      return isValidHttpsUrl(value);
    case "postal_code":
      return (
        typeof value === "string" &&
        /^[A-Za-z0-9](?:[A-Za-z0-9 -]{0,10}[A-Za-z0-9])?$/.test(value)
      );
    case "country_code":
      return typeof value === "string" && ISO_COUNTRY_CODES.has(value);
    case "identifier":
      return (
        typeof value === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
      );
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "positive_integer":
      return typeof value === "number" && Number.isInteger(value) && value > 0;
    case "percentage":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
      );
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return isValidDateOnly(value);
    case "datetime":
      return isValidDateTime(value);
    case "time":
      return isValidTime(value);
    case "enum":
      return typeof value === "string" && optionValues.has(value);
    case "multi_enum":
      return (
        Array.isArray(value) &&
        (!field.required || value.length > 0) &&
        value.every(
          (item): item is string =>
            typeof item === "string" && optionValues.has(item),
        ) &&
        new Set(value).size === value.length &&
        value.every(
          (item, index) =>
            index === 0 ||
            options.findIndex(
              (option) => option.value === value[index - 1],
            ) < options.findIndex((option) => option.value === item),
        )
      );
    case "string_list":
      return (
        Array.isArray(value) &&
        (!field.required || value.length > 0) &&
        value.every(
          (item): item is string =>
            typeof item === "string" && cleanString(item).length > 0,
        )
      );
    case "integer_list":
      return (
        Array.isArray(value) &&
        (!field.required || value.length > 0) &&
        value.every(
          (item) => typeof item === "number" && Number.isInteger(item),
        )
      );
    case "number_list":
      return (
        Array.isArray(value) &&
        (!field.required || value.length > 0) &&
        value.every(
          (item) => typeof item === "number" && Number.isFinite(item),
        )
      );
    default:
      return false;
  }
}

function assertCamelCaseSnapshotValue(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertCamelCaseSnapshotValue(item, `${label}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date) {
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return;
  }
  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key)) {
      throw new AdminRepositoryError(
        `${label} must use camelCase keys; found ${key}.`,
        400,
      );
    }
    assertCamelCaseSnapshotValue(nestedValue, `${label}.${key}`);
  }
}

function normalizedPgoSnapshot(value: unknown, label: string) {
  const snapshot = requireRecord(value, label);
  rejectForbiddenKeys(
    snapshot,
    [
      "object_id",
      "object_type",
      "schema_version",
      "created_at",
      "created_by",
      "input_refs",
    ],
    label,
  );
  assertCamelCaseSnapshotValue(snapshot, label);
  const objectId = cleanString(snapshot.objectId);
  const objectType = cleanString(snapshot.objectType);
  const schemaVersion = cleanString(snapshot.schemaVersion);
  const revision = Number(snapshot.revision);
  const createdAt = dateFromUnknown(
    snapshot.createdAt,
    `${label} createdAt`,
    true,
  );
  const createdBy = cleanString(snapshot.createdBy);
  const data = requireRecord(snapshot.data, `${label} data`);
  assertCamelCaseSnapshotValue(data, `${label}.data`);
  if (
    !objectId ||
    !OBJECT_TYPE_SET.has(objectType) ||
    schemaVersion !== "1.0.0" ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    !createdAt ||
    !createdBy
  ) {
    throw new AdminRepositoryError(`${label} has invalid platform metadata.`, 400);
  }
  return {
    objectId,
    objectType,
    schemaVersion,
    revision,
    createdAt: createdAt.toISOString(),
    createdBy,
    data,
  };
}

function normalizedPgoFormSnapshotData(value: unknown, label: string) {
  const data = requireRecord(value, label);
  rejectForbiddenKeys(data, ["form_shape"], label);
  rejectUnknownKeys(data, ["formShape", "fields", "notes"], label);
  const formShape = requireRecord(data.formShape, `${label}.formShape`);
  rejectForbiddenKeys(formShape, ["allow_unknown_fields"], `${label}.formShape`);
  rejectUnknownKeys(formShape, ["fields"], `${label}.formShape`);
  if (!Array.isArray(formShape.fields) || !Array.isArray(data.fields)) {
    throw new AdminRepositoryError(
      `${label} must contain formShape.fields and fields arrays.`,
      400,
    );
  }
  const fields = (formShape.fields as unknown[]).map((value, index) => {
    const field = requireRecord(
      value,
      `${label}.formShape.fields[${index}]`,
    );
    rejectForbiddenKeys(
      field,
      ["help_info_text"],
      `${label}.formShape.fields[${index}]`,
    );
    rejectUnknownKeys(
      field,
      ["key", "label", "type", "required", "options", "helpInfoText"],
      `${label}.formShape.fields[${index}]`,
    );
    if (
      typeof field.key !== "string" ||
      field.key !== cleanString(field.key) ||
      typeof field.type !== "string" ||
      field.type !== cleanString(field.type)
    ) {
      throw new AdminRepositoryError(
        `${label}.formShape.fields[${index}] must preserve exact canonical key and type values.`,
        400,
      );
    }
    if (Object.prototype.hasOwnProperty.call(field, "options")) {
      if (!Array.isArray(field.options)) {
        throw new AdminRepositoryError(
          `${label}.formShape.fields[${index}].options must be an array.`,
          400,
        );
      }
      (field.options as unknown[]).forEach((value, optionIndex) => {
        const option = requireRecord(
          value,
          `${label}.formShape.fields[${index}].options[${optionIndex}]`,
        );
        rejectUnknownKeys(
          option,
          ["value", "label"],
          `${label}.formShape.fields[${index}].options[${optionIndex}]`,
        );
        if (
          typeof option.value !== "string" ||
          option.value !== cleanString(option.value)
        ) {
          throw new AdminRepositoryError(
            `${label}.formShape.fields[${index}].options[${optionIndex}] must preserve its exact canonical value.`,
            400,
          );
        }
      });
    }
    return field;
  });
  const normalizedShape = normalizeFormShape({
    id: "pgfs_snapshot_projection",
    version: 1,
    allowUnknownFields: false,
    fields,
  });
  if (!normalizedShape) {
    throw new AdminRepositoryError(`${label} has an invalid form shape.`, 400);
  }
  const frozenFields = fields.map((field) =>
    withoutUndefined({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: Object.prototype.hasOwnProperty.call(field, "options")
        ? field.options
        : undefined,
      helpInfoText:
        typeof field.helpInfoText === "string"
          ? field.helpInfoText
          : undefined,
    }),
  );
  const answers = (data.fields as unknown[]).map((value, index) => {
    const answer = requireRecord(value, `${label}.fields[${index}]`);
    rejectUnknownKeys(answer, ["key", "value"], `${label}.fields[${index}]`);
    if (!Object.prototype.hasOwnProperty.call(answer, "value")) {
      throw new AdminRepositoryError(
        `${label}.fields[${index}] must contain value.`,
        400,
      );
    }
    if (
      typeof answer.key !== "string" ||
      answer.key !== cleanString(answer.key)
    ) {
      throw new AdminRepositoryError(
        `${label}.fields[${index}] must preserve its exact canonical key.`,
        400,
      );
    }
    return { key: answer.key, value: answer.value };
  });
  if (data.notes !== undefined && typeof data.notes !== "string") {
    throw new AdminRepositoryError(`${label}.notes must be a string.`, 400);
  }
  return withoutUndefined({
    formShape: { fields: frozenFields },
    fields: answers,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  });
}

function serializedPgoFormContentProjection(value: unknown, label: string) {
  const schemaError = serializedPgoObjectSchemaError(FORM_OBJECT_TYPE, value);
  if (schemaError) {
    throw new AdminRepositoryError(`${label}: ${schemaError}.`, 400);
  }
  const serialized = requireRecord(value, label);
  const serializedShape = requireRecord(
    serialized.form_shape,
    `${label}.form_shape`,
  );
  const fields = optionalRecordArray(serializedShape.fields).map((field) =>
    withoutUndefined({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: Object.prototype.hasOwnProperty.call(field, "options")
        ? field.options
        : undefined,
      helpInfoText:
        typeof field.help_info_text === "string"
          ? field.help_info_text
          : undefined,
    }),
  );
  return normalizedPgoFormSnapshotData(
    withoutUndefined({
      formShape: { fields },
      fields: serialized.fields,
      notes:
        typeof serialized.notes === "string" ? serialized.notes : undefined,
    }),
    `${label} projection`,
  );
}

function validateTransactionInputSnapshot(
  slot: SupportServiceTransactionInputSlot,
  offer: SupportServiceOfferRecord | undefined,
  transaction: Pick<
    SupportServiceTransactionDocument,
    "requestedByUserId" | "requestedByUserEmail" | "requestedAtClient"
  >,
) {
  const snapshot = normalizedPgoSnapshot(
    slot.objectSnapshot,
    `Input slot ${slot.role} objectSnapshot`,
  );
  if (
    snapshot.objectId !== slot.objectRef.objectId ||
    snapshot.objectType !== slot.objectType ||
    snapshot.revision !== slot.objectRef.revision
  ) {
    throw new AdminRepositoryError(
      `Input slot ${slot.role} objectSnapshot metadata must match objectRef and objectType.`,
      400,
    );
  }

  if (slot.objectType !== FORM_OBJECT_TYPE) {
    return;
  }
  if (snapshot.createdBy !== transaction.requestedByUserId) {
    throw new AdminRepositoryError(
      "The request form snapshot must be created by the requester.",
      400,
    );
  }
  const data = normalizedPgoFormSnapshotData(
    snapshot.data,
    `Input slot ${slot.role} objectSnapshot.data`,
  );
  const expectedShape = offer?.formShape;
  const normalizedExpectedShape = expectedShape
    ? normalizeFormShape(expectedShape)
    : undefined;
  if (
    !normalizedExpectedShape ||
    stableString(data.formShape.fields) !==
      stableString(normalizedExpectedShape.fields)
  ) {
    throw new AdminRepositoryError(
      "The form input objectSnapshot must embed the exact frozen offer form shape.",
      400,
    );
  }
  const declaredFields = new Map(
    normalizedExpectedShape.fields.map((field) => [field.key, field]),
  );
  const submittedFields = new Map<string, unknown>();
  for (const [index, field] of data.fields.entries()) {
    const key = cleanString(field.key);
    const declaredField = declaredFields.get(key);
    if (
      !key ||
      !declaredField ||
      submittedFields.has(key) ||
      !Object.prototype.hasOwnProperty.call(field, "value") ||
      !formAnswerMatchesField(field.value, declaredField)
    ) {
      throw new AdminRepositoryError(
        `Submitted form field ${index + 1} must be unique, declared, and match its frozen field type.`,
        400,
      );
    }
    submittedFields.set(key, field.value);
  }
  for (const field of normalizedExpectedShape.fields) {
    if (field.required && !submittedFields.has(field.key)) {
      throw new AdminRepositoryError(
        `Submitted form is missing required field ${field.key}.`,
        400,
      );
    }
  }
}

async function assertProvisionedFormInputsAvailable(
  document: SupportServiceTransactionDocument,
  readDocument: DocumentReader,
  providerOwnerId: string,
) {
  const formInputs = document.inputs.filter(
    (input) => input.objectType === FORM_OBJECT_TYPE,
  );
  await Promise.all(
    formInputs.map(async (input) => {
      const objectCode = cleanString(input.objectCode);
      const uploadedObjectId = cleanString(input.uploadedObjectId);
      const fileStorageId = cleanString(input.fileStorageId);
      const objectOwnerId = cleanString(input.objectOwnerId);
      const expectedOwnerId = cleanString(providerOwnerId);
      if (
        !objectCode ||
        !uploadedObjectId ||
        !fileStorageId ||
        !objectOwnerId ||
        !expectedOwnerId ||
        objectOwnerId !== expectedOwnerId
      ) {
        throw new AdminRepositoryError(
          "The provisioned request form must belong to the frozen provider owner.",
          400,
        );
      }

      const codeRef = adminDb
        .collection(OBJECT_CODES_COLLECTION)
        .doc(objectCode);
      const codeSnapshot = await readDocument(codeRef);
      if (!codeSnapshot.exists) {
        throw new AdminRepositoryError(
          `Request form object code ${objectCode} does not exist.`,
          400,
        );
      }
      const codeData = codeSnapshot.data() ?? {};
      if (
        cleanString(codeData.uploaded_object_id) !== uploadedObjectId ||
        cleanString(codeData.owner_id) !== objectOwnerId
      ) {
        throw new AdminRepositoryError(
          `Request form object code ${objectCode} does not match its uploaded object and owner.`,
          400,
        );
      }

      const uploadedRef = adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .doc(uploadedObjectId);
      const fileRef = adminDb
        .collection(FILE_STORAGE_COLLECTION)
        .doc(fileStorageId);
      const ownerRef = adminDb
        .collection(OBJECT_OWNERS_COLLECTION)
        .doc(objectOwnerId);
      const providerCommunityRef = adminDb
        .collection(COMMUNITY_USERS_COLLECTION)
        .doc(objectOwnerId);
      const [
        uploadedSnapshot,
        fileSnapshot,
        ownerSnapshot,
        providerCommunitySnapshot,
      ] = await Promise.all([
        readDocument(uploadedRef),
        readDocument(fileRef),
        readDocument(ownerRef),
        readDocument(providerCommunityRef),
      ]);
      if (
        !uploadedSnapshot.exists ||
        !fileSnapshot.exists ||
        !ownerSnapshot.exists ||
        !providerCommunitySnapshot.exists
      ) {
        throw new AdminRepositoryError(
          `Request form object code ${objectCode} has incomplete provisioned records.`,
          400,
        );
      }

      const uploadedData = uploadedSnapshot.data() ?? {};
      rejectForbiddenKeys(
        uploadedData,
        ["objectType", "objectCode"],
        `Request form uploaded object ${uploadedObjectId}`,
        "camel-case",
      );
      if (
        cleanString(uploadedData.object_code) !== objectCode ||
        cleanString(uploadedData.object_type) !== FORM_OBJECT_TYPE ||
        cleanString(uploadedData.linked_file_id) !== fileStorageId ||
        cleanString(uploadedData.object_owner_id) !== objectOwnerId ||
        cleanString(uploadedData.owner_community_user_id) !== objectOwnerId ||
        cleanString(uploadedData.owner_public_profile_id) !== objectOwnerId ||
        !Number.isInteger(uploadedData.upload_version_count) ||
        Number(uploadedData.upload_version_count) < 1 ||
        cleanString(uploadedData.tracking_progress_status) !== "document_ready"
      ) {
        throw new AdminRepositoryError(
          `Request form uploaded object ${uploadedObjectId} has invalid linkage or provenance.`,
          400,
        );
      }

      const fileData = fileSnapshot.data() ?? {};
      let storedFormContent: ReturnType<
        typeof serializedPgoFormContentProjection
      > | null;
      try {
        storedFormContent = serializedPgoFormContentProjection(
          JSON.parse(cleanString(fileData.file_content)),
          `Request form stored file ${fileStorageId}`,
        );
      } catch {
        storedFormContent = null;
      }
      const transactionFormSnapshot = normalizedPgoSnapshot(
        input.objectSnapshot,
        `Request form transaction snapshot ${input.role}`,
      );
      const transactionFormContent = normalizedPgoFormSnapshotData(
        transactionFormSnapshot.data,
        `Request form transaction snapshot ${input.role}.data`,
      );
      if (
        cleanString(fileData.linked_object_code) !== objectCode ||
        cleanString(fileData.file_type) !== FORM_OBJECT_TYPE ||
        cleanString(fileData.owner_community_user_id) !== objectOwnerId ||
        cleanString(fileData.provider_id) !== document.providerId ||
        !storedFormContent ||
        stableString(storedFormContent) !== stableString(transactionFormContent)
      ) {
        throw new AdminRepositoryError(
          `Request form stored file ${fileStorageId} does not match its object linkage.`,
          400,
        );
      }
      const providerCommunityData = providerCommunitySnapshot.data() ?? {};
      const ownedObjects = stringValueArray(
        providerCommunityData.owned_objects,
      );
      if (!ownedObjects.includes(uploadedObjectId)) {
        throw new AdminRepositoryError(
          `Provider owner ${objectOwnerId} does not index request form ${uploadedObjectId}.`,
          400,
        );
      }
    }),
  );
}

function serializedContentFromFile(
  fileData: Record<string, unknown>,
  objectType: SupportServiceObjectType,
  label: string,
) {
  try {
    const content = JSON.parse(cleanString(fileData.file_content));
    const schemaError = serializedPgoObjectSchemaError(objectType, content);
    if (schemaError) {
      throw new Error(schemaError);
    }
    return requireRecord(content, label);
  } catch {
    throw new AdminRepositoryError(
      `${label} must contain valid ${objectType} content JSON.`,
      400,
    );
  }
}

type DownloadedPgoObject = {
  objectType: SupportServiceObjectType;
  content: Record<string, unknown>;
  downloadUrl: string;
  fileName: string;
  contentSha256: string;
  contentSizeBytes: number;
};

type StoredPgoObject = {
  objectType: SupportServiceObjectType;
  content: Record<string, unknown>;
  fileStorageId: string;
  fileName: string;
  contentSha256: string;
  contentSizeBytes: number;
};

type ValidatedPgoObject = DownloadedPgoObject | StoredPgoObject;

function normalizedOutputFileName(value: string) {
  const leaf = value
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!leaf) {
    return "";
  }
  return leaf.slice(0, 255);
}

function normalizedOutputTitleFileName(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function outputFileNameFromPgoTitle(content: Record<string, unknown>) {
  return normalizedOutputTitleFileName(cleanString(content.title));
}

function decodedFileName(value: string) {
  try {
    return normalizedOutputFileName(decodeURIComponent(value));
  } catch {
    return normalizedOutputFileName(value);
  }
}

function outputFileNameFromResponse(
  response: Response,
  requestedUrl: URL,
  objectType: SupportServiceObjectType,
) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedName) {
    const name = decodedFileName(encodedName.replace(/^"|"$/g, ""));
    if (name) {
      return name;
    }
  }
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const plainName = disposition.match(/filename=([^;]+)/i)?.[1];
  const dispositionName = decodedFileName(quotedName ?? plainName ?? "");
  if (dispositionName) {
    return dispositionName;
  }
  return (
    decodedFileName(requestedUrl.pathname) || `${objectType}.pgo.json`
  );
}

function validateStoredPgoObject(
  fileStorageId: string,
  fileData: Record<string, unknown>,
  objectType: SupportServiceObjectType,
  contentLabel = `Output object stored file ${fileStorageId}`,
): StoredPgoObject {
  rejectForbiddenKeys(
    fileData,
    [
      "fileName",
      "fileType",
      "fileContent",
      "linkedObjectCode",
      "ownerCommunityUserId",
    ],
    `Stored file ${fileStorageId}`,
    "camel-case",
  );
  if (cleanString(fileData.file_type) !== objectType) {
    throw new AdminRepositoryError(
      `Stored file ${fileStorageId} must have file_type ${objectType}.`,
      400,
    );
  }
  const progressStatus = cleanString(fileData.tracking_progress_status);
  if (progressStatus && progressStatus !== "document_ready") {
    throw new AdminRepositoryError(
      `Stored file ${fileStorageId} is not finalized and ready.`,
      409,
    );
  }
  const serializedContent = cleanString(fileData.file_content);
  if (!serializedContent) {
    throw new AdminRepositoryError(
      `Stored file ${fileStorageId} must contain finalized PGO content.`,
      400,
    );
  }
  const contentBytes = Buffer.from(serializedContent, "utf8");
  if (contentBytes.length > OUTPUT_OBJECT_DOWNLOAD_MAX_BYTES) {
    throw new AdminRepositoryError(
      `Stored file ${fileStorageId} PGO content is too large.`,
      400,
    );
  }
  const content = serializedContentFromFile(
    fileData,
    objectType,
    contentLabel,
  );
  return {
    objectType,
    content,
    fileStorageId,
    fileName:
      outputFileNameFromPgoTitle(content) ||
      normalizedOutputFileName(cleanString(fileData.file_name)) ||
      `${objectType}.pgo.json`,
    contentSha256: createHash("sha256").update(contentBytes).digest("hex"),
    contentSizeBytes: contentBytes.length,
  };
}

async function assertStoredPgoNativeContent(object: StoredPgoObject) {
  if (object.objectType === "pgo_interactive_report") {
    await assertInteractiveReportNativeContent(
      cleanString(object.content.download_url),
    );
  }
}

async function assertInteractiveReportNativeContent(downloadUrl: string) {
  let requestedUrl: URL;
  try {
    requestedUrl = new URL(downloadUrl);
  } catch {
    throw new AdminRepositoryError(
      "Interactive report content must contain a valid HTTPS download_url.",
      400,
    );
  }
  try {
    const result = await fetchWithValidatedRedirects(requestedUrl, {
      accept: "application/json,application/octet-stream;q=0.9",
      timeoutMs: OUTPUT_OBJECT_DOWNLOAD_TIMEOUT_MS,
      allowedProtocols: ["https:"],
    });
    if (!result.response.ok) {
      throw new AdminRepositoryError(
        `Interactive report download_url returned HTTP ${result.response.status}.`,
        400,
      );
    }
    const bytes = await readLimitedResponse(
      result.response,
      OUTPUT_OBJECT_DOWNLOAD_MAX_BYTES,
      "Downloaded native PGI report is too large.",
    );
    let nativeContent: unknown;
    try {
      nativeContent = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new AdminRepositoryError(
        "Interactive report download_url must return valid PGI JSON.",
        400,
      );
    }
    const identified = identifyPgiNativeModel(nativeContent);
    if (!identified.ok) {
      throw new AdminRepositoryError(identified.message, 400);
    }
  } catch (error) {
    if (error instanceof AdminRepositoryError) {
      throw error;
    }
    if (error instanceof FaviconExtractionError) {
      throw new AdminRepositoryError(error.message, error.statusCode);
    }
    throw new AdminRepositoryError(
      "Interactive report download_url could not be fetched.",
      400,
    );
  }
}

async function downloadAndValidatePgoObject(
  downloadUrl: string,
  objectType: SupportServiceObjectType,
): Promise<DownloadedPgoObject> {
  let requestedUrl: URL;
  try {
    requestedUrl = new URL(downloadUrl);
  } catch {
    throw new AdminRepositoryError("downloadUrl must be a valid HTTPS URL.", 400);
  }
  if (requestedUrl.protocol !== "https:") {
    throw new AdminRepositoryError("downloadUrl must use HTTPS.", 400);
  }

  try {
    const result = await fetchWithValidatedRedirects(requestedUrl, {
      accept: "application/json,application/octet-stream;q=0.9",
      timeoutMs: OUTPUT_OBJECT_DOWNLOAD_TIMEOUT_MS,
      allowedProtocols: ["https:"],
    });
    if (!result.response.ok) {
      throw new AdminRepositoryError(
        `downloadUrl returned HTTP ${result.response.status}.`,
        400,
      );
    }
    const content = await readLimitedResponse(
      result.response,
      OUTPUT_OBJECT_DOWNLOAD_MAX_BYTES,
      "Downloaded PGO object is too large.",
    );
    if (content.length === 0) {
      throw new AdminRepositoryError("downloadUrl returned an empty file.", 400);
    }

    let serialized: unknown;
    try {
      serialized = JSON.parse(content.toString("utf8"));
    } catch {
      throw new AdminRepositoryError(
        "downloadUrl must return valid PGO content JSON.",
        400,
      );
    }
    const schemaError = serializedPgoObjectSchemaError(objectType, serialized);
    if (schemaError) {
      throw new AdminRepositoryError(
        `downloadUrl content does not match the ${objectType} schema: ${schemaError}.`,
        400,
      );
    }
    const parsedContent = requireRecord(
      serialized,
      "Downloaded output object content",
    );
    if (objectType === "pgo_interactive_report") {
      await assertInteractiveReportNativeContent(
        cleanString(parsedContent.download_url),
      );
    }
    return {
      objectType,
      content: parsedContent,
      downloadUrl: requestedUrl.href,
      fileName:
        outputFileNameFromPgoTitle(parsedContent) ||
        outputFileNameFromResponse(
          result.response,
          requestedUrl,
          objectType,
        ),
      contentSha256: createHash("sha256").update(content).digest("hex"),
      contentSizeBytes: content.length,
    };
  } catch (error) {
    if (error instanceof AdminRepositoryError) {
      throw error;
    }
    if (error instanceof FaviconExtractionError) {
      throw new AdminRepositoryError(error.message, error.statusCode);
    }
    throw new AdminRepositoryError("downloadUrl could not be fetched.", 400);
  }
}

function assertDownloadedOutputMatchesFrozenSlot(
  downloaded: Pick<ValidatedPgoObject, "objectType">,
  slot: Record<string, unknown>,
  offer: SupportServiceOfferRecord,
  transaction: Pick<SupportServiceTransactionRecord, "inputs">,
) {
  const role = cleanString(slot.role);
  const expectedType = resolvedOutputObjectType(slot, offer);
  if (downloaded.objectType !== expectedType) {
    throw new AdminRepositoryError(
      `Output slot ${role} requires ${expectedType}.`,
      400,
    );
  }
  if (slot.mutationMode === "new_revision") {
    const sourceRole = cleanString(slot.sameIdentityAsInput);
    const sourceInput = transaction.inputs.find(
      (input) => input.role === sourceRole,
    );
    if (!sourceInput) {
      throw new AdminRepositoryError(
        `Output slot ${role} cannot resolve frozen source input ${sourceRole}.`,
        400,
      );
    }
    if (sourceInput.objectType !== expectedType) {
      throw new AdminRepositoryError(
        `Output slot ${role} must preserve the object type of ${sourceRole}.`,
        400,
      );
    }
  }
}

function randomObjectCodeCandidates() {
  const candidates = new Set<string>();
  while (candidates.size < OUTPUT_OBJECT_CODE_CANDIDATE_COUNT) {
    candidates.add(String(randomInt(0, 1_000_000_000)).padStart(9, "0"));
  }
  return [...candidates];
}

function revisionUploadedObjectId(objectId: string, revision: number) {
  const claim = createHash("sha256")
    .update(`${objectId}\u0000${revision}`)
    .digest("hex");
  return `pgo_revision_${claim}`;
}

async function downloadAttachedOutputObjects(
  document: Pick<SupportServiceTransactionRecord, "outputObjects">,
) {
  const downloaded = new Map<string, DownloadedPgoObject>();
  for (const output of document.outputObjects) {
    const codeSnapshot = await adminDb
      .collection(OBJECT_CODES_COLLECTION)
      .doc(output.objectCode)
      .get();
    const codeData = codeSnapshot.data() ?? {};
    const uploadedObjectId = cleanString(codeData.uploaded_object_id);
    if (!codeSnapshot.exists || !uploadedObjectId) {
      throw new AdminRepositoryError(
        `Output object code ${output.objectCode} has no uploaded object.`,
        400,
      );
    }
    const uploadedSnapshot = await adminDb
      .collection(UPLOADED_OBJECTS_COLLECTION)
      .doc(uploadedObjectId)
      .get();
    if (!uploadedSnapshot.exists) {
      throw new AdminRepositoryError(
        `Uploaded object for code ${output.objectCode} does not exist.`,
        400,
      );
    }
    const downloadUrl = cleanString(uploadedSnapshot.data()?.download_url);
    if (downloadUrl) {
      downloaded.set(
        output.objectCode,
        await downloadAndValidatePgoObject(downloadUrl, output.objectType),
      );
    }
  }
  return downloaded;
}

function assertNewRevisionDelivery(
  document: SupportServiceTransactionDocument,
  output: SupportServiceTransactionOutputObjectSnapshot,
  promisedOutput: Record<string, unknown>,
  outputObjectData: Record<string, unknown>,
) {
  const sourceRole = cleanString(promisedOutput.sameIdentityAsInput);
  const sourceInput = document.inputs.find((input) => input.role === sourceRole);
  if (!sourceInput) {
    throw new AdminRepositoryError(
      `Output object ${output.role} cannot prove the frozen source revision for ${sourceRole}.`,
      400,
    );
  }
  if (
    output.objectType !== sourceInput.objectType ||
    cleanString(outputObjectData.object_id) !== sourceInput.objectRef.objectId ||
    Number(outputObjectData.object_revision) !==
      sourceInput.objectRef.revision + 1
  ) {
    throw new AdminRepositoryError(
      `Output object ${output.role} must be the sequential next PGO revision of ${sourceRole} with the same object identity.`,
      400,
    );
  }
}

async function assertDeliveredOutputObjectsAvailable(
  document: ReturnType<typeof transactionDocument>,
  offer: SupportServiceOfferRecord,
  readDocument: DocumentReader,
  providerOwnerId: string,
  downloadedObjects: ReadonlyMap<string, DownloadedPgoObject> = new Map(),
) {
  if (document.status !== "delivered") {
    return;
  }

  const formOwnerId = cleanString(
    document.inputs.find((input) => input.objectType === FORM_OBJECT_TYPE)
      ?.objectOwnerId,
  );
  if (formOwnerId && formOwnerId !== providerOwnerId) {
    throw new AdminRepositoryError(
      "The provisioned request form owner no longer matches the authoritative provider owner.",
      400,
    );
  }

  await Promise.all(
    document.outputObjects.map(async (output) => {
      const promisedOutput = offer.outputSlots.find(
        (slot) => cleanString(slot.role) === output.role,
      );
      const codeRef = adminDb
        .collection(OBJECT_CODES_COLLECTION)
        .doc(output.objectCode);
      const codeSnapshot = await readDocument(codeRef);
      if (!codeSnapshot.exists) {
        throw new AdminRepositoryError(
          `Output object code ${output.objectCode} does not exist.`,
          400,
        );
      }

      const codeData = codeSnapshot.data() ?? {};
      const uploadedObjectId = cleanString(codeData.uploaded_object_id);
      if (!uploadedObjectId) {
        throw new AdminRepositoryError(
          `Output object code ${output.objectCode} has no uploaded object.`,
          400,
        );
      }

      const objectRef = adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .doc(uploadedObjectId);
      const objectSnapshot = await readDocument(objectRef);
      if (!objectSnapshot.exists) {
        throw new AdminRepositoryError(
          `Uploaded object for code ${output.objectCode} does not exist.`,
          400,
        );
      }

      const objectData = objectSnapshot.data() ?? {};
      rejectForbiddenKeys(
        objectData,
        ["objectType", "objectCode"],
        `Uploaded object ${output.objectCode}`,
        "camel-case",
      );
      if (
        cleanString(objectData.object_code) !== output.objectCode
      ) {
        throw new AdminRepositoryError(
          `Uploaded object does not belong to object code ${output.objectCode}.`,
          400,
        );
      }
      if (
        cleanString(objectData.object_type) !== output.objectType
      ) {
        throw new AdminRepositoryError(
          `Uploaded object ${output.objectCode} does not match ${output.objectType}.`,
          400,
        );
      }
      if (!promisedOutput) {
        throw new AdminRepositoryError(
          `Output object ${output.role} is not declared by the frozen offer.`,
          400,
        );
      }
      const sourceRole = cleanString(promisedOutput.sameIdentityAsInput);
      const sourceInput = sourceRole
        ? document.inputs.find((input) => input.role === sourceRole)
        : undefined;
      const expectedObjectId =
        promisedOutput.mutationMode === "new_revision"
          ? cleanString(sourceInput?.objectRef.objectId)
          : `obj_output_${output.objectCode}`;
      const expectedRevision =
        promisedOutput.mutationMode === "new_revision"
          ? Number(sourceInput?.objectRef.revision) + 1
          : 1;
      if (
        !expectedObjectId ||
        !Number.isInteger(expectedRevision) ||
        cleanString(objectData.object_id) !== expectedObjectId ||
        Number(objectData.object_revision) !== expectedRevision
      ) {
        throw new AdminRepositoryError(
          `Output object ${output.objectCode} has invalid platform identity or revision metadata.`,
          400,
        );
      }
      if (
        !Number.isInteger(objectData.upload_version_count) ||
        Number(objectData.upload_version_count) < 1
      ) {
        throw new AdminRepositoryError(
          `Output object ${output.objectCode} requires a positive upload_version_count.`,
          400,
        );
      }
      if (cleanString(objectData.tracking_progress_status) !== "document_ready") {
        throw new AdminRepositoryError(
          `Output object ${output.objectCode} is not ready for download.`,
          400,
        );
      }
      if (
        !cleanString(objectData.download_url) &&
        !cleanString(objectData.linked_file_id)
      ) {
        throw new AdminRepositoryError(
          `Output object ${output.objectCode} has no downloadable payload.`,
          400,
        );
      }

      const objectOwnerId = cleanString(objectData.object_owner_id);
      const ownerCommunityUserId = cleanString(
        objectData.owner_community_user_id,
      );
      const ownerPublicProfileId = cleanString(
        objectData.owner_public_profile_id,
      );
      const ownerName = cleanString(objectData.owner_name);
      const ownerEmail = cleanString(objectData.owner_email);
      if (
        !objectOwnerId ||
        objectOwnerId !== ownerCommunityUserId ||
        ownerPublicProfileId !== objectOwnerId ||
        !ownerName ||
        !ownerEmail
      ) {
        throw new AdminRepositoryError(
          `Output object ${output.objectCode} has an invalid owner relationship or provenance snapshot.`,
          400,
        );
      }
      const codeOwnerId = cleanString(codeData.owner_id);
      if (
        !codeOwnerId ||
        codeOwnerId !== objectOwnerId ||
        !providerOwnerId ||
        objectOwnerId !== providerOwnerId
      ) {
        throw new AdminRepositoryError(
          `Output object code ${output.objectCode} does not match the frozen provider owner.`,
          400,
        );
      }
      const ownerRef = adminDb
        .collection(OBJECT_OWNERS_COLLECTION)
        .doc(objectOwnerId);
      const ownerCommunityRef = adminDb
        .collection(COMMUNITY_USERS_COLLECTION)
        .doc(objectOwnerId);
      const linkedFileId = cleanString(objectData.linked_file_id);
      const linkedFileRef = linkedFileId
        ? adminDb.collection(FILE_STORAGE_COLLECTION).doc(linkedFileId)
        : null;
      const [ownerSnapshot, ownerCommunitySnapshot, linkedFileSnapshot] =
        await Promise.all([
          readDocument(ownerRef),
          readDocument(ownerCommunityRef),
          linkedFileRef ? readDocument(linkedFileRef) : Promise.resolve(null),
        ]);
      if (!ownerSnapshot.exists || !ownerCommunitySnapshot.exists) {
        throw new AdminRepositoryError(
          `Object owner ${objectOwnerId} does not exist.`,
          400,
        );
      }
      const ownedObjects = stringValueArray(
        (ownerCommunitySnapshot.data() ?? {}).owned_objects,
      );
      if (!ownedObjects.includes(uploadedObjectId)) {
        throw new AdminRepositoryError(
          `Object owner ${objectOwnerId} does not index output ${uploadedObjectId}.`,
          400,
        );
      }
      if (linkedFileId) {
        const fileData = linkedFileSnapshot?.data() ?? {};
        if (
          !linkedFileSnapshot?.exists ||
          cleanString(fileData.linked_object_code) !== output.objectCode ||
          cleanString(fileData.file_type) !== output.objectType ||
          cleanString(fileData.owner_community_user_id) !== objectOwnerId
        ) {
          throw new AdminRepositoryError(
            `Output object ${output.objectCode} has an invalid linked file.`,
            400,
          );
        }
        if (!cleanString(fileData.file_content)) {
          throw new AdminRepositoryError(
            `Output object ${output.objectCode} linked file must contain finalized PGO content.`,
            409,
          );
        }
        const storedObject = validateStoredPgoObject(
          linkedFileId,
          fileData,
          output.objectType,
          `Output object ${output.role} stored file`,
        );
        if (
          cleanString(objectData.content_sha256) !==
            storedObject.contentSha256 ||
          Number(objectData.content_size_bytes) !==
            storedObject.contentSizeBytes
        ) {
          throw new AdminRepositoryError(
            `Output object ${output.objectCode} linked file content changed after it was attached.`,
            409,
          );
        }
        await assertStoredPgoNativeContent(storedObject);
      }
      const downloadUrl = cleanString(objectData.download_url);
      if (downloadUrl) {
        const downloaded = downloadedObjects.get(output.objectCode);
        if (!downloaded) {
          throw new AdminRepositoryError(
            `Output object ${output.objectCode} was not revalidated from its downloadUrl.`,
            400,
          );
        }
        if (
          downloaded.downloadUrl !== downloadUrl ||
          downloaded.objectType !== output.objectType ||
          cleanString(objectData.content_sha256) !== downloaded.contentSha256 ||
          Number(objectData.content_size_bytes) !== downloaded.contentSizeBytes
        ) {
          throw new AdminRepositoryError(
            `Output object ${output.objectCode} download content changed after it was attached.`,
            409,
          );
        }
        assertDownloadedOutputMatchesFrozenSlot(
          downloaded,
          promisedOutput,
          offer,
          document,
        );
      }
      if (promisedOutput.mutationMode === "new_revision") {
        assertNewRevisionDelivery(
          document,
          output,
          promisedOutput,
          objectData,
        );
      }
    }),
  );
}

function toOfferRecord(id: string, data: Record<string, unknown>) {
  rejectForbiddenKeys(data, FORBIDDEN_OFFER_ROOT_KEYS, "Stored service offer");
  if (
    !Number.isInteger(data.serviceVersion) ||
    Number(data.serviceVersion) < 1 ||
    !cleanString(data.status) ||
    !Array.isArray(data.stages) ||
    data.stages.length === 0 ||
    !Array.isArray(data.outputSlots) ||
    (data.inputSlots !== undefined && !Array.isArray(data.inputSlots)) ||
    (data.acceptedConditions !== undefined &&
      !Array.isArray(data.acceptedConditions)) ||
    (data.scopeRules !== undefined && !Array.isArray(data.scopeRules))
  ) {
    throw new AdminRepositoryError(
      "Stored service offer is missing required canonical contract fields.",
      400,
    );
  }
  const serviceId = cleanString(data.serviceId);
  const providerId = cleanString(data.providerId);
  const providerName = cleanString(data.providerName);
  const name = cleanString(data.name);
  const inputSlots = normalizeOfferInputSlots(data.inputSlots);
  const outputSlots = normalizeOfferOutputSlots(data.outputSlots);
  const serviceCategory = cleanString(data.serviceCategory);

  const record = {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    serviceId,
    serviceVersion: versionNumber(data.serviceVersion),
    name,
    serviceCategory,
    providerKind: normalizeProviderKind(data.providerKind, true),
    providerId,
    providerName,
    stages: normalizeStages(data.stages),
    status: normalizeOfferStatus(data.status, true),
    isHiddenFromSearch: booleanValue(data.isHiddenFromSearch, true),
    description: cleanString(data.description),
    shortContract: supportServiceShortContract({ inputSlots, outputSlots }),
    providerWork: cleanString(data.providerWork),
    formShape: normalizeFormShape(data.formShape),
    inputSlots,
    outputSlots,
    acceptedConditions: cleanStringArray(data.acceptedConditions),
    scopeRules: cleanStringArray(data.scopeRules),
    commercialTerms: normalizeCommercialTerms(data.commercialTerms),
    normalizedName:
      cleanString(data.normalizedName) ||
      normalizeName(
        `${name} ${serviceId} ${serviceCategory} ${providerId} ${providerName}`,
      ),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: cleanString(data.createdByEmail),
    updatedByEmail: cleanString(data.updatedByEmail),
    complianceWarnings: [],
  } satisfies SupportServiceOfferRecord;
  validateOfferDocument(offerDocument(record));
  return record;
}

function pushComplianceWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function offerAdminSlots<T>(
  label: string,
  value: unknown,
  normalize: (value: unknown) => T[],
  warnings: string[],
) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    pushComplianceWarning(
      warnings,
      `${label} must be an array; it is shown as empty.`,
    );
    return [];
  }

  const slots: T[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      pushComplianceWarning(
        warnings,
        `${label} entry ${index + 1} must be an object and was omitted.`,
      );
      return;
    }
    try {
      const normalized = normalize([item]);
      if (
        normalized.length !== 1 ||
        stableString(item) !== stableString(normalized[0])
      ) {
        pushComplianceWarning(
          warnings,
          `${label} entry ${index + 1} is not canonical; normalized values are shown for review and must be saved to remediate the stored contract.`,
        );
      }
      slots.push(...normalized);
    } catch (error) {
      pushComplianceWarning(
        warnings,
        error instanceof Error
          ? `${label} entry ${index + 1}: ${error.message}`
          : `${label} entry ${index + 1} is malformed and was omitted.`,
      );
    }
  });
  return slots;
}

function offerAdminStringArray(
  label: string,
  value: unknown,
  warnings: string[],
) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    pushComplianceWarning(
      warnings,
      `${label} must be an array; it is shown as empty.`,
    );
    return [];
  }
  if (
    value.some(
      (item) => typeof item !== "string" || item.trim().length === 0,
    )
  ) {
    pushComplianceWarning(
      warnings,
      `${label} contains non-string or empty entries; invalid entries were omitted.`,
    );
  }
  return cleanStringArray(value);
}

function toOfferAdminRecord(
  id: string,
  data: Record<string, unknown>,
) {
  const complianceWarnings: string[] = [];
  const forbiddenKeys = FORBIDDEN_OFFER_ROOT_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(data, key),
  );
  if (forbiddenKeys.length > 0) {
    pushComplianceWarning(
      complianceWarnings,
      `Stored service offer uses forbidden snake-case fields: ${forbiddenKeys.join(", ")}. Save the corrected offer with canonical camel-case fields.`,
    );
  }

  for (const [key, label] of [
    ["serviceId", "serviceId"],
    ["name", "name"],
    ["providerId", "providerId"],
    ["providerName", "providerName"],
    ["description", "description"],
    ["providerWork", "providerWork"],
  ] as const) {
    if (!cleanString(data[key])) {
      pushComplianceWarning(complianceWarnings, `${label} is missing.`);
    }
  }

  const serviceVersionIsValid =
    typeof data.serviceVersion === "number" &&
    Number.isInteger(data.serviceVersion) &&
    data.serviceVersion > 0;
  if (!serviceVersionIsValid) {
    pushComplianceWarning(
      complianceWarnings,
      "serviceVersion is missing or invalid; it is shown as version 1.",
    );
  }
  if (!PROVIDER_KIND_SET.has(normalizeKey(cleanString(data.providerKind)))) {
    pushComplianceWarning(
      complianceWarnings,
      `providerKind ${cleanString(data.providerKind) || "is missing"}; it is shown as organization.`,
    );
  }
  if (!OFFER_STATUS_SET.has(normalizeKey(cleanString(data.status)))) {
    pushComplianceWarning(
      complianceWarnings,
      `status ${cleanString(data.status) || "is missing"}; it is shown as draft.`,
    );
  }
  if (typeof data.isHiddenFromSearch !== "boolean") {
    pushComplianceWarning(
      complianceWarnings,
      "isHiddenFromSearch is missing or invalid; it is shown as false.",
    );
  }

  const canonicalStages = Array.isArray(data.stages)
    ? data.stages.map(normalizeStage).filter(Boolean)
    : [];
  if (
    !Array.isArray(data.stages) ||
    data.stages.length === 0 ||
    canonicalStages.length !== data.stages.length
  ) {
    pushComplianceWarning(
      complianceWarnings,
      "stages is missing or contains unsupported values; only canonical stages are shown.",
    );
  }

  let formShape: ReturnType<typeof normalizeFormShape>;
  if (data.formShape !== undefined) {
    try {
      formShape = normalizeFormShape(data.formShape);
    } catch (error) {
      pushComplianceWarning(
        complianceWarnings,
        error instanceof Error
          ? `formShape: ${error.message}`
          : "formShape is malformed and was omitted.",
      );
      formShape = undefined;
    }
  }

  const inputSlots = offerAdminSlots(
    "inputSlots",
    data.inputSlots,
    normalizeOfferInputSlots,
    complianceWarnings,
  );
  const outputSlots = offerAdminSlots(
    "outputSlots",
    data.outputSlots,
    normalizeOfferOutputSlots,
    complianceWarnings,
  );
  if (!Array.isArray(data.outputSlots)) {
    pushComplianceWarning(
      complianceWarnings,
      "outputSlots is missing or malformed.",
    );
  }

  let commercialTerms: ReturnType<typeof normalizeCommercialTerms>;
  if (data.commercialTerms !== undefined) {
    if (
      !data.commercialTerms ||
      typeof data.commercialTerms !== "object" ||
      Array.isArray(data.commercialTerms)
    ) {
      pushComplianceWarning(
        complianceWarnings,
        "commercialTerms must be an object and was omitted.",
      );
    } else {
      try {
        commercialTerms = normalizeCommercialTerms(data.commercialTerms);
      } catch (error) {
        pushComplianceWarning(
          complianceWarnings,
          error instanceof Error
            ? `commercialTerms: ${error.message}`
            : "commercialTerms is malformed and was omitted.",
        );
      }
    }
  }

  const serviceId = cleanString(data.serviceId);
  const providerId = cleanString(data.providerId);
  const providerName = cleanString(data.providerName);
  const name = cleanString(data.name);
  const serviceCategory = cleanString(data.serviceCategory);
  const createdAt = timestampToIso(data.createdAt);
  const updatedAt = timestampToIso(data.updatedAt);
  if (!createdAt) {
    pushComplianceWarning(
      complianceWarnings,
      "createdAt is missing or invalid; save the offer to normalize it.",
    );
  }
  if (!updatedAt) {
    pushComplianceWarning(
      complianceWarnings,
      "updatedAt is missing or invalid; this record is listed by document ID.",
    );
  }

  const record = withoutUndefined({
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    serviceId,
    serviceVersion: serviceVersionIsValid
      ? Number(data.serviceVersion)
      : 1,
    name,
    serviceCategory,
    providerKind: normalizeProviderKind(data.providerKind),
    providerId,
    providerName,
    stages: normalizeStages(canonicalStages),
    status: normalizeOfferStatus(data.status),
    isHiddenFromSearch:
      typeof data.isHiddenFromSearch === "boolean"
        ? data.isHiddenFromSearch
        : false,
    description: cleanString(data.description),
    shortContract: supportServiceShortContract({ inputSlots, outputSlots }),
    providerWork: cleanString(data.providerWork),
    formShape,
    inputSlots,
    outputSlots,
    acceptedConditions: offerAdminStringArray(
      "acceptedConditions",
      data.acceptedConditions,
      complianceWarnings,
    ),
    scopeRules: offerAdminStringArray(
      "scopeRules",
      data.scopeRules,
      complianceWarnings,
    ),
    commercialTerms,
    normalizedName:
      cleanString(data.normalizedName) ||
      normalizeName(
        `${id} ${name} ${serviceId} ${serviceCategory} ${providerId} ${providerName}`,
      ),
    createdAt,
    updatedAt,
    createdByEmail: cleanString(data.createdByEmail),
    updatedByEmail: cleanString(data.updatedByEmail),
    complianceWarnings,
  }) satisfies SupportServiceOfferRecord;

  try {
    validateOfferDocument(offerDocument(record));
  } catch (error) {
    pushComplianceWarning(
      complianceWarnings,
      error instanceof Error
        ? `Contract validation: ${error.message}`
        : "Contract validation failed.",
    );
  }

  return record;
}

function toTransactionRecord(id: string, data: Record<string, unknown>) {
  rejectForbiddenKeys(
    data,
    FORBIDDEN_STORED_TRANSACTION_ROOT_KEYS,
    "Stored service transaction",
  );
  const requestId = cleanString(data.requestId);
  const serviceId = cleanString(data.serviceId);
  const requestedByUserId = cleanString(data.requestedByUserId);
  const requestedByUserEmail = cleanString(
    data.requestedByUserEmail,
  ).toLowerCase();

  return withoutUndefined({
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    requestId,
    offerId: cleanString(data.offerId),
    serviceId,
    serviceVersion: versionNumber(data.serviceVersion),
    providerId: cleanString(data.providerId),
    providerKind: normalizeProviderKind(data.providerKind, true),
    status: normalizeTransactionStatus(data.status, true),
    requestedByUserId,
    requestedByUserEmail: requestedByUserEmail || undefined,
    requestedAt: timestampToIso(data.requestedAt),
    requestedAtClient: timestampToIso(data.requestedAtClient),
    requestRevision: versionNumber(data.requestRevision),
    idempotencyKey: cleanString(data.idempotencyKey),
    inputs: inputSlotsFromUnknown(data.inputs),
    outputObjects: outputObjectsFromUnknown(data.outputObjects),
    outputReports: outputReportsFromUnknown(data.outputReports),
    missingRequiredInputRoles: cleanStringArray(data.missingRequiredInputRoles),
    issues: unknownArray(data.issues),
    offerSnapshot: optionalRecord(data.offerSnapshot),
    providerSnapshot: optionalRecord(data.providerSnapshot),
    contractSource: cleanString(data.contractSource),
    attachmentsPending: strictBoolean(
      data.attachmentsPending,
      "attachmentsPending",
    ),
    normalizedName:
      cleanString(data.normalizedName) ||
      normalizeName(
        `${requestId} ${serviceId} ${requestedByUserId} ${requestedByUserEmail}`,
      ),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: cleanString(data.createdByEmail),
    updatedByEmail: cleanString(data.updatedByEmail),
    complianceWarnings: [],
  }) satisfies SupportServiceTransactionRecord;
}

function transactionAdminArray<T>(
  label: string,
  parser: (value: unknown) => T[],
  value: unknown,
  warnings: string[],
) {
  if (value !== undefined && !Array.isArray(value)) {
    warnings.push(`${label} must be an array; it is shown as empty.`);
    return [];
  }
  try {
    return parser(value);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `${label}: ${error.message}`
        : `${label} is malformed; it is shown as empty.`,
    );
    return [];
  }
}

function toTransactionAdminRecord(
  id: string,
  data: Record<string, unknown>,
): SupportServiceTransactionRecord {
  const complianceWarnings: string[] = [];
  const requestId = cleanString(data.requestId) || id;
  const serviceId = cleanString(data.serviceId);
  const requestedByUserId = cleanString(data.requestedByUserId);
  const requestedByUserEmail = cleanString(
    data.requestedByUserEmail,
  ).toLowerCase();

  for (const [key, label] of [
    ["requestId", "requestId"],
    ["offerId", "offerId"],
    ["serviceId", "serviceId"],
    ["providerId", "providerId"],
    ["requestedByUserId", "requestedByUserId"],
    ["idempotencyKey", "idempotencyKey"],
    ["contractSource", "contractSource"],
  ] as const) {
    if (!cleanString(data[key])) {
      complianceWarnings.push(`${label} is missing.`);
    }
  }
  if (!PROVIDER_KIND_SET.has(normalizeKey(cleanString(data.providerKind)))) {
    complianceWarnings.push(
      `providerKind ${cleanString(data.providerKind) || "is missing"}; it is shown as organization.`,
    );
  }
  if (!TRANSACTION_STATUS_SET.has(normalizeKey(cleanString(data.status)))) {
    complianceWarnings.push(
      `status ${cleanString(data.status) || "is missing"}; it is shown as received.`,
    );
  }
  if (!Object.keys(optionalRecord(data.offerSnapshot)).length) {
    complianceWarnings.push("offerSnapshot is missing or malformed.");
  }
  if (!Object.keys(optionalRecord(data.providerSnapshot)).length) {
    complianceWarnings.push("providerSnapshot is missing or malformed.");
  }
  if (Object.prototype.hasOwnProperty.call(data, "output_objects")) {
    complianceWarnings.push(
      "Obsolete output_objects was ignored; save the transaction to normalize it.",
    );
  }
  if (Object.prototype.hasOwnProperty.call(data, "output_reports")) {
    complianceWarnings.push(
      "Obsolete output_reports was ignored; save the transaction to normalize it.",
    );
  }
  const updatedAt = timestampToIso(data.updatedAt);
  if (!updatedAt) {
    complianceWarnings.push(
      "updatedAt is missing or invalid; this record is listed by document ID.",
    );
  }
  const inputs = transactionAdminArray(
    "inputs",
    inputSlotsFromUnknown,
    data.inputs,
    complianceWarnings,
  );
  for (const input of inputs) {
    try {
      assertCamelCaseSnapshotValue(
        input.objectSnapshot,
        `Input ${input.role} objectSnapshot`,
      );
    } catch (error) {
      pushComplianceWarning(
        complianceWarnings,
        `Input ${input.role} has a noncanonical frozen objectSnapshot (${error instanceof Error ? error.message : "invalid field keys"}). It is preserved as read-only evidence; saving other fields will not rewrite it.`,
      );
    }
  }

  // God mode lists the root collection itself. A malformed or historical
  // detail snapshot must not hide that root transaction from administrators.
  // These are not compatibility aliases: only canonical camel-case fields are
  // read, and malformed optional arrays are represented as empty arrays.
  return withoutUndefined({
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    requestId,
    offerId: cleanString(data.offerId),
    serviceId,
    serviceVersion: versionNumber(data.serviceVersion),
    providerId: cleanString(data.providerId),
    providerKind: normalizeProviderKind(data.providerKind),
    status: normalizeTransactionStatus(data.status),
    requestedByUserId,
    requestedByUserEmail: requestedByUserEmail || undefined,
    requestedAt: timestampToIso(data.requestedAt),
    requestedAtClient: timestampToIso(data.requestedAtClient),
    requestRevision: versionNumber(data.requestRevision),
    idempotencyKey: cleanString(data.idempotencyKey),
    inputs,
    outputObjects: transactionAdminArray(
      "outputObjects",
      outputObjectsFromUnknown,
      data.outputObjects,
      complianceWarnings,
    ),
    outputReports: transactionAdminArray(
      "outputReports",
      outputReportsFromUnknown,
      data.outputReports,
      complianceWarnings,
    ),
    missingRequiredInputRoles: cleanStringArray(data.missingRequiredInputRoles),
    issues: unknownArray(data.issues),
    offerSnapshot: optionalRecord(data.offerSnapshot),
    providerSnapshot: optionalRecord(data.providerSnapshot),
    contractSource: cleanString(data.contractSource),
    attachmentsPending:
      typeof data.attachmentsPending === "boolean"
        ? data.attachmentsPending
        : false,
    normalizedName:
      cleanString(data.normalizedName) ||
      normalizeName(
        `${requestId} ${serviceId} ${requestedByUserId} ${requestedByUserEmail}`,
      ),
    createdAt: timestampToIso(data.createdAt),
    updatedAt,
    createdByEmail: cleanString(data.createdByEmail),
    updatedByEmail: cleanString(data.updatedByEmail),
    complianceWarnings,
  }) satisfies SupportServiceTransactionRecord;
}

function matchesTextSearch(record: { normalizedName: string }, query?: string) {
  const normalizedQuery = normalizeName(cleanString(query));
  if (!normalizedQuery) {
    return true;
  }

  return record.normalizedName.includes(normalizedQuery);
}

function matchesOfferFilters(
  offer: SupportServiceOfferRecord,
  options: OfferListOptions,
) {
  const status = normalizeKey(cleanString(options.status));
  const stage = normalizeKey(cleanString(options.stage));
  const serviceId = cleanString(options.serviceId);

  return (
    matchesTextSearch(offer, options.query) &&
    (!status || status === "all" || offer.status === status) &&
    (!serviceId || offer.serviceId === serviceId) &&
    (!stage ||
      stage === "all" ||
      offer.stages.includes(stage as SupportServiceStage))
  );
}

function matchesTransactionFilters(
  transaction: SupportServiceTransactionRecord,
  options: TransactionListOptions,
) {
  const status = normalizeKey(cleanString(options.status));
  const serviceId = cleanString(options.serviceId);

  return (
    matchesTextSearch(transaction, options.query) &&
    (!status || status === "all" || transaction.status === status) &&
    (!serviceId || transaction.serviceId === serviceId)
  );
}

async function listWithFilters<TRecord>({
  collectionName,
  cursor,
  limit,
  hasFilters,
  toRecord,
  matches,
}: {
  collectionName: string;
  cursor?: string;
  limit: number;
  hasFilters: boolean;
  toRecord: (id: string, data: Record<string, unknown>) => TRecord;
  matches: (record: TRecord) => boolean;
}): Promise<{ records: TRecord[]; nextCursor?: string }> {
  const parsedCursor = parseListCursor(cursor);
  const baseQuery = adminDb
    .collection(collectionName)
    .orderBy(FieldPath.documentId(), "asc");
  let query: Query = baseQuery;

  if (parsedCursor) {
    query = query.startAfter(parsedCursor.id);
  }

  if (!hasFilters) {
    const snapshot = await query.limit(limit + 1).get();
    const visibleDocs = snapshot.docs.slice(0, limit);
    const records = visibleDocs.map((doc) =>
      toRecord(doc.id, doc.data() ?? {}),
    );
    const lastVisible = visibleDocs[visibleDocs.length - 1];
    const nextCursor =
      snapshot.docs.length > limit && lastVisible
        ? serviceListCursor(lastVisible)
        : undefined;

    return { records, nextCursor };
  }

  const records: TRecord[] = [];
  let pageCursor = parsedCursor;
  let scannedDocs = 0;
  let nextCursor: string | undefined;

  while (records.length < limit && scannedDocs < MAX_FILTERED_SCAN) {
    const batchLimit = Math.min(
      FILTERED_BATCH_LIMIT,
      MAX_FILTERED_SCAN - scannedDocs,
    );
    let batchQuery: Query = baseQuery;

    if (pageCursor) {
      batchQuery = batchQuery.startAfter(pageCursor.id);
    }

    const snapshot = await batchQuery.limit(batchLimit).get();
    if (snapshot.empty) {
      nextCursor = undefined;
      break;
    }

    let lastConsumedDoc: QueryDocumentSnapshot | undefined;

    for (const doc of snapshot.docs) {
      lastConsumedDoc = doc;
      scannedDocs += 1;

      const record = toRecord(doc.id, doc.data() ?? {});
      if (matches(record)) {
        records.push(record);
        if (records.length >= limit) {
          break;
        }
      }

      if (scannedDocs >= MAX_FILTERED_SCAN) {
        break;
      }
    }

    if (!lastConsumedDoc) {
      nextCursor = undefined;
      break;
    }

    nextCursor = serviceListCursor(lastConsumedDoc);
    const lastSnapshotDoc = snapshot.docs[snapshot.docs.length - 1];
    const consumedWholeBatch =
      lastSnapshotDoc && lastConsumedDoc.id === lastSnapshotDoc.id;

    if (!consumedWholeBatch) {
      break;
    }
    if (snapshot.docs.length < batchLimit) {
      nextCursor = undefined;
      break;
    }

    pageCursor = { id: lastConsumedDoc.id };
  }

  return { records, nextCursor };
}

async function getOfferSnapshot(offerId: string) {
  const snapshot = await adminDb
    .collection(SERVICE_OFFERS_COLLECTION)
    .doc(offerId)
    .get();
  return snapshot.exists ? snapshot : null;
}

async function getTransactionSnapshot(transactionId: string) {
  const snapshot = await adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .doc(transactionId)
    .get();
  return snapshot.exists ? snapshot : null;
}

async function getTransactionSnapshotByIdOrRequestId(transactionId: string) {
  const snapshot = await getTransactionSnapshot(transactionId);
  if (snapshot) {
    return snapshot;
  }

  const requestSnapshot = await adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .where("requestId", "==", transactionId)
    .limit(1)
    .get();

  return requestSnapshot.docs[0] ?? null;
}

async function assertOfferProviderExists(
  document: Pick<
    SupportServiceOfferRecord | ReturnType<typeof offerDocument>,
    "providerKind" | "providerId"
  >,
) {
  const collectionName =
    document.providerKind === "individual"
      ? FEED_INDIVIDUALS_COLLECTION
      : FEED_ORGANIZATIONS_COLLECTION;
  const snapshot = await adminDb
    .collection(collectionName)
    .doc(document.providerId)
    .get();

  if (!snapshot.exists) {
    throw new AdminRepositoryError(
      `Provider must reference an existing ${
        document.providerKind === "individual"
          ? "feed_individuals"
          : "feed_organizations"
      } document.`,
      400,
    );
  }
  const providerData = snapshot.data() ?? {};
  if (normalizeKey(cleanString(providerData.status)) !== "active") {
    throw new AdminRepositoryError(
      "Selected Discover provider must be active.",
      400,
    );
  }

  return providerData;
}

function applyAuthoritativeOfferProviderName(
  document: SupportServiceOfferDocument,
  providerData: Record<string, unknown>,
): SupportServiceOfferDocument {
  const providerName =
    cleanString(providerData.name) || cleanString(providerData.title);
  if (!providerName) {
    throw new AdminRepositoryError(
      "Selected Discover provider must have a display name.",
      400,
    );
  }
  return {
    ...document,
    providerName,
    normalizedName: normalizeName(
      `${document.name} ${document.serviceId} ${document.serviceCategory} ${document.providerId} ${providerName}`,
    ),
  };
}

function applyFrozenTransactionOfferContract(
  document: SupportServiceTransactionDocument,
  offer: SupportServiceOfferRecord,
): SupportServiceTransactionDocument {
  const suppliedInputRoles = new Set(document.inputs.map((slot) => slot.role));
  const missingRequiredInputRoles = offer.inputSlots
    .filter((slot) => Boolean(slot.required))
    .map((slot) => cleanString(slot.role))
    .filter((role) => role && !suppliedInputRoles.has(role));

  return {
    ...document,
    offerId: offer.id,
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    providerId: offer.providerId,
    providerKind: offer.providerKind,
    missingRequiredInputRoles,
    attachmentsPending: missingRequiredInputRoles.length > 0,
  };
}

function transactionCreationFingerprint(
  transaction: Pick<
    SupportServiceTransactionRecord,
    | "requestId"
    | "offerId"
    | "serviceId"
    | "serviceVersion"
    | "providerId"
    | "providerKind"
    | "requestedByUserId"
    | "requestedByUserEmail"
    | "requestedAtClient"
    | "idempotencyKey"
    | "inputs"
    | "contractSource"
  >,
) {
  return stableString({
    requestId: transaction.requestId,
    offerId: transaction.offerId,
    serviceId: transaction.serviceId,
    serviceVersion: transaction.serviceVersion,
    providerId: transaction.providerId,
    providerKind: transaction.providerKind,
    requestedByUserId: transaction.requestedByUserId,
    requestedByUserEmail: transaction.requestedByUserEmail || undefined,
    requestedAtClient: transaction.requestedAtClient,
    idempotencyKey: transaction.idempotencyKey,
    inputs: transaction.inputs,
    contractSource: transaction.contractSource,
  });
}

function attemptedCreationFingerprint(
  input: SupportServiceTransactionInput,
  offer: SupportServiceOfferRecord,
) {
  return stableString({
    requestId: cleanString(input.requestId),
    offerId: cleanString(input.offerId),
    serviceId: cleanString(input.serviceId) || offer.serviceId,
    serviceVersion:
      input.serviceVersion === undefined
        ? offer.serviceVersion
        : versionNumber(input.serviceVersion),
    providerId: cleanString(input.providerId) || offer.providerId,
    providerKind: input.providerKind ?? offer.providerKind,
    requestedByUserId: cleanString(input.requestedByUserId),
    requestedByUserEmail:
      cleanString(input.requestedByUserEmail).toLowerCase() || undefined,
    requestedAtClient: dateFromUnknown(
      input.requestedAtClient,
      "requestedAtClient",
      true,
    )?.toISOString(),
    idempotencyKey: cleanString(input.idempotencyKey),
    inputs: inputSlotsFromUnknown(input.inputs, true),
    contractSource: cleanString(input.contractSource),
  });
}

async function findLegacyTransactionByIdempotencyKey(
  idempotencyKey: string,
) {
  const snapshot = await adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .where("idempotencyKey", "==", idempotencyKey)
    .limit(2)
    .get();
  if (snapshot.docs.length > 1) {
    throw new AdminRepositoryError(
      "Idempotency key resolves to multiple service transactions.",
      409,
    );
  }
  return snapshot.docs[0] ?? null;
}

function idempotencyClaimId(idempotencyKey: string) {
  return createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
}

function policyInteger(
  value: unknown,
  fallback: number,
  minimum: number,
) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum
    ? value
    : fallback;
}

function aggregateCount(snapshot: unknown) {
  const data =
    snapshot &&
    typeof snapshot === "object" &&
    "data" in snapshot &&
    typeof (snapshot as { data?: unknown }).data === "function"
      ? (snapshot as { data: () => unknown }).data()
      : {};
  const count = numericValue(optionalRecord(data).count, 0);
  return Math.max(0, Math.trunc(count));
}

async function assertServiceTransactionAdmission(
  firestoreTransaction: Transaction,
  requestedByUserId: string,
  now: Date,
  userData: Record<string, unknown>,
) {
  const tokenStatus = optionalRecord(userData.token_status);
  const totalLimit = policyInteger(
    tokenStatus.total_transaction_limit,
    20,
    0,
  );
  const dailyLimit = policyInteger(
    tokenStatus.daily_transaction_limit,
    5,
    1,
  );
  const cooldownSeconds = policyInteger(
    tokenStatus.cooldown_seconds,
    300,
    0,
  );
  const startOfUtcDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const rootTransactions = adminDb.collection(
    SERVICE_TRANSACTIONS_COLLECTION,
  );
  const requesterTransactions = rootTransactions
    .where("requestedByUserId", "==", requestedByUserId)
    .where("requestedAt", "<=", now);
  const [totalSnapshot, dailySnapshot, latestSnapshot] = await Promise.all([
    firestoreTransaction.get(requesterTransactions.count()),
    firestoreTransaction.get(
      requesterTransactions
        .where("requestedAt", ">=", startOfUtcDay)
        .count(),
    ),
    firestoreTransaction.get(
      requesterTransactions.orderBy("requestedAt", "desc").limit(1),
    ),
  ]);
  const totalUsed = aggregateCount(totalSnapshot);
  const dailyUsed = aggregateCount(dailySnapshot);
  if (totalUsed >= totalLimit) {
    throw new AdminRepositoryError(
      "token_balance_exhausted: requester has reached the total service transaction limit.",
      429,
    );
  }

  const latestRequestedAt = dateFromUnknown(
    latestSnapshot.docs[0]?.data()?.requestedAt,
    "requestedAt",
  );
  const cooldownDeadline = latestRequestedAt
    ? new Date(latestRequestedAt.getTime() + cooldownSeconds * 1000)
    : undefined;
  const dailyBlocked = dailyUsed >= dailyLimit;
  const cooldownBlocked = Boolean(
    cooldownDeadline && cooldownDeadline.getTime() > now.getTime(),
  );
  if (dailyBlocked || cooldownBlocked) {
    const nextUtcDay = new Date(startOfUtcDay.getTime() + 86_400_000);
    const nextAllowedAt = new Date(
      Math.max(
        dailyBlocked ? nextUtcDay.getTime() : 0,
        cooldownBlocked ? cooldownDeadline!.getTime() : 0,
      ),
    );
    throw new AdminRepositoryError(
      `${dailyBlocked ? "token_daily_limit_reached" : "token_cooldown_active"}: next request is allowed after ${nextAllowedAt.toISOString()}.`,
      429,
    );
  }
}

function transactionSummary(
  document: SupportServiceTransactionDocument,
  offer: SupportServiceOfferRecord,
  providerSnapshot: Record<string, unknown>,
  requestedAt: Date,
) {
  return withoutUndefined({
    serviceTransactionId: document.requestId,
    offerId: document.offerId,
    serviceName: offer.name,
    providerName: cleanString(providerSnapshot.name),
    providerKind: document.providerKind,
    providerImageUrl: cleanString(providerSnapshot.imageUrl) || undefined,
    status: document.status,
    deliveryMode:
      cleanString(document.offerSnapshot.deliveryMode) || undefined,
    requestedAt,
    serviceId: document.serviceId,
    serviceVersion: document.serviceVersion,
    stages: offer.stages,
    formShapeId: cleanString(offer.formShape?.id) || undefined,
  });
}

function replaceTransactionSummaryStatus(
  summaries: unknown[],
  requestId: string,
  status: SupportServiceTransactionStatus,
) {
  let found = false;
  const updated = summaries.map((summary) => {
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      return summary;
    }
    const record = summary as Record<string, unknown>;
    if (cleanString(record.serviceTransactionId) !== requestId) {
      return summary;
    }
    found = true;
    return { ...record, status };
  });
  return { found, updated };
}

function rejectImmutableTransactionChanges(
  input: SupportServiceTransactionInput,
  previous: SupportServiceTransactionRecord,
) {
  const stringChecks: Array<[unknown, string, string]> = [
    [input.requestId, previous.requestId, "requestId"],
    [input.offerId, previous.offerId, "offerId"],
    [input.serviceId, previous.serviceId, "serviceId"],
    [input.providerId, previous.providerId, "providerId"],
    [input.requestedByUserId, previous.requestedByUserId, "requestedByUserId"],
    [input.idempotencyKey, previous.idempotencyKey, "idempotencyKey"],
    [input.contractSource, previous.contractSource, "contractSource"],
  ];
  for (const [supplied, expected, label] of stringChecks) {
    if (supplied !== undefined && cleanString(supplied) !== expected) {
      throw new AdminRepositoryError(
        `${label} is immutable after transaction creation.`,
        409,
      );
    }
  }
  if (
    input.serviceVersion !== undefined &&
    versionNumber(input.serviceVersion) !== previous.serviceVersion
  ) {
    throw new AdminRepositoryError(
      "serviceVersion is immutable after transaction creation.",
      409,
    );
  }
  if (
    input.providerKind !== undefined &&
    input.providerKind !== previous.providerKind
  ) {
    throw new AdminRepositoryError(
      "providerKind is immutable after transaction creation.",
      409,
    );
  }
  if (
    input.requestedByUserEmail !== undefined &&
    cleanString(input.requestedByUserEmail).toLowerCase() !==
      (previous.requestedByUserEmail ?? "")
  ) {
    throw new AdminRepositoryError(
      "requestedByUserEmail is immutable after transaction creation.",
      409,
    );
  }
  for (const [supplied, expected, label] of [
    [input.requestedAt, previous.requestedAt, "requestedAt"],
    [input.requestedAtClient, previous.requestedAtClient, "requestedAtClient"],
  ] as const) {
    if (
      supplied !== undefined &&
      dateFromUnknown(supplied, label, true)?.toISOString() !== expected
    ) {
      throw new AdminRepositoryError(
        `${label} is immutable after transaction creation.`,
        409,
      );
    }
  }
  if (
    input.requestRevision !== undefined &&
    input.requestRevision !== previous.requestRevision
  ) {
    throw new AdminRepositoryError(
      "requestRevision is stale or invalid.",
      409,
    );
  }
  if (
    input.offerSnapshot !== undefined &&
    stableString(input.offerSnapshot) !== stableString(previous.offerSnapshot)
  ) {
    throw new AdminRepositoryError(
      "offerSnapshot is immutable after transaction creation.",
      409,
    );
  }
  if (
    input.providerSnapshot !== undefined &&
    stableString(input.providerSnapshot) !==
      stableString(previous.providerSnapshot)
  ) {
    throw new AdminRepositoryError(
      "providerSnapshot is immutable after transaction creation.",
      409,
    );
  }
  if (input.inputs !== undefined) {
    const nextInputs = inputSlotsFromUnknown(input.inputs, true);
    const nextInputsByRole = new Map(
      nextInputs.map((slot) => [slot.role, slot]),
    );
    const previousInputsByRole = new Map(
      previous.inputs.map((slot) => [slot.role, slot]),
    );
    for (const previousInput of previous.inputs) {
      if (
        stableString(nextInputsByRole.get(previousInput.role)) !==
        stableString(previousInput)
      ) {
        throw new AdminRepositoryError(
          `Bound transaction input ${previousInput.role} is immutable after transaction creation.`,
          409,
        );
      }
    }
    const unresolvedRoles = new Set(previous.missingRequiredInputRoles);
    for (const nextInput of nextInputs) {
      if (
        !previousInputsByRole.has(nextInput.role) &&
        !unresolvedRoles.has(nextInput.role)
      ) {
        throw new AdminRepositoryError(
          `Transaction input ${nextInput.role} was not unresolved at creation time.`,
          409,
        );
      }
    }
  }
}

export async function listSupportServiceOffers(
  context: AdminContext,
  options: OfferListOptions = {},
): Promise<SupportServiceOffersPage> {
  requireGodMode(context);

  const limit = normalizeLimit(options.limit);
  const hasFilters = Boolean(
    cleanString(options.query) ||
      (cleanString(options.status) && cleanString(options.status) !== "all") ||
      cleanString(options.serviceId) ||
      (cleanString(options.stage) && cleanString(options.stage) !== "all"),
  );
  const result = await listWithFilters({
    collectionName: SERVICE_OFFERS_COLLECTION,
    cursor: options.cursor,
    limit,
    hasFilters,
    toRecord: toOfferAdminRecord,
    matches: (record) => matchesOfferFilters(record, options),
  });

  return { offers: result.records, nextCursor: result.nextCursor };
}

export async function getSupportServiceOffer(
  context: AdminContext,
  offerId: string,
) {
  requireGodMode(context);
  const snapshot = await getOfferSnapshot(offerId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service offer not found.", 404);
  }

  return toOfferAdminRecord(offerId, snapshot.data() ?? {});
}

export async function createSupportServiceOffer(
  context: AdminContext,
  input: SupportServiceOfferInput,
) {
  requireGodMode(context);
  const draft = offerDocument(input);
  const providerData = await assertOfferProviderExists(draft);
  const document = applyOfferVersions(
    applyAuthoritativeOfferProviderName(draft, providerData),
  );
  validateOfferDocument(document);

  const ref = adminDb.collection(SERVICE_OFFERS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    }),
  );

  return getSupportServiceOffer(context, ref.id);
}

export async function updateSupportServiceOffer(
  context: AdminContext,
  offerId: string,
  input: SupportServiceOfferInput,
) {
  requireGodMode(context);
  const snapshot = await getOfferSnapshot(offerId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service offer not found.", 404);
  }

  const previousDocument = offerDocument(
    toOfferAdminRecord(offerId, snapshot.data() ?? {}),
  );
  const draft = offerDocument(input);
  const providerData = await assertOfferProviderExists(draft);
  const document = applyOfferVersions(
    applyAuthoritativeOfferProviderName(draft, providerData),
    previousDocument,
  );
  validateOfferDocument(document);
  await snapshot.ref.set(
    withoutUndefined({
      ...document,
      createdAt: snapshot.data()?.createdAt ?? FieldValue.serverTimestamp(),
      createdByEmail:
        cleanString(snapshot.data()?.createdByEmail) || context.email,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    }),
  );

  return getSupportServiceOffer(context, offerId);
}

export async function deleteSupportServiceOffer(
  context: AdminContext,
  offerId: string,
) {
  requireGodMode(context);
  const snapshot = await getOfferSnapshot(offerId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service offer not found.", 404);
  }

  await snapshot.ref.delete();
}

export async function listSupportServiceTransactions(
  context: AdminContext,
  options: TransactionListOptions = {},
): Promise<SupportServiceTransactionsPage> {
  requireGodMode(context);

  const limit = normalizeLimit(options.limit);
  const hasFilters = Boolean(
    cleanString(options.query) ||
      (cleanString(options.status) && cleanString(options.status) !== "all") ||
      cleanString(options.serviceId),
  );
  const result = await listWithFilters({
    collectionName: SERVICE_TRANSACTIONS_COLLECTION,
    cursor: options.cursor,
    limit,
    hasFilters,
    toRecord: toTransactionAdminRecord,
    matches: (record) => matchesTransactionFilters(record, options),
  });

  return { transactions: result.records, nextCursor: result.nextCursor };
}

export async function getSupportServiceTransaction(
  context: AdminContext,
  transactionId: string,
) {
  requireGodMode(context);
  const snapshot = await getTransactionSnapshotByIdOrRequestId(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  return toTransactionAdminRecord(snapshot.id, snapshot.data() ?? {});
}

export async function createSupportServiceTransaction(
  context: AdminContext,
  input: SupportServiceTransactionInput,
) {
  requireGodMode(context);
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new AdminRepositoryError("Idempotency key is required.", 400);
  }
  const requestId = cleanString(input.requestId);
  const offerId = cleanString(input.offerId);
  if (!requestId || !offerId) {
    throw new AdminRepositoryError(
      "Request ID and offer ID are required.",
      400,
    );
  }
  const idempotentSnapshot = await findLegacyTransactionByIdempotencyKey(
    idempotencyKey,
  );
  if (idempotentSnapshot) {
    const existing = toTransactionRecord(
      idempotentSnapshot.id,
      idempotentSnapshot.data() ?? {},
    );
    const frozenOffer = offerFromFrozenTransaction(existing);
    if (
      attemptedCreationFingerprint(input, frozenOffer) !==
      transactionCreationFingerprint(existing)
    ) {
      throw new AdminRepositoryError(
        "Idempotency key is already bound to a different service transaction request.",
        409,
      );
    }
    const existingFingerprint = transactionCreationFingerprint(existing);
    const claimRef = adminDb
      .collection(SERVICE_TRANSACTION_IDEMPOTENCY_COLLECTION)
      .doc(idempotencyClaimId(idempotencyKey));
    await adminDb.runTransaction(async (firestoreTransaction) => {
      const [latestSnapshot, claimSnapshot] = await Promise.all([
        firestoreTransaction.get(idempotentSnapshot.ref),
        firestoreTransaction.get(claimRef),
      ]);
      if (!latestSnapshot.exists) {
        throw new AdminRepositoryError(
          "Idempotency key was already consumed by a deleted service transaction.",
          409,
        );
      }
      const latest = toTransactionRecord(
        latestSnapshot.id,
        latestSnapshot.data() ?? {},
      );
      if (
        latest.requestId !== requestId ||
        latest.idempotencyKey !== idempotencyKey ||
        transactionCreationFingerprint(latest) !== existingFingerprint
      ) {
        throw new AdminRepositoryError(
          "Idempotency key is already bound to a different service transaction request.",
          409,
        );
      }
      if (claimSnapshot.exists) {
        const claim = claimSnapshot.data() ?? {};
        if (
          cleanString(claim.idempotencyKey) !== idempotencyKey ||
          cleanString(claim.requestId) !== requestId ||
          cleanString(claim.creationFingerprint) !== existingFingerprint
        ) {
          throw new AdminRepositoryError(
            "Idempotency key is already bound to a different service transaction request.",
            409,
          );
        }
        return;
      }
      firestoreTransaction.set(claimRef, {
        idempotencyKey,
        requestId,
        creationFingerprint: existingFingerprint,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return getSupportServiceTransaction(context, existing.id);
  }

  const offerSnapshot = await getOfferSnapshot(offerId);
  if (!offerSnapshot) {
    throw new AdminRepositoryError(
      "Service transaction must reference an existing service offer.",
      400,
    );
  }
  const offer = toOfferRecord(offerSnapshot.id, offerSnapshot.data() ?? {});
  if (offer.status !== "active") {
    throw new AdminRepositoryError(
      "Only active service offers are selectable for new transactions.",
      400,
    );
  }
  for (const [supplied, expected, label] of [
    [input.serviceId, offer.serviceId, "serviceId"],
    [input.providerId, offer.providerId, "providerId"],
    [input.providerKind, offer.providerKind, "providerKind"],
  ] as const) {
    if (supplied !== undefined && cleanString(supplied) !== expected) {
      throw new AdminRepositoryError(
        `${label} does not match the selected service offer.`,
        400,
      );
    }
  }
  if (
    input.serviceVersion !== undefined &&
    versionNumber(input.serviceVersion) !== offer.serviceVersion
  ) {
    throw new AdminRepositoryError(
      "serviceVersion does not match the selected service offer.",
      400,
    );
  }
  if (normalizeTransactionStatus(input.status, true) !== "received") {
    throw new AdminRepositoryError(
      "New service transactions must start in received status.",
      400,
    );
  }
  if (
    (input.outputObjects?.length ?? 0) > 0 ||
    (input.outputReports?.length ?? 0) > 0
  ) {
    throw new AdminRepositoryError(
      "New service transactions cannot begin with delivered outputs.",
      400,
    );
  }
  const providerData = await assertOfferProviderExists(offer);
  const providerOwnerId = providerOwnerCommunityUserId(offer, providerData);
  const providerSnapshot = providerSnapshotForTransaction(
    offer,
    providerData,
  );
  const initialDocument = transactionDocument({
    ...input,
    requestId,
    offerId: offer.id,
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    providerId: offer.providerId,
    providerKind: offer.providerKind,
    status: "received",
    requestedAt: undefined,
    requestRevision: 1,
    outputObjects: [],
    outputReports: [],
    offerSnapshot: offerSnapshotForTransaction(offer),
    providerSnapshot,
  });
  const document = applyTransactionOfferContract(
    initialDocument,
    offer,
    providerSnapshot,
  );
  validateTransactionDocument(document, offer);
  const now = new Date();
  const attemptedFingerprint = attemptedCreationFingerprint(input, offer);

  const ref = adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .doc(document.requestId);
  const userRef = adminDb
    .collection(COMMUNITY_USERS_COLLECTION)
    .doc(document.requestedByUserId);
  const providerRef = adminDb
    .collection(
      document.providerKind === "individual"
        ? FEED_INDIVIDUALS_COLLECTION
        : FEED_ORGANIZATIONS_COLLECTION,
    )
    .doc(document.providerId);
  const offerRef = adminDb
    .collection(SERVICE_OFFERS_COLLECTION)
    .doc(document.offerId);
  const idempotencyRef = adminDb
    .collection(SERVICE_TRANSACTION_IDEMPOTENCY_COLLECTION)
    .doc(idempotencyClaimId(document.idempotencyKey));
  const requestIdQuery = adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .where("requestId", "==", document.requestId)
    .limit(2);
  await adminDb.runTransaction(async (firestoreTransaction) => {
    const [
      existingRoot,
      userSnapshot,
      latestOfferSnapshot,
      providerDocumentSnapshot,
      idempotencySnapshot,
      requestIdSnapshot,
    ] =
      await Promise.all([
        firestoreTransaction.get(ref),
        firestoreTransaction.get(userRef),
        firestoreTransaction.get(offerRef),
        firestoreTransaction.get(providerRef),
        firestoreTransaction.get(idempotencyRef),
        firestoreTransaction.get(requestIdQuery),
      ]);
    if (requestIdSnapshot.docs.some((candidate) => candidate.id !== ref.id)) {
      throw new AdminRepositoryError(
        "Request ID is already bound to another service transaction document.",
        409,
      );
    }
    if (idempotencySnapshot.exists) {
      const claim = idempotencySnapshot.data() ?? {};
      if (
        cleanString(claim.idempotencyKey) !== document.idempotencyKey ||
        cleanString(claim.requestId) !== document.requestId ||
        cleanString(claim.creationFingerprint) !== attemptedFingerprint
      ) {
        throw new AdminRepositoryError(
          "Idempotency key is already bound to a different service transaction request.",
          409,
        );
      }
      if (!existingRoot.exists) {
        throw new AdminRepositoryError(
          "Idempotency key was already consumed by a deleted service transaction.",
          409,
        );
      }
    }
    if (existingRoot.exists) {
      const existing = toTransactionRecord(
        existingRoot.id,
        existingRoot.data() ?? {},
      );
      if (
        existing.idempotencyKey !== document.idempotencyKey ||
        transactionCreationFingerprint(existing) !== attemptedFingerprint
      ) {
        throw new AdminRepositoryError(
          "Request ID is already bound to a different transaction payload.",
          409,
        );
      }
      if (!idempotencySnapshot.exists) {
        firestoreTransaction.set(idempotencyRef, {
          idempotencyKey: document.idempotencyKey,
          requestId: document.requestId,
          creationFingerprint: attemptedFingerprint,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }
    if (!userSnapshot.exists) {
      throw new AdminRepositoryError(
        "Requester must reference an existing community user.",
        400,
      );
    }
    if (!latestOfferSnapshot.exists) {
      throw new AdminRepositoryError(
        "Service offer no longer exists.",
        400,
      );
    }
    const latestOffer = toOfferRecord(
      latestOfferSnapshot.id,
      latestOfferSnapshot.data() ?? {},
    );
    if (
      latestOffer.status !== "active" ||
      stableString(offerSnapshotForTransaction(latestOffer)) !==
        stableString(document.offerSnapshot)
    ) {
      throw new AdminRepositoryError(
        "Service offer changed or became inactive while the request was being admitted.",
        409,
      );
    }
    if (!providerDocumentSnapshot.exists) {
      throw new AdminRepositoryError(
        "Service provider no longer exists.",
        400,
      );
    }
    const latestProviderData = providerDocumentSnapshot.data() ?? {};
    const latestProviderOwnerId = await resolveAuthoritativeProviderOwner(
      latestOffer,
      latestProviderData,
      (reference) => firestoreTransaction.get(reference),
    );
    const latestProviderSnapshot = providerSnapshotForTransaction(
      latestOffer,
      latestProviderData,
    );
    if (
      latestProviderOwnerId !== providerOwnerId ||
      stableString(latestProviderSnapshot) !== stableString(providerSnapshot)
    ) {
      throw new AdminRepositoryError(
        "Service provider identity changed while the request was being admitted.",
        409,
      );
    }
    const userData = userSnapshot.data() ?? {};
    await assertServiceTransactionAdmission(
      firestoreTransaction,
      document.requestedByUserId,
      now,
      userData,
    );
    await assertProvisionedFormInputsAvailable(
      document,
      (reference) => firestoreTransaction.get(reference),
      providerOwnerId,
    );
    const summaries = Array.isArray(userData[REQUESTED_TRANSACTIONS_FIELD])
      ? (userData[REQUESTED_TRANSACTIONS_FIELD] as unknown[])
      : [];
    if (
      summaries.some(
        (summary) =>
          cleanString(optionalRecord(summary).serviceTransactionId) ===
          document.requestId,
      )
    ) {
      throw new AdminRepositoryError(
        "Requester summary already contains this service transaction.",
        409,
      );
    }
    const providerDocumentData = providerDocumentSnapshot.data() ?? {};
    const providerSummaries = Array.isArray(
      providerDocumentData[REQUESTED_TRANSACTIONS_FIELD],
    )
      ? (providerDocumentData[REQUESTED_TRANSACTIONS_FIELD] as unknown[])
      : [];
    if (
      providerSummaries.some(
        (summary) =>
          cleanString(optionalRecord(summary).serviceTransactionId) ===
          document.requestId,
      )
    ) {
      throw new AdminRepositoryError(
        "Provider summary already contains this service transaction.",
        409,
      );
    }
    const summary = transactionSummary(
      document,
      offer,
      providerSnapshot,
      now,
    );
    firestoreTransaction.set(idempotencyRef, {
      idempotencyKey: document.idempotencyKey,
      requestId: document.requestId,
      creationFingerprint: attemptedFingerprint,
      createdAt: FieldValue.serverTimestamp(),
    });
    firestoreTransaction.set(
      ref,
      withoutUndefined({
        ...document,
        requestedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdByEmail: context.email,
        updatedByEmail: context.email,
      }),
    );
    firestoreTransaction.set(
      userRef,
      {
        [REQUESTED_TRANSACTIONS_FIELD]: [...summaries, summary],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    firestoreTransaction.set(
      providerRef,
      {
        [REQUESTED_TRANSACTIONS_FIELD]: [...providerSummaries, summary],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return getSupportServiceTransaction(context, document.requestId);
}

export async function attachSupportServiceTransactionOutputObject(
  context: AdminContext,
  transactionId: string,
  input: SupportServiceOutputObjectUploadInput,
): Promise<{
  transaction: SupportServiceTransactionRecord;
  object: SupportServiceOutputObjectUploadRecord;
}> {
  requireGodMode(context);
  const role = cleanString(input.role);
  const downloadUrl =
    "downloadUrl" in input ? cleanString(input.downloadUrl) : "";
  const fileStorageId =
    "fileStorageId" in input ? cleanString(input.fileStorageId) : "";
  if (!/^[a-z][a-z0-9_]*$/.test(role)) {
    throw new AdminRepositoryError(
      "Output role must be a lowercase identifier key.",
      400,
    );
  }
  if (Boolean(downloadUrl) === Boolean(fileStorageId)) {
    throw new AdminRepositoryError(
      "Provide exactly one output source: downloadUrl or fileStorageId.",
      400,
    );
  }
  if (
    fileStorageId &&
    (fileStorageId.length > 240 || fileStorageId.includes("/"))
  ) {
    throw new AdminRepositoryError(
      "fileStorageId must be a Firestore document ID.",
      400,
    );
  }

  const snapshot = await getTransactionSnapshotByIdOrRequestId(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }
  const previous = toTransactionRecord(snapshot.id, snapshot.data() ?? {});
  if (TERMINAL_TRANSACTION_STATUSES.has(previous.status)) {
    throw new AdminRepositoryError(
      "Terminal service transactions cannot accept output objects.",
      409,
    );
  }
  const offer = offerFromFrozenTransaction(previous);
  const promisedSlot = offer.outputSlots.find(
    (slot) => cleanString(slot.role) === role,
  );
  if (!promisedSlot) {
    throw new AdminRepositoryError(
      `Output role ${role} is not declared by the frozen service offer.`,
      400,
    );
  }
  if (previous.outputObjects.some((output) => output.role === role)) {
    throw new AdminRepositoryError(
      `Output role ${role} already has an attached object.`,
      409,
    );
  }

  const promisedObjectType = resolvedOutputObjectType(promisedSlot, offer);
  let validatedObject: ValidatedPgoObject;
  if (downloadUrl) {
    validatedObject = await downloadAndValidatePgoObject(
      downloadUrl,
      promisedObjectType,
    );
  } else {
    const fileSnapshot = await adminDb
      .collection(FILE_STORAGE_COLLECTION)
      .doc(fileStorageId)
      .get();
    if (!fileSnapshot.exists) {
      throw new AdminRepositoryError(
        `Stored file ${fileStorageId} does not exist.`,
        404,
      );
    }
    const fileData = fileSnapshot.data() ?? {};
    if (cleanString(fileData.linked_object_code)) {
      throw new AdminRepositoryError(
        `Stored file ${fileStorageId} is already linked to an uploaded object.`,
        409,
      );
    }
    if (
      cleanString(fileData.linked_report_code) ||
      cleanString(fileData.linked_report_id)
    ) {
      throw new AdminRepositoryError(
        `Stored file ${fileStorageId} is already linked to an uploaded report.`,
        409,
      );
    }
    validatedObject = validateStoredPgoObject(
      fileStorageId,
      fileData,
      promisedObjectType,
    );
    await assertStoredPgoNativeContent(validatedObject);
  }
  const providerRef = adminDb
    .collection(
      previous.providerKind === "individual"
        ? FEED_INDIVIDUALS_COLLECTION
        : FEED_ORGANIZATIONS_COLLECTION,
    )
    .doc(previous.providerId);
  const sourceFileRef = fileStorageId
    ? adminDb.collection(FILE_STORAGE_COLLECTION).doc(fileStorageId)
    : undefined;
  const sourceFileObjectBackrefQuery = sourceFileRef
    ? adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .where("linked_file_id", "==", fileStorageId)
        .limit(1)
    : undefined;
  const sourceFileReportBackrefQuery = sourceFileRef
    ? adminDb
        .collection(UPLOADED_REPORTS_COLLECTION)
        .where("linked_file_id", "==", fileStorageId)
        .limit(1)
    : undefined;
  const codeCandidates = randomObjectCodeCandidates();
  let uploadedObject: SupportServiceOutputObjectUploadRecord | undefined;

  await adminDb.runTransaction(async (firestoreTransaction) => {
    const [
      latestSnapshot,
      providerSnapshot,
      sourceFileSnapshot,
      sourceFileObjectBackrefSnapshot,
      sourceFileReportBackrefSnapshot,
    ] = await Promise.all([
      firestoreTransaction.get(snapshot.ref),
      firestoreTransaction.get(providerRef),
      sourceFileRef
        ? firestoreTransaction.get(sourceFileRef)
        : Promise.resolve(null),
      sourceFileObjectBackrefQuery
        ? firestoreTransaction.get(sourceFileObjectBackrefQuery)
        : Promise.resolve(null),
      sourceFileReportBackrefQuery
        ? firestoreTransaction.get(sourceFileReportBackrefQuery)
        : Promise.resolve(null),
    ]);
    if (!latestSnapshot.exists) {
      throw new AdminRepositoryError("Service transaction not found.", 404);
    }
    if (!providerSnapshot.exists) {
      throw new AdminRepositoryError("Service provider no longer exists.", 400);
    }
    const latest = toTransactionRecord(
      latestSnapshot.id,
      latestSnapshot.data() ?? {},
    );
    if (latest.requestRevision !== previous.requestRevision) {
      throw new AdminRepositoryError(
        "Service transaction changed while the output object was being attached.",
        409,
      );
    }
    if (TERMINAL_TRANSACTION_STATUSES.has(latest.status)) {
      throw new AdminRepositoryError(
        "Terminal service transactions cannot accept output objects.",
        409,
      );
    }
    if (latest.outputObjects.some((output) => output.role === role)) {
      throw new AdminRepositoryError(
        `Output role ${role} already has an attached object.`,
        409,
      );
    }
    const latestOffer = offerFromFrozenTransaction(latest);
    const latestSlot = latestOffer.outputSlots.find(
      (slot) => cleanString(slot.role) === role,
    );
    if (!latestSlot) {
      throw new AdminRepositoryError(
        `Output role ${role} is not declared by the frozen service offer.`,
        400,
      );
    }

    const providerData = providerSnapshot.data() ?? {};
    const providerOwnerId = await resolveAuthoritativeProviderOwner(
      latestOffer,
      providerData,
      (reference) => firestoreTransaction.get(reference),
      false,
    );
    if (sourceFileRef) {
      if (!sourceFileSnapshot?.exists) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} does not exist.`,
          404,
        );
      }
      const fileData = sourceFileSnapshot.data() ?? {};
      if (cleanString(fileData.linked_object_code)) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} is already linked to an uploaded object.`,
          409,
        );
      }
      if (
        cleanString(fileData.linked_report_code) ||
        cleanString(fileData.linked_report_id)
      ) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} is already linked to an uploaded report.`,
          409,
        );
      }
      if (sourceFileObjectBackrefSnapshot?.docs.length) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} is already referenced by an uploaded object.`,
          409,
        );
      }
      if (sourceFileReportBackrefSnapshot?.docs.length) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} is already referenced by an uploaded report.`,
          409,
        );
      }
      const fileOwnerId = cleanString(fileData.owner_community_user_id);
      if (fileOwnerId && fileOwnerId !== providerOwnerId) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} belongs to another object owner.`,
          409,
        );
      }
      const fileProviderId = cleanString(fileData.provider_id);
      if (fileProviderId && fileProviderId !== latest.providerId) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} belongs to another service provider.`,
          409,
        );
      }
      const currentStoredObject = validateStoredPgoObject(
        fileStorageId,
        fileData,
        resolvedOutputObjectType(latestSlot, latestOffer),
      );
      if (
        !("fileStorageId" in validatedObject) ||
        currentStoredObject.contentSha256 !== validatedObject.contentSha256 ||
        currentStoredObject.contentSizeBytes !== validatedObject.contentSizeBytes
      ) {
        throw new AdminRepositoryError(
          `Stored file ${fileStorageId} changed while the output object was being attached.`,
          409,
        );
      }
      validatedObject = currentStoredObject;
    }
    assertDownloadedOutputMatchesFrozenSlot(
      validatedObject,
      latestSlot,
      latestOffer,
      latest,
    );

    const expectedObjectType = resolvedOutputObjectType(latestSlot, latestOffer);
    const isNewRevision = latestSlot.mutationMode === "new_revision";
    const sourceRole = cleanString(latestSlot.sameIdentityAsInput);
    const sourceInput = sourceRole
      ? latest.inputs.find((candidate) => candidate.role === sourceRole)
      : undefined;
    const revisionObjectId = isNewRevision
      ? cleanString(sourceInput?.objectRef.objectId)
      : "";
    const sourceRevision = isNewRevision
      ? Number(sourceInput?.objectRef.revision)
      : 0;
    const nextRevision = sourceRevision + 1;
    let revisionObjectRef: DocumentReference | undefined;
    if (
      isNewRevision &&
      (!sourceInput ||
        !revisionObjectId ||
        !Number.isInteger(sourceRevision) ||
        sourceRevision < 1)
    ) {
      throw new AdminRepositoryError(
        `Output role ${role} cannot derive platform object identity and revision from its frozen contract.`,
        400,
      );
    }
    if (isNewRevision) {
      revisionObjectRef = adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .doc(revisionUploadedObjectId(revisionObjectId, nextRevision));
      const revisionHistoryQuery = adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .where("object_id", "==", revisionObjectId)
        .limit(MAX_OBJECT_REVISION_HISTORY_RECORDS + 1);
      const [revisionHistorySnapshot, revisionClaimSnapshot] =
        await Promise.all([
          firestoreTransaction.get(revisionHistoryQuery),
          firestoreTransaction.get(revisionObjectRef),
        ]);
      if (
        revisionHistorySnapshot.docs.length >
        MAX_OBJECT_REVISION_HISTORY_RECORDS
      ) {
        throw new AdminRepositoryError(
          `Object identity ${revisionObjectId} has too many platform revisions to prove the current source safely.`,
          409,
        );
      }
      const revisionRecords = revisionHistorySnapshot.docs.map((candidate) => {
        const data = candidate.data() ?? {};
        rejectForbiddenKeys(
          data,
          ["objectId", "objectRevision", "objectType"],
          `Uploaded object revision ${candidate.id}`,
          "camel-case",
        );
        const revision = data.object_revision;
        if (
          cleanString(data.object_id) !== revisionObjectId ||
          cleanString(data.object_type) !== expectedObjectType ||
          !Number.isInteger(revision) ||
          Number(revision) < 1
        ) {
          throw new AdminRepositoryError(
            `Object identity ${revisionObjectId} has invalid uploaded revision records and cannot be revised safely.`,
            409,
          );
        }
        return { id: candidate.id, revision: Number(revision) };
      });
      const sourceRecords = revisionRecords.filter(
        (record) => record.revision === sourceRevision,
      );
      const sourceUploadedObjectId = cleanString(sourceInput?.uploadedObjectId);
      if (
        sourceRecords.length !== 1 ||
        (sourceUploadedObjectId &&
          sourceRecords[0]?.id !== sourceUploadedObjectId)
      ) {
        throw new AdminRepositoryError(
          `Output role ${role} cannot prove that ${sourceRole} revision ${sourceRevision} is the authoritative platform source.`,
          409,
        );
      }
      const highestRevision = revisionRecords.reduce(
        (highest, record) => Math.max(highest, record.revision),
        0,
      );
      if (
        highestRevision !== sourceRevision ||
        revisionClaimSnapshot.exists
      ) {
        throw new AdminRepositoryError(
          `Output role ${role} cannot create revision ${nextRevision} because ${sourceRole} revision ${sourceRevision} is stale or already has a successor.`,
          409,
        );
      }
    }

    const ownerRef = adminDb
      .collection(OBJECT_OWNERS_COLLECTION)
      .doc(providerOwnerId);
    const ownerCommunityRef = adminDb
      .collection(COMMUNITY_USERS_COLLECTION)
      .doc(providerOwnerId);
    const [ownerSnapshot, ownerCommunitySnapshot, ...candidateSnapshots] =
      await Promise.all([
        firestoreTransaction.get(ownerRef),
        firestoreTransaction.get(ownerCommunityRef),
        ...codeCandidates.flatMap((objectCode) => [
          firestoreTransaction.get(
            adminDb.collection(OBJECT_CODES_COLLECTION).doc(objectCode),
          ),
          firestoreTransaction.get(
            adminDb
              .collection(UPLOADED_OBJECTS_COLLECTION)
              .doc(`pgo_output_${objectCode}`),
          ),
        ]),
      ]);
    if (!ownerSnapshot.exists || !ownerCommunitySnapshot.exists) {
      throw new AdminRepositoryError(
        "The service provider no longer has an authoritative object owner account.",
        400,
      );
    }

    let objectCode = "";
    for (let index = 0; index < codeCandidates.length; index += 1) {
      if (
        !candidateSnapshots[index * 2]?.exists &&
        !candidateSnapshots[index * 2 + 1]?.exists
      ) {
        objectCode = codeCandidates[index]!;
        break;
      }
    }
    if (!objectCode) {
      throw new AdminRepositoryError(
        "Could not allocate a unique 9-digit object code.",
        503,
      );
    }

    const uploadedObjectId =
      revisionObjectRef?.id ?? `pgo_output_${objectCode}`;
    const objectId = isNewRevision
      ? revisionObjectId
      : `obj_output_${objectCode}`;
    const objectRevision = isNewRevision ? nextRevision : 1;
    if (
      !objectId ||
      !Number.isInteger(objectRevision) ||
      objectRevision < 1
    ) {
      throw new AdminRepositoryError(
        `Output role ${role} cannot derive platform object identity and revision from its frozen contract.`,
        400,
      );
    }
    const output: SupportServiceTransactionOutputObjectSnapshot = {
      role,
      objectType: expectedObjectType as SupportServiceObjectType,
      objectCode,
    };
    const document = applyFrozenTransactionOfferContract(
      transactionDocument({
        ...latest,
        requestRevision: latest.requestRevision + 1,
        outputObjects: [...latest.outputObjects, output],
      }),
      latestOffer,
    );
    validateTransactionDocument(document, latestOffer, {
      preservedInputs: latest.inputs,
    });

    const ownerData = ownerSnapshot.data() ?? {};
    const ownerCommunityData = ownerCommunitySnapshot.data() ?? {};
    const ownerName =
      cleanString(ownerData.owner_name) ||
      cleanString(ownerCommunityData.fullName) ||
      cleanString(ownerCommunityData.name) ||
      cleanString(latest.providerSnapshot.name);
    const ownerEmail =
      cleanString(ownerData.owner_contact_email) ||
      cleanString(ownerCommunityData.email);
    if (!ownerName || !ownerEmail) {
      throw new AdminRepositoryError(
        "The authoritative provider owner requires a name and email before outputs can be attached.",
        400,
      );
    }

    const objectCodeRef = adminDb
      .collection(OBJECT_CODES_COLLECTION)
      .doc(objectCode);
    const uploadedObjectRef =
      revisionObjectRef ??
      adminDb.collection(UPLOADED_OBJECTS_COLLECTION).doc(uploadedObjectId);
    const ownedObjects = stringValueArray(ownerCommunityData.owned_objects);
    firestoreTransaction.set(objectCodeRef, {
      uploaded_object_id: uploadedObjectId,
      owner_id: providerOwnerId,
    });
    firestoreTransaction.set(uploadedObjectRef, {
      schema_version: 1,
      object_code: objectCode,
      object_type: expectedObjectType,
      object_id: objectId,
      object_revision: objectRevision,
      file_name: validatedObject.fileName,
      download_url:
        "downloadUrl" in validatedObject ? validatedObject.downloadUrl : null,
      linked_file_id:
        "fileStorageId" in validatedObject
          ? validatedObject.fileStorageId
          : null,
      content_sha256: validatedObject.contentSha256,
      content_size_bytes: validatedObject.contentSizeBytes,
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      object_owner_id: providerOwnerId,
      owner_community_user_id: providerOwnerId,
      owner_public_profile_id: providerOwnerId,
      owner_name: ownerName,
      owner_email: ownerEmail,
      provider_id: latest.providerId,
      provider_kind: latest.providerKind,
      provider_name: cleanString(latest.providerSnapshot.name),
      service_transaction_id: latest.requestId,
      offer_id: latest.offerId,
      output_role: role,
      date_created: FieldValue.serverTimestamp(),
      date_modified: FieldValue.serverTimestamp(),
      created_by_email: context.email,
      updated_by_email: context.email,
    });
    if (sourceFileRef) {
      firestoreTransaction.set(
        sourceFileRef,
        {
          linked_object_code: objectCode,
          file_name: validatedObject.fileName,
          file_type: expectedObjectType,
          owner_community_user_id: providerOwnerId,
          provider_id: latest.providerId,
          last_modified_date: FieldValue.serverTimestamp(),
          updated_by_email: context.email,
        },
        { merge: true },
      );
    }
    firestoreTransaction.set(
      ownerCommunityRef,
      {
        owned_objects: [...new Set([...ownedObjects, uploadedObjectId])],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    firestoreTransaction.set(
      snapshot.ref,
      withoutUndefined({
        ...document,
        createdAt: latestSnapshot.data()?.createdAt,
        createdByEmail: latestSnapshot.data()?.createdByEmail,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByEmail: context.email,
      }),
    );

    uploadedObject = {
      id: uploadedObjectId,
      role,
      objectCode,
      objectType: expectedObjectType as SupportServiceObjectType,
      fileName: validatedObject.fileName,
      ...("downloadUrl" in validatedObject
        ? { downloadUrl: validatedObject.downloadUrl }
        : { fileStorageId: validatedObject.fileStorageId }),
      status: "ready",
    };
  });

  if (!uploadedObject) {
    throw new AdminRepositoryError("Output object was not created.", 500);
  }
  return {
    transaction: await getSupportServiceTransaction(context, snapshot.id),
    object: uploadedObject,
  };
}

async function persistSupportServiceTransactionUpdate(
  context: AdminContext,
  transactionId: string,
  input: SupportServiceTransactionInput,
  options: { allowDelivery: boolean },
) {
  requireGodMode(context);
  const snapshot = await getTransactionSnapshotByIdOrRequestId(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  const previous = options.allowDelivery
    ? toTransactionRecord(snapshot.id, snapshot.data() ?? {})
    : toTransactionAdminRecord(snapshot.id, snapshot.data() ?? {});
  if (options.allowDelivery && previous.status !== "running") {
    throw new AdminRepositoryError(
      "Only running service transactions can be marked delivered.",
      409,
    );
  }
  if (!options.allowDelivery && input.status === "delivered") {
    throw new AdminRepositoryError(
      "Use the dedicated deliver command to mark a service transaction delivered.",
      409,
    );
  }
  if (!options.allowDelivery && TERMINAL_TRANSACTION_STATUSES.has(previous.status)) {
    throw new AdminRepositoryError(
      "Terminal service transactions cannot be edited.",
      409,
    );
  }
  if (
    input.outputObjects !== undefined &&
    stableString(comparableOutputObjects(input.outputObjects)) !==
      stableString(comparableOutputObjects(previous.outputObjects))
  ) {
    throw new AdminRepositoryError(
      "Output objects can only be attached through the dedicated output-object command.",
      409,
    );
  }
  rejectImmutableTransactionChanges(input, previous);
  const offer = offerFromFrozenTransaction(previous);
  const document = applyFrozenTransactionOfferContract(
    transactionDocument({
      ...input,
      requestId: previous.requestId,
      offerId: previous.offerId,
      serviceId: previous.serviceId,
      serviceVersion: previous.serviceVersion,
      providerId: previous.providerId,
      providerKind: previous.providerKind,
      status: input.status ?? previous.status,
      requestedByUserId: previous.requestedByUserId,
      requestedByUserEmail: previous.requestedByUserEmail,
      requestedAt: previous.requestedAt,
      requestedAtClient: previous.requestedAtClient,
      requestRevision: previous.requestRevision + 1,
      idempotencyKey: previous.idempotencyKey,
      inputs: input.inputs ?? previous.inputs,
      outputObjects: previous.outputObjects,
      outputReports: input.outputReports ?? previous.outputReports,
      issues: input.issues ?? previous.issues,
      offerSnapshot: previous.offerSnapshot,
      providerSnapshot: previous.providerSnapshot,
      contractSource: previous.contractSource,
      attachmentsPending: previous.attachmentsPending,
    }),
    offer,
  );
  validateTransactionDocument(document, offer, {
    preservedInputs: previous.inputs,
  });
  assertTransactionStatusTransition(previous.status, document);
  const downloadedObjects =
    document.status === "delivered"
      ? await downloadAttachedOutputObjects(document)
      : new Map<string, DownloadedPgoObject>();

  const userRef = adminDb
    .collection(COMMUNITY_USERS_COLLECTION)
    .doc(previous.requestedByUserId);
  const providerRef = adminDb
    .collection(
      previous.providerKind === "individual"
        ? FEED_INDIVIDUALS_COLLECTION
        : FEED_ORGANIZATIONS_COLLECTION,
    )
    .doc(previous.providerId);
  await adminDb.runTransaction(async (firestoreTransaction) => {
    const [latestSnapshot, userSnapshot, providerDocumentSnapshot] =
      await Promise.all([
        firestoreTransaction.get(snapshot.ref),
        firestoreTransaction.get(userRef),
        firestoreTransaction.get(providerRef),
      ]);
    if (!latestSnapshot.exists) {
      throw new AdminRepositoryError("Service transaction not found.", 404);
    }
    const latest = options.allowDelivery
      ? toTransactionRecord(latestSnapshot.id, latestSnapshot.data() ?? {})
      : toTransactionAdminRecord(
          latestSnapshot.id,
          latestSnapshot.data() ?? {},
        );
    if (latest.requestRevision !== previous.requestRevision) {
      throw new AdminRepositoryError(
        "Service transaction changed while it was being updated.",
        409,
      );
    }
    if (options.allowDelivery && latest.status !== "running") {
      throw new AdminRepositoryError(
        "Only running service transactions can be marked delivered.",
        409,
      );
    }
    assertTransactionStatusTransition(latest.status, document);
    if (!userSnapshot.exists) {
      throw new AdminRepositoryError(
        "Requester summary document no longer exists.",
        400,
      );
    }
    if (!providerDocumentSnapshot.exists) {
      throw new AdminRepositoryError(
        "Service provider no longer exists.",
        400,
      );
    }
    const providerOwnerId =
      document.status === "delivered"
        ? await resolveAuthoritativeProviderOwner(
            offer,
            providerDocumentSnapshot.data() ?? {},
            (reference) => firestoreTransaction.get(reference),
            false,
          )
        : "";
    await assertDeliveredOutputObjectsAvailable(
      document,
      offer,
      (reference) => firestoreTransaction.get(reference),
      providerOwnerId,
      downloadedObjects,
    );
    const userData = userSnapshot.data() ?? {};
    const summaries = Array.isArray(userData[REQUESTED_TRANSACTIONS_FIELD])
      ? (userData[REQUESTED_TRANSACTIONS_FIELD] as unknown[])
      : [];
    const summaryUpdate = replaceTransactionSummaryStatus(
      summaries,
      previous.requestId,
      document.status,
    );
    const providerDocumentData = providerDocumentSnapshot.data() ?? {};
    const providerSummaries = Array.isArray(
      providerDocumentData[REQUESTED_TRANSACTIONS_FIELD],
    )
      ? (providerDocumentData[REQUESTED_TRANSACTIONS_FIELD] as unknown[])
      : [];
    const providerSummaryUpdate = replaceTransactionSummaryStatus(
      providerSummaries,
      previous.requestId,
      document.status,
    );
    const requestedAt = dateFromUnknown(
      previous.requestedAt,
      "requestedAt",
      true,
    )!;
    firestoreTransaction.set(
      snapshot.ref,
      withoutUndefined({
        ...document,
        createdAt: snapshot.data()?.createdAt,
        createdByEmail: snapshot.data()?.createdByEmail,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByEmail: context.email,
      }),
    );
    firestoreTransaction.set(
      userRef,
      {
        [REQUESTED_TRANSACTIONS_FIELD]: summaryUpdate.found
          ? summaryUpdate.updated
          : [
              ...summaries,
              transactionSummary(
                document,
                offer,
                previous.providerSnapshot,
                requestedAt,
              ),
            ],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const fallbackSummary = transactionSummary(
      document,
      offer,
      previous.providerSnapshot,
      requestedAt,
    );
    firestoreTransaction.set(
      providerRef,
      {
        [REQUESTED_TRANSACTIONS_FIELD]: providerSummaryUpdate.found
          ? providerSummaryUpdate.updated
          : [...providerSummaries, fallbackSummary],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return getSupportServiceTransaction(context, snapshot.id);
}

export async function updateSupportServiceTransaction(
  context: AdminContext,
  transactionId: string,
  input: SupportServiceTransactionInput,
) {
  return persistSupportServiceTransactionUpdate(context, transactionId, input, {
    allowDelivery: false,
  });
}

export async function deliverSupportServiceTransaction(
  context: AdminContext,
  transactionId: string,
) {
  return persistSupportServiceTransactionUpdate(
    context,
    transactionId,
    { status: "delivered" },
    { allowDelivery: true },
  );
}

function requestedTransactionSummariesAfterRemoval(
  data: Record<string, unknown>,
  transactionIds: Set<string>,
) {
  const summaries = Array.isArray(data[REQUESTED_TRANSACTIONS_FIELD])
    ? (data[REQUESTED_TRANSACTIONS_FIELD] as unknown[])
    : [];
  const remainingSummaries = summaries.filter((summary) => {
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      return true;
    }
    const serviceTransactionId = cleanString(
      (summary as Record<string, unknown>).serviceTransactionId,
    );
    return !transactionIds.has(serviceTransactionId);
  });
  return { summaries, remainingSummaries };
}

export async function deleteSupportServiceTransaction(
  context: AdminContext,
  transactionId: string,
) {
  requireGodMode(context);
  const snapshot = await getTransactionSnapshotByIdOrRequestId(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  const transactionData = snapshot.data() ?? {};
  const requestId = cleanString(transactionData.requestId) || snapshot.id;
  const transactionIds = new Set(
    [snapshot.id, requestId, cleanString(transactionId)].filter(Boolean),
  );
  const requestedByUserId = cleanString(transactionData.requestedByUserId);
  const storedProviderSnapshot = optionalRecord(
    transactionData.providerSnapshot,
  );
  const providerId =
    cleanString(transactionData.providerId) ||
    cleanString(storedProviderSnapshot.id);
  const providerKind =
    cleanString(transactionData.providerKind) ||
    cleanString(storedProviderSnapshot.kind);
  const idempotencyKey = cleanString(transactionData.idempotencyKey);

  // An explicit god-mode delete is authoritative. The root is removed first;
  // malformed data or a secondary-index failure cannot veto that intention.
  await snapshot.ref.delete();

  const cleanupWarnings: string[] = [];
  const cleanupSummaryReference = async (
    reference: DocumentReference,
    label: string,
  ) => {
    try {
      await adminDb.runTransaction(async (firestoreTransaction) => {
        const referenceSnapshot = await firestoreTransaction.get(reference);
        if (!referenceSnapshot.exists) {
          return;
        }
        const summaryUpdate = requestedTransactionSummariesAfterRemoval(
          referenceSnapshot.data() ?? {},
          transactionIds,
        );
        if (
          summaryUpdate.remainingSummaries.length !==
          summaryUpdate.summaries.length
        ) {
          firestoreTransaction.set(
            reference,
            {
              [REQUESTED_TRANSACTIONS_FIELD]:
                summaryUpdate.remainingSummaries,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      });
    } catch (error) {
      cleanupWarnings.push(
        `${label} cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  };

  if (requestedByUserId) {
    await cleanupSummaryReference(
      adminDb.collection(COMMUNITY_USERS_COLLECTION).doc(requestedByUserId),
      "Requester reference",
    );
  }
  if (providerId && PROVIDER_KIND_SET.has(providerKind)) {
    await cleanupSummaryReference(
      adminDb
        .collection(
          providerKind === "individual"
            ? FEED_INDIVIDUALS_COLLECTION
            : FEED_ORGANIZATIONS_COLLECTION,
        )
        .doc(providerId),
      "Provider reference",
    );
  }
  if (idempotencyKey) {
    try {
      const idempotencyRef = adminDb
        .collection(SERVICE_TRANSACTION_IDEMPOTENCY_COLLECTION)
        .doc(idempotencyClaimId(idempotencyKey));
      await adminDb.runTransaction(async (firestoreTransaction) => {
        const idempotencySnapshot = await firestoreTransaction.get(
          idempotencyRef,
        );
        if (!idempotencySnapshot.exists) {
          firestoreTransaction.set(idempotencyRef, {
            idempotencyKey,
            requestId,
            creationFingerprint: `deleted:${snapshot.id}`,
            createdAt: FieldValue.serverTimestamp(),
            deletedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (error) {
      cleanupWarnings.push(
        `Idempotency tombstone cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return { cleanupWarnings };
}

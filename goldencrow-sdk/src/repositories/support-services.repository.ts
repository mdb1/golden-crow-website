import {
  FieldValue,
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");
const FEED_ORGANIZATIONS_COLLECTION = "feed_organizations";
const FEED_INDIVIDUALS_COLLECTION = "feed_individuals";
const SERVICE_OFFERS_COLLECTION = "service_offers";
const SERVICE_TRANSACTIONS_COLLECTION = "service_transactions";
const OBJECT_CODES_COLLECTION = "object_codes";
const UPLOADED_OBJECTS_COLLECTION = "uploaded_objects";
const COMMUNITY_USERS_COLLECTION = "community_users";
const REQUESTED_TRANSACTIONS_FIELD = "requestedServiceTransactions";
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const FILTERED_BATCH_LIMIT = MAX_PAGE_SIZE;
const MAX_FILTERED_SCAN = MAX_PAGE_SIZE * 3;

export const SUPPORT_SERVICE_STAGES = [
  "test_planning",
  "wet_lab",
  "bioinformatics",
] as const;

export const SUPPORT_SERVICE_OFFER_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
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
}

export interface SupportServiceTransactionsInputRef {
  objectId: string;
  revision: number;
}

export interface SupportServiceTransactionInputSlot {
  role: string;
  objectRef: SupportServiceTransactionsInputRef;
}

export interface SupportServiceTransactionOutputObjectSnapshot {
  role: string;
  objectType: string;
  objectCode: string;
}

export interface SupportServiceTransactionOutputReportSnapshot {
  reportCode: string;
}

export interface SupportServiceTransactionInput {
  requestId?: string;
  serviceId?: string;
  serviceVersion?: number;
  status?: SupportServiceTransactionStatus;
  requesterEmail?: string;
  subjectId?: string;
  inputs?: SupportServiceTransactionInputSlot[];
  outputObjects?: SupportServiceTransactionOutputObjectSnapshot[];
  outputReports?: SupportServiceTransactionOutputReportSnapshot[];
  missingRequiredInputRoles?: string[];
  notes?: string;
}

export interface SupportServiceTransactionRecord {
  id: string;
  schemaVersion: number;
  requestId: string;
  serviceId: string;
  serviceVersion: number;
  status: SupportServiceTransactionStatus;
  requesterEmail: string;
  subjectId: string;
  inputs: SupportServiceTransactionInputSlot[];
  outputObjects: SupportServiceTransactionOutputObjectSnapshot[];
  outputReports: SupportServiceTransactionOutputReportSnapshot[];
  missingRequiredInputRoles: string[];
  notes: string;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
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
const PUBLISHED_OFFER_STATUSES = new Set<SupportServiceOfferStatus>([
  "active",
  "paused",
  "archived",
]);
const FORM_OBJECT_TYPE = "pgo_form";

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
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
  }

  return undefined;
}

function parseCursorTimestamp(cursor?: string) {
  if (!cursor) {
    return undefined;
  }

  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return Timestamp.fromDate(parsed);
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

function normalizeFormShape(value: unknown) {
  const formShape = optionalRecord(value);
  const fields = optionalRecordArray(formShape.fields).map((field) => ({
    key: cleanString(field.key),
    label: cleanString(field.label),
    type: cleanString(field.type) || "text",
    required: Boolean(field.required),
    options: optionalRecordArray(field.options).map((option) => ({
      value: cleanString(option.value),
      label: cleanString(option.label) || cleanString(option.value),
    })),
  }));
  const id = cleanString(formShape.id);

  if (!id && fields.length === 0) {
    return undefined;
  }

  return {
    id,
    version: versionNumber(formShape.version),
    allowUnknownFields: Boolean(
      formShape.allowUnknownFields ?? formShape.allow_unknown_fields,
    ),
    fields,
  };
}

function normalizeOfferInputSlots(value: unknown) {
  return optionalRecordArray(value).map((slot) => {
    const acceptedTypes = stringValueArray(
      slot.acceptedTypes ?? slot.accepted_types,
    );
    const objectType =
      cleanString(slot.objectType ?? slot.object_type) || acceptedTypes[0] || "";
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
  return optionalRecordArray(value).map((slot) => ({
    role: cleanString(slot.role),
    objectType: cleanString(slot.objectType ?? slot.object_type),
    mutationMode:
      cleanString(slot.mutationMode ?? slot.mutation_mode) === "new_revision"
        ? "new_revision"
        : "new_object",
    sameIdentityAsInput:
      cleanString(slot.sameIdentityAsInput ?? slot.same_identity_as_input) ||
      undefined,
  }));
}

function normalizeProviderKind(value: unknown): SupportServiceProviderKind {
  const normalized = normalizeKey(cleanString(value));
  return PROVIDER_KIND_SET.has(normalized)
    ? (normalized as SupportServiceProviderKind)
    : "organization";
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
  const right = outputs.length
    ? outputs.join(" + ")
    : "provider_output";

  return `${left} -> ${right}`;
}

function normalizeCommercialTerms(value: unknown) {
  const terms = optionalRecord(value);
  const price = optionalRecord(terms.price);
  const rawPricingModel = normalizeKey(
    cleanString(terms.pricingModel ?? terms.pricing_model),
  );
  const hasPrice = Object.keys(price).length > 0;
  const pricingModel = PRICING_MODEL_SET.has(rawPricingModel)
    ? (rawPricingModel as SupportServicePricingModel)
    : hasPrice
      ? numericValue(price.amount, 0) === 0
        ? "free"
        : "fixed"
      : "not_specified";
  const turnaround = cleanString(terms.turnaround);

  if (pricingModel === "not_specified" && !turnaround) {
    return undefined;
  }

  if (pricingModel === "fixed") {
    return withoutUndefined({
      pricingModel,
      price: withoutUndefined({
        amount: numericValue(price.amount, 0),
        currency: cleanString(price.currency).toUpperCase() || "ARS",
      }),
      turnaround: turnaround || undefined,
    });
  }

  return {
    pricingModel,
    ...(turnaround ? { turnaround } : {}),
  };
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

function normalizeOfferStatus(value: unknown): SupportServiceOfferStatus {
  const normalized = normalizeKey(cleanString(value));
  return OFFER_STATUS_SET.has(normalized)
    ? (normalized as SupportServiceOfferStatus)
    : "draft";
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
): SupportServiceTransactionsInputRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const objectId = cleanString(record.objectId ?? record.object_id);
  const rawRevision = record.revision;
  const parsedRevision =
    typeof rawRevision === "number"
      ? rawRevision
      : typeof rawRevision === "string"
        ? Number(rawRevision)
        : NaN;

  if (!objectId || !Number.isFinite(parsedRevision)) {
    return null;
  }

  return {
    objectId,
    revision: Math.max(1, Math.trunc(parsedRevision)),
  };
}

function inputSlotsFromUnknown(
  value: unknown,
): SupportServiceTransactionInputSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const role = cleanString(record.role);
      const objectRef = objectRefFromUnknown(
        record.objectRef ?? record.object_ref,
      );

      return role && objectRef ? { role, objectRef } : null;
    })
    .filter((item): item is SupportServiceTransactionInputSlot =>
      Boolean(item),
    );
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
    const role = cleanString(record.role);
    const objectType = cleanString(record.objectType ?? record.object_type);
    const objectCode = cleanString(record.objectCode ?? record.object_code);
    if (!role || !objectType || !objectCode) {
      throw new AdminRepositoryError(
        `Output object snapshot ${index + 1} requires role, object type, and object code.`,
        400,
      );
    }

    return { role, objectType, objectCode };
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
    const reportCode = cleanString(record.reportCode ?? record.report_code);
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
    providerKind: normalizeProviderKind(input.providerKind),
    providerId,
    providerName,
    stages,
    status: normalizeOfferStatus(input.status),
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
  const requestId = cleanString(input.requestId);
  const serviceId = cleanString(input.serviceId);
  const requesterEmail = cleanString(input.requesterEmail).toLowerCase();
  const subjectId = cleanString(input.subjectId);

  return {
    schemaVersion: 1,
    requestId,
    serviceId,
    serviceVersion: versionNumber(input.serviceVersion),
    status: normalizeTransactionStatus(input.status, true),
    requesterEmail,
    subjectId,
    inputs: inputSlotsFromUnknown(input.inputs),
    output_objects: outputObjectsFromUnknown(input.outputObjects),
    output_reports: outputReportsFromUnknown(input.outputReports),
    missingRequiredInputRoles: cleanStringArray(input.missingRequiredInputRoles),
    notes: cleanString(input.notes),
    normalizedName: normalizeName(`${requestId} ${serviceId} ${requesterEmail}`),
  };
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
  options: { serviceVersion?: number } = {},
): SupportServiceTransactionDocument {
  const suppliedInputRoles = new Set(document.inputs.map((slot) => slot.role));
  const missingRequiredInputRoles = offer.inputSlots
    .filter((slot) => Boolean(slot.required))
    .map((slot) => cleanString(slot.role))
    .filter((role) => role && !suppliedInputRoles.has(role));

  return {
    ...document,
    serviceId: offer.serviceId,
    serviceVersion: options.serviceVersion ?? offer.serviceVersion,
    missingRequiredInputRoles,
  };
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
  if (!/^pgs_[a-z0-9_]+$/.test(document.serviceId)) {
    throw new AdminRepositoryError(
      "Service ID must use the pgs_* convention.",
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
  const formInputSlotCount = document.inputSlots.filter(
    (slot) => slot.objectType === FORM_OBJECT_TYPE,
  ).length;
  if (document.formShape) {
    if (!/^pgfs_[a-z0-9_]+$/.test(cleanString(document.formShape.id))) {
      throw new AdminRepositoryError(
        "Form shape ID must use the pgfs_* convention.",
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
    if (document.formShape.fields.length < 2) {
      throw new AdminRepositoryError(
        "Form shape must declare requested_at and requested_by fields.",
        400,
      );
    }

    const fieldKeys = new Set<string>();
    for (const field of document.formShape.fields) {
      const key = cleanString(field.key);
      const label = cleanString(field.label);
      const type = cleanString(field.type);
      const options = optionalRecordArray(field.options);
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
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
      if (["enum", "multi_enum"].includes(type) && options.length === 0) {
        throw new AdminRepositoryError(
          `Form field ${key} needs enum options.`,
          400,
        );
      }
    }

    for (const requiredKey of ["requested_at", "requested_by"]) {
      if (!fieldKeys.has(requiredKey)) {
        throw new AdminRepositoryError(
          `Form shape must include ${requiredKey}.`,
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
    if (!/^pgo_[a-z0-9_]+$/.test(slot.objectType)) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} needs a pgo_* object type.`,
        400,
      );
    }
    if (slot.role !== inputRoleForObjectType(slot.objectType)) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} must use the generated role for ${slot.objectType}.`,
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

  if (document.outputSlots.length === 0) {
    throw new AdminRepositoryError(
      "At least one output slot is required.",
      400,
    );
  }
  for (const slot of document.outputSlots) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.role)) {
      throw new AdminRepositoryError(
        "Output slot roles must be lowercase identifier keys.",
        400,
      );
    }
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
    if (!/^pgo_[a-z0-9_]+$/.test(slot.objectType)) {
      throw new AdminRepositoryError(
        `Output slot ${slot.role} needs a pgo_* object type.`,
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
  }
  for (const slot of document.inputs) {
    if (offer && !offerInputRoles.has(slot.role)) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} is not declared by the selected service offer.`,
        400,
      );
    }
    suppliedInputRoles.add(slot.role);
  }
  const suppliedOutputRoles = new Set<string>();
  for (const output of document.output_objects) {
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
    if (!/^pgo_[a-z0-9_]+$/.test(output.objectType)) {
      throw new AdminRepositoryError(
        `Output object ${output.role} must declare a concrete pgo_* object type.`,
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
  for (const report of document.output_reports) {
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
  if (document.status === "delivered") {
    const expectedRoles = [...offerOutputRoles];
    if (document.output_objects.length !== expectedRoles.length) {
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
) {
  const objectType = cleanString(slot.objectType);
  if (!objectType.startsWith("same_as:")) {
    return objectType;
  }

  const inputRole = cleanString(slot.sameIdentityAsInput) || objectType.slice(8);
  return (
    cleanString(
      offer?.inputSlots.find((input) => cleanString(input.role) === inputRole)
        ?.objectType,
    ) || ""
  );
}

async function assertDeliveredOutputObjectsAvailable(
  document: ReturnType<typeof transactionDocument>,
) {
  if (document.status !== "delivered") {
    return;
  }

  await Promise.all(
    document.output_objects.map(async (output) => {
      const codeSnapshot = await adminDb
        .collection(OBJECT_CODES_COLLECTION)
        .doc(output.objectCode)
        .get();
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

      const objectSnapshot = await adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .doc(uploadedObjectId)
        .get();
      if (!objectSnapshot.exists) {
        throw new AdminRepositoryError(
          `Uploaded object for code ${output.objectCode} does not exist.`,
          400,
        );
      }

      const objectData = objectSnapshot.data() ?? {};
      if (cleanString(objectData.object_code) !== output.objectCode) {
        throw new AdminRepositoryError(
          `Uploaded object does not belong to object code ${output.objectCode}.`,
          400,
        );
      }
      if (cleanString(objectData.object_type) !== output.objectType) {
        throw new AdminRepositoryError(
          `Uploaded object ${output.objectCode} does not match ${output.objectType}.`,
          400,
        );
      }
      if (!Number.isInteger(objectData.upload_version_count) || Number(objectData.upload_version_count) < 1) {
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
    }),
  );
}

function toOfferRecord(id: string, data: Record<string, unknown>) {
  const serviceId = cleanString(data.serviceId ?? data.service_id);
  const providerId = cleanString(data.providerId ?? data.provider_id);
  const providerName = cleanString(data.providerName ?? data.provider_name);
  const name = cleanString(data.name);
  const inputSlots = normalizeOfferInputSlots(data.inputSlots ?? data.input_slots);
  const outputSlots = normalizeOfferOutputSlots(
    data.outputSlots ?? data.output_slots,
  );
  const serviceCategory = cleanString(
    data.serviceCategory ?? data.service_category,
  );

  return {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    serviceId,
    serviceVersion: versionNumber(data.serviceVersion ?? data.service_version),
    name,
    serviceCategory,
    providerKind: normalizeProviderKind(data.providerKind ?? data.provider_kind),
    providerId,
    providerName,
    stages: normalizeStages(data.stages),
    status: normalizeOfferStatus(data.status),
    description: cleanString(data.description),
    shortContract: supportServiceShortContract({ inputSlots, outputSlots }),
    providerWork: cleanString(data.providerWork ?? data.provider_work),
    formShape: normalizeFormShape(data.formShape ?? data.form_shape),
    inputSlots,
    outputSlots,
    acceptedConditions: cleanStringArray(
      data.acceptedConditions ?? data.accepted_conditions,
    ),
    scopeRules: cleanStringArray(data.scopeRules ?? data.scope_rules),
    commercialTerms: normalizeCommercialTerms(
      data.commercialTerms ?? data.mock_commercial_terms,
    ),
    normalizedName:
      cleanString(data.normalizedName) ||
      normalizeName(
        `${name} ${serviceId} ${serviceCategory} ${providerId} ${providerName}`,
      ),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: cleanString(data.createdByEmail),
    updatedByEmail: cleanString(data.updatedByEmail),
  } satisfies SupportServiceOfferRecord;
}

function toTransactionRecord(id: string, data: Record<string, unknown>) {
  const requestId = cleanString(data.requestId ?? data.request_id);
  const serviceId = cleanString(data.serviceId ?? data.service_id);
  const requesterEmail = cleanString(data.requesterEmail).toLowerCase();

  return {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    requestId,
    serviceId,
    serviceVersion: versionNumber(data.serviceVersion ?? data.service_version),
    status: normalizeTransactionStatus(data.status, true),
    requesterEmail,
    subjectId: cleanString(data.subjectId ?? data.subject_id),
    inputs: inputSlotsFromUnknown(data.inputs),
    outputObjects: outputObjectsFromUnknown(data.output_objects),
    outputReports: outputReportsFromUnknown(data.output_reports),
    missingRequiredInputRoles: cleanStringArray(
      data.missingRequiredInputRoles ?? data.missing_required_input_roles,
    ),
    notes: cleanString(data.notes),
    normalizedName:
      cleanString(data.normalizedName) ||
      normalizeName(`${requestId} ${serviceId} ${requesterEmail}`),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: cleanString(data.createdByEmail),
    updatedByEmail: cleanString(data.updatedByEmail),
  } satisfies SupportServiceTransactionRecord;
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
  const cursorTimestamp = parseCursorTimestamp(cursor);
  const baseQuery = adminDb
    .collection(collectionName)
    .orderBy("updatedAt", "desc");
  let query: Query = baseQuery;

  if (cursorTimestamp) {
    query = query.startAfter(cursorTimestamp);
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
        ? timestampToIso(lastVisible.data().updatedAt)
        : undefined;

    return { records, nextCursor };
  }

  const records: TRecord[] = [];
  let pageCursorTimestamp = cursorTimestamp;
  let scannedDocs = 0;
  let nextCursor: string | undefined;

  while (records.length < limit && scannedDocs < MAX_FILTERED_SCAN) {
    const batchLimit = Math.min(
      FILTERED_BATCH_LIMIT,
      MAX_FILTERED_SCAN - scannedDocs,
    );
    let batchQuery: Query = baseQuery;

    if (pageCursorTimestamp) {
      batchQuery = batchQuery.startAfter(pageCursorTimestamp);
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

    nextCursor = timestampToIso(lastConsumedDoc.data().updatedAt);
    const lastSnapshotDoc = snapshot.docs[snapshot.docs.length - 1];
    const consumedWholeBatch =
      lastSnapshotDoc && lastConsumedDoc.id === lastSnapshotDoc.id;

    if (!consumedWholeBatch || snapshot.docs.length < batchLimit) {
      break;
    }

    pageCursorTimestamp = parseCursorTimestamp(nextCursor);
    if (!pageCursorTimestamp) {
      nextCursor = undefined;
      break;
    }
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

async function getOfferSnapshotByServiceId(serviceId: string) {
  const snapshot = await adminDb
    .collection(SERVICE_OFFERS_COLLECTION)
    .where("serviceId", "==", serviceId)
    .limit(1)
    .get();
  return snapshot.docs[0] ?? null;
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
  document: ReturnType<typeof offerDocument>,
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
    toRecord: toOfferRecord,
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

  return toOfferRecord(offerId, snapshot.data() ?? {});
}

export async function createSupportServiceOffer(
  context: AdminContext,
  input: SupportServiceOfferInput,
) {
  requireGodMode(context);
  const document = applyOfferVersions(offerDocument(input));
  validateOfferDocument(document);
  await assertOfferProviderExists(document);

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
    toOfferRecord(offerId, snapshot.data() ?? {}),
  );
  const document = applyOfferVersions(offerDocument(input), previousDocument);
  validateOfferDocument(document);
  await assertOfferProviderExists(document);
  await snapshot.ref.set(
    withoutUndefined({
      ...document,
      createdAt: snapshot.data()?.createdAt,
      createdByEmail: snapshot.data()?.createdByEmail,
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
    toRecord: toTransactionRecord,
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

  return toTransactionRecord(snapshot.id, snapshot.data() ?? {});
}

export async function createSupportServiceTransaction(
  context: AdminContext,
  input: SupportServiceTransactionInput,
) {
  requireGodMode(context);
  const initialDocument = transactionDocument(input);
  const offerSnapshot = await getOfferSnapshotByServiceId(initialDocument.serviceId);
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
  const document = applyTransactionOfferContract(initialDocument, offer);
  validateTransactionDocument(document, offer);
  await assertDeliveredOutputObjectsAvailable(document);

  const ref = adminDb.collection(SERVICE_TRANSACTIONS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    }),
  );

  return getSupportServiceTransaction(context, ref.id);
}

export async function updateSupportServiceTransaction(
  context: AdminContext,
  transactionId: string,
  input: SupportServiceTransactionInput,
) {
  requireGodMode(context);
  const snapshot = await getTransactionSnapshotByIdOrRequestId(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  const previous = toTransactionRecord(snapshot.id, snapshot.data() ?? {});
  const offerSnapshot = await getOfferSnapshotByServiceId(previous.serviceId);
  if (!offerSnapshot) {
    throw new AdminRepositoryError(
      "Linked service offer not found for this transaction.",
      400,
    );
  }
  const offer = toOfferRecord(offerSnapshot.id, offerSnapshot.data() ?? {});
  const document = applyTransactionOfferContract(
    transactionDocument({
      ...input,
      requestId: previous.requestId,
      serviceId: previous.serviceId,
      serviceVersion: previous.serviceVersion,
    }),
    offer,
    { serviceVersion: previous.serviceVersion },
  );
  validateTransactionDocument(document, offer);
  await assertDeliveredOutputObjectsAvailable(document);
  await snapshot.ref.set(
    withoutUndefined({
      ...(snapshot.data() ?? {}),
      ...document,
      createdAt: snapshot.data()?.createdAt,
      createdByEmail: snapshot.data()?.createdByEmail,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    }),
  );

  await updateRequestedTransactionSummary(
    snapshot.data() ?? {},
    previous.requestId,
    document.status,
  );

  return getSupportServiceTransaction(context, snapshot.id);
}

async function updateRequestedTransactionSummary(
  transactionData: Record<string, unknown>,
  requestId: string,
  status: SupportServiceTransactionStatus,
) {
  const requestedByUserId = cleanString(transactionData.requestedByUserId);
  if (!requestedByUserId) {
    return;
  }

  const userRef = adminDb
    .collection(COMMUNITY_USERS_COLLECTION)
    .doc(requestedByUserId);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) {
    return;
  }

  const userData = userSnapshot.data() ?? {};
  const summaries = Array.isArray(userData[REQUESTED_TRANSACTIONS_FIELD])
    ? (userData[REQUESTED_TRANSACTIONS_FIELD] as unknown[])
    : [];
  let changed = false;
  const updatedSummaries = summaries.map((summary) => {
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      return summary;
    }
    const record = summary as Record<string, unknown>;
    if (cleanString(record.serviceTransactionId) !== requestId) {
      return summary;
    }
    changed = true;
    return { ...record, status };
  });

  if (changed) {
    await userRef.set(
      {
        [REQUESTED_TRANSACTIONS_FIELD]: updatedSummaries,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

async function removeRequestedTransactionSummary(
  collectionName: string,
  documentId: string,
  transactionIds: Set<string>,
) {
  if (!documentId) {
    return;
  }

  const ref = adminDb.collection(collectionName).doc(documentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return;
  }

  const data = snapshot.data() ?? {};
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

  if (remainingSummaries.length !== summaries.length) {
    await ref.set(
      {
        [REQUESTED_TRANSACTIONS_FIELD]: remainingSummaries,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
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
  const requestId = cleanString(transactionData.requestId);
  const transactionIds = new Set(
    [snapshot.id, requestId, cleanString(transactionId)].filter(Boolean),
  );
  const requestedByUserId = cleanString(transactionData.requestedByUserId);
  const offerSnapshot = await getOfferSnapshotByServiceId(
    cleanString(transactionData.serviceId),
  );
  const offer = offerSnapshot
    ? toOfferRecord(offerSnapshot.id, offerSnapshot.data() ?? {})
    : null;

  await Promise.all([
    removeRequestedTransactionSummary(
      COMMUNITY_USERS_COLLECTION,
      requestedByUserId,
      transactionIds,
    ),
    ...(offer
      ? [
          removeRequestedTransactionSummary(
            offer.providerKind === "individual"
              ? FEED_INDIVIDUALS_COLLECTION
              : FEED_ORGANIZATIONS_COLLECTION,
            offer.providerId,
            transactionIds,
          ),
        ]
      : []),
  ]);
  await snapshot.ref.delete();
}

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
  "draft",
  "submitted",
  "awaiting_input",
  "accepted",
  "in_progress",
  "completed",
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
};

type TransactionListOptions = ListOptions & {
  serviceId?: string;
};

export interface SupportServiceOfferInput {
  serviceId?: string;
  serviceVersion?: string;
  name?: string;
  serviceCategory?: string;
  providerKind?: SupportServiceProviderKind;
  providerId?: string;
  providerName?: string;
  stages?: string[];
  status?: SupportServiceOfferStatus;
  availability?: string;
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
  serviceVersion: string;
  name: string;
  serviceCategory: string;
  providerKind: SupportServiceProviderKind;
  providerId: string;
  providerName: string;
  stages: SupportServiceStage[];
  status: SupportServiceOfferStatus;
  availability: string;
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

export interface SupportServiceTransactionOutputSlot {
  role: string;
  objectRef: SupportServiceTransactionsInputRef;
}

export interface SupportServiceTransactionInput {
  requestId?: string;
  serviceId?: string;
  serviceVersion?: string;
  status?: SupportServiceTransactionStatus;
  requesterEmail?: string;
  subjectId?: string;
  formRef?: SupportServiceTransactionsInputRef | null;
  inputs?: SupportServiceTransactionInputSlot[];
  outputs?: SupportServiceTransactionOutputSlot[];
  notes?: string;
}

export interface SupportServiceTransactionRecord {
  id: string;
  schemaVersion: number;
  requestId: string;
  serviceId: string;
  serviceVersion: string;
  status: SupportServiceTransactionStatus;
  requesterEmail: string;
  subjectId: string;
  formRef: SupportServiceTransactionsInputRef | null;
  inputs: SupportServiceTransactionInputSlot[];
  outputs: SupportServiceTransactionOutputSlot[];
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

function stringValueArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanString).filter((item) => item.length > 0)
    : [];
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
    version: cleanString(formShape.version) || "1.0.0",
    allowUnknownFields: Boolean(
      formShape.allowUnknownFields ?? formShape.allow_unknown_fields,
    ),
    fields,
  };
}

function normalizeOfferInputSlots(value: unknown) {
  return optionalRecordArray(value).map((slot) => {
    const cardinality = optionalRecord(slot.cardinality);
    const acceptedTypes = stringValueArray(
      slot.acceptedTypes ?? slot.accepted_types,
    );
    const objectType =
      cleanString(slot.objectType ?? slot.object_type) || acceptedTypes[0] || "";
    return {
      role: cleanString(slot.role),
      objectType,
      acceptedTypes: objectType ? [objectType] : [],
      required: Boolean(slot.required),
      cardinality: {
        min: numericValue(cardinality.min, slot.required ? 1 : 0),
        max: numericValue(cardinality.max, 1),
      },
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
  const left = inputs.length ? inputs.join(" + ") : "no_input";
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
        basis: cleanString(price.basis) || undefined,
        isMock:
          price.isMock === undefined && price.is_mock === undefined
            ? undefined
            : Boolean(price.isMock ?? price.is_mock),
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
): SupportServiceTransactionStatus {
  const normalized = normalizeKey(cleanString(value));
  return TRANSACTION_STATUS_SET.has(normalized)
    ? (normalized as SupportServiceTransactionStatus)
    : "draft";
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

function outputSlotsFromUnknown(
  value: unknown,
): SupportServiceTransactionOutputSlot[] {
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
    .filter((item): item is SupportServiceTransactionOutputSlot =>
      Boolean(item),
    );
}

function offerDocument(input: SupportServiceOfferInput) {
  const name = cleanString(input.name);
  const serviceId = cleanString(input.serviceId);
  const providerId = cleanString(input.providerId);
  const providerName = cleanString(input.providerName);
  const serviceVersion = cleanString(input.serviceVersion) || "1.0.0";
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
    availability: cleanString(input.availability) || "backoffice",
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
    serviceVersion: cleanString(input.serviceVersion) || "1.0.0",
    status: normalizeTransactionStatus(input.status),
    requesterEmail,
    subjectId,
    formRef: objectRefFromUnknown(input.formRef),
    inputs: inputSlotsFromUnknown(input.inputs),
    outputs: outputSlotsFromUnknown(input.outputs),
    notes: cleanString(input.notes),
    normalizedName: normalizeName(`${requestId} ${serviceId} ${requesterEmail}`),
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

  for (const slot of document.inputSlots) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.role)) {
      throw new AdminRepositoryError(
        "Input slot roles must be lowercase identifier keys.",
        400,
      );
    }
    if (slot.acceptedTypes.length !== 1) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} must accept exactly one object type.`,
        400,
      );
    }
    if (
      slot.acceptedTypes.some((objectType) => !/^pgo_[a-z0-9_]+$/.test(objectType))
    ) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} has an invalid pgo_* object type.`,
        400,
      );
    }
    if (slot.cardinality.max < slot.cardinality.min) {
      throw new AdminRepositoryError(
        `Input slot ${slot.role} has invalid cardinality.`,
        400,
      );
    }
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
  if (document.formRef && !/^obj_[a-z0-9_]+$/.test(document.formRef.objectId)) {
    throw new AdminRepositoryError(
      "Form reference must use an obj_* object ID.",
      400,
    );
  }
  for (const slot of [...document.inputs, ...document.outputs]) {
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
  if (document.status === "completed" && document.outputs.length === 0) {
    throw new AdminRepositoryError(
      "Completed transactions require at least one output object.",
      400,
    );
  }
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
    serviceVersion:
      cleanString(data.serviceVersion ?? data.service_version) || "1.0.0",
    name,
    serviceCategory,
    providerKind: normalizeProviderKind(data.providerKind ?? data.provider_kind),
    providerId,
    providerName,
    stages: normalizeStages(data.stages),
    status: normalizeOfferStatus(data.status),
    availability: cleanString(data.availability),
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
    serviceVersion:
      cleanString(data.serviceVersion ?? data.service_version) || "1.0.0",
    status: normalizeTransactionStatus(data.status),
    requesterEmail,
    subjectId: cleanString(data.subjectId ?? data.subject_id),
    formRef: objectRefFromUnknown(data.formRef ?? data.form_ref),
    inputs: inputSlotsFromUnknown(data.inputs),
    outputs: outputSlotsFromUnknown(data.outputs),
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

  return (
    matchesTextSearch(offer, options.query) &&
    (!status || status === "all" || offer.status === status) &&
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

async function getTransactionSnapshot(transactionId: string) {
  const snapshot = await adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .doc(transactionId)
    .get();
  return snapshot.exists ? snapshot : null;
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
  const document = offerDocument(input);
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

  const document = offerDocument(input);
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
  const snapshot = await getTransactionSnapshot(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  return toTransactionRecord(transactionId, snapshot.data() ?? {});
}

export async function createSupportServiceTransaction(
  context: AdminContext,
  input: SupportServiceTransactionInput,
) {
  requireGodMode(context);
  const document = transactionDocument(input);
  validateTransactionDocument(document);

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
  const snapshot = await getTransactionSnapshot(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  const document = transactionDocument(input);
  validateTransactionDocument(document);
  await snapshot.ref.set(
    withoutUndefined({
      ...document,
      createdAt: snapshot.data()?.createdAt,
      createdByEmail: snapshot.data()?.createdByEmail,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    }),
  );

  return getSupportServiceTransaction(context, transactionId);
}

export async function deleteSupportServiceTransaction(
  context: AdminContext,
  transactionId: string,
) {
  requireGodMode(context);
  const snapshot = await getTransactionSnapshot(transactionId);
  if (!snapshot) {
    throw new AdminRepositoryError("Service transaction not found.", 404);
  }

  await snapshot.ref.delete();
}

export const SUPPORT_SERVICE_STAGES = [
  { value: "test_planning", label: "Test planning" },
  { value: "wet_lab", label: "Wet lab" },
  { value: "bioinformatics", label: "Bioinformatics" },
] as const;

export const SUPPORT_SERVICE_OFFER_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
] as const;

export const SUPPORT_SERVICE_TRANSACTION_STATUSES = [
  { value: "received", label: "Received" },
  { value: "validating", label: "Validating" },
  { value: "awaiting_input", label: "Awaiting input" },
  { value: "accepted", label: "Accepted" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type SupportServiceStage =
  (typeof SUPPORT_SERVICE_STAGES)[number]["value"];
export type SupportServiceOfferStatus =
  (typeof SUPPORT_SERVICE_OFFER_STATUSES)[number]["value"];
export type SupportServiceTransactionStatus =
  (typeof SUPPORT_SERVICE_TRANSACTION_STATUSES)[number]["value"];
export type SupportServiceProviderKind = "organization" | "individual";
export type SupportServicePricingModel =
  | "not_specified"
  | "free"
  | "fixed"
  | "calculated_after_submission";

export const SUPPORT_SERVICE_FORM_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date-time" },
  { value: "enum", label: "Enum" },
  { value: "multi_enum", label: "Multi enum" },
  { value: "string_list", label: "String list" },
] as const;

export const SUPPORT_SERVICE_MUTATION_MODES = [
  { value: "new_object", label: "New object" },
  { value: "new_revision", label: "New revision" },
] as const;

export type SupportServiceFormFieldType =
  (typeof SUPPORT_SERVICE_FORM_FIELD_TYPES)[number]["value"];
export type SupportServiceMutationMode =
  (typeof SUPPORT_SERVICE_MUTATION_MODES)[number]["value"];

export interface SupportServiceFormFieldOption {
  value: string;
  label: string;
}

export interface SupportServiceFormField {
  key: string;
  label: string;
  type: SupportServiceFormFieldType;
  required: boolean;
  options?: SupportServiceFormFieldOption[];
}

export interface SupportServiceFormShape {
  id: string;
  version: number;
  allowUnknownFields?: boolean;
  fields: SupportServiceFormField[];
}

export interface SupportServiceInputSlot {
  role: string;
  objectType?: string;
  acceptedTypes: string[];
  required: boolean;
  cardinality: {
    min: number;
    max: number;
  };
}

export interface SupportServiceOutputSlot {
  role: string;
  objectType: string;
  mutationMode: SupportServiceMutationMode;
  sameIdentityAsInput?: string;
}

export interface SupportServiceCommercialTerms {
  pricingModel?: SupportServicePricingModel;
  price?: {
    summary?: string;
    amount?: number;
    currency?: string;
  };
  turnaround?: string;
}

export interface SupportServiceOfferInput {
  serviceId: string;
  serviceVersion?: number;
  name: string;
  serviceCategory?: string;
  providerKind?: SupportServiceProviderKind;
  providerId: string;
  providerName?: string;
  stages?: SupportServiceStage[];
  status?: SupportServiceOfferStatus;
  isHiddenFromSearch: boolean;
  description?: string;
  shortContract?: string;
  providerWork?: string;
  formShape?: SupportServiceFormShape;
  inputSlots?: SupportServiceInputSlot[];
  outputSlots?: SupportServiceOutputSlot[];
  acceptedConditions?: string[];
  scopeRules?: string[];
  commercialTerms?: SupportServiceCommercialTerms;
}

export interface SupportServiceOfferRecord
  extends Required<Omit<SupportServiceOfferInput, "formShape" | "commercialTerms">> {
  id: string;
  schemaVersion: number;
  serviceVersion: number;
  formShape?: SupportServiceFormShape;
  commercialTerms?: SupportServiceCommercialTerms;
  stages: SupportServiceStage[];
  status: SupportServiceOfferStatus;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface SupportServiceObjectRef {
  objectId: string;
  revision: number;
}

export interface SupportServiceTransactionSlot {
  role: string;
  objectRef: SupportServiceObjectRef;
  objectType: string;
  objectSnapshot: Record<string, unknown>;
  objectCode?: string;
  uploadedObjectId?: string;
  fileStorageId?: string;
  objectOwnerId?: string;
}

export interface SupportServiceTransactionOutputObject {
  role: string;
  objectType: string;
  objectCode: string;
}

export interface SupportServiceTransactionOutputReport {
  reportCode: string;
}

export interface SupportServiceOfferSnapshot extends Record<string, unknown> {
  offerId?: string;
  schemaVersion?: number;
  serviceId?: string;
  serviceVersion?: number;
  name?: string;
  status?: SupportServiceOfferStatus;
  isHiddenFromSearch?: boolean;
  serviceCategory?: string;
  providerId?: string;
  providerKind?: SupportServiceProviderKind;
  providerName?: string;
  description?: string;
  providerWork?: string;
  shortContract?: string;
  stages?: SupportServiceStage[];
  formShape?: SupportServiceFormShape;
  inputSlots?: SupportServiceInputSlot[];
  outputSlots?: SupportServiceOutputSlot[];
  acceptedConditions?: string[];
  scopeRules?: string[];
  commercialTerms?: SupportServiceCommercialTerms;
}

export interface SupportServiceProviderSnapshot extends Record<string, unknown> {
  id: string;
  kind: SupportServiceProviderKind;
  name: string;
  imageUrl?: string;
  imageUploadDataUrl?: string;
}

export interface SupportServiceTransactionInput {
  requestId: string;
  offerId: string;
  serviceId: string;
  serviceVersion?: number;
  providerId: string;
  providerKind: SupportServiceProviderKind;
  requestedByUserId: string;
  requestedByUserEmail?: string;
  requestedAt?: string;
  requestedAtClient: string;
  status?: SupportServiceTransactionStatus;
  requestRevision?: number;
  idempotencyKey: string;
  inputs?: SupportServiceTransactionSlot[];
  outputObjects?: SupportServiceTransactionOutputObject[];
  outputReports?: SupportServiceTransactionOutputReport[];
  issues?: unknown[];
  missingRequiredInputRoles?: string[];
  offerSnapshot?: SupportServiceOfferSnapshot;
  providerSnapshot?: SupportServiceProviderSnapshot;
  contractSource: string;
  attachmentsPending?: boolean;
}

export interface SupportServiceTransactionRecord
  extends SupportServiceTransactionInput {
  id: string;
  schemaVersion: number;
  serviceVersion: number;
  status: SupportServiceTransactionStatus;
  requestRevision: number;
  inputs: SupportServiceTransactionSlot[];
  outputObjects: SupportServiceTransactionOutputObject[];
  outputReports: SupportServiceTransactionOutputReport[];
  issues: unknown[];
  missingRequiredInputRoles: string[];
  offerSnapshot: SupportServiceOfferSnapshot;
  providerSnapshot: SupportServiceProviderSnapshot;
  attachmentsPending: boolean;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
  complianceWarnings?: string[];
}

export interface SupportServiceOffersPage {
  offers: SupportServiceOfferRecord[];
  nextCursor?: string;
}

export interface SupportServiceTransactionsPage {
  transactions: SupportServiceTransactionRecord[];
  nextCursor?: string;
}

export function stageLabel(value: string) {
  return (
    SUPPORT_SERVICE_STAGES.find((option) => option.value === value)?.label ??
    value
  );
}

export function offerStatusLabel(value: string) {
  return (
    SUPPORT_SERVICE_OFFER_STATUSES.find((option) => option.value === value)
      ?.label ?? value
  );
}

export function transactionStatusLabel(value: string) {
  return (
    SUPPORT_SERVICE_TRANSACTION_STATUSES.find(
      (option) => option.value === value,
    )?.label ?? value
  );
}

export function mutationModeLabel(value: string) {
  return (
    SUPPORT_SERVICE_MUTATION_MODES.find((option) => option.value === value)
      ?.label ?? value
  );
}

export function compactJson(value: unknown, fallback: string) {
  if (value == null) {
    return fallback;
  }

  if (Array.isArray(value) && value.length === 0) {
    return fallback;
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    return fallback;
  }

  return JSON.stringify(value, null, 2);
}

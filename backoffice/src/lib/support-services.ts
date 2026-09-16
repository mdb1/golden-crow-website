export const SUPPORT_SERVICE_STAGES = [
  { value: "test_planning", label: "Test planning" },
  { value: "wet_lab", label: "Wet lab" },
  { value: "bioinformatics", label: "Bioinformatics" },
] as const;

export const SUPPORT_SERVICE_OFFER_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
] as const;

export const SUPPORT_SERVICE_TRANSACTION_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "awaiting_input", label: "Awaiting input" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type SupportServiceStage =
  (typeof SUPPORT_SERVICE_STAGES)[number]["value"];
export type SupportServiceOfferStatus =
  (typeof SUPPORT_SERVICE_OFFER_STATUSES)[number]["value"];
export type SupportServiceTransactionStatus =
  (typeof SUPPORT_SERVICE_TRANSACTION_STATUSES)[number]["value"];

export interface SupportServiceOfferInput {
  serviceId: string;
  serviceVersion?: string;
  name: string;
  providerId: string;
  stages?: SupportServiceStage[];
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

export interface SupportServiceOfferRecord
  extends Required<SupportServiceOfferInput> {
  id: string;
  schemaVersion: number;
  serviceVersion: string;
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
}

export interface SupportServiceTransactionInput {
  requestId: string;
  serviceId: string;
  serviceVersion?: string;
  status?: SupportServiceTransactionStatus;
  requesterEmail?: string;
  subjectId?: string;
  formRef: SupportServiceObjectRef;
  inputs?: SupportServiceTransactionSlot[];
  outputs?: SupportServiceTransactionSlot[];
  notes?: string;
}

export interface SupportServiceTransactionRecord
  extends Required<SupportServiceTransactionInput> {
  id: string;
  schemaVersion: number;
  serviceVersion: string;
  status: SupportServiceTransactionStatus;
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

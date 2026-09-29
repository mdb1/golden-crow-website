import { adminDbFor } from "../config/firebase.js";

const adminDb = adminDbFor("mydnamap");
const OPERATIONS_COLLECTION = "2pq_case_status_operations";
const OPERATION_RETENTION_MS = 24 * 60 * 60 * 1000;

export const TWO_PQ_CASE_STATUS_OPERATION_STEP_KEYS = [
  "case",
  "samplings",
  "file_storage",
  "report_code",
] as const;

export type TwoPQCaseStatusOperationStepKey =
  (typeof TWO_PQ_CASE_STATUS_OPERATION_STEP_KEYS)[number];
export type TwoPQCaseStatusOperationStepStatus =
  | "pending"
  | "running"
  | "success"
  | "skipped"
  | "error";

export interface TwoPQCaseStatusOperationStep {
  key: TwoPQCaseStatusOperationStepKey;
  status: TwoPQCaseStatusOperationStepStatus;
  detail?: string;
  updatedAt: string;
}

export interface TwoPQCaseStatusOperation {
  id: string;
  caseId: string;
  targetCaseStatus: string;
  actorEmail: string;
  status: "running" | "success" | "error";
  steps: TwoPQCaseStatusOperationStep[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt: string;
  errorMessage?: string;
}

export type TwoPQCaseStatusProgressEvent = {
  step: TwoPQCaseStatusOperationStepKey;
  status: Exclude<TwoPQCaseStatusOperationStepStatus, "pending" | "error">;
  detail?: string;
};

export type TwoPQCaseStatusProgressReporter = (
  event: TwoPQCaseStatusProgressEvent,
) => Promise<void>;

function operationReference(operationId: string) {
  return adminDb.collection(OPERATIONS_COLLECTION).doc(operationId);
}

function normalizeOperation(
  operationId: string,
  value: Record<string, unknown>,
): TwoPQCaseStatusOperation | null {
  if (
    typeof value.caseId !== "string" ||
    typeof value.targetCaseStatus !== "string" ||
    typeof value.actorEmail !== "string" ||
    (value.status !== "running" &&
      value.status !== "success" &&
      value.status !== "error") ||
    !Array.isArray(value.steps) ||
    typeof value.startedAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.expiresAt !== "string"
  ) {
    return null;
  }

  return {
    id: operationId,
    caseId: value.caseId,
    targetCaseStatus: value.targetCaseStatus,
    actorEmail: value.actorEmail,
    status: value.status,
    steps: value.steps as TwoPQCaseStatusOperationStep[],
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    ...(typeof value.completedAt === "string"
      ? { completedAt: value.completedAt }
      : {}),
    ...(typeof value.errorMessage === "string"
      ? { errorMessage: value.errorMessage }
      : {}),
    expiresAt: value.expiresAt,
  };
}

export async function beginTwoPQCaseStatusOperation(input: {
  operationId: string;
  caseId: string;
  targetCaseStatus: string;
  actorEmail: string;
}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const operation: TwoPQCaseStatusOperation = {
    id: input.operationId,
    caseId: input.caseId,
    targetCaseStatus: input.targetCaseStatus,
    actorEmail: input.actorEmail.trim().toLowerCase(),
    status: "running",
    steps: TWO_PQ_CASE_STATUS_OPERATION_STEP_KEYS.map((key, index) => ({
      key,
      status: index === 0 ? "running" : "pending",
      updatedAt: nowIso,
    })),
    startedAt: nowIso,
    updatedAt: nowIso,
    expiresAt: new Date(now.getTime() + OPERATION_RETENTION_MS).toISOString(),
  };

  await operationReference(input.operationId).set(operation);
  return operation;
}

export async function getTwoPQCaseStatusOperation(operationId: string) {
  const snapshot = await operationReference(operationId).get();
  if (!snapshot.exists) {
    return null;
  }

  return normalizeOperation(
    snapshot.id,
    (snapshot.data() ?? {}) as Record<string, unknown>,
  );
}

export async function updateTwoPQCaseStatusOperation(
  operationId: string,
  event: TwoPQCaseStatusProgressEvent,
) {
  const current = await getTwoPQCaseStatusOperation(operationId);
  if (!current || current.status !== "running") {
    return current;
  }

  const now = new Date().toISOString();
  const steps = current.steps.map((step) =>
    step.key === event.step
      ? {
          key: step.key,
          status: event.status,
          ...(event.detail ? { detail: event.detail } : {}),
          updatedAt: now,
        }
      : step,
  );
  const next: TwoPQCaseStatusOperation = {
    ...current,
    steps,
    updatedAt: now,
  };
  await operationReference(operationId).set(next);
  return next;
}

export async function completeTwoPQCaseStatusOperation(operationId: string) {
  const current = await getTwoPQCaseStatusOperation(operationId);
  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  const next: TwoPQCaseStatusOperation = {
    ...current,
    status: "success",
    updatedAt: now,
    completedAt: now,
  };
  await operationReference(operationId).set(next);
  return next;
}

export async function failTwoPQCaseStatusOperation(
  operationId: string,
  error: unknown,
) {
  const current = await getTwoPQCaseStatusOperation(operationId);
  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  const runningStep = current.steps.find((step) => step.status === "running");
  const errorMessage =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "The case status operation failed.";
  const next: TwoPQCaseStatusOperation = {
    ...current,
    status: "error",
    steps: current.steps.map((step) =>
      step.key === runningStep?.key
        ? { ...step, status: "error", detail: errorMessage, updatedAt: now }
        : step,
    ),
    errorMessage,
    updatedAt: now,
    completedAt: now,
  };
  await operationReference(operationId).set(next);
  return next;
}

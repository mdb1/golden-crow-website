import {
  FieldPath,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import type {
  AdminContext,
  PGFlexLogisticsListScope,
  PGFlexLogisticsListItem,
  PGFlexLogisticsPage,
  PGFlexLogisticsRecord,
  PGFlexLogisticsShipmentType,
  PGFlexLogisticsStatus,
  UserRoleRecord,
} from "../types/sdk.types.js";
import { sendPGFlexLogisticsAssignmentEmail } from "../lib/pgflex-dispatcher-email.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { getUserRoleByEmail, normalizeRoleEmail } from "./roles.repository.js";

const adminDb = adminDbFor("mydnamap");
const USER_ROLES_COLLECTION = "user_roles";
const PGFLEX_EVENTS_COLLECTION = "pgflex_events";
const TWO_PQ_CASES_COLLECTION = "2pq_case";
const PGFLEX_2PQ_DESTINATION =
  "Humboldt 2433  (10 'C'), Ciudad Autónoma de Buenos Aires, Argentina";
const TWO_PQ_CASE_IN_TRANSIT_STATUS = "in_transit";
const TWO_PQ_CASE_SAMPLES_RECEIVED_STATUS = "samples_received";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export const PGFLEX_LOGISTICS_SHIPMENT_TYPES = [
  "2pq",
  "other",
] as const satisfies readonly PGFlexLogisticsShipmentType[];

export const PGFLEX_LOGISTICS_STATUSES = [
  "awaiting_pick_up",
  "in_transit",
  "arrived",
  "lost",
] as const satisfies readonly PGFlexLogisticsStatus[];

export const PGFLEX_LOGISTICS_LIST_SCOPES = [
  "active",
  "finished",
] as const satisfies readonly PGFlexLogisticsListScope[];

const PGFLEX_ACTIVE_LOGISTICS_STATUSES: readonly PGFlexLogisticsStatus[] = [
  "awaiting_pick_up",
  "in_transit",
];

const PGFLEX_FINISHED_LOGISTICS_STATUSES: readonly PGFlexLogisticsStatus[] = [
  "arrived",
  "lost",
];

const STATUS_SET = new Set<string>(PGFLEX_LOGISTICS_STATUSES);
const SHIPMENT_TYPE_SET = new Set<string>(PGFLEX_LOGISTICS_SHIPMENT_TYPES);
const LIST_SCOPE_SET = new Set<string>(PGFLEX_LOGISTICS_LIST_SCOPES);

export interface PGFlexLogisticsInput {
  identifier?: string;
  shipmentType?: PGFlexLogisticsShipmentType;
  description?: string;
  linked_codes?: string;
  dispatcherId?: string;
  dispatcherFirebaseId?: string;
  dispatcherEmail?: string;
  dispatched_id?: string;
  origin?: string;
  destination?: string;
  pickupTime?: string;
  status?: PGFlexLogisticsStatus;
}

type TransportDispatcherAssignment = {
  firebaseUid: string;
  email: string;
  displayName?: string;
} | null;

type PGFlexLogisticsDocument = {
  identifier: string;
  shipmentType: PGFlexLogisticsShipmentType;
  description: string | null;
  linked_codes: string | null;
  dispatcherId: string | null;
  dispatcherFirebaseId: string | null;
  dispatcherEmail: string | null;
  origin: string;
  destination: string;
  timeRequested: string;
  pickupTime: string | null;
  status: PGFlexLogisticsStatus;
  item_was_picked_date_at?: string | null;
  item_was_delivered_at?: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  updatedByEmail: string;
};

type PGFlexLogisticsPageCursor = {
  timeRequested: string;
  id: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const normalized = cleanString(value);
  return normalized || undefined;
}

function normalizeDispatcherId(value: unknown) {
  return optionalString(value);
}

function normalizeDispatcherEmail(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalizeRoleEmail(normalized) : undefined;
}

function looksLikeEmail(value: string) {
  return value.includes("@");
}

function normalizeStatus(value: unknown): PGFlexLogisticsStatus {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (STATUS_SET.has(normalized)) {
    return normalized as PGFlexLogisticsStatus;
  }

  throw new AdminRepositoryError(
    "Select a valid PGFlex logistics status.",
    400,
  );
}

function normalizeShipmentType(
  value: unknown,
  fallback: PGFlexLogisticsShipmentType = "other",
): PGFlexLogisticsShipmentType {
  const normalized = cleanString(value).toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (SHIPMENT_TYPE_SET.has(normalized)) {
    return normalized as PGFlexLogisticsShipmentType;
  }

  throw new AdminRepositoryError("Select a valid shipment type.", 400);
}

function normalizeListScope(value: unknown): PGFlexLogisticsListScope {
  const normalized = cleanString(value);
  return LIST_SCOPE_SET.has(normalized)
    ? (normalized as PGFlexLogisticsListScope)
    : "active";
}

function statusesForScope(
  scope: PGFlexLogisticsListScope,
): readonly PGFlexLogisticsStatus[] {
  return scope === "finished"
    ? PGFLEX_FINISHED_LOGISTICS_STATUSES
    : PGFLEX_ACTIVE_LOGISTICS_STATUSES;
}

function normalizePickupTime(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) {
    return "";
  }

  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp)
    ? normalized
    : new Date(timestamp).toISOString();
}

function normalizeLinkedCodes(value: unknown) {
  const normalized = cleanString(value);

  if (!normalized) {
    return null;
  }

  const codes = normalized
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  if (codes.length === 0) {
    return null;
  }

  if (!codes.every((code) => /^[A-Z]{3}$/.test(code))) {
    throw new AdminRepositoryError(
      "Linked codes must contain only comma-separated 3-letter codes.",
      400,
    );
  }

  return [...new Set(codes)].join(",");
}

function resolveShipmentTypeForInput(payload: PGFlexLogisticsInput) {
  return normalizeShipmentType(
    payload.shipmentType,
    cleanString(payload.linked_codes) ? "2pq" : "other",
  );
}

function resolveLinkedCodesForShipment(
  payload: PGFlexLogisticsInput,
  shipmentType: PGFlexLogisticsShipmentType,
) {
  return shipmentType === "2pq"
    ? normalizeLinkedCodes(payload.linked_codes)
    : null;
}

function resolveDestinationForShipment(
  payload: PGFlexLogisticsInput,
  shipmentType: PGFlexLogisticsShipmentType,
) {
  return shipmentType === "2pq"
    ? PGFLEX_2PQ_DESTINATION
    : requireRequiredString(payload.destination, "Destination");
}

function linkedCodesFromNormalizedCsv(value: unknown) {
  return (normalizeLinkedCodes(value) ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code): code is string => /^[A-Z]{3}$/.test(code));
}

function twoPQCaseStatusForPGFlexStatus(status: PGFlexLogisticsStatus) {
  if (status === "in_transit") {
    return TWO_PQ_CASE_IN_TRANSIT_STATUS;
  }

  if (status === "arrived") {
    return TWO_PQ_CASE_SAMPLES_RECEIVED_STATUS;
  }

  return null;
}

function isMissingFirestoreIndexError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message =
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  return (
    code === 9 ||
    code === "failed-precondition" ||
    /requires an index|indexes\?create_composite/i.test(message)
  );
}

function requireRequiredString(value: unknown, label: string) {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }

  return normalized;
}

function buildRecordId() {
  const timestamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `pgflex_${timestamp}_${suffix}`;
}

async function getUniqueTwoPQCaseIdByField({
  field,
  label,
  value,
}: {
  field: "caseLabel" | "three_letter_code";
  label: string;
  value: string;
}) {
  const snapshot = await adminDb
    .collection(TWO_PQ_CASES_COLLECTION)
    .where(field, "==", value)
    .limit(2)
    .get();

  if (snapshot.docs.length > 1) {
    throw new AdminRepositoryError(
      `Multiple 2PQ cases found for ${label} ${value}.`,
      409,
    );
  }

  return snapshot.docs[0]?.id ?? null;
}

async function getTwoPQCaseIdForLinkedCode(linkedCode: string) {
  const caseCode = `${linkedCode}XXX`;
  return (
    (await getUniqueTwoPQCaseIdByField({
      field: "caseLabel",
      label: "caseCode",
      value: caseCode,
    })) ??
    (await getUniqueTwoPQCaseIdByField({
      field: "three_letter_code",
      label: "three_letter_code",
      value: linkedCode,
    }))
  );
}

async function syncTwoPQCasesForPGFlexStatusChange({
  context,
  existing,
  now,
  updated,
}: {
  context: AdminContext;
  existing: PGFlexLogisticsRecord;
  now: string;
  updated: PGFlexLogisticsRecord;
}) {
  if (existing.status === updated.status || updated.shipmentType !== "2pq") {
    return;
  }

  const nextCaseStatus = twoPQCaseStatusForPGFlexStatus(updated.status);
  if (!nextCaseStatus) {
    return;
  }

  const linkedCodes = linkedCodesFromNormalizedCsv(updated.linked_codes);
  if (linkedCodes.length === 0) {
    return;
  }

  await Promise.all(
    linkedCodes.map(async (linkedCode) => {
      const caseId = await getTwoPQCaseIdForLinkedCode(linkedCode);

      if (!caseId) {
        return;
      }

      await adminDb
        .collection(TWO_PQ_CASES_COLLECTION)
        .doc(caseId)
        .set(
          {
            caseStatus: nextCaseStatus,
            last_updated_date: now,
            updatedAt: now,
            updatedByEmail: normalizeRoleEmail(context.email),
          },
          { merge: true },
        );
    }),
  );
}

function canAccessPGFlexLogistics(context: AdminContext) {
  return (
    context.role === "full_admin" || context.role === "transport_dispatcher"
  );
}

function isAssignedDispatcher(
  context: AdminContext,
  record: Pick<
    PGFlexLogisticsRecord,
    "dispatcherId" | "dispatcherFirebaseId" | "dispatcherEmail"
  >,
) {
  const contextUid = cleanString(context.uid);
  const contextEmail = normalizeRoleEmail(context.email);
  const dispatcherUid = cleanString(
    record.dispatcherFirebaseId ?? record.dispatcherId,
  );
  const dispatcherEmail = normalizeDispatcherEmail(
    record.dispatcherEmail ?? record.dispatcherId,
  );

  return (
    context.role === "transport_dispatcher" &&
    ((contextUid && dispatcherUid === contextUid) ||
      dispatcherEmail === contextEmail)
  );
}

function assertPGFlexAccess(context: AdminContext) {
  if (!canAccessPGFlexLogistics(context)) {
    throw new AdminRepositoryError("PGFlex logistics access required.", 403);
  }
}

function assertCanCreatePGFlexLogistics(context: AdminContext) {
  assertPGFlexAccess(context);
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError(
      "Only full admins can create PGFlex logistics items.",
      403,
    );
  }
}

function assertCanViewPGFlexLogistics(
  context: AdminContext,
  record: PGFlexLogisticsRecord,
) {
  assertPGFlexAccess(context);
  if (context.role === "full_admin" || isAssignedDispatcher(context, record)) {
    return;
  }

  throw new AdminRepositoryError(
    "This PGFlex logistics item is not assigned to you.",
    403,
  );
}

function assertCanUpdatePGFlexLogistics(
  context: AdminContext,
  record: PGFlexLogisticsRecord,
) {
  assertCanViewPGFlexLogistics(context, record);
  if (context.role === "full_admin" || isAssignedDispatcher(context, record)) {
    return;
  }

  throw new AdminRepositoryError(
    "This PGFlex logistics item cannot be updated.",
    403,
  );
}

function assertCanDeletePGFlexLogistics(context: AdminContext) {
  assertPGFlexAccess(context);
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError(
      "Only full admins can delete PGFlex logistics items.",
      403,
    );
  }
}

function assertDispatcherPatchIsStatusOnly(
  context: AdminContext,
  payload: PGFlexLogisticsInput,
) {
  if (context.role !== "transport_dispatcher") {
    return;
  }

  const editedFields = Object.keys(payload).filter((key) => key !== "status");
  if (editedFields.length > 0) {
    throw new AdminRepositoryError(
      "Transport dispatchers can update only the logistics status.",
      403,
    );
  }
}

function operationalTransitionPatch(
  context: AdminContext,
  existing: PGFlexLogisticsRecord,
  nextStatus: unknown,
  now: string,
) {
  if (nextStatus === undefined || nextStatus === existing.status) {
    return {};
  }

  if (existing.status === "awaiting_pick_up" && nextStatus === "in_transit") {
    return { item_was_picked_date_at: now };
  }

  if (existing.status === "in_transit" && nextStatus === "arrived") {
    return { item_was_delivered_at: now };
  }

  if (context.role === "transport_dispatcher") {
    throw new AdminRepositoryError(
      "Transport dispatchers can only move assigned items from awaiting pick up to in transit, or from in transit to arrived.",
      403,
    );
  }

  return {};
}

function toPGFlexLogisticsRecord(
  id: string,
  data: Record<string, unknown>,
): PGFlexLogisticsRecord {
  const now = new Date().toISOString();
  const status = STATUS_SET.has(cleanString(data.status))
    ? (cleanString(data.status) as PGFlexLogisticsStatus)
    : "awaiting_pick_up";
  const rawDispatcherId = normalizeDispatcherId(data.dispatcherId);
  const dispatcherFirebaseId =
    normalizeDispatcherId(data.dispatcherFirebaseId) ??
    (rawDispatcherId && !looksLikeEmail(rawDispatcherId)
      ? rawDispatcherId
      : undefined);
  const dispatcherEmail =
    normalizeDispatcherEmail(data.dispatcherEmail) ??
    (rawDispatcherId && looksLikeEmail(rawDispatcherId)
      ? normalizeDispatcherEmail(rawDispatcherId)
      : undefined);
  const legacyPickupTime = optionalString(data.pickupTime);
  const linkedCodes = optionalString(data.linked_codes);

  return {
    id,
    identifier: optionalString(data.identifier) ?? id,
    shipmentType: normalizeShipmentType(
      data.shipmentType,
      linkedCodes ? "2pq" : "other",
    ),
    description: optionalString(data.description),
    linked_codes: linkedCodes,
    dispatcherId: rawDispatcherId ?? dispatcherFirebaseId ?? dispatcherEmail,
    dispatcherFirebaseId,
    dispatcherEmail,
    origin: optionalString(data.origin) ?? "",
    destination: optionalString(data.destination) ?? "",
    timeRequested:
      optionalString(data.timeRequested) ??
      legacyPickupTime ??
      optionalString(data.createdAt) ??
      now,
    pickupTime: legacyPickupTime,
    status,
    item_was_picked_date_at: optionalString(data.item_was_picked_date_at),
    item_was_delivered_at: optionalString(data.item_was_delivered_at),
    createdAt: optionalString(data.createdAt) ?? now,
    updatedAt: optionalString(data.updatedAt) ?? now,
    createdByEmail: normalizeDispatcherEmail(data.createdByEmail),
    updatedByEmail: normalizeDispatcherEmail(data.updatedByEmail),
    dispatcherNotificationEmailSentAt: optionalString(
      data.dispatcherNotificationEmailSentAt,
    ),
    dispatcherNotificationEmailFailedAt: optionalString(
      data.dispatcherNotificationEmailFailedAt,
    ),
    dispatcherNotificationEmailLastError: optionalString(
      data.dispatcherNotificationEmailLastError,
    ),
  };
}

function withCapabilities(
  context: AdminContext,
  record: PGFlexLogisticsRecord,
): PGFlexLogisticsListItem {
  const dispatcherCanUpdate =
    isAssignedDispatcher(context, record) &&
    (record.status === "awaiting_pick_up" || record.status === "in_transit");

  return {
    ...record,
    canUpdate: context.role === "full_admin" || dispatcherCanUpdate,
    canDelete: context.role === "full_admin",
  };
}

function extractDispatcherFields(payload: PGFlexLogisticsInput) {
  const rawDispatcherId = cleanString(
    payload.dispatcherId ?? payload.dispatched_id,
  );
  const dispatcherFirebaseId =
    normalizeDispatcherId(payload.dispatcherFirebaseId) ??
    (rawDispatcherId && !looksLikeEmail(rawDispatcherId)
      ? rawDispatcherId
      : undefined);
  const dispatcherEmail =
    normalizeDispatcherEmail(payload.dispatcherEmail) ??
    (rawDispatcherId && looksLikeEmail(rawDispatcherId)
      ? normalizeDispatcherEmail(rawDispatcherId)
      : undefined);

  return { dispatcherFirebaseId, dispatcherEmail };
}

async function getTransportDispatcherByFirebaseUid(firebaseUid: string) {
  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("firebaseUid", "==", firebaseUid)
    .limit(1)
    .get();
  const doc = snapshot.docs.find((candidate) => {
    const data = candidate.data() as Record<string, unknown>;
    return data.role === "transport_dispatcher" && data.isActive !== false;
  });

  if (!doc) {
    return null;
  }

  return toRoleAssignmentRecord(doc.id, doc.data() as Record<string, unknown>);
}

function toRoleAssignmentRecord(
  email: string,
  data: Record<string, unknown>,
): Pick<
  UserRoleRecord,
  "email" | "role" | "isActive" | "firebaseUid" | "displayName"
> {
  return {
    email: normalizeRoleEmail(email),
    role:
      data.role === "transport_dispatcher" ? "transport_dispatcher" : "patient",
    isActive: data.isActive !== false,
    firebaseUid: optionalString(data.firebaseUid),
    displayName: optionalString(data.displayName),
  };
}

async function resolveTransportDispatcherAssignment(
  payload: PGFlexLogisticsInput,
): Promise<TransportDispatcherAssignment> {
  const { dispatcherFirebaseId, dispatcherEmail } =
    extractDispatcherFields(payload);

  if (!dispatcherFirebaseId && !dispatcherEmail) {
    return null;
  }

  const roleRecord =
    (dispatcherEmail ? await getUserRoleByEmail(dispatcherEmail) : null) ??
    (dispatcherFirebaseId
      ? await getTransportDispatcherByFirebaseUid(dispatcherFirebaseId)
      : null);

  if (
    !roleRecord ||
    roleRecord.role !== "transport_dispatcher" ||
    roleRecord.isActive === false
  ) {
    throw new AdminRepositoryError(
      "Select an active transport dispatcher.",
      400,
    );
  }

  if (
    dispatcherFirebaseId &&
    roleRecord.firebaseUid &&
    roleRecord.firebaseUid !== dispatcherFirebaseId
  ) {
    throw new AdminRepositoryError(
      "Selected transport dispatcher identity does not match the role record.",
      400,
    );
  }

  const firebaseUid = roleRecord.firebaseUid ?? dispatcherFirebaseId;
  if (!firebaseUid) {
    throw new AdminRepositoryError(
      "Select a transport dispatcher with a Firebase ID.",
      400,
    );
  }

  if (!roleRecord.firebaseUid) {
    await adminDb.collection(USER_ROLES_COLLECTION).doc(roleRecord.email).set(
      {
        firebaseUid,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  return {
    firebaseUid,
    email: roleRecord.email,
    displayName: roleRecord.displayName,
  };
}

function assignmentChanged(
  existing: Pick<
    PGFlexLogisticsRecord,
    "dispatcherId" | "dispatcherFirebaseId" | "dispatcherEmail"
  >,
  assignment: TransportDispatcherAssignment,
) {
  if (!assignment) {
    return false;
  }

  const existingUid =
    normalizeDispatcherId(existing.dispatcherFirebaseId) ??
    (existing.dispatcherId && !looksLikeEmail(existing.dispatcherId)
      ? existing.dispatcherId
      : undefined);
  const existingEmail =
    normalizeDispatcherEmail(existing.dispatcherEmail) ??
    (existing.dispatcherId && looksLikeEmail(existing.dispatcherId)
      ? normalizeDispatcherEmail(existing.dispatcherId)
      : undefined);

  return (
    existingUid !== assignment.firebaseUid || existingEmail !== assignment.email
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sendDispatcherNotificationForItem(
  record: PGFlexLogisticsRecord,
  assignment: TransportDispatcherAssignment,
) {
  if (!assignment) {
    return {};
  }

  const logisticsRef = adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(record.id);

  try {
    await sendPGFlexLogisticsAssignmentEmail(
      {
        email: assignment.email,
        displayName: assignment.displayName,
      },
      record,
    );
    const metadata = {
      dispatcherNotificationEmailSentAt: new Date().toISOString(),
      dispatcherNotificationEmailFailedAt: null,
      dispatcherNotificationEmailLastError: null,
    };
    await logisticsRef.set(metadata, { merge: true });
    return metadata;
  } catch (error) {
    const metadata = {
      dispatcherNotificationEmailSentAt: null,
      dispatcherNotificationEmailFailedAt: new Date().toISOString(),
      dispatcherNotificationEmailLastError: errorMessage(error),
    };
    await logisticsRef.set(metadata, { merge: true });
    console.error("Failed to send PGFlex logistics assignment email", error);
    return metadata;
  }
}

async function fullDocumentFromInput(
  payload: PGFlexLogisticsInput,
  context: AdminContext,
  timestamps: { createdAt: string; updatedAt: string },
  options: { timeRequested?: string } = {},
): Promise<{
  document: PGFlexLogisticsDocument;
  assignment: TransportDispatcherAssignment;
}> {
  const assignment = await resolveTransportDispatcherAssignment(payload);
  const shipmentType = resolveShipmentTypeForInput(payload);

  return {
    document: {
      identifier: requireRequiredString(payload.identifier, "Identifier"),
      shipmentType,
      description: optionalString(payload.description) ?? null,
      linked_codes: resolveLinkedCodesForShipment(payload, shipmentType),
      dispatcherId: assignment?.firebaseUid ?? null,
      dispatcherFirebaseId: assignment?.firebaseUid ?? null,
      dispatcherEmail: assignment?.email ?? null,
      origin: requireRequiredString(payload.origin, "Origin"),
      destination: resolveDestinationForShipment(payload, shipmentType),
      timeRequested: options.timeRequested ?? timestamps.createdAt,
      pickupTime:
        optionalString(normalizePickupTime(payload.pickupTime)) ?? null,
      status: payload.status
        ? normalizeStatus(payload.status)
        : "awaiting_pick_up",
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      createdByEmail: normalizeRoleEmail(context.email),
      updatedByEmail: normalizeRoleEmail(context.email),
    },
    assignment,
  };
}

async function patchDocumentFromInput(
  payload: PGFlexLogisticsInput,
  context: AdminContext,
  now: string = new Date().toISOString(),
) {
  const document: Partial<Record<keyof PGFlexLogisticsRecord, unknown>> = {};
  let assignment: TransportDispatcherAssignment | undefined;
  const shipmentType =
    "shipmentType" in payload
      ? resolveShipmentTypeForInput(payload)
      : undefined;

  if ("identifier" in payload) {
    document.identifier = requireRequiredString(
      payload.identifier,
      "Identifier",
    );
  }

  if (shipmentType) {
    document.shipmentType = shipmentType;
    if (shipmentType === "other") {
      document.linked_codes = null;
    }
  }

  if ("description" in payload) {
    document.description = optionalString(payload.description) ?? null;
  }

  if ("linked_codes" in payload) {
    document.linked_codes = resolveLinkedCodesForShipment(
      payload,
      shipmentType ?? resolveShipmentTypeForInput(payload),
    );
  }

  if (
    "dispatcherId" in payload ||
    "dispatcherFirebaseId" in payload ||
    "dispatcherEmail" in payload ||
    "dispatched_id" in payload
  ) {
    assignment = await resolveTransportDispatcherAssignment(payload);
    document.dispatcherId = assignment?.firebaseUid ?? null;
    document.dispatcherFirebaseId = assignment?.firebaseUid ?? null;
    document.dispatcherEmail = assignment?.email ?? null;
  }

  if ("origin" in payload) {
    document.origin = requireRequiredString(payload.origin, "Origin");
  }

  if ("destination" in payload || shipmentType === "2pq") {
    document.destination = resolveDestinationForShipment(
      payload,
      shipmentType ?? "other",
    );
  }

  if ("status" in payload) {
    document.status = normalizeStatus(payload.status);
  }

  if (Object.keys(document).length === 0) {
    throw new AdminRepositoryError(
      "No PGFlex logistics fields were provided.",
      400,
    );
  }

  document.updatedAt = now;
  document.updatedByEmail = normalizeRoleEmail(context.email);
  return { document, assignment };
}

function resolvePageSize(limit: unknown) {
  const parsed =
    typeof limit === "number"
      ? limit
      : typeof limit === "string"
        ? Number.parseInt(limit, 10)
        : DEFAULT_PAGE_SIZE;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.max(1, Math.min(Math.trunc(parsed), MAX_PAGE_SIZE));
}

function encodePageCursor(record: PGFlexLogisticsRecord) {
  return Buffer.from(
    JSON.stringify({
      timeRequested: record.timeRequested,
      id: record.id,
    } satisfies PGFlexLogisticsPageCursor),
  ).toString("base64url");
}

async function resolvePageCursor(
  cursor?: string,
): Promise<PGFlexLogisticsPageCursor | null> {
  const normalized = optionalString(cursor);

  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(normalized, "base64url").toString("utf8"),
    ) as Partial<PGFlexLogisticsPageCursor>;
    const timeRequested = optionalString(parsed.timeRequested);
    const id = optionalString(parsed.id);

    if (timeRequested && id) {
      return { timeRequested, id };
    }
  } catch {
    // Treat unknown cursors as plain document ids for older in-flight clients.
  }

  const snapshot = await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(normalized)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  const record = toPGFlexLogisticsRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  return { timeRequested: record.timeRequested, id: record.id };
}

function baseQueryForContext(
  context: AdminContext,
  scope: PGFlexLogisticsListScope,
): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .where("status", "in", statusesForScope(scope));

  if (context.role === "transport_dispatcher") {
    query = query.where("dispatcherId", "==", context.uid);
  }

  return query;
}

function orderedQueryForContext(
  context: AdminContext,
  scope: PGFlexLogisticsListScope,
): Query<DocumentData> {
  return baseQueryForContext(context, scope)
    .orderBy("timeRequested", "desc")
    .orderBy(FieldPath.documentId(), "desc");
}

function fallbackQueryForContext(
  context: AdminContext,
  scope: PGFlexLogisticsListScope,
): Query<DocumentData> {
  return baseQueryForContext(context, scope);
}

function docTimeRequested(doc: { id: string; data: () => DocumentData }) {
  return optionalString(doc.data().timeRequested) ?? "";
}

function compareDocsNewestFirst(
  left: { id: string; data: () => DocumentData },
  right: { id: string; data: () => DocumentData },
) {
  const byTimeRequested = docTimeRequested(right).localeCompare(
    docTimeRequested(left),
  );

  if (byTimeRequested !== 0) {
    return byTimeRequested;
  }

  return right.id.localeCompare(left.id);
}

async function getPageWithIndexFallback(
  orderedQuery: Query<DocumentData>,
  fallbackQuery: Query<DocumentData>,
  pageSize: number,
  cursor?: string,
) {
  const pageCursor = await resolvePageCursor(cursor);
  let query = orderedQuery;
  if (pageCursor) {
    query = query.startAfter(pageCursor.timeRequested, pageCursor.id);
  }

  try {
    return await query.limit(pageSize + 1).get();
  } catch (error) {
    if (!isMissingFirestoreIndexError(error)) {
      throw error;
    }

    const snapshot = await fallbackQuery.limit(pageSize + 1).get();
    const sortedDocs = [...snapshot.docs].sort(compareDocsNewestFirst);
    const startIndex = pageCursor
      ? sortedDocs.findIndex(
          (doc) =>
            doc.id === pageCursor.id &&
            docTimeRequested(doc) === pageCursor.timeRequested,
        ) + 1
      : 0;

    return {
      docs: sortedDocs.slice(
        Math.max(0, startIndex),
        Math.max(0, startIndex) + pageSize + 1,
      ),
    };
  }
}

export async function listPGFlexLogisticsForContext(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown; scope?: unknown } = {},
): Promise<PGFlexLogisticsPage> {
  assertPGFlexAccess(context);
  const pageSize = resolvePageSize(options.limit);
  const scope = normalizeListScope(options.scope);
  const snapshot = await getPageWithIndexFallback(
    orderedQueryForContext(context, scope),
    fallbackQueryForContext(context, scope),
    pageSize,
    options.cursor,
  );
  const docs = snapshot.docs.slice(0, pageSize);
  const records = docs.map((doc) =>
    toPGFlexLogisticsRecord(doc.id, doc.data() as Record<string, unknown>),
  );
  const hasNextPage = snapshot.docs.length > pageSize;
  const nextRecord = hasNextPage ? records.at(-1) : undefined;

  return {
    items: records.map((record) => withCapabilities(context, record)),
    nextCursor: nextRecord ? encodePageCursor(nextRecord) : null,
    scope,
  };
}

export async function getPGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
): Promise<PGFlexLogisticsListItem> {
  assertPGFlexAccess(context);
  const snapshot = await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(itemId)
    .get();

  if (!snapshot.exists) {
    throw new AdminRepositoryError("PGFlex logistics item not found.", 404);
  }

  const record = toPGFlexLogisticsRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  assertCanViewPGFlexLogistics(context, record);
  return withCapabilities(context, record);
}

export async function createPGFlexLogisticsItemForContext(
  context: AdminContext,
  payload: PGFlexLogisticsInput,
): Promise<PGFlexLogisticsListItem> {
  assertCanCreatePGFlexLogistics(context);
  const now = new Date().toISOString();
  const { document, assignment } = await fullDocumentFromInput(
    payload,
    context,
    {
      createdAt: now,
      updatedAt: now,
    },
  );
  const recordId = buildRecordId();
  await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(recordId)
    .set(document);

  const record = toPGFlexLogisticsRecord(recordId, document);
  const emailMetadata = await sendDispatcherNotificationForItem(
    record,
    assignment,
  );
  return withCapabilities(
    context,
    toPGFlexLogisticsRecord(recordId, { ...document, ...emailMetadata }),
  );
}

export async function replacePGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
  payload: PGFlexLogisticsInput,
): Promise<PGFlexLogisticsListItem> {
  assertCanCreatePGFlexLogistics(context);
  const existing = await getPGFlexLogisticsItemForContext(context, itemId);
  const { document, assignment } = await fullDocumentFromInput(
    payload,
    context,
    {
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    },
    {
      timeRequested: existing.timeRequested,
    },
  );
  const shouldNotifyDispatcher = assignmentChanged(existing, assignment);
  const persistedDocument =
    !shouldNotifyDispatcher && assignment
      ? {
          ...document,
          dispatcherNotificationEmailSentAt:
            existing.dispatcherNotificationEmailSentAt ?? null,
          dispatcherNotificationEmailFailedAt:
            existing.dispatcherNotificationEmailFailedAt ?? null,
          dispatcherNotificationEmailLastError:
            existing.dispatcherNotificationEmailLastError ?? null,
        }
      : document;

  await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(itemId)
    .set(persistedDocument, { merge: false });

  const record = toPGFlexLogisticsRecord(itemId, persistedDocument);
  await syncTwoPQCasesForPGFlexStatusChange({
    context,
    existing,
    now: document.updatedAt,
    updated: record,
  });

  const emailMetadata = shouldNotifyDispatcher
    ? await sendDispatcherNotificationForItem(record, assignment)
    : {};
  return withCapabilities(
    context,
    toPGFlexLogisticsRecord(itemId, { ...persistedDocument, ...emailMetadata }),
  );
}

export async function updatePGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
  payload: PGFlexLogisticsInput,
): Promise<PGFlexLogisticsListItem> {
  assertDispatcherPatchIsStatusOnly(context, payload);
  const existing = await getPGFlexLogisticsItemForContext(context, itemId);
  assertCanUpdatePGFlexLogistics(context, existing);
  const now = new Date().toISOString();
  const { document: patch, assignment } = await patchDocumentFromInput(
    payload,
    context,
    now,
  );
  Object.assign(
    patch,
    operationalTransitionPatch(context, existing, patch.status, now),
  );

  await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(itemId)
    .set(patch, { merge: true });

  const updated = await getPGFlexLogisticsItemForContext(context, itemId);
  await syncTwoPQCasesForPGFlexStatusChange({
    context,
    existing,
    now,
    updated,
  });

  if (assignmentChanged(existing, assignment ?? null)) {
    await sendDispatcherNotificationForItem(updated, assignment ?? null);
  }

  return getPGFlexLogisticsItemForContext(context, itemId);
}

export async function deletePGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
) {
  assertCanDeletePGFlexLogistics(context);
  await getPGFlexLogisticsItemForContext(context, itemId);
  await adminDb.collection(PGFLEX_EVENTS_COLLECTION).doc(itemId).delete();

  return { deleted: true, itemId };
}

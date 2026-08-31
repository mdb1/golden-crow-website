import {
  FieldPath,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import type {
  AdminContext,
  PGFlexLogisticsListItem,
  PGFlexLogisticsPage,
  PGFlexLogisticsRecord,
  PGFlexLogisticsStatus,
  UserRoleRecord,
} from "../types/sdk.types.js";
import { sendPGFlexLogisticsAssignmentEmail } from "../lib/pgflex-dispatcher-email.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  getUserRoleByEmail,
  normalizeRoleEmail,
} from "./roles.repository.js";

const adminDb = adminDbFor("mydnamap");
const USER_ROLES_COLLECTION = "user_roles";
const PGFLEX_EVENTS_COLLECTION = "pgflex_events";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export const PGFLEX_LOGISTICS_STATUSES = [
  "awaiting_pick_up",
  "in_transit",
  "arrived",
  "lost",
] as const satisfies readonly PGFlexLogisticsStatus[];

const STATUS_SET = new Set<string>(PGFLEX_LOGISTICS_STATUSES);

export interface PGFlexLogisticsInput {
  identifier?: string;
  description?: string;
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
  description: string | null;
  dispatcherId: string | null;
  dispatcherFirebaseId: string | null;
  dispatcherEmail: string | null;
  origin: string;
  destination: string;
  timeRequested: string;
  pickupTime: string | null;
  status: PGFlexLogisticsStatus;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  updatedByEmail: string;
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

  throw new AdminRepositoryError("Select a valid PGFlex logistics status.", 400);
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

function canAccessPGFlexLogistics(context: AdminContext) {
  return context.role === "full_admin" || context.role === "transport_dispatcher";
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

  throw new AdminRepositoryError("This PGFlex logistics item is not assigned to you.", 403);
}

function assertCanUpdatePGFlexLogistics(
  context: AdminContext,
  record: PGFlexLogisticsRecord,
) {
  assertCanViewPGFlexLogistics(context, record);
  if (context.role === "full_admin" || isAssignedDispatcher(context, record)) {
    return;
  }

  throw new AdminRepositoryError("This PGFlex logistics item cannot be updated.", 403);
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

  return {
    id,
    identifier: optionalString(data.identifier) ?? id,
    description: optionalString(data.description),
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
  const dispatcherCanUpdate = isAssignedDispatcher(context, record);

  return {
    ...record,
    canUpdate: context.role === "full_admin" || dispatcherCanUpdate,
    canDelete: context.role === "full_admin",
  };
}

function extractDispatcherFields(payload: PGFlexLogisticsInput) {
  const rawDispatcherId = cleanString(payload.dispatcherId ?? payload.dispatched_id);
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
      data.role === "transport_dispatcher"
        ? "transport_dispatcher"
        : "patient",
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
    existingUid !== assignment.firebaseUid ||
    existingEmail !== assignment.email
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

  return {
    document: {
      identifier: requireRequiredString(payload.identifier, "Identifier"),
      description: optionalString(payload.description) ?? null,
      dispatcherId: assignment?.firebaseUid ?? null,
      dispatcherFirebaseId: assignment?.firebaseUid ?? null,
      dispatcherEmail: assignment?.email ?? null,
      origin: requireRequiredString(payload.origin, "Origin"),
      destination: requireRequiredString(payload.destination, "Destination"),
      timeRequested: options.timeRequested ?? timestamps.createdAt,
      pickupTime: optionalString(normalizePickupTime(payload.pickupTime)) ?? null,
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
) {
  const document: Partial<Record<keyof PGFlexLogisticsRecord, unknown>> = {};
  let assignment: TransportDispatcherAssignment | undefined;

  if ("identifier" in payload) {
    document.identifier = requireRequiredString(payload.identifier, "Identifier");
  }

  if ("description" in payload) {
    document.description = optionalString(payload.description) ?? null;
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

  if ("destination" in payload) {
    document.destination = requireRequiredString(payload.destination, "Destination");
  }

  if ("status" in payload) {
    document.status = normalizeStatus(payload.status);
  }

  if (Object.keys(document).length === 0) {
    throw new AdminRepositoryError("No PGFlex logistics fields were provided.", 400);
  }

  document.updatedAt = new Date().toISOString();
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

function orderedQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PGFLEX_EVENTS_COLLECTION);

  if (context.role === "transport_dispatcher") {
    query = query.where("dispatcherId", "==", context.uid);
  }

  return query.orderBy(FieldPath.documentId(), "desc");
}

function fallbackQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PGFLEX_EVENTS_COLLECTION);

  if (context.role === "transport_dispatcher") {
    query = query.where("dispatcherId", "==", context.uid);
  }

  return query;
}

async function getPageWithIndexFallback(
  orderedQuery: Query<DocumentData>,
  fallbackQuery: Query<DocumentData>,
  pageSize: number,
  cursor?: string,
) {
  let query = orderedQuery;
  if (cursor) {
    query = query.startAfter(cursor);
  }

  try {
    return await query.limit(pageSize + 1).get();
  } catch (error) {
    if (!isMissingFirestoreIndexError(error)) {
      throw error;
    }

    let fallback = fallbackQuery;
    if (cursor) {
      const cursorSnapshot = await adminDb
        .collection(PGFLEX_EVENTS_COLLECTION)
        .doc(cursor)
        .get();
      if (cursorSnapshot.exists) {
        fallback = fallback.startAfter(cursorSnapshot);
      }
    }

    return fallback.limit(pageSize + 1).get();
  }
}

export async function listPGFlexLogisticsForContext(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
): Promise<PGFlexLogisticsPage> {
  assertPGFlexAccess(context);
  const pageSize = resolvePageSize(options.limit);
  const snapshot = await getPageWithIndexFallback(
    orderedQueryForContext(context),
    fallbackQueryForContext(context),
    pageSize,
    options.cursor,
  );
  const docs = snapshot.docs.slice(0, pageSize);
  const nextDoc = snapshot.docs.length > pageSize ? docs.at(-1) : undefined;

  return {
    items: docs
      .map((doc) =>
        toPGFlexLogisticsRecord(doc.id, doc.data() as Record<string, unknown>),
      )
      .map((record) => withCapabilities(context, record)),
    nextCursor: nextDoc?.id ?? null,
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
  const { document, assignment } = await fullDocumentFromInput(payload, context, {
    createdAt: now,
    updatedAt: now,
  });
  const recordId = buildRecordId();
  await adminDb.collection(PGFLEX_EVENTS_COLLECTION).doc(recordId).set(document);

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
  const { document: patch, assignment } = await patchDocumentFromInput(
    payload,
    context,
  );

  await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(itemId)
    .set(patch, { merge: true });

  if (assignmentChanged(existing, assignment ?? null)) {
    const updated = await getPGFlexLogisticsItemForContext(context, itemId);
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
  await adminDb
    .collection(PGFLEX_EVENTS_COLLECTION)
    .doc(itemId)
    .delete();

  return { deleted: true, itemId };
}

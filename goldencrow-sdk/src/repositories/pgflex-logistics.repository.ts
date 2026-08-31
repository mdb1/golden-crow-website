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
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { normalizeRoleEmail } from "./roles.repository.js";

const adminDb = adminDbFor("mydnamap");
const PGFLEX_LOGISTICS_COLLECTION = "pgflex_logistics";
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
  dispatched_id?: string;
  origin?: string;
  destination?: string;
  pickupTime?: string;
  status?: PGFlexLogisticsStatus;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const normalized = cleanString(value);
  return normalized || undefined;
}

function normalizeDispatcherId(value: unknown) {
  return normalizeRoleEmail(cleanString(value));
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
  record: Pick<PGFlexLogisticsRecord, "dispatcherId">,
) {
  return (
    context.role === "transport_dispatcher" &&
    normalizeDispatcherId(record.dispatcherId) === normalizeRoleEmail(context.email)
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

  return {
    id,
    identifier: optionalString(data.identifier) ?? id,
    description: optionalString(data.description),
    dispatcherId: normalizeDispatcherId(data.dispatcherId) || undefined,
    origin: optionalString(data.origin) ?? "",
    destination: optionalString(data.destination) ?? "",
    pickupTime: optionalString(data.pickupTime) ?? "",
    status,
    createdAt: optionalString(data.createdAt) ?? now,
    updatedAt: optionalString(data.updatedAt) ?? now,
    createdByEmail: normalizeDispatcherId(data.createdByEmail) || undefined,
    updatedByEmail: normalizeDispatcherId(data.updatedByEmail) || undefined,
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

function fullDocumentFromInput(
  payload: PGFlexLogisticsInput,
  context: AdminContext,
  timestamps: { createdAt: string; updatedAt: string },
) {
  return {
    identifier: requireRequiredString(payload.identifier, "Identifier"),
    description: optionalString(payload.description) ?? null,
    dispatcherId:
      normalizeDispatcherId(payload.dispatcherId ?? payload.dispatched_id) ||
      null,
    origin: requireRequiredString(payload.origin, "Origin"),
    destination: requireRequiredString(payload.destination, "Destination"),
    pickupTime: requireRequiredString(
      normalizePickupTime(payload.pickupTime),
      "Time of pick up",
    ),
    status: payload.status
      ? normalizeStatus(payload.status)
      : "awaiting_pick_up",
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    createdByEmail: normalizeRoleEmail(context.email),
    updatedByEmail: normalizeRoleEmail(context.email),
  };
}

function patchDocumentFromInput(
  payload: PGFlexLogisticsInput,
  context: AdminContext,
) {
  const document: Partial<Record<keyof PGFlexLogisticsRecord, unknown>> = {};

  if ("identifier" in payload) {
    document.identifier = requireRequiredString(payload.identifier, "Identifier");
  }

  if ("description" in payload) {
    document.description = optionalString(payload.description) ?? null;
  }

  if ("dispatcherId" in payload || "dispatched_id" in payload) {
    document.dispatcherId =
      normalizeDispatcherId(payload.dispatcherId ?? payload.dispatched_id) ||
      null;
  }

  if ("origin" in payload) {
    document.origin = requireRequiredString(payload.origin, "Origin");
  }

  if ("destination" in payload) {
    document.destination = requireRequiredString(payload.destination, "Destination");
  }

  if ("pickupTime" in payload) {
    document.pickupTime = requireRequiredString(
      normalizePickupTime(payload.pickupTime),
      "Time of pick up",
    );
  }

  if ("status" in payload) {
    document.status = normalizeStatus(payload.status);
  }

  if (Object.keys(document).length === 0) {
    throw new AdminRepositoryError("No PGFlex logistics fields were provided.", 400);
  }

  document.updatedAt = new Date().toISOString();
  document.updatedByEmail = normalizeRoleEmail(context.email);
  return document;
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
  let query: Query<DocumentData> = adminDb.collection(PGFLEX_LOGISTICS_COLLECTION);

  if (context.role === "transport_dispatcher") {
    query = query.where("dispatcherId", "==", normalizeRoleEmail(context.email));
  }

  return query.orderBy(FieldPath.documentId(), "desc");
}

function fallbackQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PGFLEX_LOGISTICS_COLLECTION);

  if (context.role === "transport_dispatcher") {
    query = query.where("dispatcherId", "==", normalizeRoleEmail(context.email));
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
        .collection(PGFLEX_LOGISTICS_COLLECTION)
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
    .collection(PGFLEX_LOGISTICS_COLLECTION)
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
  const document = fullDocumentFromInput(payload, context, {
    createdAt: now,
    updatedAt: now,
  });
  const recordId = buildRecordId();

  await adminDb
    .collection(PGFLEX_LOGISTICS_COLLECTION)
    .doc(recordId)
    .set(document);

  return withCapabilities(context, toPGFlexLogisticsRecord(recordId, document));
}

export async function replacePGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
  payload: PGFlexLogisticsInput,
): Promise<PGFlexLogisticsListItem> {
  assertCanCreatePGFlexLogistics(context);
  const existing = await getPGFlexLogisticsItemForContext(context, itemId);
  const document = fullDocumentFromInput(payload, context, {
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  await adminDb
    .collection(PGFLEX_LOGISTICS_COLLECTION)
    .doc(itemId)
    .set(document, { merge: false });

  return withCapabilities(context, toPGFlexLogisticsRecord(itemId, document));
}

export async function updatePGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
  payload: PGFlexLogisticsInput,
): Promise<PGFlexLogisticsListItem> {
  assertDispatcherPatchIsStatusOnly(context, payload);
  const existing = await getPGFlexLogisticsItemForContext(context, itemId);
  assertCanUpdatePGFlexLogistics(context, existing);
  const patch = patchDocumentFromInput(payload, context);

  await adminDb
    .collection(PGFLEX_LOGISTICS_COLLECTION)
    .doc(itemId)
    .set(patch, { merge: true });

  return getPGFlexLogisticsItemForContext(context, itemId);
}

export async function deletePGFlexLogisticsItemForContext(
  context: AdminContext,
  itemId: string,
) {
  assertCanDeletePGFlexLogistics(context);
  await getPGFlexLogisticsItemForContext(context, itemId);
  await adminDb
    .collection(PGFLEX_LOGISTICS_COLLECTION)
    .doc(itemId)
    .delete();

  return { deleted: true, itemId };
}

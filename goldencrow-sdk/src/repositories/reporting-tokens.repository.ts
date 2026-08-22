import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, type Query } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");

const CLIENTS_COLLECTION = "openapi_reporting_integration_clients";
const TOKENS_COLLECTION = "openapi_reporting_access_tokens";
const AUDIT_LOGS_COLLECTION = "openapi_reporting_audit_logs";
const ACCESS_EVENTS_COLLECTION = "openapi_reporting_access_events";
const CLIENT_ID_PREFIX = "gci_live_";
const CLIENT_SECRET_PREFIX = "gcs_live_";
const ACCESS_TOKEN_PREFIX = "rpt_access_";
const RANDOM_BYTES = 32;
const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const QUOTA_WINDOW_SECONDS = 60;
const DEFAULT_QUOTA_PER_MINUTE = 60;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const REPORTING_SCOPES = ["reporting:read", "reporting:write"] as const;

type ReportingScope = (typeof REPORTING_SCOPES)[number];
type IntegrationClientStatus = "active" | "revoked";
type IntegrationClientAccessEventType =
  | "integration_client.created"
  | "integration_client.secret_created"
  | "integration_client.secret_rotated"
  | "integration_client.revoked";

export interface ReportingIntegrationClientCreateInput {
  name: string;
  quotaPerMinute?: number;
}

export interface ReportingIntegrationClientCreateResult {
  client_id: string;
  name: string;
  scopes: ReportingScope[];
  quota: {
    limit: number;
    window_seconds: number;
  };
  status: IntegrationClientStatus;
  created_at: string;
  created_by: {
    uid: string;
    email: string;
  };
}

export interface ReportingIntegrationClientSummary {
  client_id: string;
  name: string;
  scopes: ReportingScope[];
  quota: {
    limit: number;
    window_seconds: number;
  };
  status: IntegrationClientStatus;
  created_at: string;
  created_by: {
    uid: string;
    email: string;
  };
  secret_prefix?: string;
  last_secret_rotated_at?: string;
  last_secret_rotated_by?: {
    uid: string;
    email: string;
  };
  revoked_at?: string;
  revoked_by?: {
    uid: string;
    email: string;
  };
  last_token_issued_at?: string;
  last_used_at?: string;
  usage_count: number;
  token_issue_count: number;
}

export interface ReportingIntegrationClientListResult {
  clients: ReportingIntegrationClientSummary[];
  next_cursor?: string;
}

export interface ReportingIntegrationClientSecretRotateResult {
  client: ReportingIntegrationClientSummary;
  client_secret: string;
}

export interface ReportingIntegrationClientRevokeResult {
  client: ReportingIntegrationClientSummary;
}

export interface ReportingIntegrationClientAccessEvent {
  id: string;
  event_type: IntegrationClientAccessEventType;
  client_id: string;
  client_name: string;
  occurred_at: string;
  actor: {
    uid: string;
    email: string;
  };
  status?: IntegrationClientStatus;
  secret_prefix?: string;
  previous_secret_prefix?: string;
  quota?: {
    limit: number;
    window_seconds: number;
  };
  scopes?: ReportingScope[];
}

export interface ReportingIntegrationClientAccessEventListResult {
  events: ReportingIntegrationClientAccessEvent[];
  next_cursor?: string;
}

export interface ReportingOAuthTokenInput {
  grant_type: "client_credentials";
  client_id: string;
  client_secret: string;
}

export interface ReportingOAuthTokenResult {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export interface ReportingAccessTokenVerificationResult {
  ok: true;
  client_id: string;
  token_type: "Bearer";
  expires_at: string;
  scope: string;
  quota: {
    limit: number;
    remaining: number;
    reset_at: string;
    window_seconds: number;
  };
}

type IntegrationClientRecord = {
  clientId: string;
  name: string;
  clientSecretHash?: string;
  clientSecretPrefix?: string;
  scopes: ReportingScope[];
  quotaPerMinute: number;
  status: IntegrationClientStatus;
  createdAt: string;
  createdByUid: string;
  createdByEmail: string;
  lastSecretRotatedAt?: string;
  lastSecretRotatedByUid?: string;
  lastSecretRotatedByEmail?: string;
  revokedAt?: string;
  revokedByUid?: string;
  revokedByEmail?: string;
  lastTokenIssuedAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  tokenIssueCount: number;
  quotaWindow?: string;
  quotaWindowCount?: number;
};

type AccessTokenRecord = {
  clientId: string;
  tokenHash: string;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string;
  scope: string;
  revokedAt?: string;
};

type SnapshotLike = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

type QueryDocumentLike = {
  id: string;
  data: () => Record<string, unknown> | undefined;
};

type QuerySnapshotLike = {
  docs: QueryDocumentLike[];
};

function defaultQuotaPerMinute() {
  const parsed = Number(
    process.env.GOLDENCROW_OPENAPI_REPORTING_QUOTA_PER_MINUTE,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUOTA_PER_MINUTE;
  }

  return Math.floor(parsed);
}

function normalizeQuota(value: number | undefined) {
  if (value === undefined) {
    return defaultQuotaPerMinute();
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new AdminRepositoryError("quotaPerMinute must be positive.", 400);
  }

  return Math.floor(value);
}

function normalizePageLimit(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.min(MAX_PAGE_LIMIT, Math.floor(value));
}

function normalizeCursor(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const timestamp = new Date(normalized);
  return Number.isNaN(timestamp.getTime())
    ? undefined
    : timestamp.toISOString();
}

function generateCredential(prefix: string) {
  return `${prefix}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secretPrefix(value: string) {
  return value.slice(0, 18);
}

function safeHashEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function accessTokenExpiresAt(now = new Date()) {
  return new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
}

function minuteWindowStart(now: Date) {
  return new Date(
    Math.floor(now.getTime() / (QUOTA_WINDOW_SECONDS * 1000)) *
      QUOTA_WINDOW_SECONDS *
      1000,
  );
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeName(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new AdminRepositoryError("Integration client name is required.", 400);
  }

  return normalized.slice(0, 120);
}

function normalizeClientId(value: string) {
  const normalized = value.trim();
  if (!normalized.startsWith(CLIENT_ID_PREFIX)) {
    throw new AdminRepositoryError("Invalid client_id.", 401);
  }

  return normalized;
}

function normalizeClientSecret(value: string) {
  const normalized = value.trim();
  if (!normalized.startsWith(CLIENT_SECRET_PREFIX)) {
    throw new AdminRepositoryError("Invalid client_secret.", 401);
  }

  return normalized;
}

function normalizeAccessToken(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new AdminRepositoryError("Missing access token.", 401);
  }

  if (!normalized.startsWith(ACCESS_TOKEN_PREFIX)) {
    throw new AdminRepositoryError("Invalid access token.", 401);
  }

  return normalized;
}

function normalizeScopes(value: unknown): ReportingScope[] {
  if (!Array.isArray(value)) {
    return [...REPORTING_SCOPES];
  }

  const scopes = value.filter((entry): entry is ReportingScope =>
    REPORTING_SCOPES.includes(entry as ReportingScope),
  );
  return scopes.length > 0 ? scopes : [...REPORTING_SCOPES];
}

function readClientRecord(snapshot: SnapshotLike): IntegrationClientRecord {
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Invalid client credentials.", 401);
  }

  const data = snapshot.data() ?? {};
  const clientId = asString(data.clientId);
  const name = asString(data.name);
  const clientSecretHash = asString(data.clientSecretHash);
  const clientSecretPrefix = asString(data.clientSecretPrefix);
  const createdAt = asString(data.createdAt);
  const createdByUid = asString(data.createdByUid);
  const createdByEmail = asString(data.createdByEmail);
  const status =
    data.status === "revoked"
      ? "revoked"
      : ("active" as IntegrationClientStatus);

  if (!clientId || !name || !createdAt) {
    throw new AdminRepositoryError("Invalid client credentials.", 401);
  }

  return {
    clientId,
    name,
    clientSecretHash,
    clientSecretPrefix,
    scopes: normalizeScopes(data.scopes),
    quotaPerMinute: asNumber(data.quotaPerMinute) ?? DEFAULT_QUOTA_PER_MINUTE,
    status,
    createdAt,
    createdByUid: createdByUid ?? "",
    createdByEmail: createdByEmail ?? "",
    lastSecretRotatedAt: asString(data.lastSecretRotatedAt),
    lastSecretRotatedByUid: asString(data.lastSecretRotatedByUid),
    lastSecretRotatedByEmail: asString(data.lastSecretRotatedByEmail),
    revokedAt: asString(data.revokedAt),
    revokedByUid: asString(data.revokedByUid),
    revokedByEmail: asString(data.revokedByEmail),
    lastTokenIssuedAt: asString(data.lastTokenIssuedAt),
    lastUsedAt: asString(data.lastUsedAt),
    usageCount: asNumber(data.usageCount) ?? 0,
    tokenIssueCount: asNumber(data.tokenIssueCount) ?? 0,
    quotaWindow: asString(data.quotaWindow),
    quotaWindowCount: asNumber(data.quotaWindowCount),
  };
}

function readAccessTokenRecord(snapshot: SnapshotLike): AccessTokenRecord {
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Invalid access token.", 401);
  }

  const data = snapshot.data() ?? {};
  const clientId = asString(data.clientId);
  const tokenHash = asString(data.tokenHash);
  const tokenPrefix = asString(data.tokenPrefix);
  const createdAt = asString(data.createdAt);
  const expiresAt = asString(data.expiresAt);
  const scope = asString(data.scope);

  if (!clientId || !tokenHash || !tokenPrefix || !createdAt || !expiresAt) {
    throw new AdminRepositoryError("Invalid access token.", 401);
  }

  return {
    clientId,
    tokenHash,
    tokenPrefix,
    createdAt,
    expiresAt,
    scope: scope ?? REPORTING_SCOPES.join(" "),
    revokedAt: asString(data.revokedAt),
  };
}

function assertCanManageIntegrationClients(context: AdminContext) {
  if (context.role !== "full_admin" && !context.isBootstrap) {
    throw new AdminRepositoryError(
      "Only full admins can manage reporting integration clients.",
      403,
    );
  }
}

function assertActiveClient(record: IntegrationClientRecord) {
  if (record.status !== "active") {
    throw new AdminRepositoryError("Integration client was revoked.", 401);
  }
}

function assertUsableToken(record: AccessTokenRecord, now: Date) {
  if (record.revokedAt) {
    throw new AdminRepositoryError("Access token was revoked.", 401);
  }

  const expiresAtMs = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
    throw new AdminRepositoryError("Access token expired.", 401);
  }
}

function requiredScopeForEndpoint(endpoint?: string): ReportingScope | null {
  if (!endpoint) {
    return null;
  }

  return endpoint.includes("/reports/upload")
    ? "reporting:write"
    : "reporting:read";
}

function assertScope(record: IntegrationClientRecord, endpoint?: string) {
  const requiredScope = requiredScopeForEndpoint(endpoint);
  if (requiredScope && !record.scopes.includes(requiredScope)) {
    throw new AdminRepositoryError("Access token scope is insufficient.", 403);
  }
}

function clientRef(clientId: string) {
  return adminDb.collection(CLIENTS_COLLECTION).doc(clientId);
}

function accessTokenRef(token: string) {
  return adminDb.collection(TOKENS_COLLECTION).doc(hashSecret(token));
}

function auditLogRef() {
  return adminDb.collection(AUDIT_LOGS_COLLECTION).doc();
}

function accessEventRef() {
  return adminDb.collection(ACCESS_EVENTS_COLLECTION).doc();
}

function eventFromRecord(
  id: string,
  data: Record<string, unknown> | undefined,
): ReportingIntegrationClientAccessEvent | null {
  if (!data) {
    return null;
  }

  const eventType = asString(data.eventType);
  const clientId = asString(data.clientId);
  const clientName = asString(data.clientName);
  const occurredAt = asString(data.occurredAt);
  const actorUid = asString(data.actorUid);
  const actorEmail = asString(data.actorEmail);
  if (
    eventType !== "integration_client.created" &&
    eventType !== "integration_client.secret_created" &&
    eventType !== "integration_client.secret_rotated" &&
    eventType !== "integration_client.revoked"
  ) {
    return null;
  }

  if (!clientId || !clientName || !occurredAt || !actorUid || !actorEmail) {
    return null;
  }

  const status =
    data.status === "revoked"
      ? "revoked"
      : data.status === "active"
        ? "active"
        : undefined;
  const quotaLimit = asNumber(data.quotaPerMinute);

  return {
    id,
    event_type: eventType,
    client_id: clientId,
    client_name: clientName,
    occurred_at: occurredAt,
    actor: {
      uid: actorUid,
      email: actorEmail,
    },
    status,
    secret_prefix: asString(data.secretPrefix),
    previous_secret_prefix: asString(data.previousSecretPrefix),
    quota: quotaLimit
      ? {
          limit: quotaLimit,
          window_seconds: QUOTA_WINDOW_SECONDS,
        }
      : undefined,
    scopes: normalizeScopes(data.scopes),
  };
}

function clientSummaryFromRecord(
  record: IntegrationClientRecord,
): ReportingIntegrationClientSummary {
  const summary: ReportingIntegrationClientSummary = {
    client_id: record.clientId,
    name: record.name,
    scopes: record.scopes,
    quota: {
      limit: record.quotaPerMinute,
      window_seconds: QUOTA_WINDOW_SECONDS,
    },
    status: record.status,
    created_at: record.createdAt,
    created_by: {
      uid: record.createdByUid,
      email: record.createdByEmail,
    },
    secret_prefix: record.clientSecretPrefix,
    usage_count: record.usageCount,
    token_issue_count: record.tokenIssueCount,
  };

  if (record.lastSecretRotatedAt) {
    summary.last_secret_rotated_at = record.lastSecretRotatedAt;
    summary.last_secret_rotated_by = {
      uid: record.lastSecretRotatedByUid ?? "",
      email: record.lastSecretRotatedByEmail ?? "",
    };
  }

  if (record.revokedAt) {
    summary.revoked_at = record.revokedAt;
    summary.revoked_by = {
      uid: record.revokedByUid ?? "",
      email: record.revokedByEmail ?? "",
    };
  }

  if (record.lastTokenIssuedAt) {
    summary.last_token_issued_at = record.lastTokenIssuedAt;
  }

  if (record.lastUsedAt) {
    summary.last_used_at = record.lastUsedAt;
  }

  return summary;
}

function accessEventPayload(input: {
  eventType: IntegrationClientAccessEventType;
  client: IntegrationClientRecord | ReportingIntegrationClientSummary;
  actor: AdminContext;
  occurredAt: string;
  secretPrefix?: string;
  previousSecretPrefix?: string;
  status?: IntegrationClientStatus;
}) {
  const payload = {
    eventType: input.eventType,
    clientId:
      "clientId" in input.client
        ? input.client.clientId
        : input.client.client_id,
    clientName: input.client.name,
    occurredAt: input.occurredAt,
    actorUid: input.actor.uid,
    actorEmail: input.actor.email,
    status: input.status ?? input.client.status,
    secretPrefix: input.secretPrefix,
    previousSecretPrefix: input.previousSecretPrefix,
    scopes: [...input.client.scopes],
    quotaPerMinute:
      "quotaPerMinute" in input.client
        ? input.client.quotaPerMinute
        : input.client.quota.limit,
    quotaWindowSeconds: QUOTA_WINDOW_SECONDS,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function pageFromDocs<T>(
  docs: QueryDocumentLike[],
  limit: number,
  mapper: (doc: QueryDocumentLike) => T | null,
  cursorField: string,
) {
  const pageDocs = docs.slice(0, limit);
  const items = pageDocs
    .map((doc) => mapper(doc))
    .filter((item): item is T => item !== null);
  const lastDoc = pageDocs.at(-1);
  const lastData = lastDoc?.data();
  const nextCursor =
    docs.length > limit ? asString(lastData?.[cursorField]) : undefined;

  return {
    items,
    nextCursor,
  };
}

async function paginatedQuery(
  collectionName: string,
  orderField: string,
  input: { limit?: number; cursor?: string } = {},
) {
  const pageLimit = normalizePageLimit(input.limit);
  const cursor = normalizeCursor(input.cursor);
  let query: Query = adminDb
    .collection(collectionName)
    .orderBy(orderField, "desc");
  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snapshot = (await query
    .limit(pageLimit + 1)
    .get()) as QuerySnapshotLike;
  return {
    docs: snapshot.docs,
    pageLimit,
  };
}

export async function createReportingIntegrationClient(
  context: AdminContext,
  input: ReportingIntegrationClientCreateInput,
): Promise<ReportingIntegrationClientCreateResult> {
  assertCanManageIntegrationClients(context);

  const name = normalizeName(input.name);
  const quotaPerMinute = normalizeQuota(input.quotaPerMinute);
  const clientId = generateCredential(CLIENT_ID_PREFIX);
  const now = new Date().toISOString();
  const clientData = {
    clientId,
    name,
    scopes: [...REPORTING_SCOPES],
    quotaPerMinute,
    quotaWindowSeconds: QUOTA_WINDOW_SECONDS,
    status: "active" as const,
    createdAt: now,
    createdByUid: context.uid,
    createdByEmail: context.email,
    usageCount: 0,
    tokenIssueCount: 0,
  };

  await adminDb.runTransaction(async (transaction) => {
    transaction.set(clientRef(clientId), clientData);
    transaction.set(
      accessEventRef(),
      accessEventPayload({
        eventType: "integration_client.created",
        client: readClientRecord({
          exists: true,
          data: () => clientData,
        }),
        actor: context,
        occurredAt: now,
        status: "active",
      }),
    );
  });

  return {
    client_id: clientId,
    name,
    scopes: [...REPORTING_SCOPES],
    quota: {
      limit: quotaPerMinute,
      window_seconds: QUOTA_WINDOW_SECONDS,
    },
    status: "active",
    created_at: now,
    created_by: {
      uid: context.uid,
      email: context.email,
    },
  };
}

export async function listReportingIntegrationClients(
  context: AdminContext,
  input: { limit?: number; cursor?: string } = {},
): Promise<ReportingIntegrationClientListResult> {
  assertCanManageIntegrationClients(context);

  const { docs, pageLimit } = await paginatedQuery(
    CLIENTS_COLLECTION,
    "createdAt",
    input,
  );
  const { items, nextCursor } = pageFromDocs(
    docs,
    pageLimit,
    (doc) =>
      clientSummaryFromRecord(
        readClientRecord({
          exists: true,
          data: doc.data,
        }),
      ),
    "createdAt",
  );

  return {
    clients: items,
    next_cursor: nextCursor,
  };
}

export async function listReportingIntegrationClientAccessEvents(
  context: AdminContext,
  input: { limit?: number; cursor?: string } = {},
): Promise<ReportingIntegrationClientAccessEventListResult> {
  assertCanManageIntegrationClients(context);

  const { docs, pageLimit } = await paginatedQuery(
    ACCESS_EVENTS_COLLECTION,
    "occurredAt",
    input,
  );
  const { items, nextCursor } = pageFromDocs(
    docs,
    pageLimit,
    (doc) => eventFromRecord(doc.id, doc.data()),
    "occurredAt",
  );

  return {
    events: items,
    next_cursor: nextCursor,
  };
}

export async function rotateReportingIntegrationClientSecret(
  context: AdminContext,
  clientIdInput: string,
): Promise<ReportingIntegrationClientSecretRotateResult> {
  assertCanManageIntegrationClients(context);

  const clientId = normalizeClientId(clientIdInput);
  const newSecret = generateCredential(CLIENT_SECRET_PREFIX);
  const newSecretPrefix = secretPrefix(newSecret);
  const now = new Date().toISOString();

  return adminDb.runTransaction(async (transaction) => {
    const ref = clientRef(clientId);
    const snapshot = (await transaction.get(ref)) as SnapshotLike;
    const client = readClientRecord(snapshot);
    assertActiveClient(client);

    const update = {
      clientSecretHash: hashSecret(newSecret),
      clientSecretPrefix: newSecretPrefix,
      lastSecretRotatedAt: now,
      lastSecretRotatedByUid: context.uid,
      lastSecretRotatedByEmail: context.email,
      secretVersion: FieldValue.increment(1),
    };
    transaction.update(ref, update);

    const updatedClient: IntegrationClientRecord = {
      ...client,
      clientSecretHash: update.clientSecretHash,
      clientSecretPrefix: newSecretPrefix,
      lastSecretRotatedAt: now,
      lastSecretRotatedByUid: context.uid,
      lastSecretRotatedByEmail: context.email,
    };
    transaction.set(
      accessEventRef(),
      accessEventPayload({
        eventType: client.clientSecretHash
          ? "integration_client.secret_rotated"
          : "integration_client.secret_created",
        client: updatedClient,
        actor: context,
        occurredAt: now,
        secretPrefix: newSecretPrefix,
        previousSecretPrefix: client.clientSecretPrefix,
      }),
    );

    return {
      client: clientSummaryFromRecord(updatedClient),
      client_secret: newSecret,
    };
  });
}

export async function revokeReportingIntegrationClient(
  context: AdminContext,
  clientIdInput: string,
): Promise<ReportingIntegrationClientRevokeResult> {
  assertCanManageIntegrationClients(context);

  const clientId = normalizeClientId(clientIdInput);
  const now = new Date().toISOString();

  return adminDb.runTransaction(async (transaction) => {
    const ref = clientRef(clientId);
    const snapshot = (await transaction.get(ref)) as SnapshotLike;
    const client = readClientRecord(snapshot);
    const updatedClient: IntegrationClientRecord = {
      ...client,
      status: "revoked",
      revokedAt: client.revokedAt ?? now,
      revokedByUid: client.revokedByUid ?? context.uid,
      revokedByEmail: client.revokedByEmail ?? context.email,
    };

    if (client.status !== "revoked") {
      transaction.update(ref, {
        status: "revoked",
        revokedAt: now,
        revokedByUid: context.uid,
        revokedByEmail: context.email,
      });
      transaction.set(
        accessEventRef(),
        accessEventPayload({
          eventType: "integration_client.revoked",
          client: updatedClient,
          actor: context,
          occurredAt: now,
          status: "revoked",
        }),
      );
    }

    return {
      client: clientSummaryFromRecord(updatedClient),
    };
  });
}

export async function exchangeReportingClientCredentials(
  input: ReportingOAuthTokenInput,
): Promise<ReportingOAuthTokenResult> {
  if (input.grant_type !== "client_credentials") {
    throw new AdminRepositoryError("Unsupported grant_type.", 400);
  }

  const clientId = normalizeClientId(input.client_id);
  const clientSecret = normalizeClientSecret(input.client_secret);
  const ref = clientRef(clientId);
  const now = new Date();
  const expiresAt = accessTokenExpiresAt(now);
  const accessToken = generateCredential(ACCESS_TOKEN_PREFIX);
  const accessTokenHash = hashSecret(accessToken);

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = (await transaction.get(ref)) as SnapshotLike;
    const client = readClientRecord(snapshot);
    assertActiveClient(client);

    if (!client.clientSecretHash) {
      throw new AdminRepositoryError(
        "Client secret has not been generated.",
        401,
      );
    }

    if (!safeHashEquals(hashSecret(clientSecret), client.clientSecretHash)) {
      throw new AdminRepositoryError("Invalid client credentials.", 401);
    }

    transaction.set(accessTokenRef(accessToken), {
      tokenHash: accessTokenHash,
      tokenPrefix: secretPrefix(accessToken),
      tokenType: "Bearer",
      clientId: client.clientId,
      clientName: client.name,
      scope: client.scopes.join(" "),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      usageCount: 0,
    });
    transaction.update(ref, {
      lastTokenIssuedAt: now.toISOString(),
      tokenIssueCount: FieldValue.increment(1),
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: client.scopes.join(" "),
    };
  });
}

export async function verifyReportingAccessToken(
  token: string,
  endpoint?: string,
): Promise<ReportingAccessTokenVerificationResult> {
  const normalizedToken = normalizeAccessToken(token);
  const tokenRef = accessTokenRef(normalizedToken);
  const now = new Date();
  const windowStart = minuteWindowStart(now);
  const windowKey = windowStart.toISOString();
  const resetAt = new Date(
    windowStart.getTime() + QUOTA_WINDOW_SECONDS * 1000,
  ).toISOString();

  return adminDb.runTransaction(async (transaction) => {
    const tokenSnapshot = (await transaction.get(tokenRef)) as SnapshotLike;
    const tokenRecord = readAccessTokenRecord(tokenSnapshot);
    assertUsableToken(tokenRecord, now);

    const client = readClientRecord(
      (await transaction.get(clientRef(tokenRecord.clientId))) as SnapshotLike,
    );
    assertActiveClient(client);
    assertScope(client, endpoint);

    const currentCount =
      client.quotaWindow === windowKey ? (client.quotaWindowCount ?? 0) : 0;
    if (currentCount >= client.quotaPerMinute) {
      throw new AdminRepositoryError("Client quota exceeded.", 429);
    }

    const usageUpdate: Record<string, unknown> = {
      quotaWindow: windowKey,
      quotaWindowCount: currentCount + 1,
      lastUsedAt: now.toISOString(),
      usageCount: FieldValue.increment(1),
    };
    if (endpoint) {
      usageUpdate.lastEndpoint = endpoint;
    }

    transaction.update(clientRef(client.clientId), usageUpdate);
    transaction.update(tokenRef, {
      lastUsedAt: now.toISOString(),
      usageCount: FieldValue.increment(1),
    });
    transaction.set(auditLogRef(), {
      clientId: client.clientId,
      clientName: client.name,
      endpoint: endpoint ?? null,
      usedAt: now.toISOString(),
      tokenPrefix: tokenRecord.tokenPrefix,
      quotaWindow: windowKey,
      result: "accepted",
    });

    return {
      ok: true,
      client_id: client.clientId,
      token_type: "Bearer",
      expires_at: tokenRecord.expiresAt,
      scope: tokenRecord.scope,
      quota: {
        limit: client.quotaPerMinute,
        remaining: Math.max(0, client.quotaPerMinute - currentCount - 1),
        reset_at: resetAt,
        window_seconds: QUOTA_WINDOW_SECONDS,
      },
    };
  });
}

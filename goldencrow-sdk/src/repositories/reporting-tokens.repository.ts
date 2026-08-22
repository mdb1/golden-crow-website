import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");

const CLIENTS_COLLECTION = "openapi_reporting_integration_clients";
const TOKENS_COLLECTION = "openapi_reporting_access_tokens";
const AUDIT_LOGS_COLLECTION = "openapi_reporting_audit_logs";
const CLIENT_ID_PREFIX = "gci_live_";
const CLIENT_SECRET_PREFIX = "gcs_live_";
const ACCESS_TOKEN_PREFIX = "rpt_access_";
const RANDOM_BYTES = 32;
const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const QUOTA_WINDOW_SECONDS = 60;
const DEFAULT_QUOTA_PER_MINUTE = 60;
const REPORTING_SCOPES = ["reporting:read", "reporting:write"] as const;

type ReportingScope = (typeof REPORTING_SCOPES)[number];
type IntegrationClientStatus = "active" | "revoked";

export interface ReportingIntegrationClientCreateInput {
  name: string;
  quotaPerMinute?: number;
}

export interface ReportingIntegrationClientCreateResult {
  client_id: string;
  client_secret: string;
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
  clientSecretHash: string;
  scopes: ReportingScope[];
  quotaPerMinute: number;
  status: IntegrationClientStatus;
  createdAt: string;
  createdByUid: string;
  createdByEmail: string;
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
  const createdAt = asString(data.createdAt);
  const createdByUid = asString(data.createdByUid);
  const createdByEmail = asString(data.createdByEmail);
  const status =
    data.status === "revoked"
      ? "revoked"
      : ("active" as IntegrationClientStatus);

  if (!clientId || !name || !clientSecretHash || !createdAt) {
    throw new AdminRepositoryError("Invalid client credentials.", 401);
  }

  return {
    clientId,
    name,
    clientSecretHash,
    scopes: normalizeScopes(data.scopes),
    quotaPerMinute: asNumber(data.quotaPerMinute) ?? DEFAULT_QUOTA_PER_MINUTE,
    status,
    createdAt,
    createdByUid: createdByUid ?? "",
    createdByEmail: createdByEmail ?? "",
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

function assertCanCreateIntegrationClient(context: AdminContext) {
  if (context.role !== "full_admin" && !context.isBootstrap) {
    throw new AdminRepositoryError(
      "Only full admins can create reporting integration clients.",
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

export async function createReportingIntegrationClient(
  context: AdminContext,
  input: ReportingIntegrationClientCreateInput,
): Promise<ReportingIntegrationClientCreateResult> {
  assertCanCreateIntegrationClient(context);

  const name = normalizeName(input.name);
  const quotaPerMinute = normalizeQuota(input.quotaPerMinute);
  const clientId = generateCredential(CLIENT_ID_PREFIX);
  const clientSecret = generateCredential(CLIENT_SECRET_PREFIX);
  const now = new Date().toISOString();

  await clientRef(clientId).set({
    clientId,
    name,
    clientSecretHash: hashSecret(clientSecret),
    clientSecretPrefix: secretPrefix(clientSecret),
    scopes: [...REPORTING_SCOPES],
    quotaPerMinute,
    quotaWindowSeconds: QUOTA_WINDOW_SECONDS,
    status: "active",
    createdAt: now,
    createdByUid: context.uid,
    createdByEmail: context.email,
    usageCount: 0,
    tokenIssueCount: 0,
  });

  return {
    client_id: clientId,
    client_secret: clientSecret,
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

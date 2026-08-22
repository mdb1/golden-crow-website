import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");

const TOKENS_COLLECTION = "openapi_reporting_access_tokens";
const TOKEN_PREFIX = "rpt_access_";
const TOKEN_RANDOM_BYTES = 32;
const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const QUOTA_WINDOW_SECONDS = 60;
const DEFAULT_QUOTA_PER_MINUTE = 60;

export interface ReportingTokenIssueResult {
  token: string;
  tokenType: "Bearer";
  expiresAt: string;
  expiresInSeconds: number;
  quota: {
    limit: number;
    windowSeconds: number;
  };
  issuedTo: {
    uid: string;
    email: string;
  };
}

export interface ReportingTokenVerificationResult {
  ok: true;
  tokenType: "Bearer";
  expiresAt: string;
  quota: {
    limit: number;
    remaining: number;
    resetAt: string;
    windowSeconds: number;
  };
  issuedTo: {
    uid: string;
    email: string;
  };
}

type TokenRecord = {
  adminUid: string;
  adminEmail: string;
  createdAt: string;
  expiresAt: string;
  quotaPerMinute?: number;
  quotaWindow?: string;
  quotaWindowCount?: number;
  revokedAt?: string;
};

type SnapshotLike = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

function quotaPerMinute() {
  const parsed = Number(
    process.env.GOLDENCROW_OPENAPI_REPORTING_QUOTA_PER_MINUTE,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUOTA_PER_MINUTE;
  }

  return Math.floor(parsed);
}

function tokenExpiresAt(now = new Date()) {
  return new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);
}

function generateToken() {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString("base64url")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenPrefix(token: string) {
  return token.slice(0, 18);
}

function normalizeToken(token: string) {
  const normalized = token.trim();
  if (!normalized) {
    throw new AdminRepositoryError("Missing reporting access token.", 401);
  }

  if (!normalized.startsWith(TOKEN_PREFIX)) {
    throw new AdminRepositoryError("Invalid reporting access token.", 401);
  }

  return normalized;
}

function assertCanIssueReportingToken(context: AdminContext) {
  if (context.role !== "full_admin" && !context.isBootstrap) {
    throw new AdminRepositoryError(
      "Only full admins can issue reporting access tokens.",
      403,
    );
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readTokenRecord(snapshot: SnapshotLike): TokenRecord {
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Invalid reporting access token.", 401);
  }

  const data = snapshot.data() ?? {};
  const adminUid = asString(data.adminUid);
  const adminEmail = asString(data.adminEmail);
  const createdAt = asString(data.createdAt);
  const expiresAt = asString(data.expiresAt);

  if (!adminUid || !adminEmail || !createdAt || !expiresAt) {
    throw new AdminRepositoryError("Invalid reporting access token.", 401);
  }

  return {
    adminUid,
    adminEmail,
    createdAt,
    expiresAt,
    quotaPerMinute: asNumber(data.quotaPerMinute),
    quotaWindow: asString(data.quotaWindow),
    quotaWindowCount: asNumber(data.quotaWindowCount),
    revokedAt: asString(data.revokedAt),
  };
}

function assertUsableToken(record: TokenRecord, now: Date) {
  if (record.revokedAt) {
    throw new AdminRepositoryError("Reporting access token was revoked.", 401);
  }

  const expiresAtMs = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
    throw new AdminRepositoryError("Reporting access token expired.", 401);
  }
}

function minuteWindowStart(now: Date) {
  return new Date(
    Math.floor(now.getTime() / (QUOTA_WINDOW_SECONDS * 1000)) *
      QUOTA_WINDOW_SECONDS *
      1000,
  );
}

function tokenIssueResult(
  token: string,
  context: Pick<AdminContext, "uid" | "email">,
  expiresAt: Date,
  limit: number,
): ReportingTokenIssueResult {
  return {
    token,
    tokenType: "Bearer",
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: TOKEN_TTL_SECONDS,
    quota: {
      limit,
      windowSeconds: QUOTA_WINDOW_SECONDS,
    },
    issuedTo: {
      uid: context.uid,
      email: context.email,
    },
  };
}

function tokenDocument(token: string) {
  return adminDb.collection(TOKENS_COLLECTION).doc(hashToken(token));
}

export async function issueReportingAccessToken(
  context: AdminContext,
): Promise<ReportingTokenIssueResult> {
  assertCanIssueReportingToken(context);

  const token = generateToken();
  const now = new Date();
  const expiresAt = tokenExpiresAt(now);
  const limit = quotaPerMinute();

  await tokenDocument(token).set({
    tokenHash: hashToken(token),
    tokenPrefix: tokenPrefix(token),
    tokenType: "Bearer",
    scope: "reporting",
    adminUid: context.uid,
    adminEmail: context.email,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    quotaPerMinute: limit,
    quotaWindowSeconds: QUOTA_WINDOW_SECONDS,
    usageCount: 0,
  });

  return tokenIssueResult(token, context, expiresAt, limit);
}

export async function verifyReportingAccessToken(
  token: string,
  endpoint?: string,
): Promise<ReportingTokenVerificationResult> {
  const normalizedToken = normalizeToken(token);
  const ref = tokenDocument(normalizedToken);
  const now = new Date();
  const windowStart = minuteWindowStart(now);
  const windowKey = windowStart.toISOString();
  const resetAt = new Date(
    windowStart.getTime() + QUOTA_WINDOW_SECONDS * 1000,
  ).toISOString();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = (await transaction.get(ref)) as SnapshotLike;
    const record = readTokenRecord(snapshot);
    assertUsableToken(record, now);

    const limit = record.quotaPerMinute ?? DEFAULT_QUOTA_PER_MINUTE;
    const currentCount =
      record.quotaWindow === windowKey ? (record.quotaWindowCount ?? 0) : 0;
    if (currentCount >= limit) {
      throw new AdminRepositoryError(
        "Reporting access token quota exceeded.",
        429,
      );
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

    transaction.update(ref, usageUpdate);

    return {
      ok: true,
      tokenType: "Bearer",
      expiresAt: record.expiresAt,
      quota: {
        limit,
        remaining: Math.max(0, limit - currentCount - 1),
        resetAt,
        windowSeconds: QUOTA_WINDOW_SECONDS,
      },
      issuedTo: {
        uid: record.adminUid,
        email: record.adminEmail,
      },
    };
  });
}

export async function refreshReportingAccessToken(
  token: string,
): Promise<ReportingTokenIssueResult> {
  const normalizedToken = normalizeToken(token);
  const currentRef = tokenDocument(normalizedToken);
  const nextToken = generateToken();
  const nextRef = tokenDocument(nextToken);
  const now = new Date();
  const expiresAt = tokenExpiresAt(now);

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = (await transaction.get(currentRef)) as SnapshotLike;
    const record = readTokenRecord(snapshot);
    assertUsableToken(record, now);

    const limit = record.quotaPerMinute ?? DEFAULT_QUOTA_PER_MINUTE;

    transaction.update(currentRef, {
      revokedAt: now.toISOString(),
      refreshedAt: now.toISOString(),
      replacedByTokenHash: hashToken(nextToken),
    });
    transaction.set(nextRef, {
      tokenHash: hashToken(nextToken),
      tokenPrefix: tokenPrefix(nextToken),
      tokenType: "Bearer",
      scope: "reporting",
      adminUid: record.adminUid,
      adminEmail: record.adminEmail,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      quotaPerMinute: limit,
      quotaWindowSeconds: QUOTA_WINDOW_SECONDS,
      refreshedFromTokenHash: hashToken(normalizedToken),
      usageCount: 0,
    });

    return tokenIssueResult(
      nextToken,
      { uid: record.adminUid, email: record.adminEmail },
      expiresAt,
      limit,
    );
  });
}

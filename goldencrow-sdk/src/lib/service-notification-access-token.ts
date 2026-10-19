import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SERVICE_NOTIFICATION_TOKEN_ISSUER = "goldencrow-openapi";
export const SERVICE_NOTIFICATION_TOKEN_AUDIENCE =
  "goldencrow-service-notifications";
export const SERVICE_NOTIFICATION_TOKEN_USE = "service_notifications";
export const SERVICE_NOTIFICATION_TOKEN_SCOPE =
  "service-transactions:notify";
export const SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

const SIGNING_SECRET_ENV =
  "SERVICE_TRANSACTION_NOTIFICATION_TOKEN_SIGNING_SECRET";
const MINIMUM_SIGNING_KEY_BYTES = 32;
const CLIENT_ID_PATTERN = /^gci_live_[A-Za-z0-9_-]+$/;
const MAX_CLIENT_ID_LENGTH = 256;
const DERIVATION_SALT = "goldencrow-service-notifications/v1";
const DERIVATION_INFO = "service-transaction-notification-access-token";

type ServiceNotificationTokenHeader = {
  alg: string;
  typ: string;
};

type ServiceNotificationTokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  client_id: string;
  scope: string;
  token_use: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
};

export interface ServiceNotificationAccessTokenResult {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: typeof SERVICE_NOTIFICATION_TOKEN_SCOPE;
}

export interface ServiceNotificationAccessTokenVerificationResult {
  client_id: string;
  scope: typeof SERVICE_NOTIFICATION_TOKEN_SCOPE;
  issued_at: string;
  expires_at: string;
  token_id: string;
}

export class ServiceNotificationTokenError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 | 500,
  ) {
    super(message);
    this.name = "ServiceNotificationTokenError";
  }
}

export function isServiceNotificationTokenError(
  error: unknown,
): error is ServiceNotificationTokenError {
  return error instanceof ServiceNotificationTokenError;
}

function signingKey() {
  const configuredSecret = process.env[SIGNING_SECRET_ENV]?.trim();
  if (configuredSecret) {
    if (
      Buffer.byteLength(configuredSecret, "utf8") < MINIMUM_SIGNING_KEY_BYTES
    ) {
      throw new ServiceNotificationTokenError(
        `${SIGNING_SECRET_ENV} must contain at least ${MINIMUM_SIGNING_KEY_BYTES} bytes.`,
        500,
      );
    }

    return Buffer.from(configuredSecret, "utf8");
  }

  // Keep issuance deployable before a dedicated secret is configured. This
  // derives a separate HMAC key without importing or initializing Firebase.
  // The dedicated secret above remains preferred because rotating the source
  // service-account key necessarily invalidates tokens signed by this fallback.
  const privateKey = [
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    process.env.MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY,
  ]
    .find((value) => Boolean(value?.trim()))
    ?.trim()
    .replace(/\\n/g, "\n");
  if (!privateKey) {
    throw new ServiceNotificationTokenError(
      `${SIGNING_SECRET_ENV} or a MyDNAMap Firebase Admin private key must be configured.`,
      500,
    );
  }

  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(privateKey, "utf8"),
      Buffer.from(DERIVATION_SALT, "utf8"),
      Buffer.from(DERIVATION_INFO, "utf8"),
      MINIMUM_SIGNING_KEY_BYTES,
    ),
  );
}

function unixSeconds(value: Date) {
  return Math.floor(value.getTime() / 1000);
}

function isoTimestamp(value: number) {
  return new Date(value * 1000).toISOString();
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(signingInput: string, key: Buffer) {
  return createHmac("sha256", key).update(signingInput).digest("base64url");
}

function invalidToken(message = "Invalid service notification access token.") {
  return new ServiceNotificationTokenError(message, 401);
}

function parseJsonPart<T>(encoded: string): Partial<T> {
  try {
    return JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<T>;
  } catch {
    throw invalidToken();
  }
}

function assertValidDate(value: Date) {
  if (!Number.isFinite(value.getTime())) {
    throw new ServiceNotificationTokenError(
      "Cannot issue or verify a service notification token with an invalid date.",
      500,
    );
  }
}

export function issueServiceNotificationAccessToken(input: {
  clientId: string;
  now?: Date;
}): ServiceNotificationAccessTokenResult {
  const clientId = input.clientId.trim();
  if (
    clientId.length > MAX_CLIENT_ID_LENGTH ||
    !CLIENT_ID_PATTERN.test(clientId)
  ) {
    throw new ServiceNotificationTokenError(
      "Cannot issue a service notification token for an invalid client id.",
      500,
    );
  }

  const now = input.now ?? new Date();
  assertValidDate(now);
  const issuedAt = unixSeconds(now);
  const claims: ServiceNotificationTokenClaims = {
    iss: SERVICE_NOTIFICATION_TOKEN_ISSUER,
    aud: SERVICE_NOTIFICATION_TOKEN_AUDIENCE,
    sub: clientId,
    client_id: clientId,
    scope: SERVICE_NOTIFICATION_TOKEN_SCOPE,
    token_use: SERVICE_NOTIFICATION_TOKEN_USE,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS,
    jti: randomBytes(16).toString("base64url"),
  };
  const encodedHeader = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const encodedPayload = base64UrlJson(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(signingInput, signingKey());

  return {
    access_token: `${signingInput}.${signature}`,
    token_type: "Bearer",
    expires_in: SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS,
    scope: SERVICE_NOTIFICATION_TOKEN_SCOPE,
  };
}

export function verifyServiceNotificationAccessToken(
  token: string,
  now = new Date(),
): ServiceNotificationAccessTokenVerificationResult {
  assertValidDate(now);
  const normalizedToken = token.trim();
  const parts = normalizedToken.split(".");
  if (parts.length !== 3) {
    throw invalidToken();
  }

  const [encodedHeader, encodedPayload, suppliedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !suppliedSignature) {
    throw invalidToken();
  }

  const expectedSignature = sign(
    `${encodedHeader}.${encodedPayload}`,
    signingKey(),
  );
  const suppliedBuffer = Buffer.from(suppliedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw invalidToken();
  }

  const header = parseJsonPart<ServiceNotificationTokenHeader>(encodedHeader);
  const claims = parseJsonPart<ServiceNotificationTokenClaims>(encodedPayload);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw invalidToken();
  }

  if (
    claims.iss !== SERVICE_NOTIFICATION_TOKEN_ISSUER ||
    claims.aud !== SERVICE_NOTIFICATION_TOKEN_AUDIENCE ||
    claims.token_use !== SERVICE_NOTIFICATION_TOKEN_USE ||
    typeof claims.sub !== "string" ||
    claims.sub.length > MAX_CLIENT_ID_LENGTH ||
    !CLIENT_ID_PATTERN.test(claims.sub) ||
    typeof claims.client_id !== "string" ||
    claims.client_id !== claims.sub ||
    typeof claims.iat !== "number" ||
    !Number.isInteger(claims.iat) ||
    typeof claims.nbf !== "number" ||
    !Number.isInteger(claims.nbf) ||
    claims.nbf !== claims.iat ||
    typeof claims.exp !== "number" ||
    !Number.isInteger(claims.exp) ||
    claims.exp !== claims.iat + SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS ||
    typeof claims.jti !== "string" ||
    !claims.jti
  ) {
    throw invalidToken();
  }

  if (claims.scope !== SERVICE_NOTIFICATION_TOKEN_SCOPE) {
    throw new ServiceNotificationTokenError(
      "Service notification access token scope is insufficient.",
      403,
    );
  }

  const nowSeconds = unixSeconds(now);
  if (claims.nbf > nowSeconds) {
    throw invalidToken("Service notification access token is not active yet.");
  }
  if (claims.exp <= nowSeconds) {
    throw invalidToken("Service notification access token expired.");
  }

  return {
    client_id: claims.client_id,
    scope: SERVICE_NOTIFICATION_TOKEN_SCOPE,
    issued_at: isoTimestamp(claims.iat),
    expires_at: isoTimestamp(claims.exp),
    token_id: claims.jti,
  };
}

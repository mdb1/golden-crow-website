export {};

import { createHmac } from "node:crypto";
import {
  SERVICE_NOTIFICATION_TOKEN_AUDIENCE,
  SERVICE_NOTIFICATION_TOKEN_ISSUER,
  SERVICE_NOTIFICATION_TOKEN_SCOPE,
  SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS,
  SERVICE_NOTIFICATION_TOKEN_USE,
  issueServiceNotificationAccessToken,
  verifyServiceNotificationAccessToken,
} from "../lib/service-notification-access-token";

const SIGNING_SECRET_ENV =
  "SERVICE_TRANSACTION_NOTIFICATION_TOKEN_SIGNING_SECRET";
const TEST_SIGNING_SECRET = "notification-test-signing-secret-".repeat(2);
const CLIENT_ID = "gci_live_native-app-integration";
const ISSUED_AT = new Date("2026-10-19T12:00:00.000Z");

function decodePart<T>(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function resignWithPayload(
  accessToken: string,
  changes: Record<string, unknown>,
) {
  const [encodedHeader, encodedPayload] = accessToken.split(".");
  if (!encodedHeader || !encodedPayload) {
    throw new Error("Expected a JWT");
  }

  const payload = {
    ...decodePart<Record<string, unknown>>(encodedPayload),
    ...changes,
  };
  const changedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signingInput = `${encodedHeader}.${changedPayload}`;
  const signature = createHmac("sha256", TEST_SIGNING_SECRET)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

describe("service notification access tokens", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      [SIGNING_SECRET_ENV]: TEST_SIGNING_SECRET,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("issues a one-year notification-only JWT with the exact contract", () => {
    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });
    const [encodedHeader, encodedPayload] = result.access_token.split(".");
    if (!encodedHeader || !encodedPayload) {
      throw new Error("Expected a JWT");
    }

    expect(result).toMatchObject({
      access_token: expect.stringMatching(/^eyJ/),
      token_type: "Bearer",
      expires_in: 31_536_000,
      scope: "service-transactions:notify",
    });
    expect(decodePart(encodedHeader)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodePart(encodedPayload)).toMatchObject({
      iss: SERVICE_NOTIFICATION_TOKEN_ISSUER,
      aud: SERVICE_NOTIFICATION_TOKEN_AUDIENCE,
      sub: CLIENT_ID,
      client_id: CLIENT_ID,
      scope: SERVICE_NOTIFICATION_TOKEN_SCOPE,
      token_use: SERVICE_NOTIFICATION_TOKEN_USE,
      iat: Math.floor(ISSUED_AT.getTime() / 1000),
      nbf: Math.floor(ISSUED_AT.getTime() / 1000),
      exp:
        Math.floor(ISSUED_AT.getTime() / 1000) +
        SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS,
      jti: expect.any(String),
    });
  });

  it("verifies the same token ten times without a five-request quota", () => {
    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });
    const verificationTime = new Date(ISSUED_AT.getTime() + 60_000);

    const verifications = Array.from({ length: 10 }, () =>
      verifyServiceNotificationAccessToken(
        result.access_token,
        verificationTime,
      ),
    );

    expect(verifications).toHaveLength(10);
    expect(verifications).toEqual(
      verifications.map(() =>
        expect.objectContaining({
          client_id: CLIENT_ID,
          scope: SERVICE_NOTIFICATION_TOKEN_SCOPE,
        }),
      ),
    );
  });

  it("rejects a modified signature, wrong audience, and wrong token use", () => {
    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });
    const verificationTime = new Date(ISSUED_AT.getTime() + 60_000);
    const changedSignature = `${result.access_token.slice(0, -1)}x`;
    const wrongAudience = resignWithPayload(result.access_token, {
      aud: "another-audience",
    });
    const wrongTokenUse = resignWithPayload(result.access_token, {
      token_use: "reporting",
    });

    for (const token of [changedSignature, wrongAudience, wrongTokenUse]) {
      expect(() =>
        verifyServiceNotificationAccessToken(token, verificationTime),
      ).toThrow(
        expect.objectContaining({
          statusCode: 401,
        }),
      );
    }
  });

  it.each([
    ["wrong issuer", { iss: "another-issuer" }],
    ["mismatched client identity", { client_id: "gci_live_other-client" }],
    [
      "future not-before time",
      {
        iat: Math.floor(ISSUED_AT.getTime() / 1000) + 120,
        nbf: Math.floor(ISSUED_AT.getTime() / 1000) + 120,
        exp:
          Math.floor(ISSUED_AT.getTime() / 1000) +
          120 +
          SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS,
      },
    ],
  ])("rejects a correctly signed token with %s", (_label, changes) => {
    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });
    const changedToken = resignWithPayload(result.access_token, changes);

    expect(() =>
      verifyServiceNotificationAccessToken(
        changedToken,
        new Date(ISSUED_AT.getTime() + 60_000),
      ),
    ).toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  it("returns 403 for a correctly signed token without the exact scope", () => {
    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });
    const wrongScope = resignWithPayload(result.access_token, {
      scope: "reporting:write",
    });

    expect(() =>
      verifyServiceNotificationAccessToken(
        wrongScope,
        new Date(ISSUED_AT.getTime() + 60_000),
      ),
    ).toThrow(
      expect.objectContaining({
        statusCode: 403,
      }),
    );
  });

  it("rejects the token at its exact expiration time", () => {
    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });
    const expiresAt = new Date(
      ISSUED_AT.getTime() + SERVICE_NOTIFICATION_TOKEN_TTL_SECONDS * 1000,
    );

    expect(() =>
      verifyServiceNotificationAccessToken(result.access_token, expiresAt),
    ).toThrow(
      expect.objectContaining({
        message: "Service notification access token expired.",
        statusCode: 401,
      }),
    );
    expect(
      verifyServiceNotificationAccessToken(
        result.access_token,
        new Date(expiresAt.getTime() - 1_000),
      ),
    ).toMatchObject({ client_id: CLIENT_ID });
  });

  it("requires at least 32 bytes in the dedicated signing secret", () => {
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fallback-must-not-be-used";
    process.env[SIGNING_SECRET_ENV] = "x".repeat(31);

    expect(() =>
      issueServiceNotificationAccessToken({
        clientId: CLIENT_ID,
        now: ISSUED_AT,
      }),
    ).toThrow(expect.objectContaining({ statusCode: 500 }));

    process.env[SIGNING_SECRET_ENV] = "x".repeat(32);
    expect(
      issueServiceNotificationAccessToken({
        clientId: CLIENT_ID,
        now: ISSUED_AT,
      }).access_token,
    ).toMatch(/^eyJ/);
  });

  it("uses a domain-separated private-key fallback without Firebase access", () => {
    delete process.env[SIGNING_SECRET_ENV];
    process.env.FIREBASE_ADMIN_PRIVATE_KEY =
      "-----BEGIN PRIVATE KEY-----\\nserver-only-material\\n-----END PRIVATE KEY-----";

    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });

    expect(
      verifyServiceNotificationAccessToken(
        result.access_token,
        new Date(ISSUED_AT.getTime() + 60_000),
      ),
    ).toMatchObject({ client_id: CLIENT_ID });
  });

  it("uses the MyDNAMap private-key fallback when the legacy value is blank", () => {
    delete process.env[SIGNING_SECRET_ENV];
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = "   ";
    process.env.MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY =
      "-----BEGIN PRIVATE KEY-----\\nmydnamap-server-material\\n-----END PRIVATE KEY-----";

    const result = issueServiceNotificationAccessToken({
      clientId: CLIENT_ID,
      now: ISSUED_AT,
    });

    expect(
      verifyServiceNotificationAccessToken(
        result.access_token,
        new Date(ISSUED_AT.getTime() + 60_000),
      ),
    ).toMatchObject({ client_id: CLIENT_ID });
  });

  it("fails closed when no server-only signing material is configured", () => {
    delete process.env[SIGNING_SECRET_ENV];
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY;

    expect(() =>
      issueServiceNotificationAccessToken({
        clientId: CLIENT_ID,
        now: ISSUED_AT,
      }),
    ).toThrow(
      expect.objectContaining({
        statusCode: 500,
      }),
    );
  });
});

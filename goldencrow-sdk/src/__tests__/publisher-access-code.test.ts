import { createHmac, hkdfSync } from "node:crypto";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";
import type { Partner } from "../contracts/connected-partners.js";

const docs = new Map<string, Record<string, unknown>>();
const getUserByEmail = jest.fn();
const createCustomToken = jest.fn();
const reads: string[] = [];
jest.mock("../config/firebase.js", () => ({
  adminDbFor: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const path = `${name}/${id}`;
          reads.push(path);
          return { exists: docs.has(path), data: () => docs.get(path) };
        },
      }),
    }),
  }),
  adminAuthFor: () => ({ getUserByEmail, createCustomToken }),
}));

import {
  createPublisherAccessCode,
  readPublisherAccessCode,
} from "../lib/publisher-access-code.js";
import {
  exchangePublisherAccessCode,
  partnerPublisherAccessCode,
} from "../repositories/publisher-access-code.repository.js";
import { publisherAccessCodeRoutes } from "../routes/publisher-access-code.routes.js";

const context = makeAdminContext({ isBootstrap: true });
const identity = {
  email: "ana@example.com",
  uid: "publisher-uid",
  publisherKind: "organization" as const,
  publisherId: "org-one",
  authValidAfter: "Wed, 11 Nov 2026 10:00:00 GMT",
};
const partner: Partner = {
  id: "partner-one",
  companyName: "Genome Studio",
  firstName: "Ana",
  lastName: "Rivera",
  email: identity.email,
  phoneNumber: "",
  meetingDate: null,
  notes: null,
  linkedOrganizationId: identity.publisherId,
  linkedOrganization: { id: identity.publisherId, name: "Genome Studio" },
  linkedOrganizationSnapshot: null,
  linkedIndividualPublisherId: null,
  linkedIndividualPublisher: null,
  linkedIndividualPublisherSnapshot: null,
  linkedAppId: null,
  linkedApp: null,
  linkedAppSnapshot: null,
};
const now = new Date("2026-11-11T12:00:00Z");
const secretEnv = "PUBLISHER_PORTAL_ACCESS_CODE_SIGNING_SECRET";
const originalSecret = process.env[secretEnv];

function signedCodeWithLifetime(days: number) {
  const issuedAt = Date.parse("2026-11-11T00:00:00Z") / 1000;
  const payload = Buffer.from(JSON.stringify({
    ...identity,
    partnerId: partner.id,
    issuedAt,
    expiresAt: issuedAt + days * 86_400,
  })).toString("base64url");
  const key = Buffer.from(hkdfSync(
    "sha256",
    process.env[secretEnv]!,
    "pocketgenes-publisher-portal",
    "access-code-v1",
    32,
  ));
  const signature = createHmac("sha256", key)
    .update(`pgp1.${payload}`)
    .digest("base64url");
  return `pgp1.${payload}.${signature}`;
}

beforeEach(() => {
  jest.resetAllMocks();
  docs.clear();
  reads.length = 0;
  process.env[secretEnv] = "publisher-only-test-secret-with-at-least-32-bytes";
  docs.set(`user_roles/${identity.email}`, {
    role: "organization_publisher",
    isActive: true,
    organizationId: identity.publisherId,
    firebaseUid: identity.uid,
  });
  docs.set(`feed_organizations/${identity.publisherId}`, {
    name: "Genome Studio",
  });
  getUserByEmail.mockResolvedValue({
    uid: identity.uid,
    email: identity.email,
    disabled: false,
    tokensValidAfterTime: identity.authValidAfter,
  });
  createCustomToken.mockResolvedValue("firebase-custom-token");
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env[secretEnv];
  else process.env[secretEnv] = originalSecret;
});

it("creates reproducible, scoped, expiring credentials and validates the recipient", () => {
  const first = createPublisherAccessCode(identity, partner.id, now);
  expect(first).toEqual(
    createPublisherAccessCode(
      identity,
      partner.id,
      new Date("2026-11-11T23:00:00Z"),
    ),
  );
  expect(
    readPublisherAccessCode(first.accessKey, " ANA@EXAMPLE.COM ", now),
  ).toMatchObject({ ...identity, partnerId: partner.id });
  expect(first.expiresAt).toBe("2026-12-13T00:00:00.000Z");
  expect(() =>
    readPublisherAccessCode(first.accessKey, "other@example.com", now),
  ).toThrow("invalid or expired");
  expect(() =>
    readPublisherAccessCode(
      first.accessKey,
      identity.email,
      new Date(first.expiresAt),
    ),
  ).toThrow("invalid or expired");
  expect(() =>
    readPublisherAccessCode(
      first.accessKey,
      identity.email,
      new Date("2026-11-10T23:59:59Z"),
    ),
  ).toThrow("invalid or expired");
});

it.each([
  "2026-01-31T00:00:00.000Z",
  "2026-01-31T23:59:59.999Z",
  "2026-02-28T23:59:59.999Z",
  "2028-02-29T23:59:59.999Z",
  "2026-12-31T23:59:59.999Z",
])("guarantees at least 31 full days when generated at %s", (date) => {
  const generatedAt = new Date(date);
  const code = createPublisherAccessCode(identity, partner.id, generatedAt);
  const expiresAt = Date.parse(code.expiresAt);
  const minimumLifetime = 31 * 86_400_000;
  expect(expiresAt - generatedAt.getTime()).toBeGreaterThanOrEqual(minimumLifetime);
  expect(readPublisherAccessCode(
    code.accessKey,
    identity.email,
    new Date(generatedAt.getTime() + minimumLifetime),
  )).toMatchObject(identity);
  expect(readPublisherAccessCode(
    code.accessKey,
    identity.email,
    new Date(expiresAt - 1),
  )).toMatchObject(identity);
  expect(() => readPublisherAccessCode(
    code.accessKey,
    identity.email,
    new Date(expiresAt),
  )).toThrow("invalid or expired");
});

it("keeps already issued two-day codes valid only until their original expiry", () => {
  const code = signedCodeWithLifetime(2);
  expect(readPublisherAccessCode(code, identity.email, now)).toMatchObject(identity);
  expect(readPublisherAccessCode(
    code,
    identity.email,
    new Date("2026-11-12T23:59:59.999Z"),
  )).toMatchObject(identity);
  expect(() => readPublisherAccessCode(
    code,
    identity.email,
    new Date("2026-11-13T00:00:00Z"),
  )).toThrow("invalid or expired");
});

it.each([1, 31, 33, 365])("rejects signed codes with an unsupported %s-day lifetime", (days) => {
  expect(() => readPublisherAccessCode(
    signedCodeWithLifetime(days),
    identity.email,
    now,
  )).toThrow("invalid or expired");
});

it("rejects tampering, malformed credentials, another signing purpose, and oversized inputs", () => {
  const { accessKey } = createPublisherAccessCode(identity, partner.id, now);
  const pieces = accessKey.split(".");
  for (const value of [
    "",
    "patient.code",
    `pgp2.${pieces[1]}.${pieces[2]}`,
    `pgp1.${pieces[1]}.` + "A".repeat(43),
    "x".repeat(2049),
  ]) {
    expect(() => readPublisherAccessCode(value, identity.email, now)).toThrow();
  }
});

it("issues a code only for an already approved account matching the partner", async () => {
  const result = await partnerPublisherAccessCode(context, partner);
  expect(result?.accessKey).toMatch(/^pgp1\./);
  expect(createCustomToken).not.toHaveBeenCalled();
  expect(reads).toEqual([
    `user_roles/${identity.email}`,
    `feed_organizations/${identity.publisherId}`,
  ]);
  expect(
    await partnerPublisherAccessCode(context, {
      ...partner,
      linkedOrganizationId: "other-org",
    }),
  ).toBeNull();
  await expect(
    partnerPublisherAccessCode(makeAdminContext(), partner),
  ).rejects.toMatchObject({ statusCode: 403 });
});

it("supports individual publishers and refuses an account from the other app-owner kind", async () => {
  docs.set(`user_roles/${identity.email}`, {
    role: "individual_publisher",
    isActive: true,
    individualId: "individual-one",
    firebaseUid: identity.uid,
  });
  docs.set("feed_individuals/individual-one", { name: "Ana Rivera" });
  const linked = {
    ...partner,
    linkedOrganizationId: null,
    linkedIndividualPublisherId: "individual-one",
  };
  expect(await partnerPublisherAccessCode(context, linked)).not.toBeNull();
  expect(
    await partnerPublisherAccessCode(context, {
      ...linked,
      linkedApp: {
        id: "app",
        publisherKind: "organization",
        publisherId: "org-one",
        publisherName: "Genome",
        status: "active",
      },
    }),
  ).toBeNull();
});

it.each([
  {
    role: "organization_publisher",
    isActive: false,
    organizationId: identity.publisherId,
  },
  { role: "full_admin", isActive: true },
  { role: "patient", isActive: true },
])("does not create access for an unauthorized role (%j)", async (role) => {
  docs.set(`user_roles/${identity.email}`, role);
  expect(await partnerPublisherAccessCode(context, partner)).toBeNull();
  expect(getUserByEmail).not.toHaveBeenCalled();
});

it("refuses a missing publisher, missing account, disabled account or mismatched Firebase UID", async () => {
  docs.delete(`feed_organizations/${identity.publisherId}`);
  expect(await partnerPublisherAccessCode(context, partner)).toBeNull();
  docs.set(`feed_organizations/${identity.publisherId}`, {});
  getUserByEmail.mockRejectedValueOnce({ code: "auth/user-not-found" });
  expect(await partnerPublisherAccessCode(context, partner)).toBeNull();
  getUserByEmail.mockResolvedValueOnce({
    uid: identity.uid,
    email: identity.email,
    disabled: true,
  });
  expect(await partnerPublisherAccessCode(context, partner)).toBeNull();
  getUserByEmail.mockResolvedValueOnce({
    uid: "recreated-account",
    email: identity.email,
  });
  expect(await partnerPublisherAccessCode(context, partner)).toBeNull();
});

it("redeems a valid code through the primary Firebase custom-token flow without changing any account", async () => {
  const code = (await partnerPublisherAccessCode(context, partner))!;
  expect(
    await exchangePublisherAccessCode(identity.email, code.accessKey),
  ).toEqual({ customToken: "firebase-custom-token" });
  expect(createCustomToken).toHaveBeenCalledWith(identity.uid);
});

it("checks revocation and current role scope again at redemption", async () => {
  const code = (await partnerPublisherAccessCode(context, partner))!;
  getUserByEmail.mockResolvedValueOnce({
    uid: identity.uid,
    email: identity.email,
    disabled: false,
    tokensValidAfterTime: "revoked-now",
  });
  await expect(
    exchangePublisherAccessCode(identity.email, code.accessKey),
  ).rejects.toMatchObject({ statusCode: 401 });
  docs.set(`user_roles/${identity.email}`, {
    role: "organization_publisher",
    isActive: false,
    organizationId: identity.publisherId,
  });
  await expect(
    exchangePublisherAccessCode(identity.email, code.accessKey),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(createCustomToken).not.toHaveBeenCalled();
});

it("exchanges credentials without a session cookie, rejects invalid bodies, and never caches the response", async () => {
  const server = await buildRouteServer(
    publisherAccessCodeRoutes,
    () => undefined,
  );
  try {
    const code = (await partnerPublisherAccessCode(context, partner))!;
    const response = await server.inject({
      method: "POST",
      url: "/publisher-portal/access-code",
      payload: { email: identity.email, accessKey: code.accessKey },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ customToken: "firebase-custom-token" });
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/publisher-portal/access-code",
          payload: { email: identity.email, accessKey: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/publisher-portal/access-code",
          payload: {
            email: identity.email,
            accessKey: code.accessKey,
            uid: "someone-else",
          },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await server.close();
  }
});

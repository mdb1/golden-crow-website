import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";
const docs = new Map<string, Record<string, unknown>>();
const reads: string[] = [];
const updates: string[] = [];
function reference(collection: string, id: string) {
  const path = `${collection}/${id}`;
  return {
    path,
    get: async () => {
      reads.push(path);
      return { exists: docs.has(path), data: () => docs.get(path) };
    },
  };
}
jest.mock("../config/firebase.js", () => ({
  adminDbFor: () => ({
    collection: (name: string) => ({
      doc: (id: string) => reference(name, id),
    }),
    runTransaction: async (work: (transaction: unknown) => Promise<unknown>) =>
      work({
        get: (ref: ReturnType<typeof reference>) => ref.get(),
        update: (
          ref: ReturnType<typeof reference>,
          data: Record<string, unknown>,
        ) => {
          updates.push(ref.path);
          docs.set(ref.path, { ...docs.get(ref.path), ...data });
        },
      }),
  }),
}));

import {
  openPublisherAccessKey,
  sealPublisherAccessKey,
} from "../lib/publisher-portal-credentials.js";
import {
  publisherAccessKeyStatus,
  revealPublisherAccessKey,
  saveMissingPublisherAccessKey,
  partnerPublisherStoredAccessKey,
} from "../repositories/publisher-portal-credentials.repository.js";
import { publisherCredentialsRoutes } from "../routes/publisher-credentials.routes.js";
import type { Partner } from "../contracts/connected-partners.js";

const context = makeAdminContext({ isBootstrap: true });
const oldSecret = process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET;
beforeEach(() => {
  docs.clear();
  reads.length = 0;
  updates.length = 0;
  process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET =
    "publisher-storage-test-".repeat(3);
});
afterAll(() => {
  if (oldSecret === undefined)
    delete process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET;
  else process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET = oldSecret;
});

it("stores authenticated ciphertext bound to the publisher and accepts null without secrets", () => {
  const sealed = sealPublisherAccessKey(
    "organization",
    "org",
    " ANA@example.com ",
    "Test+Key&42",
  );
  expect(sealed).not.toContain("Test+Key&42");
  expect(openPublisherAccessKey("organization", "org", sealed)).toEqual({
    email: "ana@example.com",
    accessKey: "Test+Key&42",
  });
  for (const [kind, id, value] of [
    ["individual", "org", sealed],
    ["organization", "other", sealed],
    ["organization", "org", "plaintext"],
    ["organization", "org", sealed.slice(0, -5) + "aaaaa"],
  ] as const)
    expect(() => openPublisherAccessKey(kind, id, value)).toThrow(
      "could not be read",
    );
  delete process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET;
  expect(openPublisherAccessKey("organization", "org", null)).toBeNull();
});

it.each(["organization", "individual"] as const)(
  "saves a missing %s key without exposing it through metadata or overwriting an existing key",
  async (kind) => {
    const collection =
      kind === "organization" ? "feed_organizations" : "feed_individuals";
    docs.set(`${collection}/one`, {
      contactEmail: "ana@example.com",
      portalAccessKey: null,
    });
    expect(await publisherAccessKeyStatus(context, kind, "one")).toEqual({
      available: false,
      contactEmail: "ana@example.com",
    });
    await saveMissingPublisherAccessKey(context, kind, "one", " Test+Key&42 ");
    expect(await publisherAccessKeyStatus(context, kind, "one")).toEqual({
      available: true,
      contactEmail: "ana@example.com",
    });
    expect(await revealPublisherAccessKey(context, kind, "one")).toEqual({
      email: "ana@example.com",
      accessKey: " Test+Key&42 ",
    });
    await expect(
      saveMissingPublisherAccessKey(context, kind, "one", "AnotherKey"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(updates).toEqual([`${collection}/one`]);
    expect(Object.keys(docs.get(`${collection}/one`)!)).not.toContain(
      "portal_access_key",
    );
  },
);

it("denies all credential operations to ordinary admins and publishers before reading the entity", async () => {
  const ordinary = makeAdminContext({ role: "full_admin", isBootstrap: false });
  for (const call of [
    () => publisherAccessKeyStatus(ordinary, "organization", "org"),
    () => revealPublisherAccessKey(ordinary, "organization", "org"),
    () =>
      saveMissingPublisherAccessKey(
        ordinary,
        "organization",
        "org",
        "Password",
      ),
  ])
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
  expect(reads).toEqual([]);
  expect(updates).toEqual([]);
});

it("does not save against a missing publisher or one without an email", async () => {
  await expect(
    saveMissingPublisherAccessKey(
      context,
      "organization",
      "missing",
      "Password",
    ),
  ).rejects.toMatchObject({ statusCode: 404 });
  docs.set("feed_organizations/empty", {});
  await expect(
    saveMissingPublisherAccessKey(context, "organization", "empty", "Password"),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(updates).toEqual([]);
});

it("includes a stored key only for the matching active publisher account and recipient", async () => {
  const partner = {
    email: "ana@example.com",
    linkedOrganizationId: "org",
    linkedApp: null,
  } as Partner;
  docs.set("user_roles/ana@example.com", {
    role: "organization_publisher",
    isActive: true,
    organizationId: "org",
  });
  docs.set("feed_organizations/org", {
    portalAccessKey: sealPublisherAccessKey(
      "organization",
      "org",
      partner.email,
      "Password",
    ),
  });
  expect(await partnerPublisherStoredAccessKey(context, partner)).toBe(
    "Password",
  );
  expect(
    await partnerPublisherStoredAccessKey(context, {
      ...partner,
      linkedOrganizationId: "other",
    }),
  ).toBeNull();
  docs.set("feed_organizations/org", {
    portalAccessKey: sealPublisherAccessKey(
      "organization",
      "org",
      "other@example.com",
      "Password",
    ),
  });
  expect(await partnerPublisherStoredAccessKey(context, partner)).toBeNull();
  docs.set("user_roles/ana@example.com", {
    role: "organization_publisher",
    isActive: false,
    organizationId: "org",
  });
  expect(await partnerPublisherStoredAccessKey(context, partner)).toBeNull();
});

it("protects credential routes, requires explicit reveal, disables caching and rejects field aliases", async () => {
  docs.set("feed_individuals/one", {
    contactEmail: "ana@example.com",
    portalAccessKey: null,
  });
  const server = await buildRouteServer(
    publisherCredentialsRoutes,
    () => context,
  );
  const restricted = await buildRouteServer(publisherCredentialsRoutes, () =>
    makeAdminContext(),
  );
  const url = "/discover/publisher-credentials/individual/one";
  try {
    expect((await restricted.inject({ method: "GET", url })).statusCode).toBe(
      403,
    );
    const saved = await server.inject({
      method: "PUT",
      url,
      payload: { accessKey: "Test+Key&42" },
    });
    expect(saved.statusCode).toBe(200);
    const status = await server.inject({ method: "GET", url });
    expect(status.headers["cache-control"]).toBe("no-store");
    expect(status.body).not.toContain("Test+Key&42");
    const revealed = await server.inject({
      method: "POST",
      url: `${url}/reveal`,
    });
    expect(revealed.headers["cache-control"]).toBe("no-store");
    expect(revealed.json()).toEqual({
      email: "ana@example.com",
      accessKey: "Test+Key&42",
    });
    expect(
      (
        await server.inject({
          method: "PUT",
          url,
          payload: { portal_access_key: "Password" },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await server.close();
    await restricted.close();
  }
});

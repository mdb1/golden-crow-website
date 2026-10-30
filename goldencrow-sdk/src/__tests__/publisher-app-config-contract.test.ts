import type { FastifyInstance } from "fastify";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const FIXED_TIME = Date.parse("2026-10-30T15:00:00.000Z");

type StoredDocument = Record<string, unknown>;
type MockSnapshot = {
  exists: boolean;
  id: string;
  data: () => StoredDocument | undefined;
  ref: MockDocumentReference;
};
type MockDocumentReference = {
  id: string;
  get: jest.Mock<Promise<MockSnapshot>, []>;
  create: jest.Mock<Promise<void>, [StoredDocument]>;
  update: jest.Mock<Promise<void>, [StoredDocument]>;
};

const collections = new Map<string, Map<string, StoredDocument>>();
const mockGetProfileSetupState = jest.fn();
const mockSendPublisherAppCreationNotificationEmails = jest.fn();
let timestampCallCount = 0;

function collectionStore(name: string) {
  let store = collections.get(name);
  if (!store) {
    store = new Map<string, StoredDocument>();
    collections.set(name, store);
  }
  return store;
}

function snapshotFor(
  collectionName: string,
  id: string,
  ref: MockDocumentReference,
): MockSnapshot {
  const value = collectionStore(collectionName).get(id);
  return {
    exists: Boolean(value),
    id,
    data: () => value,
    ref,
  };
}

function documentReferenceFor(
  collectionName: string,
  id: string,
): MockDocumentReference {
  const ref = {
    id,
  } as MockDocumentReference;

  ref.get = jest.fn(async () => snapshotFor(collectionName, id, ref));
  ref.create = jest.fn(async (document: StoredDocument) => {
    const store = collectionStore(collectionName);
    if (store.has(id)) {
      const error = new Error("Document already exists.") as Error & {
        code?: string;
      };
      error.code = "already-exists";
      throw error;
    }
    store.set(id, { ...document });
  });
  ref.update = jest.fn(async (update: StoredDocument) => {
    const store = collectionStore(collectionName);
    const existing = store.get(id);
    if (!existing) {
      throw new Error(`Missing document ${collectionName}/${id}`);
    }
    store.set(id, { ...existing, ...update });
  });

  return ref;
}

const mockCollection = jest.fn((name: string) => ({
  doc: jest.fn((id: string) => documentReferenceFor(name, id)),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: class FieldValueStub {
    static serverTimestamp() {
      const timestamp = new Date(FIXED_TIME + timestampCallCount * 1_000);
      timestampCallCount += 1;
      return timestamp;
    }
  },
  Timestamp: class TimestampStub {
    constructor(private readonly value: Date) {}

    toDate() {
      return this.value;
    }
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

jest.mock("../repositories/profile-setup.repository.js", () => ({
  getProfileSetupState: mockGetProfileSetupState,
  isProfileSetupError: jest.fn(() => false),
}));

jest.mock("../lib/publisher-app-creation-notification-email.js", () => ({
  sendPublisherAppCreationNotificationEmails: (...args: unknown[]) =>
    mockSendPublisherAppCreationNotificationEmails(...args),
}));

const validBody = {
  platformOption: "ios_android" as const,
  connectEnabled: true,
  profileEnabled: false,
  learnCustomizationEnabled: true,
  colors: {
    primary: "#aabbcc",
    secondary: "#123456",
    tertiary: "#fedcba",
  },
  iconSource: "publisher" as const,
  iconImageUrl: null,
  iconImageUploadDataUrl: null,
};

function organizationContext(
  overrides: Partial<AdminContext> = {},
): AdminContext {
  return makeAdminContext({
    email: "Publisher.Operator@Example.ORG",
    uid: "org-user-1",
    role: "organization_publisher",
    organizationId: "shared-publisher-id",
    canAccessBackoffice: false,
    canAccessPublisherPortal: true,
    ...overrides,
  });
}

function individualContext(
  overrides: Partial<AdminContext> = {},
): AdminContext {
  return makeAdminContext({
    email: "individual@example.org",
    uid: "individual-user-1",
    role: "individual_publisher",
    individualId: "shared-publisher-id",
    canAccessBackoffice: false,
    canAccessPublisherPortal: true,
    ...overrides,
  });
}

function seedPublisher(
  kind: "organization" | "individual",
  id: string,
  document: StoredDocument,
) {
  collectionStore(
    kind === "organization" ? "feed_organizations" : "feed_individuals",
  ).set(id, document);
}

describe("publisher app config contract", () => {
  let context: AdminContext | undefined;
  let fastify: FastifyInstance;

  beforeAll(async () => {
    const { publisherAppConfigRoutes } =
      await import("../routes/publisher-app-config.routes.js");
    fastify = await buildRouteServer(publisherAppConfigRoutes, () => context);
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    collections.clear();
    timestampCallCount = 0;
    context = organizationContext();
    seedPublisher("organization", "shared-publisher-id", {
      name: "Canonical Organization",
      contactEmail: "public-contact@example.net",
      imageUrl: "https://example.org/canonical-icon.png",
    });
    mockGetProfileSetupState.mockResolvedValue({
      defaults: { username: "current-profile-user" },
    });
  });

  it.each([
    ["GET", undefined],
    ["POST", validBody],
    ["PUT", validBody],
  ] as const)(
    "%s requires an authenticated admin context before touching Firestore",
    async (method, payload) => {
      context = undefined;

      const response = await fastify.inject({
        method,
        url: "/publisher-app/config",
        payload,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "No authenticated admin context",
      });
      expect(mockCollection).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      label: "server-owned identity and audit fields",
      payload: {
        ...validBody,
        publisherKind: "individual",
        publisherId: "attacker-controlled",
        publisherName: "Injected name",
        publisherEmail: "injected@example.org",
        publisherUsername: "injected-user",
        createdByUserId: "injected-uid",
      },
    },
    {
      label: "an unknown nested color alias",
      payload: {
        ...validBody,
        colors: {
          ...validBody.colors,
          primary_color: "#000000",
        },
      },
    },
  ])("rejects $label from the strict request body", async ({ payload }) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(collectionStore("app_configs").size).toBe(0);
    expect(mockGetProfileSetupState).not.toHaveBeenCalled();
  });

  it("derives identity from the authenticated publisher and stores only the camelCase contract", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });

    expect(response.statusCode).toBe(201);
    expect(mockGetProfileSetupState).toHaveBeenCalledWith("org-user-1");

    const stored = collectionStore("app_configs").get(
      "organization_shared-publisher-id",
    );
    expect(stored).toEqual({
      schemaVersion: 1,
      publisherKind: "organization",
      publisherId: "shared-publisher-id",
      publisherName: "Canonical Organization",
      publisherEmail: "publisher.operator@example.org",
      publisherUsername: "current-profile-user",
      catalogEnabled: true,
      feedEnabled: true,
      status: "pending_revision",
      platformOption: "ios_android",
      connectEnabled: true,
      profileEnabled: false,
      learnCustomizationEnabled: true,
      colors: {
        primary: "#AABBCC",
        secondary: "#123456",
        tertiary: "#FEDCBA",
      },
      iconSource: "publisher",
      iconImageUrl: "https://example.org/canonical-icon.png",
      iconImageUploadDataUrl: null,
      createdAt: new Date("2026-10-30T15:00:00.000Z"),
      updatedAt: new Date("2026-10-30T15:00:00.000Z"),
      createdByUserId: "org-user-1",
      updatedByUserId: "org-user-1",
    });
    expect(Object.keys(stored ?? {}).sort()).toEqual(
      [
        "schemaVersion",
        "publisherKind",
        "publisherId",
        "publisherName",
        "publisherEmail",
        "publisherUsername",
        "catalogEnabled",
        "feedEnabled",
        "status",
        "platformOption",
        "connectEnabled",
        "profileEnabled",
        "learnCustomizationEnabled",
        "colors",
        "iconSource",
        "iconImageUrl",
        "iconImageUploadDataUrl",
        "createdAt",
        "updatedAt",
        "createdByUserId",
        "updatedByUserId",
      ].sort(),
    );
    expect(stored).not.toHaveProperty("publisher_id");
    expect(stored).not.toHaveProperty("publisher_email");
    expect(stored).not.toHaveProperty("created_by_user_id");

    expect(response.json()).toMatchObject({
      config: {
        id: "organization_shared-publisher-id",
        publisherKind: "organization",
        publisherId: "shared-publisher-id",
        publisherName: "Canonical Organization",
        publisherEmail: "publisher.operator@example.org",
        publisherUsername: "current-profile-user",
        colors: {
          primary: "#AABBCC",
          secondary: "#123456",
          tertiary: "#FEDCBA",
        },
        status: "pending_revision",
        catalogEnabled: true,
        feedEnabled: true,
        iconSource: "publisher",
        iconImageUrl: "https://example.org/canonical-icon.png",
      },
    });
    expect(
      mockSendPublisherAppCreationNotificationEmails,
    ).toHaveBeenCalledTimes(1);
  });

  it("keeps organization and individual configs separate when their publisher ids match", async () => {
    const organizationResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(organizationResponse.statusCode).toBe(201);

    context = individualContext();
    seedPublisher("individual", "shared-publisher-id", {
      name: "Canonical Individual",
    });
    mockGetProfileSetupState.mockResolvedValue({
      defaults: { username: "individual-profile-user" },
    });

    const individualResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: {
        ...validBody,
        platformOption: "ios",
      },
    });

    expect(individualResponse.statusCode).toBe(201);
    expect([...collectionStore("app_configs").keys()].sort()).toEqual([
      "individual_shared-publisher-id",
      "organization_shared-publisher-id",
    ]);
    expect(
      collectionStore("app_configs").get("organization_shared-publisher-id"),
    ).toMatchObject({
      publisherKind: "organization",
      publisherName: "Canonical Organization",
    });
    expect(
      collectionStore("app_configs").get("individual_shared-publisher-id"),
    ).toMatchObject({
      publisherKind: "individual",
      publisherName: "Canonical Individual",
    });
  });

  it("returns 409 when POST targets an existing publisher config", async () => {
    const firstResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(firstResponse.statusCode).toBe(201);

    const secondResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: {
        ...validBody,
        connectEnabled: false,
      },
    });

    expect(secondResponse.statusCode).toBe(409);
    expect(secondResponse.json()).toEqual({
      error: "A publisher app config already exists.",
    });
    expect(
      collectionStore("app_configs").get("organization_shared-publisher-id"),
    ).toMatchObject({ connectEnabled: true });
  });

  it("returns 404 when PUT targets a publisher without a config", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/publisher-app/config",
      payload: validBody,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Publisher app config not found.",
    });
    expect(collectionStore("app_configs").size).toBe(0);
    expect(mockGetProfileSetupState).not.toHaveBeenCalled();
  });

  it("refreshes server-owned identity on PUT while preserving creation audit fields", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);

    context = organizationContext({
      email: "new-operator@example.org",
      uid: "org-user-2",
    });
    seedPublisher("organization", "shared-publisher-id", {
      name: "Renamed Canonical Organization",
      contactEmail: "still-not-the-actor@example.net",
    });
    mockGetProfileSetupState.mockResolvedValue({
      defaults: { username: "new-current-profile-user" },
    });

    const updateResponse = await fastify.inject({
      method: "PUT",
      url: "/publisher-app/config",
      payload: {
        ...validBody,
        connectEnabled: false,
        colors: {
          primary: "#010203",
          secondary: "#040506",
          tertiary: "#070809",
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const stored = collectionStore("app_configs").get(
      "organization_shared-publisher-id",
    );
    expect(stored).toMatchObject({
      publisherKind: "organization",
      publisherId: "shared-publisher-id",
      publisherName: "Renamed Canonical Organization",
      publisherEmail: "new-operator@example.org",
      publisherUsername: "new-current-profile-user",
      connectEnabled: false,
      colors: {
        primary: "#010203",
        secondary: "#040506",
        tertiary: "#070809",
      },
      createdByUserId: "org-user-1",
      updatedByUserId: "org-user-2",
      createdAt: new Date("2026-10-30T15:00:00.000Z"),
      updatedAt: new Date("2026-10-30T15:00:01.000Z"),
      status: "pending_revision",
      catalogEnabled: true,
      feedEnabled: true,
    });
  });

  it("preserves an admin-managed status when the publisher edits the config", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);

    const stored = collectionStore("app_configs").get(
      "organization_shared-publisher-id",
    );
    collectionStore("app_configs").set("organization_shared-publisher-id", {
      ...stored,
      status: "approved",
    });

    const updateResponse = await fastify.inject({
      method: "PUT",
      url: "/publisher-app/config",
      payload: { ...validBody, profileEnabled: true },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().config.status).toBe("approved");
    expect(
      collectionStore("app_configs").get("organization_shared-publisher-id"),
    ).toMatchObject({ status: "approved", profileEnabled: true });
  });

  it("rejects publisher attempts to set the review status or disable required features", async () => {
    for (const serverOwned of [
      { status: "approved" },
      { catalogEnabled: false },
      { feedEnabled: false },
    ]) {
      const response = await fastify.inject({
        method: "POST",
        url: "/publisher-app/config",
        payload: { ...validBody, ...serverOwned },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(collectionStore("app_configs").size).toBe(0);
  });

  it("returns null from GET when the scoped publisher has no config", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/publisher-app/config",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ config: null });
  });

  it("forbids an authenticated non-publisher context", async () => {
    context = makeAdminContext({ role: "full_admin" });

    const response = await fastify.inject({
      method: "GET",
      url: "/publisher-app/config",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Publisher portal access is required to manage an app config.",
    });
  });
});

import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { createHash } from "node:crypto";
import type {
  AdminContext,
  PublisherAppAdvancedConfiguration,
} from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";
import { derivePublisherAppSemanticColors } from "../lib/publisher-app-advanced-config.js";
import { derivePublisherAppCounterpointColors } from "../lib/publisher-app-color-identity.js";

const fixedWhiteForegrounds = {
  "community.genes.primaryActionForeground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.friends.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.genes.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.circles.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
  "community.quickActions.search.foreground": { light: "#FFFFFF", dark: "#FFFFFF" },
};

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
  set: jest.Mock<Promise<void>, [StoredDocument]>;
  update: jest.Mock<Promise<void>, [StoredDocument]>;
  delete: jest.Mock<Promise<void>, []>;
};
type MockQuery = {
  where: jest.Mock<MockQuery, [string, string, unknown]>;
  orderBy: jest.Mock<MockQuery, []>;
  startAfter: jest.Mock<MockQuery, [MockSnapshot]>;
  limit: jest.Mock<MockQuery, [number]>;
  get: jest.Mock<Promise<{ docs: MockSnapshot[]; empty: boolean }>, []>;
};

const collections = new Map<string, Map<string, StoredDocument>>();
const DELETE_FIELD = Symbol("delete-field");
const mockGetProfileSetupState = jest.fn();
const mockSendPublisherAppCreationNotificationEmails = jest.fn();
const mockSendPublisherAppPublicationNotificationEmails = jest.fn();
const mockVerifySessionCookie = jest.fn();
const mockResolveAdminContext = jest.fn();
const mockQueryReadCollections: string[] = [];
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
  ref.set = jest.fn(async (document: StoredDocument) => {
    if (collectionName === "custom_apps_snapshot" && Buffer.byteLength(JSON.stringify(document)) > 1_048_576) {
      throw new Error("Snapshot exceeds Firestore document size limit");
    }
    collectionStore(collectionName).set(id, { ...document });
  });
  ref.update = jest.fn(async (update: StoredDocument) => {
    const store = collectionStore(collectionName);
    const existing = store.get(id);
    if (!existing) {
      throw new Error(`Missing document ${collectionName}/${id}`);
    }
    const next = { ...existing };
    for (const [key, value] of Object.entries(update)) {
      if (value === DELETE_FIELD) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    if (collectionName === "custom_apps_snapshot" && Buffer.byteLength(JSON.stringify(next)) > 1_048_576) {
      throw new Error("Snapshot exceeds Firestore document size limit");
    }
    store.set(id, next);
  });
  ref.delete = jest.fn(async () => {
    collectionStore(collectionName).delete(id);
  });

  return ref;
}

function queryForCollection(name: string) {
  let afterId = "";
  let pageLimit = Number.POSITIVE_INFINITY;
  const filters: Array<[string, unknown]> = [];
  const query = {} as MockQuery;
  query.where = jest.fn((field: string, operator: string, value: unknown) => {
    if (operator !== "==") throw new Error(`Unsupported mock operator ${operator}`);
    filters.push([field, value]);
    return query;
  });
  query.orderBy = jest.fn(() => query);
  query.startAfter = jest.fn((snapshot: MockSnapshot) => {
    afterId = snapshot.id;
    return query;
  });
  query.limit = jest.fn((limit: number) => {
    pageLimit = limit;
    return query;
  });
  query.get = jest.fn(async () => {
    mockQueryReadCollections.push(name);
    const records = [...collectionStore(name).entries()]
      .filter(([, value]) => filters.every(([field, expected]) => value[field] === expected))
      .sort((left, right) => {
        const leftTime = new Date(String(left[1].updatedAt)).getTime();
        const rightTime = new Date(String(right[1].updatedAt)).getTime();
        return rightTime - leftTime || left[0].localeCompare(right[0]);
      });
    const startIndex = afterId
      ? Math.max(0, records.findIndex(([id]) => id === afterId) + 1)
      : 0;
    const docs = records.slice(startIndex, startIndex + pageLimit).map(([id]) => {
      const ref = documentReferenceFor(name, id);
      return snapshotFor(name, id, ref);
    });
    return { docs, empty: docs.length === 0 };
  });
  return query;
}

const mockCollection = jest.fn((name: string) => {
  const query = queryForCollection(name);
  return {
    doc: jest.fn((id: string) => documentReferenceFor(name, id)),
    where: query.where,
    orderBy: query.orderBy,
  };
});
const mockRunTransaction = jest.fn(
  async (
    operation: (transaction: {
      get: (ref: MockDocumentReference) => Promise<MockSnapshot>;
      create: (ref: MockDocumentReference, value: StoredDocument) => void;
      set: (ref: MockDocumentReference, value: StoredDocument) => void;
      update: (ref: MockDocumentReference, value: StoredDocument) => void;
      delete: (ref: MockDocumentReference) => void;
    }) => Promise<unknown>,
  ) =>
    operation({
      get: (ref) => ref.get(),
      create: (ref, value) => {
        void ref.create(value);
      },
      set: (ref, value) => {
        void ref.set(value);
      },
      update: (ref, value) => {
        void ref.update(value);
      },
      delete: (ref) => {
        void ref.delete();
      },
    }),
);

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: class FieldValueStub {
    static delete() {
      return DELETE_FIELD;
    }

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
  adminAuthFor: jest.fn(() => ({ verifySessionCookie: mockVerifySessionCookie })),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  resolveAdminContext: mockResolveAdminContext,
}));

jest.mock("../repositories/profile-setup.repository.js", () => ({
  getProfileSetupState: mockGetProfileSetupState,
  isProfileSetupError: jest.fn(() => false),
}));

jest.mock("../lib/publisher-app-creation-notification-email.js", () => ({
  sendPublisherAppCreationNotificationEmails: (...args: unknown[]) =>
    mockSendPublisherAppCreationNotificationEmails(...args),
  sendPublisherAppPublicationNotificationEmails: (...args: unknown[]) =>
    mockSendPublisherAppPublicationNotificationEmails(...args),
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
    counterpointClockwise: "#6639EF",
    counterpointAnticlockwise: "#39EFC1",
    counterpointFarClockwise: "#C139EF",
    counterpointFarAnticlockwise: "#39EF66",
  },
  iconSource: "publisher" as const,
  iconImageUrl: null,
  iconImageUploadDataUrl: null,
  termsAccepted: true as const,
};

const advancedConfigurationBody = {
  displayName: "Advanced Experience",
  semanticColors: {
    primary: "#101010",
    primaryStrong: "#202020",
    primaryDeep: "#303030",
    primarySoft: "#404040",
    secondary: "#505050",
    accent: "#606060",
    accentTextLight: "#707070",
    accentTextDark: "#808080",
    accentSurfaceLight: "#F0F0F0",
  },
  colorOverrides: {
    "brand.primary": { light: "#FF5500", dark: "#FF7700CC" },
    "discover.category.news.accent": {
      light: "#E04A5E",
      dark: "#E04A5E",
    },
    "learn.level.bacteria.accent": {
      light: "#00A88A",
      dark: "#00A88A",
    },
    "learn.background.stop1": {
      light: "#F2F8F7",
      dark: "#070B1F",
    },
    "learn.chapter.accent": { light: "#F51568", dark: "#F51568" },
    "learn.quiz.wordAvailableText": {
      light: "#0088FF",
      dark: "#0091FF",
    },
    "discover.suggestion.pocketGuideInitialOverview.accent": {
      light: "#E04A5E",
      dark: "#E04A5E",
    },
    "discover.feed.tint": { light: "#E04A5E17", dark: "#E04A5E14" },
    "discover.requestLauncher.ribbonStart": {
      light: "#FF174D",
      dark: "#FF174D",
    },
    "discover.variantFinder.metricVariants": {
      light: "#F59E0B",
      dark: "#F59E0B",
    },
  },
  catalogEnabled: false,
  feedEnabled: true,
  discoverScope: { mode: "all" as const },
  serviceScope: {
    mode: "provider" as const,
    providerId: "professional-42",
    providerKind: "individual" as const,
  },
  localization: {
    defaultLanguage: "en" as const,
    availableLanguages: ["en", "es"] as Array<"en" | "es">,
  },
  textOverrides: [
    {
      key: "Contact Pocket Genes",
      en: "Contact Advanced Experience",
      es: "Contactá a Advanced Experience",
    },
  ],
  learn: {
    mode: "replace" as const,
    curriculumId: "advanced-curriculum",
    curriculumRevision: 3,
    defaultLanguage: "es",
    subjects: [
      {
        subjectIdentifier: "ADV",
        subjectTitle: "Advanced subject",
        chapters: [
          {
            chapterTitle: "Advanced chapter",
            lessons: [
              {
                lessonIdentifier: "ADV.1",
                lessonTitle: "Advanced lesson",
                imageUrl: "https://example.org/lesson.png",
                lessonColor: "#ABCDEF",
                paragraphs: [
                  {
                    paragraphTitle: "Welcome",
                    icon: "hand.wave",
                    contentText: "Advanced educational content.",
                  },
                ],
                usefulLinks: ["https://example.org/guide"],
                relatedLessons: [],
              },
            ],
          },
        ],
      },
    ],
    topics: { personalized_medicine: ["ADV"] },
  },
  links: {
    joinUs: {
      en: "https://example.org/en/contact",
      es: "https://example.org/es/contact",
    },
    supportEmail: "help@example.org",
    privacyUrl: "https://example.org/privacy",
    termsUrl: "https://example.org/terms",
  },
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
  let publisherSessionServer: FastifyInstance;

  beforeAll(async () => {
    const { publisherAppConfigRoutes } =
      await import("../routes/publisher-app-config.routes.js");
    fastify = await buildRouteServer(publisherAppConfigRoutes, () => context);
    const { authMiddleware } = await import("../middleware/auth.js");
    publisherSessionServer = Fastify();
    publisherSessionServer.setValidatorCompiler(validatorCompiler);
    publisherSessionServer.setSerializerCompiler(serializerCompiler);
    await publisherSessionServer.register(cookie);
    publisherSessionServer.addHook("onRequest", authMiddleware);
    await publisherSessionServer.register(publisherAppConfigRoutes);
    await publisherSessionServer.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await publisherSessionServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendPublisherAppCreationNotificationEmails.mockReset().mockResolvedValue(undefined);
    mockSendPublisherAppPublicationNotificationEmails.mockReset().mockResolvedValue(undefined);
    collections.clear();
    mockQueryReadCollections.length = 0;
    timestampCallCount = 0;
    context = organizationContext();
    mockVerifySessionCookie.mockImplementation(async () => ({ uid: context?.uid, email: context?.email }));
    mockResolveAdminContext.mockImplementation(async () => context);
    seedPublisher("organization", "shared-publisher-id", {
      name: "Canonical Organization",
      contactEmail: "public-contact@example.net",
      imageUrl: "https://example.org/canonical-icon.png",
    });
    mockGetProfileSetupState.mockResolvedValue({
      defaults: { username: "current-profile-user" },
    });
  });

  it("persists generated palette provenance without publishing it into the mobile runtime", async () => {
    const generatedColorOverrides = {
      "learn.background.stop1": { light: "#F0E0D0", dark: "#10203080" },
    };
    const advanced = { ...structuredClone(advancedConfigurationBody), generatedColorOverrides };
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: { ...validBody, advancedConfiguration: advanced } });
    expect(created.statusCode).toBe(201);
    expect(created.json().config.advancedConfiguration.generatedColorOverrides).toEqual(generatedColorOverrides);
    const stored = collectionStore("app_configs").get(created.json().config.id);
    expect(stored?.advancedConfiguration).toMatchObject({ generatedColorOverrides });
    await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    const runtime = await fastify.inject({ method: "GET", url: "/publisher-app/config/runtime" });
    expect(runtime.statusCode).toBe(200);
    expect(runtime.json().branding.colorOverrides).toEqual({ ...advanced.colorOverrides, ...fixedWhiteForegrounds });
    expect(JSON.stringify(runtime.json())).not.toContain("generatedColorOverrides");
  });

  it.each([
    ["GET", undefined],
    ["POST", validBody],
    ["PUT", validBody],
    ["DELETE", undefined],
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
      label: "server-owned runtime publication metadata",
      payload: { ...validBody, runtimeColorContractVersion: 1 },
    },
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
        counterpointClockwise: "#6639EF",
        counterpointAnticlockwise: "#39EFC1",
        counterpointFarClockwise: "#C139EF",
        counterpointFarAnticlockwise: "#39EF66",
      },
      iconSource: "publisher",
      iconImageUrl: "https://example.org/canonical-icon.png",
      iconImageUploadDataUrl: null,
      advancedConfiguration: expect.objectContaining({
        displayName: "Canonical Organization",
        semanticColors: null,
        catalogEnabled: true,
        feedEnabled: true,
        discoverScope: {
          mode: "organization",
          publisherOrganizationId: "shared-publisher-id",
        },
        serviceScope: {
          mode: "provider",
          providerId: "shared-publisher-id",
          providerKind: "organization",
        },
        learn: { mode: "base" },
      }),
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
        "advancedConfiguration",
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
          counterpointClockwise: "#6639EF",
          counterpointAnticlockwise: "#39EFC1",
          counterpointFarClockwise: "#C139EF",
          counterpointFarAnticlockwise: "#39EF66",
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
    ).not.toHaveBeenCalled();
  });

  it("derives counterpoints when reading a historical config without the new fields", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);

    const id = "organization_shared-publisher-id";
    const stored = collectionStore("app_configs").get(id);
    if (!stored) throw new Error("Expected the historical app config fixture.");
    collectionStore("app_configs").set(id, {
      ...stored,
      colors: {
        primary: "#AABBCC",
        secondary: "#123456",
        tertiary: "#FEDCBA",
      },
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/publisher-app/config",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.colors).toEqual({
      primary: "#AABBCC",
      secondary: "#123456",
      tertiary: "#FEDCBA",
      counterpointClockwise: "#6639EF",
      counterpointAnticlockwise: "#39EFC1",
      counterpointFarClockwise: "#C139EF",
      counterpointFarAnticlockwise: "#39EF66",
    });
  });

  it("preserves all four manual counterpoints, including orange, through creation, save, reads and runtime publication", async () => {
    const colors = {
      ...validBody.colors,
      counterpointClockwise: "#ff8800", counterpointAnticlockwise: "#123abc",
      counterpointFarClockwise: "#fedcba", counterpointFarAnticlockwise: "#987def",
    };
    const expected = Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, value.toUpperCase()]));
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: { ...validBody, colors } });
    expect(created.statusCode).toBe(201);
    expect(created.json().config.colors).toEqual(expected);
    const saved = await fastify.inject({ method: "PUT", url: "/publisher-app/config", payload: { ...validBody, colors } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().config.colors).toEqual(expected);
    expect(collectionStore("app_configs").get(created.json().config.id)?.colors).toEqual(expected);
    const read = await fastify.inject({ method: "GET", url: "/publisher-app/config" });
    expect(read.json().config.colors).toEqual(expected);
    const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().config.status).toBe("active_for_testing");
    expect(collectionStore("app_configs").get(created.json().config.id)?.status).toBe("active_for_testing");
    const runtime = await fastify.inject({ method: "GET", url: "/publisher-app/config/runtime" });
    expect(runtime.json().branding.colors).toMatchObject({ counterpointClockwise: "#FF8800", counterpointAnticlockwise: "#123ABC" });
  });

  it.each([undefined, true])("creates a testing draft without recording a signature (legacy flag: %s)", async (termsAccepted) => {
    const response = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: { ...validBody, termsAccepted } });
    expect(response.statusCode).toBe(201);
    const stored = collectionStore("app_configs").get(response.json().config.id)!;
    for (const key of ["termsAcceptedAt", "termsAcceptedByUserId", "termsVersion"]) {
      expect(stored).not.toHaveProperty(key);
      expect(response.json().config).not.toHaveProperty(key);
    }
    expect(mockSendPublisherAppCreationNotificationEmails).not.toHaveBeenCalled();
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
  });

  async function createTestingConfig() {
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: { ...validBody, termsAccepted: undefined } });
    expect(created.statusCode).toBe(201);
    const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().config.status).toBe("active_for_testing");
    return activated.json().config;
  }

  it.each(["organization", "individual"] as const)("accepts an authenticated %s publisher portal signature through the real middleware and persists the payment state", async kind => {
    context = kind === "organization" ? organizationContext() : individualContext();
    if (kind === "individual") seedPublisher(kind, "shared-publisher-id", { name: "Canonical Individual" });
    const publisherContext = context;
    const session = {
      cookies: { session: "publisher-session", auth_surface: "publisher-portal" },
      headers: { "x-expected-session-uid": publisherContext.uid },
    };
    const created = await publisherSessionServer.inject({
      ...session, method: "POST", url: "/publisher-app/config",
      payload: { ...validBody, termsAccepted: undefined },
    });
    expect(created.statusCode).toBe(201);
    const activated = await publisherSessionServer.inject({ ...session, method: "POST", url: "/publisher-app/config/identifier" });
    expect(activated.statusCode).toBe(200);
    const testing = activated.json().config;
    expect(testing.status).toBe("active_for_testing");
    expect(testing).not.toHaveProperty("termsAcceptedAt");

    context = makeAdminContext({ isBootstrap: true });
    expect((await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(200);
    context = publisherContext;
    const payload = { termsAccepted: true, expectedUpdatedAt: testing.updatedAt };
    const signed = await publisherSessionServer.inject({
      ...session, method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload,
    });
    expect(signed.statusCode).toBe(200);
    const published = signed.json().config;
    expect(mockVerifySessionCookie).toHaveBeenCalledWith("publisher-session", true);
    expect(mockResolveAdminContext).toHaveBeenLastCalledWith({
      uid: publisherContext.uid, email: publisherContext.email, surface: "publisher-portal",
    });
    expect(published).toMatchObject({
      id: testing.id, status: "active_waiting_for_payment", appProviderIdentifier: testing.appProviderIdentifier,
      runtimeRevision: testing.runtimeRevision + 1, termsVersion: "2026-10-31",
      termsAcceptedAt: expect.any(String), termsAcceptedByUserId: publisherContext.uid, updatedByUserId: publisherContext.uid,
    });
    expect(collectionStore("app_configs").get(testing.id)).toMatchObject({
      status: "active_waiting_for_payment", termsAcceptedAt: new Date(published.termsAcceptedAt),
      termsAcceptedByUserId: publisherContext.uid, runtimeRevision: testing.runtimeRevision + 1,
    });
    const catalog = collectionStore("custom_apps_snapshot").get("simple")!;
    expect((catalog.apps as StoredDocument[])[0]).toMatchObject({ id: testing.id, status: "active_waiting_for_payment", isActive: true });
    expect(catalog.statusCounts).toEqual(expect.arrayContaining([
      { status: "active_for_testing", count: 0 }, { status: "active_waiting_for_payment", count: 1 },
    ]));
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledWith(published);

    const replay = await publisherSessionServer.inject({
      ...session, method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(signed.json());
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledTimes(1);
    const godMode = await publisherSessionServer.inject({
      ...session, method: "POST", url: `/admin/publisher-app-configs/${testing.id}/sign-terms-and-conditions`, payload,
    });
    expect(godMode.statusCode).toBe(403);
    expect(collectionStore("app_configs").get(testing.id)?.status).toBe("active_waiting_for_payment");
  });

  it.each(["organization", "individual"] as const)("immediately migrates a signed %s app to waiting for payment, persists the signature and updates the catalog atomically", async (kind) => {
    context = kind === "organization" ? organizationContext() : individualContext();
    if (kind === "individual") seedPublisher(kind, "shared-publisher-id", { name: "Canonical Individual" });
    const publisherContext = context;
    const testing = await createTestingConfig();
    context = makeAdminContext({ isBootstrap: true });
    expect((await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(200);
    context = publisherContext;
    const snapshotBefore = collectionStore("custom_apps_snapshot").get("simple")!;
    const payload = { termsAccepted: true, expectedUpdatedAt: testing.updatedAt };
    const signed = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload });
    expect(signed.statusCode).toBe(200);
    const published = signed.json().config;
    expect(published).toMatchObject({
      id: testing.id, status: "active_waiting_for_payment", appProviderIdentifier: testing.appProviderIdentifier,
      runtimeRevision: testing.runtimeRevision + 1, colors: testing.colors,
      termsVersion: "2026-10-31", termsAcceptedByUserId: publisherContext.uid, updatedByUserId: publisherContext.uid,
      termsAcceptedAt: expect.any(String),
    });
    expect(published.termsAcceptedAt).toBe(published.updatedAt);
    expect(published.updatedAt).not.toBe(testing.updatedAt);
    expect(collectionStore("app_configs").get(testing.id)).toMatchObject({
      status: "active_waiting_for_payment", termsAcceptedByUserId: publisherContext.uid,
      termsAcceptedAt: new Date(published.termsAcceptedAt), runtimeRevision: testing.runtimeRevision + 1,
    });
    const snapshot = collectionStore("custom_apps_snapshot").get("simple")!;
    expect(snapshot).toMatchObject({ totalCount: 1, activeCount: 1, inactiveCount: 0, updatedByUserId: publisherContext.uid });
    expect(snapshot.updatedAt).not.toEqual(snapshotBefore.updatedAt);
    expect((snapshot.apps as StoredDocument[])[0]).toMatchObject({ id: testing.id, status: "active_waiting_for_payment", isActive: true });
    expect(snapshot.statusCounts).toEqual(expect.arrayContaining([
      { status: "active_for_testing", count: 0 }, { status: "active_waiting_for_payment", count: 1 }, { status: "active", count: 0 },
    ]));
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledWith(published);
    expect(mockSendPublisherAppCreationNotificationEmails).toHaveBeenCalledTimes(1);
    const { getActivePublisherAppRuntimeConfig } = await import("../repositories/publisher-app-config.repository.js");
    expect(await getActivePublisherAppRuntimeConfig(testing.appProviderIdentifier, "ios")).toMatchObject({ status: "published", revision: published.runtimeRevision });
    const replay = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(signed.json());
    expect(collectionStore("custom_apps_snapshot").get("simple")).toEqual(snapshot);
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledTimes(1);
    const identifierReplay = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    expect(identifierReplay.json()).toEqual(signed.json());
    const edited = await fastify.inject({ method: "PUT", url: "/publisher-app/config", payload: { ...validBody, profileEnabled: true } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().config).toMatchObject({ status: "active_waiting_for_payment", termsAcceptedAt: published.termsAcceptedAt, termsAcceptedByUserId: publisherContext.uid, termsVersion: "2026-10-31" });
  });

  it("records the actual GOD MODE operator when signing for the selected organization", async () => {
    context = makeAdminContext({ isBootstrap: true, uid: "god-signing-operator" });
    const base = "/admin/publisher-app-configs/organizations/shared-publisher-id";
    expect((await fastify.inject({ method: "POST", url: base, payload: { ...validBody, termsAccepted: undefined } })).statusCode).toBe(201);
    const testing = (await fastify.inject({ method: "POST", url: `${base}/identifier` })).json().config;
    const signed = await fastify.inject({ method: "POST", url: `/admin/publisher-app-configs/${testing.id}/sign-terms-and-conditions`, payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt } });
    expect(signed.statusCode).toBe(200);
    expect(signed.json().config).toMatchObject({ status: "active_waiting_for_payment", termsAcceptedByUserId: "god-signing-operator", updatedByUserId: "god-signing-operator" });
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledWith(signed.json().config);
  });

  it.each([
    {}, { termsAccepted: false }, { termsAccepted: true },
    { termsAccepted: true, expectedUpdatedAt: "not-a-date" },
    { termsAccepted: true, expectedUpdatedAt: "2026-10-30T15:00:00.000Z", termsAcceptedByUserId: "forged-user" },
    { termsAccepted: true, expectedUpdatedAt: "2026-10-30T15:00:00.000Z", status: "active" },
  ])("rejects an incomplete or forged signature body without changing testing state: %j", async (payload) => {
    const testing = await createTestingConfig();
    const stored = structuredClone(collectionStore("app_configs").get(testing.id));
    const result = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload });
    expect(result.statusCode).toBe(400);
    expect(collectionStore("app_configs").get(testing.id)).toEqual(stored);
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
  });

  it("rejects stale terms acceptance after the configuration changes", async () => {
    const testing = await createTestingConfig();
    const edited = await fastify.inject({ method: "PUT", url: "/publisher-app/config", payload: { ...validBody, connectEnabled: false } });
    expect(edited.statusCode).toBe(200);
    const stale = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toContain("Reload and review");
    expect(collectionStore("app_configs").get(testing.id)).toMatchObject({ status: "active_for_testing", connectEnabled: false });
    expect(collectionStore("app_configs").get(testing.id)).not.toHaveProperty("termsAcceptedAt");
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
    const fresh = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: edited.json().config.updatedAt } });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().config.status).toBe("active_waiting_for_payment");
  });

  it.each(["pending_revision", "approved", "active", "active_waiting_for_upload", "changes_requested", "rejected"] as const)("refuses publication acceptance from %s", async (status) => {
    const testing = await createTestingConfig();
    collectionStore("app_configs").set(testing.id, { ...collectionStore("app_configs").get(testing.id), status });
    const signed = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt } });
    expect(signed.statusCode).toBe(409);
    expect(collectionStore("app_configs").get(testing.id)?.status).toBe(status);
    expect(collectionStore("app_configs").get(testing.id)).not.toHaveProperty("termsAcceptedAt");
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
  });

  it("requires a valid testing identifier before accepting terms", async () => {
    const testing = await createTestingConfig();
    collectionStore("app_configs").set(testing.id, { ...collectionStore("app_configs").get(testing.id), appProviderIdentifier: undefined });
    const signed = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt } });
    expect(signed.statusCode).toBe(409);
    expect(collectionStore("app_configs").get(testing.id)?.status).toBe("active_for_testing");
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
  });

  it("prevents both ordinary updates and GOD MODE status changes from bypassing the terms signature", async () => {
    const testing = await createTestingConfig();
    const forged = await fastify.inject({ method: "PUT", url: "/publisher-app/config", payload: { ...validBody, status: "active_waiting_for_payment" } });
    expect(forged.statusCode).toBe(400);
    context = makeAdminContext({ isBootstrap: true });
    const bypass = await fastify.inject({ method: "PUT", url: `/admin/publisher-app-configs/${testing.id}`, payload: { ...validBody, termsAccepted: undefined, status: "active_waiting_for_payment" } });
    expect(bypass.statusCode).toBe(409);
    expect(collectionStore("app_configs").get(testing.id)?.status).toBe("active_for_testing");
    expect(collectionStore("app_configs").get(testing.id)).not.toHaveProperty("termsAcceptedAt");
  });

  it.each([
    ["publisher", false], ["publisher", true], ["god", false], ["god", true],
  ] as const)("preserves a concurrently signed payment state during an in-flight %s save (catalog change: %s)", async (surface, changesCatalog) => {
    const testing = await createTestingConfig();
    if (surface === "god") context = makeAdminContext({ isBootstrap: true });
    const runNormally = mockRunTransaction.getMockImplementation()!;
    mockRunTransaction.mockImplementationOnce(async operation => {
      // Another request signs after the save's initial read and before its transaction starts.
      collectionStore("app_configs").set(testing.id, {
        ...collectionStore("app_configs").get(testing.id),
        status: "active_waiting_for_payment", runtimeRevision: 2,
        termsAcceptedAt: new Date(FIXED_TIME + 10_000), termsAcceptedByUserId: "concurrent-signing-user", termsVersion: "2026-10-31",
      });
      return runNormally(operation);
    });
    const payload = {
      ...validBody, termsAccepted: undefined, connectEnabled: false,
      ...(changesCatalog ? { advancedConfiguration: { ...advancedConfigurationBody, displayName: "Updated application name" } } : {}),
      ...(surface === "god" ? { status: "active_for_testing", expectedStatus: "active_for_testing" } : {}),
    };
    const saved = await fastify.inject({ method: "PUT", url: surface === "god" ? `/admin/publisher-app-configs/${testing.id}` : "/publisher-app/config", payload });
    expect(saved.statusCode).toBe(surface === "god" ? 409 : 200);
    expect(collectionStore("app_configs").get(testing.id)).toMatchObject({
      status: "active_waiting_for_payment", termsAcceptedByUserId: "concurrent-signing-user", termsVersion: "2026-10-31",
      runtimeRevision: surface === "god" ? 2 : 3,
    });
    if (surface === "publisher") expect(saved.json().config.status).toBe("active_waiting_for_payment");
  });

  it.each([false, true])("rejects a stale GOD MODE testing save after signing and preserves the payment state (catalog: %s)", async (withCatalog) => {
    const testing = await createTestingConfig();
    if (withCatalog) {
      context = makeAdminContext({ isBootstrap: true });
      expect((await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(200);
      context = organizationContext();
    }
    const signed = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt } });
    expect(signed.statusCode).toBe(200);
    const currentStored = structuredClone(collectionStore("app_configs").get(testing.id));
    context = makeAdminContext({ isBootstrap: true });
    const stale = await fastify.inject({
      method: "PUT", url: `/admin/publisher-app-configs/${testing.id}`,
      payload: { ...validBody, termsAccepted: undefined, status: "active_for_testing", expectedStatus: "active_for_testing" },
    });
    expect(stale.statusCode).toBe(409);
    expect(collectionStore("app_configs").get(testing.id)).toEqual(currentStored);
    const reviewedSave = await fastify.inject({
      method: "PUT", url: `/admin/publisher-app-configs/${testing.id}`,
      payload: { ...validBody, termsAccepted: undefined, status: "active_waiting_for_payment", expectedStatus: "active_waiting_for_payment" },
    });
    expect(reviewedSave.statusCode).toBe(200);
    expect(reviewedSave.json().config).toMatchObject({ status: "active_waiting_for_payment", termsAcceptedAt: signed.json().config.termsAcceptedAt, termsAcceptedByUserId: "org-user-1" });
    if (withCatalog) expect((collectionStore("custom_apps_snapshot").get("simple")?.apps as StoredDocument[])[0]?.status).toBe("active_waiting_for_payment");
  });

  it.each([undefined, organizationContext(), makeAdminContext({ isBootstrap: false })])("protects GOD MODE signing before reading another publisher's configuration (%j)", async (actor) => {
    context = actor;
    const signed = await fastify.inject({ method: "POST", url: "/admin/publisher-app-configs/organization_shared-publisher-id/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: "2026-10-30T15:00:00.000Z" } });
    expect(signed.statusCode).toBe(actor ? 403 : 401);
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("limits portal signing to the authenticated publisher's own app", async () => {
    const testing = await createTestingConfig();
    context = organizationContext({ organizationId: "another-org", uid: "another-user" });
    const signed = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt } });
    expect(signed.statusCode).toBe(404);
    expect(collectionStore("app_configs").get(testing.id)?.status).toBe("active_for_testing");
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
  });

  it("keeps the committed payment state on notification failure and never repeats the transition", async () => {
    const testing = await createTestingConfig();
    mockSendPublisherAppPublicationNotificationEmails.mockRejectedValueOnce(new Error("Notification delivery failed"));
    const payload = { termsAccepted: true, expectedUpdatedAt: testing.updatedAt };
    const first = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().config.status).toBe("active_waiting_for_payment");
    expect(collectionStore("app_configs").get(testing.id)?.status).toBe("active_waiting_for_payment");
    const retried = await fastify.inject({ method: "POST", url: "/publisher-app/config/sign-terms-and-conditions", payload });
    expect(retried.json()).toEqual(first.json());
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledTimes(1);
  });

  it("creates a stable runtime identifier, activates testing, and exports schema v3", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);

    const identifierResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });
    expect(identifierResponse.statusCode).toBe(200);
    const appProviderIdentifier = identifierResponse.json().config
      .appProviderIdentifier as string;
    expect(appProviderIdentifier).toMatch(
      /^app_org_canonical_organization_[0-9]{5}$/,
    );
    expect(identifierResponse.json()).toMatchObject({
      config: {
        status: "active_for_testing",
        runtimeRevision: 1,
        activatedByUserId: "org-user-1",
      },
    });
    expect(
      collectionStore("app_config_identifiers").get(appProviderIdentifier),
    ).toMatchObject({
      appProviderIdentifier,
      configId: "organization_shared-publisher-id",
      publisherKind: "organization",
      publisherId: "shared-publisher-id",
      createdByUserId: "org-user-1",
    });

    const repeatedIdentifierResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });
    expect(repeatedIdentifierResponse.statusCode).toBe(200);
    expect(repeatedIdentifierResponse.json().config).toMatchObject({
      appProviderIdentifier,
      runtimeRevision: 1,
      status: "active_for_testing",
    });
    expect(collectionStore("app_configs").get(createResponse.json().config.id)?.status).toBe("active_for_testing");
    expect(collectionStore("app_config_identifiers").size).toBe(1);
    expect(mockSendPublisherAppCreationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(mockSendPublisherAppCreationNotificationEmails).toHaveBeenCalledWith(identifierResponse.json().config);
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();

    const runtimeResponse = await fastify.inject({
      method: "GET",
      url: "/publisher-app/config/runtime",
    });
    expect(runtimeResponse.statusCode).toBe(200);
    expect(runtimeResponse.json()).toEqual({
      schemaVersion: 3,
      appProviderIdentifier,
      revision: 1,
      status: "published",
      baseContentVersion: "pg-core-v1",
      publisher: {
        kind: "organization",
        id: "shared-publisher-id",
        name: "Canonical Organization",
      },
      branding: {
        displayName: "Canonical Organization",
        logoURL: "https://example.org/canonical-icon.png",
        colors: {
          primary: "#AABBCC",
          secondary: "#123456",
          accent: "#FEDCBA",
          primaryStrong: expect.stringMatching(/^#[0-9A-F]{6}$/),
          primaryDeep: expect.stringMatching(/^#[0-9A-F]{6}$/),
          primarySoft: expect.stringMatching(/^#[0-9A-F]{6}$/),
          accentTextLight: expect.stringMatching(/^#[0-9A-F]{6}$/),
          accentTextDark: expect.stringMatching(/^#[0-9A-F]{6}$/),
          accentSurfaceLight: expect.stringMatching(/^#[0-9A-F]{6}$/),
          counterpointClockwise: "#6639EF",
          counterpointAnticlockwise: "#39EFC1",
        },
        colorOverrides: fixedWhiteForegrounds,
      },
      features: {
        catalogEnabled: true,
        feedEnabled: true,
        connectEnabled: true,
        profileEnabled: true,
        learnEnabled: true,
      },
      discoverScope: {
        mode: "organization",
        publisherOrganizationId: "shared-publisher-id",
      },
      serviceScope: {
        mode: "provider",
        providerId: "shared-publisher-id",
        providerKind: "organization",
      },
      localization: {
        defaultLanguage: "es",
        availableLanguages: ["en", "es"],
      },
      learn: { mode: "base" },
      textOverrides: [
        {
          key: "Only on Pocket Genes",
          en: "Only on Canonical Organization",
          es: "Solo en Canonical Organization",
        },
        {
          key: "Contact Pocket Genes",
          en: "Contact Canonical Organization",
          es: "Contactá a Canonical Organization",
        },
      ],
      links: {
        joinUs: {
          en: "https://goldencrowvs.com/en/pocket-genes/join-us/",
          es: "https://goldencrowvs.com/pocket-genes/join-us/",
        },
        supportEmail: "support@goldencrowvs.com",
        privacyURL: "https://goldencrowvs.com/privacy/",
        termsURL: "https://goldencrowvs.com/terms/",
      },
    });
  });

  it.each(["active", "active_for_testing", "active_waiting_for_upload"] as const)(
    "keeps %s apps available and revises their runtime when edited or moved to the other active state",
    async (status) => {
      const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
      expect(created.statusCode).toBe(201);
      const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
      expect(activated.statusCode).toBe(200);
      const { id, appProviderIdentifier } = activated.json().config;
      collectionStore("app_configs").set(id, { ...collectionStore("app_configs").get(id), status });
      context = makeAdminContext({ isBootstrap: true });
      expect((await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(200);
      context = organizationContext();

      const replay = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
      expect(replay.json().config).toMatchObject({ status, appProviderIdentifier, runtimeRevision: 1 });
      const { getActivePublisherAppRuntimeConfig } = await import("../repositories/publisher-app-config.repository.js");
      expect(await getActivePublisherAppRuntimeConfig(appProviderIdentifier, "ios")).toMatchObject({ status: "published", revision: 1 });

      const edited = await fastify.inject({
        method: "PUT", url: "/publisher-app/config",
        payload: { ...validBody, colors: { ...validBody.colors, primary: "#F97316" } },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json().config).toMatchObject({ status, appProviderIdentifier, runtimeRevision: 2 });
      expect(await getActivePublisherAppRuntimeConfig(appProviderIdentifier, "ios")).toMatchObject({ revision: 2, branding: { colors: { primary: "#F97316" } } });

      const nextStatus = status === "active" ? "active_for_testing" : "active";
      context = makeAdminContext({ isBootstrap: true });
      const transitioned = await fastify.inject({
        method: "PUT", url: `/admin/publisher-app-configs/${id}`,
        payload: { ...validBody, termsAccepted: undefined, status: nextStatus },
      });
      expect(transitioned.statusCode).toBe(200);
      expect(transitioned.json().config).toMatchObject({ status: nextStatus, runtimeRevision: 3 });
      const snapshot = collectionStore("custom_apps_snapshot").get("simple")!;
      expect(snapshot).toMatchObject({ activeCount: 1, inactiveCount: 0, totalCount: 1 });
      expect((snapshot.apps as StoredDocument[])[0]).toMatchObject({ status: nextStatus, isActive: true });
      expect((snapshot.statusCounts as StoredDocument[]).find((entry) => entry.status === nextStatus)?.count).toBe(1);
      expect((snapshot.statusCounts as StoredDocument[]).find((entry) => entry.status === status)?.count).toBe(0);
      expect(await getActivePublisherAppRuntimeConfig(appProviderIdentifier, "android")).toMatchObject({ revision: 3, status: "published" });
    },
  );

  it.each(["active", "active_for_testing", "active_waiting_for_upload"] as const)("requires an identifier before an admin can set %s", async (status) => {
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    expect(created.statusCode).toBe(201);
    context = makeAdminContext({ isBootstrap: true });
    const updated = await fastify.inject({ method: "PUT", url: `/admin/publisher-app-configs/${created.json().config.id}`, payload: { ...validBody, termsAccepted: undefined, status } });
    expect(updated.statusCode).toBe(409);
    expect(collectionStore("app_configs").get(created.json().config.id)?.status).toBe("pending_revision");
  });

  it("allows GOD MODE to move a signed app to waiting for upload while publishers can only read and preserve that status", async () => {
    const testing = await createTestingConfig();
    const signed = await fastify.inject({
      method: "POST", url: "/publisher-app/config/sign-terms-and-conditions",
      payload: { termsAccepted: true, expectedUpdatedAt: testing.updatedAt },
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json().config.status).toBe("active_waiting_for_payment");
    context = makeAdminContext({ isBootstrap: true, uid: "upload-operator" });
    expect((await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(200);
    const changed = await fastify.inject({
      method: "PUT", url: `/admin/publisher-app-configs/${testing.id}`,
      payload: { ...validBody, termsAccepted: undefined, status: "active_waiting_for_upload", expectedStatus: "active_waiting_for_payment" },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().config).toMatchObject({
      status: "active_waiting_for_upload", appProviderIdentifier: testing.appProviderIdentifier,
      termsAcceptedAt: signed.json().config.termsAcceptedAt,
      termsAcceptedByUserId: signed.json().config.termsAcceptedByUserId,
      runtimeRevision: signed.json().config.runtimeRevision + 1, updatedByUserId: "upload-operator",
    });
    const snapshot = collectionStore("custom_apps_snapshot").get("simple")!;
    expect(snapshot).toMatchObject({ activeCount: 1, inactiveCount: 0 });
    expect(snapshot.statusCounts).toEqual(expect.arrayContaining([
      { status: "active_waiting_for_payment", count: 0 }, { status: "active_waiting_for_upload", count: 1 },
    ]));
    expect((snapshot.apps as StoredDocument[])[0]).toMatchObject({ status: "active_waiting_for_upload", isActive: true });
    expect((await fastify.inject({ method: "GET", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(200);
    collectionStore("custom_apps_snapshot").set("simple", {
      ...snapshot, statusCounts: (snapshot.statusCounts as StoredDocument[]).filter(entry => entry.status !== "active_waiting_for_upload"),
    });
    expect((await fastify.inject({ method: "GET", url: "/admin/publisher-app-configs/snapshot" })).statusCode).toBe(500);
    collectionStore("custom_apps_snapshot").set("simple", snapshot);

    context = organizationContext();
    const read = await fastify.inject({ method: "GET", url: "/publisher-app/config" });
    expect(read.json().config.status).toBe("active_waiting_for_upload");
    const edited = await fastify.inject({ method: "PUT", url: "/publisher-app/config", payload: { ...validBody, termsAccepted: undefined, connectEnabled: false } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().config).toMatchObject({ status: "active_waiting_for_upload", termsAcceptedAt: signed.json().config.termsAcceptedAt });
    expect(mockSendPublisherAppPublicationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(mockSendPublisherAppCreationNotificationEmails).toHaveBeenCalledTimes(1);
  });

  it("rejects publisher manual status updates and identifier deactivation without touching config, catalog or identifier records", async () => {
    const testing = await createTestingConfig();
    context = makeAdminContext({ isBootstrap: true });
    await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" });
    context = organizationContext();
    const before = structuredClone([...collections]);
    for (const request of [
      { method: "PUT" as const, url: "/publisher-app/config", payload: { ...validBody, termsAccepted: undefined, status: "active_waiting_for_upload" } },
      { method: "PUT" as const, url: `/admin/publisher-app-configs/${testing.id}`, payload: { ...validBody, termsAccepted: undefined, status: "active_waiting_for_upload" } },
      { method: "DELETE" as const, url: "/publisher-app/config/identifier" },
    ]) {
      const denied = await fastify.inject(request);
      expect(denied.statusCode).toBe(request.url === "/publisher-app/config" ? 400 : 403);
      expect([...collections]).toEqual(before);
    }
  });

  it("enforces GOD MODE privileges at the repository boundary for status edits and deactivation", async () => {
    const { updatePublisherAppConfigById, deactivatePublisherAppIdentifier } = await import("../repositories/publisher-app-config.repository.js");
    mockCollection.mockClear();
    await expect(updatePublisherAppConfigById(organizationContext(), "organization_shared-publisher-id", {
      ...validBody, iconSource: "publisher", status: "active_waiting_for_upload",
    })).rejects.toMatchObject({ statusCode: 403 });
    await expect(deactivatePublisherAppIdentifier(organizationContext())).rejects.toMatchObject({ statusCode: 403 });
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it.each(["active", "active_for_testing", "active_waiting_for_upload"] as const)("revises the runtime when an admin re-enables a configured app as %s", async (status) => {
    await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    const { id, appProviderIdentifier } = activated.json().config;
    collectionStore("app_configs").set(id, { ...collectionStore("app_configs").get(id), status: "approved", runtimeRevision: 7 });
    context = makeAdminContext({ isBootstrap: true });
    await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" });
    expect(collectionStore("custom_apps_snapshot").get("simple")).toMatchObject({ activeCount: 0, inactiveCount: 1 });
    const enabled = await fastify.inject({ method: "PUT", url: `/admin/publisher-app-configs/${id}`, payload: { ...validBody, termsAccepted: undefined, status } });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().config).toMatchObject({ status, runtimeRevision: 8, appProviderIdentifier });
    expect(collectionStore("custom_apps_snapshot").get("simple")).toMatchObject({ activeCount: 1, inactiveCount: 0 });
    const { getActivePublisherAppRuntimeConfig } = await import("../repositories/publisher-app-config.repository.js");
    expect(await getActivePublisherAppRuntimeConfig(appProviderIdentifier, "ios")).toMatchObject({ status: "published", revision: 8 });
  });

  it("publishes every advanced configuration block into the runtime contract", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: {
        ...validBody,
        iconSource: "custom",
        iconImageUrl: null,
        iconImageUploadDataUrl: "data:image/png;base64,QUJDRA==",
        advancedConfiguration: advancedConfigurationBody,
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const activationResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });
    expect(activationResponse.statusCode).toBe(200);

    const runtimeResponse = await fastify.inject({
      method: "GET",
      url: "/publisher-app/config/runtime",
    });
    expect(runtimeResponse.statusCode).toBe(200);
    expect(runtimeResponse.json()).toMatchObject({
      schemaVersion: 3,
      branding: {
        displayName: "Advanced Experience",
        logoURL: null,
        logoUploadDataUrl: "data:image/png;base64,QUJDRA==",
        colors: advancedConfigurationBody.semanticColors,
        colorOverrides: advancedConfigurationBody.colorOverrides,
      },
      features: {
        catalogEnabled: false,
        feedEnabled: true,
      },
      discoverScope: { mode: "all" },
      serviceScope: {
        mode: "provider",
        providerId: "professional-42",
        providerKind: "individual",
      },
      localization: advancedConfigurationBody.localization,
      textOverrides: advancedConfigurationBody.textOverrides,
      learn: {
        mode: "replace",
        curriculumId: "advanced-curriculum",
        curriculumRevision: 3,
        defaultLanguage: "es",
        lessonReference: {
          subjects: [
            {
              subjectIdentifier: "ADV",
              chapters: [
                {
                  chapterTitle: "Advanced chapter",
                  lessons: [
                    {
                      lessonIdentifier: "ADV.1",
                      imageURL: "https://example.org/lesson.png",
                      lessonColor: "#ABCDEF",
                    },
                  ],
                },
              ],
            },
          ],
        },
        lessonDictionary: {
          "ADV.1": {
            lessonIdentifier: "ADV.1",
            paragraphs: [
              {
                paragraphTitle: "Welcome",
                icon: "hand.wave",
                contentText: "Advanced educational content.",
              },
            ],
            useful_links: ["https://example.org/guide"],
            related_lessons: [],
          },
        },
        topics: { personalized_medicine: ["ADV"] },
      },
      links: {
        joinUs: advancedConfigurationBody.links.joinUs,
        supportEmail: "help@example.org",
        privacyURL: "https://example.org/privacy",
        termsURL: "https://example.org/terms",
      },
    });
    expect(runtimeResponse.json().branding.colors).toEqual({
      ...advancedConfigurationBody.semanticColors,
      counterpointClockwise: "#6639EF",
      counterpointAnticlockwise: "#39EFC1",
    });
  });

  it.each([[5, "active"], [5, "active_for_testing"], [6, "active"], [6, "active_for_testing"]] as const)("republishes contract %s once with fixed white foregrounds for %s while preserving the stored configuration", async (priorContract, status) => {
    const advanced: PublisherAppAdvancedConfiguration = structuredClone(advancedConfigurationBody);
    advanced.colorOverrides = {
      ...advanced.colorOverrides,
      ...Object.fromEntries(Object.keys(fixedWhiteForegrounds).map(key => [key, { light: "#12345680", dark: "#000000" }])),
      "community.genes.primaryActionFill": { light: "#00A88A", dark: "#5EEAD4" },
      "community.genes.secondaryActionForeground": { light: "#123456", dark: "#65432180" },
    };
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: { ...validBody, advancedConfiguration: advanced } });
    expect(created.statusCode).toBe(201);
    const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    const configId = created.json().config.id;
    const stored = collectionStore("app_configs").get(configId)!;
    const legacy = { ...stored, status, runtimeRevision: 7, runtimeColorContractVersion: priorContract };
    collectionStore("app_configs").set(configId, legacy);
    const { getActivePublisherAppRuntimeConfig } = await import("../repositories/publisher-app-config.repository.js");
    const first = await getActivePublisherAppRuntimeConfig(activated.json().config.appProviderIdentifier, "ios");
    expect(first.revision).toBe(8);
    expect(first.branding.colorOverrides).toEqual({ ...advanced.colorOverrides, ...fixedWhiteForegrounds });
    expect(collectionStore("app_configs").get(configId)).toEqual({ ...legacy, runtimeRevision: 8, runtimeColorContractVersion: 7 });
    expect(await getActivePublisherAppRuntimeConfig(activated.json().config.appProviderIdentifier, "android")).toEqual(first);
    expect(collectionStore("app_configs").get(configId)?.runtimeRevision).toBe(8);
  });

  it.each([3, 4, 5, 6])("publishes restored missing-counterpoint defaults from contract %s with a new revision while preserving explicit manual colors", async (priorContract) => {
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    expect(created.statusCode).toBe(201);
    const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    const configId = created.json().config.id;
    const stored = collectionStore("app_configs").get(configId)!;
    const originalColors = stored.colors as Record<string, string>;
    const legacyColors = {
      primary: "#5A443C",
      secondary: originalColors.secondary,
      tertiary: originalColors.tertiary,
      counterpointAnticlockwise: "#123456",
    };
    collectionStore("app_configs").set(configId, {
      ...stored, colors: legacyColors, runtimeRevision: 7, runtimeColorContractVersion: priorContract,
    });
    const { getActivePublisherAppRuntimeConfig } = await import("../repositories/publisher-app-config.repository.js");
    const first = await getActivePublisherAppRuntimeConfig(activated.json().config.appProviderIdentifier, "ios");
    expect(first.revision).toBe(8);
    expect(first.branding.colors).toMatchObject({
      primary: "#5A443C",
      counterpointClockwise: derivePublisherAppCounterpointColors("#5A443C").counterpointClockwise,
      counterpointAnticlockwise: "#123456",
    });
    expect(first.branding.colors.counterpointClockwise).not.toBe("#524935");
    expect(collectionStore("app_configs").get(configId)).toMatchObject({
      colors: legacyColors, runtimeRevision: 8, runtimeColorContractVersion: 7,
    });
    expect(await getActivePublisherAppRuntimeConfig(activated.json().config.appProviderIdentifier, "ios")).toEqual(first);
  });

  it.each([[false, undefined], [true, undefined], [false, 1], [true, 1], [false, 2], [true, 2], [false, 3], [true, 3], [false, 4], [true, 4], [false, 5], [true, 5], [false, 6], [true, 6]] as const)(
    "publishes configured counterpoints exactly and bumps a legacy runtime revision only once (stored semantic colors: %s, prior contract: %s)",
    async (useStoredSemanticColors, priorContract) => {
      const created = await fastify.inject({
        method: "POST",
        url: "/publisher-app/config",
        payload: {
          ...validBody,
          ...(useStoredSemanticColors ? { advancedConfiguration: advancedConfigurationBody } : {}),
        },
      });
      expect(created.statusCode).toBe(201);
      const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
      expect(activated.statusCode).toBe(200);
      const configId = created.json().config.id;
      const original = collectionStore("app_configs").get(configId)!;
      const legacy: StoredDocument = { ...original, runtimeRevision: 7 };
      if (priorContract === undefined) delete legacy.runtimeColorContractVersion;
      else legacy.runtimeColorContractVersion = priorContract;
      collectionStore("app_configs").set(configId, legacy);
      const expectedSemanticColors = useStoredSemanticColors
        ? advancedConfigurationBody.semanticColors
        : derivePublisherAppSemanticColors(created.json().config.colors);
      const colors = created.json().config.colors;
      const { getActivePublisherAppRuntimeConfig } = await import("../repositories/publisher-app-config.repository.js");
      const first = await getActivePublisherAppRuntimeConfig(activated.json().config.appProviderIdentifier, "ios");
      expect(first.revision).toBe(8);
      expect(first.branding.colors).toEqual({
        ...expectedSemanticColors,
        counterpointClockwise: colors.counterpointClockwise,
        counterpointAnticlockwise: colors.counterpointAnticlockwise,
      });
      expect(first.branding.colors.counterpointClockwise).toMatch(/^#[0-9A-F]{6}$/);
      expect(first.branding.colors.counterpointAnticlockwise).toMatch(/^#[0-9A-F]{6}$/);
      if (useStoredSemanticColors) {
        expect(first.branding.colorOverrides).toEqual({ ...advancedConfigurationBody.colorOverrides, ...fixedWhiteForegrounds });
      }
      expect(collectionStore("app_configs").get(configId)).toEqual({
        ...legacy,
        runtimeRevision: 8,
        runtimeColorContractVersion: 7,
      });
      expect(await getActivePublisherAppRuntimeConfig(activated.json().config.appProviderIdentifier, "android")).toEqual(first);
      const repeated = await fastify.inject({ method: "GET", url: "/publisher-app/config/runtime" });
      expect(repeated.json()).toEqual(first);
      context = makeAdminContext({ isBootstrap: true });
      const exported = await fastify.inject({ method: "GET", url: `/admin/publisher-app-configs/${configId}/runtime` });
      expect(exported.json()).toEqual(first);
    },
  );

  it.each([
    {
      label: "an unknown wording key",
      mutate: (advanced: PublisherAppAdvancedConfiguration) => {
        advanced.textOverrides[0]!.key = "Unknown private localization key";
      },
    },
    {
      label: "an unknown color role",
      mutate: (advanced: PublisherAppAdvancedConfiguration) => {
        advanced.colorOverrides = { "unknown.color": { light: "#FFFFFF" } };
      },
    },
    {
      label: "an unknown automatic provenance role",
      mutate: (advanced: PublisherAppAdvancedConfiguration) => {
        advanced.generatedColorOverrides = { "unknown.color": { light: "#FFFFFF" } };
      },
    },
    {
      label: "an unknown related lesson",
      mutate: (advanced: PublisherAppAdvancedConfiguration) => {
        if (advanced.learn.mode === "replace") {
          advanced.learn.subjects[0]!.chapters[0]!.lessons[0]!.relatedLessons =
            ["UNKNOWN.1"];
        }
      },
    },
    {
      label: "an unsupported Learn topic",
      mutate: (advanced: PublisherAppAdvancedConfiguration) => {
        if (advanced.learn.mode === "replace") {
          advanced.learn.topics = { unsupported_topic: ["ADV"] };
        }
      },
    },
  ])("rejects $label in advanced configuration", async ({ mutate }) => {
    const advanced: PublisherAppAdvancedConfiguration = structuredClone(
      advancedConfigurationBody,
    );
    mutate(advanced);
    const response = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: { ...validBody, advancedConfiguration: advanced },
    });

    expect(response.statusCode).toBe(400);
    expect(collectionStore("app_configs").size).toBe(0);
  });

  it("replaces a legacy active identifier with the memorable name format", async () => {
    await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    const configId = "organization_shared-publisher-id";
    collectionStore("app_configs").set(configId, {
      ...collectionStore("app_configs").get(configId),
      status: "active",
      appProviderIdentifier: "organization_8thNEDU1xbFqwnQDUrPt",
      runtimeRevision: 1,
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config).toMatchObject({
      status: "active",
      runtimeRevision: 2,
      appProviderIdentifier: expect.stringMatching(
        /^app_org_canonical_organization_[0-9]{5}$/,
      ),
    });
  });

  it.each(["active", "active_for_testing", "active_waiting_for_upload"] as const)("turns down an %s identifier and returns the app to pending revision", async (status) => {
    await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    const activationResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });
    const appProviderIdentifier = activationResponse.json().config
      .appProviderIdentifier as string;
    collectionStore("app_configs").set("organization_shared-publisher-id", {
      ...collectionStore("app_configs").get("organization_shared-publisher-id"),
      status,
    });

    context = organizationContext({ isBootstrap: true });
    const response = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config/identifier",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config).toMatchObject({
      status: "pending_revision",
      updatedByUserId: "org-user-1",
    });
    expect(response.json().config).not.toHaveProperty("appProviderIdentifier");
    expect(response.json().config).not.toHaveProperty("runtimeRevision");
    expect(response.json().config).not.toHaveProperty("activatedAt");
    expect(response.json().config).not.toHaveProperty("activatedByUserId");
    expect(
      collectionStore("app_config_identifiers").get(appProviderIdentifier),
    ).toMatchObject({ configId: "organization_shared-publisher-id" });

    const runtimeResponse = await fastify.inject({
      method: "GET",
      url: "/publisher-app/config/runtime",
    });
    expect(runtimeResponse.statusCode).toBe(409);

    const reactivationResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });
    expect(reactivationResponse.statusCode).toBe(200);
    expect(reactivationResponse.json().config).toMatchObject({
      status: "active_for_testing",
      runtimeRevision: 1,
      appProviderIdentifier: expect.stringMatching(
        /^app_org_canonical_organization_[0-9]{5}$/,
      ),
    });
    expect(reactivationResponse.json().config.appProviderIdentifier).not.toBe(
      appProviderIdentifier,
    );
    expect(collectionStore("app_config_identifiers").size).toBe(2);
  });

  it("rejects identifier deactivation when the app is not active for testing", async () => {
    await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });

    context = organizationContext({ isBootstrap: true });
    const response = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config/identifier",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "Only a runtime-enabled app can deactivate its identifier.",
    });
  });

  it("uses at most three normalized profile-name words for individual identifiers", async () => {
    context = individualContext();
    seedPublisher("individual", "shared-publisher-id", {
      name: "Dra. María José Pérez Extra",
    });
    mockGetProfileSetupState.mockResolvedValue({
      defaults: { username: "maria-jose" },
    });
    const creationResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(creationResponse.statusCode).toBe(201);

    const response = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.appProviderIdentifier).toMatch(
      /^app_ind_dra_maria_jose_[0-9]{5}$/,
    );
    expect(response.json().config.status).toBe("active_for_testing");
    expect(collectionStore("app_configs").get(creationResponse.json().config.id)?.status).toBe("active_for_testing");
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

  it.each(["organization", "individual"] as const)("lets GOD MODE delete %s apps in every status without deleting publishers", async (kind) => {
    if (kind === "individual") {
      context = individualContext();
      seedPublisher(kind, "shared-publisher-id", { name: "Individual Publisher" });
    }
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    expect(created.statusCode).toBe(201);
    const config = created.json().config;
    for (const status of ["pending_revision", "active_for_testing", "active_waiting_for_payment", "active_waiting_for_upload", "active", "approved", "changes_requested", "rejected"]) {
      collectionStore("app_configs").set(config.id, { ...config, status });
      context = makeAdminContext({ isBootstrap: true });
      const response = await fastify.inject({ method: "DELETE", url: `/admin/publisher-app-configs/${config.id}`, payload: { expectedUpdatedAt: config.updatedAt } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ deleted: true, configId: config.id });
      expect(collectionStore("app_configs").has(config.id)).toBe(false);
      expect(collectionStore(kind === "organization" ? "feed_organizations" : "feed_individuals").has("shared-publisher-id")).toBe(true);
    }
  });

  it("atomically removes a GOD MODE app from the catalog and keeps identifier reservations and linked content", async () => {
    await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    const activated = await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    const target = activated.json().config;
    context = individualContext();
    seedPublisher("individual", "shared-publisher-id", { name: "Individual Publisher" });
    await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    await fastify.inject({ method: "POST", url: "/publisher-app/config/identifier" });
    context = makeAdminContext({ isBootstrap: true, uid: "deleting-operator" });
    await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" });
    collectionStore("connected-partners").set("partner", { linkedAppId: target.id });
    collectionStore("feed_items").set("publication", { publisherId: target.publisherId });
    mockQueryReadCollections.length = 0;
    const beforeTransactions = mockRunTransaction.mock.calls.length;
    const response = await fastify.inject({ method: "DELETE", url: `/admin/publisher-app-configs/${target.id}`, payload: { expectedUpdatedAt: target.updatedAt } });
    expect(response.statusCode).toBe(200);
    expect(mockRunTransaction.mock.calls.length).toBe(beforeTransactions + 1);
    expect(mockQueryReadCollections).toEqual([]);
    const snapshot = collectionStore("custom_apps_snapshot").get("simple")!;
    expect(snapshot).toMatchObject({ totalCount: 1, activeCount: 1, inactiveCount: 0, updatedByUserId: "deleting-operator" });
    expect(snapshot.apps).toEqual([expect.objectContaining({ id: "individual_shared-publisher-id" })]);
    expect(snapshot.statusCounts).toEqual(expect.arrayContaining([{ status: "active_for_testing", count: 1 }]));
    expect(collectionStore("app_config_identifiers").size).toBe(2);
    expect(collectionStore("feed_organizations").has("shared-publisher-id")).toBe(true);
    expect(collectionStore("connected-partners").get("partner")).toEqual({ linkedAppId: target.id });
    expect(collectionStore("feed_items").has("publication")).toBe(true);
    const replay = await fastify.inject({ method: "DELETE", url: `/admin/publisher-app-configs/${target.id}`, payload: { expectedUpdatedAt: target.updatedAt } });
    expect(replay.statusCode).toBe(200);
    expect(collectionStore("custom_apps_snapshot").get("simple")?.totalCount).toBe(1);
  });

  it("rejects stale GOD MODE deletions, including a recreated app with the same id", async () => {
    const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
    const config = created.json().config;
    const replacement = { ...collectionStore("app_configs").get(config.id), updatedAt: new Date(FIXED_TIME + 60_000) };
    collectionStore("app_configs").set(config.id, replacement);
    context = makeAdminContext({ isBootstrap: true });
    const response = await fastify.inject({ method: "DELETE", url: `/admin/publisher-app-configs/${config.id}`, payload: { expectedUpdatedAt: config.updatedAt } });
    expect(response.statusCode).toBe(409);
    expect(collectionStore("app_configs").get(config.id)).toEqual(replacement);
  });

  it.each([undefined, organizationContext(), makeAdminContext()])("denies unprivileged GOD MODE deletions before reading Firestore (%j)", async (caller) => {
    context = caller;
    const response = await fastify.inject({ method: "DELETE", url: "/admin/publisher-app-configs/organization_target", payload: { expectedUpdatedAt: new Date(FIXED_TIME).toISOString() } });
    expect(response.statusCode).toBe(caller ? 403 : 401);
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("also enforces GOD MODE access in the deletion repository", async () => {
    const { deletePublisherAppConfigById } = await import("../repositories/publisher-app-config.repository.js");
    await expect(deletePublisherAppConfigById(makeAdminContext(), "organization_target", new Date(FIXED_TIME).toISOString())).rejects.toMatchObject({ statusCode: 403 });
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("validates the deletion timestamp and document id before accessing Firestore", async () => {
    context = makeAdminContext({ isBootstrap: true });
    for (const payload of [{}, { expectedUpdatedAt: "yesterday" }]) {
      expect((await fastify.inject({ method: "DELETE", url: "/admin/publisher-app-configs/organization_target", payload })).statusCode).toBe(400);
    }
    expect((await fastify.inject({ method: "DELETE", url: "/admin/publisher-app-configs/invalid%2Fid", payload: { expectedUpdatedAt: new Date(FIXED_TIME).toISOString() } })).statusCode).toBe(400);
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("deletes a pending-revision app config for its scoped publisher", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);

    const response = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      configId: "organization_shared-publisher-id",
    });
    expect(collectionStore("app_configs").size).toBe(0);
  });

  it("refuses to delete an app config after review has advanced", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);
    const id = "organization_shared-publisher-id";
    collectionStore("app_configs").set(id, {
      ...collectionStore("app_configs").get(id),
      status: "approved",
    });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "Only app configs pending revision can be deleted.",
    });
    expect(collectionStore("app_configs").has(id)).toBe(true);
  });

  it("returns 404 when deleting a publisher without an app config", async () => {
    const response = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Publisher app config not found.",
    });
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
        counterpointClockwise: "#4612E2",
        counterpointAnticlockwise: "#12E2AE",
        counterpointFarClockwise: "#AE12E2",
        counterpointFarAnticlockwise: "#12E246",
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

  it("restricts the global app collection routes to GOD MODE", async () => {
    context = makeAdminContext({ role: "full_admin", isBootstrap: false });

    for (const { method, url } of [
      { method: "GET", url: "/admin/publisher-app-configs" },
      { method: "GET", url: "/admin/publisher-app-configs/snapshot" },
      { method: "PUT", url: "/admin/publisher-app-configs/snapshot" },
      {
        method: "GET",
        url: "/admin/publisher-app-configs/organization_shared-publisher-id",
      },
    ] as const) {
      const response = await fastify.inject({ method, url });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "GOD MODE access required" });
    }
  });

  it.each([undefined, organizationContext(), makeAdminContext({ isBootstrap: false })])(
    "protects organization app creation, preparation, and activation before any reads (%j)",
    async (actor) => {
      context = actor;
      const base = "/admin/publisher-app-configs/organizations/shared-publisher-id";
      for (const request of [
        { method: "GET" as const, url: base },
        { method: "POST" as const, url: base, payload: validBody },
        { method: "PUT" as const, url: base, payload: validBody },
        { method: "POST" as const, url: `${base}/identifier` },
      ]) {
        const response = await fastify.inject(request);
        expect(response.statusCode).toBe(actor ? 403 : 401);
      }
      expect(mockCollection).not.toHaveBeenCalled();
      expect(mockSendPublisherAppCreationNotificationEmails).not.toHaveBeenCalled();
    },
  );

  it("creates and activates the selected organization's app through the publisher workflow, auditing the real operator", async () => {
    context = makeAdminContext({ isBootstrap: true });
    const base = "/admin/publisher-app-configs/organizations/shared-publisher-id";
    const snapshot = await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" });
    expect(snapshot.statusCode).toBe(200);
    seedPublisher("organization", "shared-publisher-id", {
      name: "Canonical Organization",
      colorHex: "#123ABC",
      imageUrl: "https://example.org/canonical-icon.png",
    });

    const preparation = await fastify.inject({ method: "GET", url: base });
    expect(preparation.statusCode).toBe(200);
    expect(preparation.json()).toMatchObject({
      config: null,
      publisherKind: "organization",
      publisherId: "shared-publisher-id",
      publisherName: "Canonical Organization",
      publisherTint: "#123ABC",
      publisherImageUrl: "https://example.org/canonical-icon.png",
      publisherEmail: context.email.toLowerCase(),
      publisherUsername: "current-profile-user",
    });
    expect(collectionStore("app_configs").size).toBe(0);

    const created = await fastify.inject({ method: "POST", url: base, payload: validBody });
    expect(created.statusCode).toBe(201);
    expect(created.json().config).toMatchObject({
      id: "organization_shared-publisher-id",
      publisherKind: "organization",
      publisherId: "shared-publisher-id",
      publisherName: "Canonical Organization",
      publisherEmail: context.email.toLowerCase(),
      publisherUsername: "current-profile-user",
      iconImageUrl: "https://example.org/canonical-icon.png",
      status: "pending_revision",
      createdByUserId: context.uid,
      advancedConfiguration: {
        discoverScope: { mode: "organization", publisherOrganizationId: "shared-publisher-id" },
        serviceScope: { mode: "provider", providerId: "shared-publisher-id", providerKind: "organization" },
      },
    });
    expect(mockSendPublisherAppCreationNotificationEmails).not.toHaveBeenCalled();
    expect(collectionStore("custom_apps_snapshot").get("simple")).toMatchObject({
      totalCount: 1,
      updatedByUserId: context.uid,
    });

    const duplicate = await fastify.inject({ method: "POST", url: base, payload: validBody });
    expect(duplicate.statusCode).toBe(409);
    expect(collectionStore("app_configs").size).toBe(1);
    expect(mockSendPublisherAppCreationNotificationEmails).not.toHaveBeenCalled();

    const colorsUpdated = await fastify.inject({
      method: "PUT",
      url: base,
      payload: { ...validBody, advancedConfiguration: advancedConfigurationBody },
    });
    expect(colorsUpdated.statusCode).toBe(200);
    expect(colorsUpdated.json().config).toMatchObject({
      id: created.json().config.id,
      status: "pending_revision",
      publisherEmail: context.email.toLowerCase(),
      advancedConfiguration: { colorOverrides: advancedConfigurationBody.colorOverrides },
    });

    const activated = await fastify.inject({ method: "POST", url: `${base}/identifier` });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().config).toMatchObject({
      status: "active_for_testing",
      activatedByUserId: context.uid,
      appProviderIdentifier: expect.stringMatching(/^app_org_/),
    });
    const replay = await fastify.inject({ method: "POST", url: `${base}/identifier` });
    expect(replay.json().config.status).toBe("active_for_testing");
    expect(replay.json().config.appProviderIdentifier).toBe(activated.json().config.appProviderIdentifier);
    expect(collectionStore("app_configs").get(created.json().config.id)?.status).toBe("active_for_testing");
    expect((collectionStore("custom_apps_snapshot").get("simple")?.apps as StoredDocument[])[0]).toMatchObject({
      status: "active_for_testing", isActive: true,
    });
    expect(mockSendPublisherAppCreationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(mockSendPublisherAppCreationNotificationEmails).toHaveBeenCalledWith(activated.json().config);
    expect(activated.json().config).not.toHaveProperty("termsAcceptedAt");
    expect(mockSendPublisherAppPublicationNotificationEmails).not.toHaveBeenCalled();
    const existing = await fastify.inject({ method: "GET", url: base });
    expect(existing.json().config.id).toBe("organization_shared-publisher-id");
  });

  it("rejects missing organizations and client-authored publisher identities without creating an app", async () => {
    context = makeAdminContext({ isBootstrap: true });
    const missing = await fastify.inject({
      method: "POST",
      url: "/admin/publisher-app-configs/organizations/missing",
      payload: validBody,
    });
    expect(missing.statusCode).toBe(404);
    for (const payload of [
      { ...validBody, publisherId: "other-org", publisherEmail: "fake@example.org" },
      { ...validBody, termsAccepted: false },
    ]) {
      const rejected = await fastify.inject({
        method: "POST",
        url: "/admin/publisher-app-configs/organizations/shared-publisher-id",
        payload,
      });
      expect(rejected.statusCode).toBe(400);
    }
    expect(collectionStore("app_configs").size).toBe(0);
    expect(mockSendPublisherAppCreationNotificationEmails).not.toHaveBeenCalled();
  });

  it("lists every app config for GOD MODE with a bounded cursor page", async () => {
    const firstCreate = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(firstCreate.statusCode).toBe(201);

    context = individualContext();
    seedPublisher("individual", "shared-publisher-id", {
      name: "Canonical Individual",
    });
    const secondCreate = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: { ...validBody, platformOption: "ios" },
    });
    expect(secondCreate.statusCode).toBe(201);

    context = makeAdminContext({
      role: "full_admin",
      isBootstrap: true,
      uid: "god-user",
    });
    const firstPage = await fastify.inject({
      method: "GET",
      url: "/admin/publisher-app-configs?limit=1",
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().apps).toHaveLength(1);
    expect(firstPage.json().nextCursor).toEqual(expect.any(String));

    const secondPage = await fastify.inject({
      method: "GET",
      url: `/admin/publisher-app-configs?limit=1&cursor=${encodeURIComponent(
        firstPage.json().nextCursor,
      )}`,
    });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json().apps).toHaveLength(1);
    expect(secondPage.json().apps[0].id).not.toBe(firstPage.json().apps[0].id);
    expect(secondPage.json().nextCursor).toBeNull();
  });

  it("compacts legacy embedded icons atomically when adding another app would exceed Firestore's document limit", async () => {
    const images = ["A", "B", "C"].map((character) => `data:image/png;base64,${character.repeat(384_000)}`);
    for (let index = 0; index < 2; index += 1) {
      const id = `large-icon-${index}`;
      context = organizationContext({ organizationId: id });
      seedPublisher("organization", id, { name: id, imageUploadDataUrl: images[index] });
      const created = await fastify.inject({ method: "POST", url: "/publisher-app/config", payload: validBody });
      expect(created.statusCode).toBe(201);
    }
    context = makeAdminContext({ isBootstrap: true });
    const refreshed = await fastify.inject({ method: "PUT", url: "/admin/publisher-app-configs/snapshot" });
    expect(refreshed.statusCode).toBe(200);
    const compactSnapshot = collectionStore("custom_apps_snapshot").get("simple")!;
    // Reproduce a deployed catalog that still embeds the first two image payloads.
    collectionStore("custom_apps_snapshot").set("simple", {
      ...compactSnapshot,
      apps: (compactSnapshot.apps as StoredDocument[]).map((app, index) => ({ ...app, image: images[index] })),
    });
    seedPublisher("organization", "large-icon-2", { name: "Third app", imageUploadDataUrl: images[2] });
    const created = await fastify.inject({
      method: "POST",
      url: "/admin/publisher-app-configs/organizations/large-icon-2",
      payload: validBody,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().config.iconImageUploadDataUrl).toBe(images[2]);
    const snapshot = collectionStore("custom_apps_snapshot").get("simple")!;
    expect(snapshot.totalCount).toBe(3);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(10_000);
    expect((snapshot.apps as StoredDocument[]).every((app) => String(app.image).startsWith("https://"))).toBe(true);
    expect(collectionStore("custom_app_icons").size).toBe(3);

    context = undefined;
    for (const image of images) {
      const hash = createHash("sha256").update(image!).digest("hex");
      const icon = await fastify.inject({ method: "GET", url: `/publisher-app/icon?hash=${hash}` });
      expect(icon.statusCode).toBe(200);
      expect(icon.headers["content-type"]).toBe("image/png");
      expect(icon.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(icon.headers["cache-control"]).toContain("immutable");
      expect(icon.rawPayload).toEqual(Buffer.from(image!.split(",")[1]!, "base64"));
    }
    const invalid = await fastify.inject({ method: "GET", url: "/publisher-app/icon?hash=../app_configs" });
    expect(invalid.statusCode).toBe(400);
    const absent = await fastify.inject({ method: "GET", url: `/publisher-app/icon?hash=${"0".repeat(64)}` });
    expect(absent.statusCode).toBe(404);
  });

  it("creates and reads one lightweight custom app catalog snapshot", async () => {
    seedPublisher("organization", "shared-publisher-id", {
      name: "Canonical Organization",
      imageUrl: "https://example.org/canonical-icon.png",
      description: "  A compact organization app description.  ",
    });
    const organizationCreate = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(organizationCreate.statusCode).toBe(201);
    collectionStore("app_configs").set("organization_shared-publisher-id", {
      ...collectionStore("app_configs").get("organization_shared-publisher-id"),
      status: "active",
      appProviderIdentifier: "app_org_canonical_12345",
    });

    context = individualContext();
    seedPublisher("individual", "shared-publisher-id", {
      name: "Canonical Individual",
      imageUploadDataUrl: "data:image/png;base64,QUJD",
      descriptionEn: "Individual app description.",
    });
    const individualCreate = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: { ...validBody, platformOption: "ios" },
    });
    expect(individualCreate.statusCode).toBe(201);
    collectionStore("app_configs").set("individual_shared-publisher-id", {
      ...collectionStore("app_configs").get("individual_shared-publisher-id"),
      status: "approved",
    });

    context = makeAdminContext({
      role: "full_admin",
      isBootstrap: true,
      uid: "god-user",
    });
    const emptyResponse = await fastify.inject({
      method: "GET",
      url: "/admin/publisher-app-configs/snapshot",
    });
    expect(emptyResponse.statusCode).toBe(200);
    expect(emptyResponse.json()).toEqual({ snapshot: null });

    const updateResponse = await fastify.inject({
      method: "PUT",
      url: "/admin/publisher-app-configs/snapshot",
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.headers["cache-control"]).toBe("private, no-store");
    expect(updateResponse.json().snapshot).toMatchObject({
      id: "simple",
      schemaVersion: 1,
      totalCount: 2,
      activeCount: 1,
      inactiveCount: 1,
      sourceReadCount: 4,
      updatedByUserId: "god-user",
      statusCounts: expect.arrayContaining([
        { status: "active", count: 1 },
        { status: "approved", count: 1 },
        { status: "pending_revision", count: 0 },
      ]),
      apps: expect.arrayContaining([
        {
          id: "organization_shared-publisher-id",
          appProviderIdentifier: "app_org_canonical_12345",
          name: "Canonical Organization",
          image: "https://example.org/canonical-icon.png",
          description: "A compact organization app description.",
          status: "active",
          isActive: true,
          publisherKind: "organization",
          publisherId: "shared-publisher-id",
        },
        {
          id: "individual_shared-publisher-id",
          appProviderIdentifier: null,
          name: "Canonical Individual",
          image: `https://golden-crow-sdk.vercel.app/publisher-app/icon?hash=${createHash("sha256").update("data:image/png;base64,QUJD").digest("hex")}`,
          description: "Individual app description.",
          status: "approved",
          isActive: false,
          publisherKind: "individual",
          publisherId: "shared-publisher-id",
        },
      ]),
    });
    expect([...collectionStore("custom_apps_snapshot").keys()]).toEqual([
      "simple",
    ]);

    const readResponse = await fastify.inject({
      method: "GET",
      url: "/admin/publisher-app-configs/snapshot",
    });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.headers["cache-control"]).toBe("private, no-store");
    expect(readResponse.json()).toEqual(updateResponse.json());

    const currentSnapshot = collectionStore("custom_apps_snapshot").get("simple")!;
    const paymentEraSnapshot = {
      ...currentSnapshot,
      statusCounts: (currentSnapshot.statusCounts as StoredDocument[]).filter(entry => entry.status !== "active_waiting_for_upload"),
    };
    expect(paymentEraSnapshot.statusCounts).toHaveLength(7);
    collectionStore("custom_apps_snapshot").set("simple", paymentEraSnapshot);
    const paymentEraRead = await fastify.inject({ method: "GET", url: "/admin/publisher-app-configs/snapshot" });
    expect(paymentEraRead.statusCode).toBe(200);
    expect(paymentEraRead.json()).toEqual(updateResponse.json());
    const testingEraSnapshot = {
      ...currentSnapshot,
      statusCounts: (currentSnapshot.statusCounts as StoredDocument[]).filter(entry => !["active_waiting_for_payment", "active_waiting_for_upload"].includes(String(entry.status))),
    };
    expect(testingEraSnapshot.statusCounts).toHaveLength(6);
    collectionStore("custom_apps_snapshot").set("simple", testingEraSnapshot);
    const testingEraRead = await fastify.inject({ method: "GET", url: "/admin/publisher-app-configs/snapshot" });
    expect(testingEraRead.statusCode).toBe(200);
    expect(testingEraRead.json()).toEqual(updateResponse.json());
    const legacySnapshot = {
      ...currentSnapshot,
      statusCounts: (currentSnapshot.statusCounts as StoredDocument[]).filter((entry) => !["active_for_testing", "active_waiting_for_payment", "active_waiting_for_upload"].includes(String(entry.status))),
    };
    expect(legacySnapshot.statusCounts).toHaveLength(5);
    collectionStore("custom_apps_snapshot").set("simple", legacySnapshot);
    const legacyRead = await fastify.inject({ method: "GET", url: "/admin/publisher-app-configs/snapshot" });
    expect(legacyRead.statusCode).toBe(200);
    expect(legacyRead.json()).toEqual(updateResponse.json());
    expect(collectionStore("custom_apps_snapshot").get("simple")).toEqual(legacySnapshot);

    for (const statusCounts of [
      legacySnapshot.statusCounts.filter((entry) => entry.status !== "active"),
      [...legacySnapshot.statusCounts, legacySnapshot.statusCounts.find((entry) => entry.status === "active")!],
    ]) {
      collectionStore("custom_apps_snapshot").set("simple", { ...legacySnapshot, statusCounts });
      const invalidRead = await fastify.inject({ method: "GET", url: "/admin/publisher-app-configs/snapshot" });
      expect(invalidRead.statusCode).toBe(500);
    }
  });

  it("updates only the affected snapshot item for relevant app mutations", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);

    context = makeAdminContext({
      role: "full_admin",
      isBootstrap: true,
      uid: "god-user",
    });
    const fullRefresh = await fastify.inject({
      method: "PUT",
      url: "/admin/publisher-app-configs/snapshot",
    });
    expect(fullRefresh.statusCode).toBe(200);
    mockQueryReadCollections.length = 0;
    const initialSnapshot = collectionStore("custom_apps_snapshot").get(
      "simple",
    );
    const initialSnapshotUpdatedAt = initialSnapshot?.updatedAt;

    const paletteOnlyUpdate = await fastify.inject({
      method: "PUT",
      url: "/admin/publisher-app-configs/organization_shared-publisher-id",
      payload: {
        ...validBody,
        termsAccepted: undefined,
        colors: {
          primary: "#010203",
          secondary: "#040506",
          tertiary: "#070809",
        },
        status: "pending_revision",
      },
    });
    expect(paletteOnlyUpdate.statusCode).toBe(200);
    expect(
      collectionStore("custom_apps_snapshot").get("simple")?.updatedAt,
    ).toEqual(initialSnapshotUpdatedAt);

    const displayNameUpdate = await fastify.inject({
      method: "PUT",
      url: "/admin/publisher-app-configs/organization_shared-publisher-id",
      payload: {
        ...validBody,
        termsAccepted: undefined,
        advancedConfiguration: {
          ...createResponse.json().config.advancedConfiguration,
          displayName: "Custom Catalog Name",
        },
        status: "pending_revision",
      },
    });
    expect(displayNameUpdate.statusCode).toBe(200);
    expect(
      (
        collectionStore("custom_apps_snapshot").get("simple")?.apps as Array<
          Record<string, unknown>
        >
      )[0],
    ).toMatchObject({ name: "Custom Catalog Name" });

    const iconUpdate = await fastify.inject({
      method: "PUT",
      url: "/admin/publisher-app-configs/organization_shared-publisher-id",
      payload: {
        ...validBody,
        termsAccepted: undefined,
        iconSource: "custom",
        iconImageUrl: null,
        iconImageUploadDataUrl: "data:image/png;base64,QUJD",
        status: "pending_revision",
      },
    });
    expect(iconUpdate.statusCode).toBe(200);
    expect(
      (
        collectionStore("custom_apps_snapshot").get("simple")?.apps as Array<
          Record<string, unknown>
        >
      )[0],
    ).toMatchObject({
      id: "organization_shared-publisher-id",
      image: `https://golden-crow-sdk.vercel.app/publisher-app/icon?hash=${createHash("sha256").update("data:image/png;base64,QUJD").digest("hex")}`,
      status: "pending_revision",
      isActive: false,
    });

    context = organizationContext();
    const activation = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config/identifier",
    });
    expect(activation.statusCode).toBe(200);
    expect(
      (
        collectionStore("custom_apps_snapshot").get("simple")?.apps as Array<
          Record<string, unknown>
        >
      )[0],
    ).toMatchObject({
      appProviderIdentifier: activation.json().config.appProviderIdentifier,
      status: "active_for_testing",
      isActive: true,
    });
    expect(collectionStore("custom_apps_snapshot").get("simple")).toMatchObject(
      { activeCount: 1, inactiveCount: 0, totalCount: 1 },
    );

    context = organizationContext({ isBootstrap: true });
    const deactivation = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config/identifier",
    });
    expect(deactivation.statusCode).toBe(200);
    expect(
      (
        collectionStore("custom_apps_snapshot").get("simple")?.apps as Array<
          Record<string, unknown>
        >
      )[0],
    ).toMatchObject({
      appProviderIdentifier: null,
      status: "pending_revision",
      isActive: false,
    });

    const deletion = await fastify.inject({
      method: "DELETE",
      url: "/publisher-app/config",
    });
    expect(deletion.statusCode).toBe(200);
    expect(collectionStore("custom_apps_snapshot").get("simple")).toMatchObject(
      {
        totalCount: 0,
        activeCount: 0,
        inactiveCount: 0,
        apps: [],
      },
    );

    context = individualContext();
    seedPublisher("individual", "shared-publisher-id", {
      name: "New Individual App",
      imageUploadDataUrl: "data:image/png;base64,REVG",
      description: "New app description.",
    });
    const incrementalCreation = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(incrementalCreation.statusCode).toBe(201);
    expect(
      (
        collectionStore("custom_apps_snapshot").get("simple")?.apps as Array<
          Record<string, unknown>
        >
      )[0],
    ).toMatchObject({
      id: "individual_shared-publisher-id",
      name: "New Individual App",
      image: `https://golden-crow-sdk.vercel.app/publisher-app/icon?hash=${createHash("sha256").update("data:image/png;base64,REVG").digest("hex")}`,
      description: "New app description.",
    });

    seedPublisher("individual", "shared-publisher-id", {
      name: "Renamed Individual App",
      imageUrl: "https://example.org/renamed-app.png",
      description: "New app description.",
    });
    const publisherUpdate = await fastify.inject({
      method: "PUT",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(publisherUpdate.statusCode).toBe(200);
    expect(
      (
        collectionStore("custom_apps_snapshot").get("simple")?.apps as Array<
          Record<string, unknown>
        >
      )[0],
    ).toMatchObject({
      name: "Renamed Individual App",
      image: "https://example.org/renamed-app.png",
    });
    expect(mockQueryReadCollections).not.toContain("app_configs");
  });

  it("lets GOD MODE open and update any app config by document id", async () => {
    const createResponse = await fastify.inject({
      method: "POST",
      url: "/publisher-app/config",
      payload: validBody,
    });
    expect(createResponse.statusCode).toBe(201);
    const configId = "organization_shared-publisher-id";

    context = makeAdminContext({
      role: "full_admin",
      isBootstrap: true,
      uid: "god-user",
    });
    const detailResponse = await fastify.inject({
      method: "GET",
      url: `/admin/publisher-app-configs/${configId}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().config.id).toBe(configId);

    const updateResponse = await fastify.inject({
      method: "PUT",
      url: `/admin/publisher-app-configs/${configId}`,
      payload: {
        ...validBody,
        termsAccepted: undefined,
        platformOption: "ios",
        status: "approved",
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().config).toMatchObject({
      id: configId,
      platformOption: "ios",
      status: "approved",
      updatedByUserId: "god-user",
    });
    expect(collectionStore("app_configs").get(configId)).toMatchObject({
      publisherName: "Canonical Organization",
      publisherId: "shared-publisher-id",
      platformOption: "ios",
      status: "approved",
      updatedByUserId: "god-user",
    });
  });
});

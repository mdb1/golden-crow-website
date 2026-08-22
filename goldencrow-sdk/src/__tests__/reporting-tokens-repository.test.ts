export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  set: jest.Mock;
};

const CLIENTS_COLLECTION = "openapi_reporting_integration_clients";
const TOKENS_COLLECTION = "openapi_reporting_access_tokens";
const AUDIT_LOGS_COLLECTION = "openapi_reporting_audit_logs";

const mockDocs = new Map<string, MockDocData>();
let mockAutoId = 0;
const mockFieldValueIncrement = jest.fn((value: number) => ({
  __op: "increment",
  value,
}));

function docKey(ref: MockDocumentRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function docsIn(collectionName: string) {
  return [...mockDocs.entries()]
    .filter(([key]) => key.startsWith(`${collectionName}/`))
    .map(([, value]) => value);
}

function applyUpdate(ref: MockDocumentRef, update: MockDocData) {
  const key = docKey(ref);
  const current = mockDocs.get(key) ?? {};
  const next = { ...current };

  for (const [field, value] of Object.entries(update)) {
    const operation =
      value && typeof value === "object"
        ? (value as { __op?: unknown; value?: unknown })
        : null;
    if (
      operation &&
      operation.__op === "increment" &&
      typeof operation.value === "number"
    ) {
      next[field] = Number(next[field] ?? 0) + operation.value;
    } else {
      next[field] = value;
    }
  }

  mockDocs.set(key, next);
}

function makeDocRef(collectionName: string, id?: string): MockDocumentRef {
  const documentId = id ?? `auto-${++mockAutoId}`;
  return {
    id: documentId,
    collectionName,
    set: jest.fn(async (data: MockDocData) => {
      mockDocs.set(`${collectionName}/${documentId}`, { ...data });
    }),
  };
}

const mockTransactionGet = jest.fn(async (ref: MockDocumentRef) => {
  const data = mockDocs.get(docKey(ref));
  return {
    exists: Boolean(data),
    data: () => data,
  };
});
const mockTransactionSet = jest.fn(
  async (ref: MockDocumentRef, data: MockDocData) => {
    mockDocs.set(docKey(ref), { ...data });
  },
);
const mockTransactionUpdate = jest.fn(
  async (ref: MockDocumentRef, update: MockDocData) => {
    applyUpdate(ref, update);
  },
);
const mockRunTransaction = jest.fn(
  async (callback: (transaction: unknown) => unknown) =>
    callback({
      get: mockTransactionGet,
      set: mockTransactionSet,
      update: mockTransactionUpdate,
    }),
);

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: mockFieldValueIncrement,
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((collectionName: string) => ({
      doc: (id?: string) => makeDocRef(collectionName, id),
    })),
    runTransaction: mockRunTransaction,
  })),
}));

const fullAdminContext = {
  email: "admin@example.com",
  uid: "admin-1",
  role: "full_admin" as const,
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  projectAccess: ["mydnamap" as const],
};

describe("reporting integration client repository", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
    mockAutoId = 0;
    mockFieldValueIncrement.mockClear();
    mockRunTransaction.mockClear();
    mockTransactionGet.mockClear();
    mockTransactionSet.mockClear();
    mockTransactionUpdate.mockClear();
    process.env = {
      ...originalEnv,
      GOLDENCROW_OPENAPI_REPORTING_QUOTA_PER_MINUTE: "1",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates a full-admin integration client without storing the plaintext secret", async () => {
    const { createReportingIntegrationClient } =
      await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "  Reporting partner  ",
    });
    const stored = mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`);

    expect(created).toMatchObject({
      client_id: expect.stringMatching(/^gci_live_/),
      client_secret: expect.stringMatching(/^gcs_live_/),
      name: "Reporting partner",
      scopes: ["reporting:read", "reporting:write"],
      quota: {
        limit: 1,
        window_seconds: 60,
      },
      status: "active",
      created_by: {
        uid: "admin-1",
        email: "admin@example.com",
      },
    });
    expect(stored).toMatchObject({
      clientId: created.client_id,
      name: "Reporting partner",
      clientSecretHash: expect.any(String),
      clientSecretPrefix: created.client_secret.slice(0, 18),
      scopes: ["reporting:read", "reporting:write"],
      quotaPerMinute: 1,
      status: "active",
      createdByUid: "admin-1",
      createdByEmail: "admin@example.com",
    });
    expect(JSON.stringify(stored)).not.toContain(created.client_secret);
  });

  it("exchanges valid client credentials for a 24-hour access token", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: created.client_secret,
    });

    expect(token).toMatchObject({
      access_token: expect.stringMatching(/^rpt_access_/),
      token_type: "Bearer",
      expires_in: 86400,
      scope: "reporting:read reporting:write",
    });
    expect(docsIn(TOKENS_COLLECTION)).toHaveLength(1);
    expect(docsIn(TOKENS_COLLECTION)[0]).toMatchObject({
      clientId: created.client_id,
      clientName: "Reporting partner",
      tokenType: "Bearer",
      scope: "reporting:read reporting:write",
    });
    expect(JSON.stringify(docsIn(TOKENS_COLLECTION)[0])).not.toContain(
      token.access_token,
    );

    await expect(
      exchangeReportingClientCredentials({
        grant_type: "client_credentials",
        client_id: created.client_id,
        client_secret: `${created.client_secret}x`,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("enforces per-client quota and audits accepted requests by client id", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      verifyReportingAccessToken,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: created.client_secret,
    });

    await expect(
      verifyReportingAccessToken(
        token.access_token,
        "/open-api/reporting/patients",
      ),
    ).resolves.toMatchObject({
      ok: true,
      client_id: created.client_id,
      quota: {
        limit: 1,
        remaining: 0,
      },
    });
    await expect(
      verifyReportingAccessToken(
        token.access_token,
        "/open-api/reporting/patients",
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(docsIn(AUDIT_LOGS_COLLECTION)).toHaveLength(1);
    expect(docsIn(AUDIT_LOGS_COLLECTION)[0]).toMatchObject({
      clientId: created.client_id,
      clientName: "Reporting partner",
      endpoint: "/open-api/reporting/patients",
      result: "accepted",
    });
    expect(
      mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`),
    ).toMatchObject({
      usageCount: 1,
      quotaWindowCount: 1,
      lastEndpoint: "/open-api/reporting/patients",
    });
  });

  it("rejects access tokens when their integration client is revoked", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      verifyReportingAccessToken,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: created.client_secret,
    });
    const storedClient =
      mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`) ?? {};
    mockDocs.set(`${CLIENTS_COLLECTION}/${created.client_id}`, {
      ...storedClient,
      status: "revoked",
    });

    await expect(
      verifyReportingAccessToken(token.access_token),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

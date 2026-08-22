export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  set: jest.Mock;
};
type MockQueryState = {
  collectionName: string;
  orderField?: string;
  direction?: "asc" | "desc";
  startAfterValue?: string;
  limitValue?: number;
};

const CLIENTS_COLLECTION = "openapi_reporting_integration_clients";
const TOKENS_COLLECTION = "openapi_reporting_access_tokens";
const AUDIT_LOGS_COLLECTION = "openapi_reporting_audit_logs";
const ACCESS_EVENTS_COLLECTION = "openapi_reporting_access_events";

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

function queryDocs(state: MockQueryState) {
  let docs = [...mockDocs.entries()]
    .filter(([key]) => key.startsWith(`${state.collectionName}/`))
    .map(([key, value]) => {
      const doc = {
        id: key.slice(state.collectionName.length + 1),
        _value: value,
        data(this: { _value?: MockDocData }) {
          if (!this?._value) {
            throw new Error("Unbound QueryDocumentSnapshot data method");
          }

          return this._value;
        },
      };

      return doc;
    });

  if (state.orderField) {
    docs = docs.sort((left, right) => {
      const leftValue = String(left.data()[state.orderField!] ?? "");
      const rightValue = String(right.data()[state.orderField!] ?? "");
      return state.direction === "asc"
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue);
    });
  }

  if (state.orderField && state.startAfterValue) {
    docs = docs.filter((doc) => {
      const value = String(doc.data()[state.orderField!] ?? "");
      return state.direction === "asc"
        ? value > state.startAfterValue!
        : value < state.startAfterValue!;
    });
  }

  return state.limitValue === undefined
    ? docs
    : docs.slice(0, state.limitValue);
}

function makeQuery(state: MockQueryState) {
  return {
    doc: (id?: string) => makeDocRef(state.collectionName, id),
    orderBy: (orderField: string, direction: "asc" | "desc" = "asc") =>
      makeQuery({
        ...state,
        orderField,
        direction,
      }),
    startAfter: (startAfterValue: string) =>
      makeQuery({
        ...state,
        startAfterValue,
      }),
    limit: (limitValue: number) =>
      makeQuery({
        ...state,
        limitValue,
      }),
    get: jest.fn(async () => ({
      docs: queryDocs(state),
      empty: queryDocs(state).length === 0,
    })),
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
    collection: jest.fn((collectionName: string) =>
      makeQuery({ collectionName }),
    ),
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

  it("creates a full-admin integration client without generating a secret", async () => {
    const { createReportingIntegrationClient } =
      await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "  Reporting partner  ",
    });
    const stored = mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`);

    expect(created).toMatchObject({
      client_id: expect.stringMatching(/^gci_live_/),
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
    expect(created).not.toHaveProperty("client_secret");
    expect(stored).toMatchObject({
      clientId: created.client_id,
      name: "Reporting partner",
      scopes: ["reporting:read", "reporting:write"],
      quotaPerMinute: 1,
      status: "active",
      createdByUid: "admin-1",
      createdByEmail: "admin@example.com",
    });
    expect(stored).not.toHaveProperty("clientSecretHash");
    expect(stored).not.toHaveProperty("clientSecretPrefix");
    expect(docsIn(ACCESS_EVENTS_COLLECTION)).toHaveLength(1);
    expect(docsIn(ACCESS_EVENTS_COLLECTION)[0]).toMatchObject({
      eventType: "integration_client.created",
      clientId: created.client_id,
      clientName: "Reporting partner",
      actorUid: "admin-1",
      actorEmail: "admin@example.com",
    });
    expect(docsIn(ACCESS_EVENTS_COLLECTION)[0]).not.toHaveProperty(
      "secretPrefix",
    );
  });

  it("lists integration clients and API access events with safe metadata", async () => {
    const {
      createReportingIntegrationClient,
      listReportingIntegrationClientAccessEvents,
      listReportingIntegrationClients,
    } = await import("../repositories/reporting-tokens.repository");

    const first = await createReportingIntegrationClient(fullAdminContext, {
      name: "First partner",
    });
    const second = await createReportingIntegrationClient(fullAdminContext, {
      name: "Second partner",
    });

    const clients = await listReportingIntegrationClients(fullAdminContext, {
      limit: 1,
    });
    const events =
      await listReportingIntegrationClientAccessEvents(fullAdminContext);

    expect(clients.clients).toHaveLength(1);
    expect(clients.next_cursor).toBeDefined();
    expect(JSON.stringify(clients)).not.toContain("clientSecretHash");
    expect(first).not.toHaveProperty("client_secret");
    expect(second).not.toHaveProperty("client_secret");
    expect(events.events).toHaveLength(2);
    expect(events.events[0]).toMatchObject({
      event_type: "integration_client.created",
      actor: {
        email: "admin@example.com",
      },
    });
  });

  it("generates the first client secret only through the explicit secret action", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      rotateReportingIntegrationClientSecret,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });

    await expect(
      exchangeReportingClientCredentials({
        grant_type: "client_credentials",
        client_id: created.client_id,
        client_secret: "gcs_live_missing",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    const generated = await rotateReportingIntegrationClientSecret(
      fullAdminContext,
      created.client_id,
    );

    expect(generated.client_secret).toMatch(/^gcs_live_/);
    expect(generated.client).toMatchObject({
      client_id: created.client_id,
      status: "active",
      secret_prefix: generated.client_secret.slice(0, 18),
    });
    expect(
      mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`),
    ).toMatchObject({
      clientSecretHash: expect.any(String),
      clientSecretPrefix: generated.client_secret.slice(0, 18),
    });
    expect(JSON.stringify([...mockDocs.values()])).not.toContain(
      generated.client_secret,
    );
    expect(docsIn(ACCESS_EVENTS_COLLECTION)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "integration_client.secret_created",
          clientId: created.client_id,
          secretPrefix: generated.client_secret.slice(0, 18),
        }),
      ]),
    );
  });

  it("exchanges valid client credentials for a 24-hour access token", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      rotateReportingIntegrationClientSecret,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const generated = await rotateReportingIntegrationClientSecret(
      fullAdminContext,
      created.client_id,
    );
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: generated.client_secret,
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
        client_secret: `${generated.client_secret}x`,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("enforces per-client quota and audits accepted requests by client id", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      rotateReportingIntegrationClientSecret,
      verifyReportingAccessToken,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const generated = await rotateReportingIntegrationClientSecret(
      fullAdminContext,
      created.client_id,
    );
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: generated.client_secret,
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

  it("rotates the client secret while preserving already issued active access tokens", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      rotateReportingIntegrationClientSecret,
      verifyReportingAccessToken,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const generated = await rotateReportingIntegrationClientSecret(
      fullAdminContext,
      created.client_id,
    );
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: generated.client_secret,
    });
    const rotated = await rotateReportingIntegrationClientSecret(
      fullAdminContext,
      created.client_id,
    );

    expect(rotated.client_secret).toMatch(/^gcs_live_/);
    expect(rotated.client_secret).not.toBe(generated.client_secret);
    expect(rotated.client).toMatchObject({
      client_id: created.client_id,
      status: "active",
      secret_prefix: rotated.client_secret.slice(0, 18),
      last_secret_rotated_by: {
        email: "admin@example.com",
      },
    });
    await expect(
      exchangeReportingClientCredentials({
        grant_type: "client_credentials",
        client_id: created.client_id,
        client_secret: generated.client_secret,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      exchangeReportingClientCredentials({
        grant_type: "client_credentials",
        client_id: created.client_id,
        client_secret: rotated.client_secret,
      }),
    ).resolves.toMatchObject({
      access_token: expect.stringMatching(/^rpt_access_/),
    });
    await expect(
      verifyReportingAccessToken(token.access_token),
    ).resolves.toMatchObject({
      ok: true,
      client_id: created.client_id,
    });
    expect(docsIn(ACCESS_EVENTS_COLLECTION)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "integration_client.secret_rotated",
          clientId: created.client_id,
          previousSecretPrefix: generated.client_secret.slice(0, 18),
          secretPrefix: rotated.client_secret.slice(0, 18),
        }),
      ]),
    );
  });

  it("rejects token exchange and access-token verification after client revocation", async () => {
    const {
      createReportingIntegrationClient,
      exchangeReportingClientCredentials,
      rotateReportingIntegrationClientSecret,
      revokeReportingIntegrationClient,
      verifyReportingAccessToken,
    } = await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const generated = await rotateReportingIntegrationClientSecret(
      fullAdminContext,
      created.client_id,
    );
    const token = await exchangeReportingClientCredentials({
      grant_type: "client_credentials",
      client_id: created.client_id,
      client_secret: generated.client_secret,
    });
    const revoked = await revokeReportingIntegrationClient(
      fullAdminContext,
      created.client_id,
    );

    expect(revoked.client).toMatchObject({
      client_id: created.client_id,
      status: "revoked",
      revoked_by: {
        email: "admin@example.com",
      },
    });

    await expect(
      verifyReportingAccessToken(token.access_token),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      exchangeReportingClientCredentials({
        grant_type: "client_credentials",
        client_id: created.client_id,
        client_secret: generated.client_secret,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(docsIn(ACCESS_EVENTS_COLLECTION)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "integration_client.revoked",
          clientId: created.client_id,
          status: "revoked",
        }),
      ]),
    );
  });
});

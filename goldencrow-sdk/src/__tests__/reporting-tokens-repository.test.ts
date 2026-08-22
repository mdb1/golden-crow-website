export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  set: jest.Mock;
  update: jest.Mock;
};
type MockQueryState = {
  collectionName: string;
  whereFilters?: Array<{
    field: string;
    op: "==";
    value: unknown;
  }>;
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
const mockFieldValueDelete = jest.fn(() => ({
  __op: "delete",
}));

function docKey(ref: MockDocumentRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function docsIn(collectionName: string) {
  return [...mockDocs.entries()]
    .filter(([key]) => key.startsWith(`${collectionName}/`))
    .map(([, value]) => value);
}

function eventLogClientId(clientId: string) {
  return `gci_live_...${clientId.slice(-6)}`;
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("JWT payload is missing");
  }

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    sub?: string;
    client_id?: string;
    scope?: string;
    token_use?: string;
    iat?: number;
    nbf?: number;
    exp?: number;
    jti?: string;
  };
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
    } else if (operation && operation.__op === "delete") {
      delete next[field];
    } else {
      next[field] = value;
    }
  }

  mockDocs.set(key, next);
}

function makeDocRef(collectionName: string, id?: string): MockDocumentRef {
  const documentId = id ?? `auto-${++mockAutoId}`;
  const ref: MockDocumentRef = {
    id: documentId,
    collectionName,
    set: jest.fn(async (data: MockDocData) => {
      mockDocs.set(`${collectionName}/${documentId}`, { ...data });
    }),
    update: jest.fn(async (update: MockDocData) => {
      applyUpdate(ref, update);
    }),
  };
  return ref;
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

  if (state.whereFilters?.length) {
    docs = docs.filter((doc) =>
      state.whereFilters!.every(
        (filter) => doc.data()[filter.field] === filter.value,
      ),
    );
  }

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
    where: (field: string, op: "==", value: unknown) =>
      makeQuery({
        ...state,
        whereFilters: [...(state.whereFilters ?? []), { field, op, value }],
      }),
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
    delete: mockFieldValueDelete,
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

const otherFullAdminContext = {
  ...fullAdminContext,
  email: "other-admin@example.com",
  uid: "admin-2",
};

const godModeContext = {
  ...fullAdminContext,
  email: "god@example.com",
  uid: "god-1",
  isBootstrap: true,
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
    mockFieldValueDelete.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults new integration clients to five requests per minute", async () => {
    process.env.GOLDENCROW_OPENAPI_REPORTING_QUOTA_PER_MINUTE = "";

    const { createReportingIntegrationClient } =
      await import("../repositories/reporting-tokens.repository");

    const created = await createReportingIntegrationClient(fullAdminContext, {
      name: "Reporting partner",
    });
    const stored = mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`);

    expect(created).toMatchObject({
      quota: {
        limit: 5,
        window_seconds: 60,
      },
    });
    expect(stored).toMatchObject({
      quotaPerMinute: 5,
    });
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
      has_client_secret: false,
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
      clientId: eventLogClientId(created.client_id),
      clientName: "Reporting partner",
      actorUid: "admin-1",
      actorEmail: "admin@example.com",
    });
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      created.client_id,
    );
    expect(docsIn(ACCESS_EVENTS_COLLECTION)[0]).not.toHaveProperty(
      "secretPrefix",
    );
    await expect(
      createReportingIntegrationClient(fullAdminContext, {
        name: "Second active partner",
      }),
    ).rejects.toMatchObject({
      message:
        "Revoke the active integration client before creating a new one.",
      statusCode: 409,
    });
  });

  it("lists integration clients and API access events with safe metadata", async () => {
    const {
      createReportingIntegrationClient,
      listReportingIntegrationClientAccessEvents,
      listReportingIntegrationClients,
      revokeReportingIntegrationClient,
    } = await import("../repositories/reporting-tokens.repository");

    const first = await createReportingIntegrationClient(fullAdminContext, {
      name: "First partner",
    });
    await revokeReportingIntegrationClient(fullAdminContext, first.client_id);
    const second = await createReportingIntegrationClient(fullAdminContext, {
      name: "Second partner",
    });
    const otherAdminClient = await createReportingIntegrationClient(
      otherFullAdminContext,
      {
        name: "Other admin partner",
      },
    );

    const clients = await listReportingIntegrationClients(fullAdminContext, {
      limit: 1,
    });
    const events =
      await listReportingIntegrationClientAccessEvents(fullAdminContext);
    const godModeEvents =
      await listReportingIntegrationClientAccessEvents(godModeContext);

    expect(clients.clients).toHaveLength(1);
    expect(clients.next_cursor).toBeDefined();
    expect(JSON.stringify(clients)).not.toContain("clientSecretHash");
    expect(first).not.toHaveProperty("client_secret");
    expect(second).not.toHaveProperty("client_secret");
    expect(events.events).toHaveLength(3);
    expect(events.events.every((event) => event.actor.uid === "admin-1")).toBe(
      true,
    );
    expect(events.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "integration_client.created",
          client_id: eventLogClientId(first.client_id),
          actor: expect.objectContaining({
            email: "admin@example.com",
          }),
        }),
        expect.objectContaining({
          event_type: "integration_client.created",
          client_id: eventLogClientId(second.client_id),
        }),
      ]),
    );
    expect(JSON.stringify(events.events)).not.toContain(second.client_id);
    expect(JSON.stringify(events.events)).not.toContain(first.client_id);
    expect(JSON.stringify(events.events)).not.toContain(
      otherAdminClient.client_id,
    );
    expect(godModeEvents.events).toHaveLength(4);
    expect(godModeEvents.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: expect.objectContaining({ uid: "admin-1" }),
        }),
        expect.objectContaining({
          actor: expect.objectContaining({ uid: "admin-2" }),
          client_id: eventLogClientId(otherAdminClient.client_id),
        }),
      ]),
    );
  });

  it("masks legacy access event client ids when listing events", async () => {
    const { listReportingIntegrationClientAccessEvents } =
      await import("../repositories/reporting-tokens.repository");
    const fullClientId = "gci_live_abcdefghijklmnopqrstuvwxyz123456";
    mockDocs.set(`${ACCESS_EVENTS_COLLECTION}/legacy-full-client-id`, {
      eventType: "integration_client.revoked",
      clientId: fullClientId,
      clientName: "Legacy partner",
      occurredAt: "2026-08-22T12:00:00.000Z",
      actorUid: "admin-1",
      actorEmail: "admin@example.com",
      status: "revoked",
      previousSecretPrefix: "gcs_live_previous",
      secretPrefix: "gcs_live_current",
    });

    const events =
      await listReportingIntegrationClientAccessEvents(fullAdminContext);

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      client_id: "gci_live_...123456",
      client_name: "Legacy partner",
      status: "revoked",
    });
    expect(events.events[0]).not.toHaveProperty("previous_secret_prefix");
    expect(events.events[0]).not.toHaveProperty("secret_prefix");
    expect(JSON.stringify(events.events)).not.toContain(fullClientId);
    expect(JSON.stringify(events.events)).not.toContain("gcs_live_previous");
    expect(JSON.stringify(events.events)).not.toContain("gcs_live_current");
    expect(
      mockDocs.get(`${ACCESS_EVENTS_COLLECTION}/legacy-full-client-id`),
    ).not.toHaveProperty("previousSecretPrefix");
    expect(
      mockDocs.get(`${ACCESS_EVENTS_COLLECTION}/legacy-full-client-id`),
    ).not.toHaveProperty("secretPrefix");
  });

  it("deletes legacy client secret prefix metadata when listing clients", async () => {
    const { listReportingIntegrationClients } =
      await import("../repositories/reporting-tokens.repository");
    const clientId = "gci_live_abcdefghijklmnopqrstuvwxyz123456";
    mockDocs.set(`${CLIENTS_COLLECTION}/${clientId}`, {
      clientId,
      name: "Legacy partner",
      clientSecretHash: "a".repeat(64),
      clientSecretPrefix: "gcs_live_current",
      scopes: ["reporting:read", "reporting:write"],
      quotaPerMinute: 60,
      status: "active",
      createdAt: "2026-08-22T12:00:00.000Z",
      createdByUid: "admin-1",
      createdByEmail: "admin@example.com",
      usageCount: 0,
      tokenIssueCount: 0,
    });

    const clients = await listReportingIntegrationClients(fullAdminContext);

    expect(clients.clients).toEqual([
      expect.objectContaining({
        client_id: clientId,
        has_client_secret: true,
        quota: {
          limit: 5,
          window_seconds: 60,
        },
      }),
    ]);
    expect(JSON.stringify(clients.clients)).not.toContain("gcs_live_current");
    expect(
      mockDocs.get(`${CLIENTS_COLLECTION}/${clientId}`),
    ).not.toHaveProperty("clientSecretPrefix");
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
      has_client_secret: true,
    });
    expect(
      mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`),
    ).toMatchObject({
      clientSecretHash: expect.any(String),
    });
    expect(
      mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`),
    ).not.toHaveProperty("clientSecretPrefix");
    expect(JSON.stringify([...mockDocs.values()])).not.toContain(
      generated.client_secret,
    );
    expect(docsIn(ACCESS_EVENTS_COLLECTION)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "integration_client.secret_created",
          clientId: eventLogClientId(created.client_id),
        }),
      ]),
    );
    expect(docsIn(ACCESS_EVENTS_COLLECTION)[1]).not.toHaveProperty(
      "secretPrefix",
    );
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      created.client_id,
    );
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      generated.client_secret.slice(0, 18),
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

    const claims = decodeJwtPayload(token.access_token);
    expect(token).toMatchObject({
      access_token: expect.stringMatching(/^eyJ/),
      token_type: "Bearer",
      expires_in: 86400,
      scope: "reporting:read reporting:write",
    });
    expect(token.access_token.split(".")).toHaveLength(3);
    expect(claims).toMatchObject({
      iss: "goldencrow-openapi",
      aud: "goldencrow-reporting-api",
      sub: created.client_id,
      client_id: created.client_id,
      scope: "reporting:read reporting:write",
      token_use: "reporting",
      jti: expect.any(String),
    });
    expect(typeof claims.iat).toBe("number");
    expect(claims.nbf).toBe(claims.iat);
    expect(claims.exp).toBe((claims.iat ?? 0) + 86400);
    expect(docsIn(TOKENS_COLLECTION)).toHaveLength(1);
    expect(docsIn(TOKENS_COLLECTION)[0]).toMatchObject({
      clientId: created.client_id,
      clientName: "Reporting partner",
      tokenId: claims.jti,
      tokenPrefix: `jwt_${claims.jti?.slice(0, 12)}`,
      tokenType: "Bearer",
      scope: "reporting:read reporting:write",
      signingKeyHash: expect.any(String),
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
    await expect(
      verifyReportingAccessToken(
        token.access_token,
        "/open-api/reporting/patients",
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(docsIn(AUDIT_LOGS_COLLECTION)).toHaveLength(3);
    expect(docsIn(AUDIT_LOGS_COLLECTION)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientId: created.client_id,
          clientName: "Reporting partner",
          endpoint: "/open-api/reporting/patients",
          result: "accepted",
        }),
        expect.objectContaining({
          clientId: created.client_id,
          clientName: "Reporting partner",
          endpoint: "/open-api/reporting/patients",
          result: "quota_exceeded",
        }),
      ]),
    );
    const quotaEvents = docsIn(ACCESS_EVENTS_COLLECTION).filter(
      (event) => event.eventType === "integration_client.quota_exceeded",
    );
    expect(quotaEvents).toHaveLength(1);
    expect(quotaEvents[0]).toMatchObject({
      eventType: "integration_client.quota_exceeded",
      clientId: eventLogClientId(created.client_id),
      clientName: "Reporting partner",
      endpoint: "/open-api/reporting/patients",
      actorUid: "admin-1",
      actorEmail: "system@goldencrow",
      quotaPerMinute: 1,
    });
    expect(JSON.stringify(quotaEvents)).not.toContain(created.client_id);
    expect(
      mockDocs.get(`${CLIENTS_COLLECTION}/${created.client_id}`),
    ).toMatchObject({
      usageCount: 1,
      quotaWindowCount: 1,
      lastEndpoint: "/open-api/reporting/patients",
      quotaExceededCount: 2,
      lastQuotaExceededEndpoint: "/open-api/reporting/patients",
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
      has_client_secret: true,
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
      access_token: expect.stringMatching(/^eyJ/),
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
          clientId: eventLogClientId(created.client_id),
        }),
      ]),
    );
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      generated.client_secret.slice(0, 18),
    );
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      rotated.client_secret.slice(0, 18),
    );
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      created.client_id,
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
          clientId: eventLogClientId(created.client_id),
          status: "revoked",
        }),
      ]),
    );
    expect(JSON.stringify(docsIn(ACCESS_EVENTS_COLLECTION))).not.toContain(
      created.client_id,
    );
  });
});

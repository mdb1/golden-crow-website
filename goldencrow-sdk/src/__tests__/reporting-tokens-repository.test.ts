export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  set: jest.Mock;
};

const mockDocs = new Map<string, MockDocData>();
const mockFieldValueIncrement = jest.fn((value: number) => ({
  __op: "increment",
  value,
}));

function applyUpdate(id: string, update: MockDocData) {
  const current = mockDocs.get(id) ?? {};
  const next = { ...current };

  for (const [key, value] of Object.entries(update)) {
    const operation =
      value && typeof value === "object"
        ? (value as { __op?: unknown; value?: unknown })
        : null;
    if (
      operation &&
      operation.__op === "increment" &&
      typeof operation.value === "number"
    ) {
      next[key] = Number(next[key] ?? 0) + operation.value;
    } else {
      next[key] = value;
    }
  }

  mockDocs.set(id, next);
}

function makeDocRef(collectionName: string, id: string): MockDocumentRef {
  return {
    id,
    collectionName,
    set: jest.fn(async (data: MockDocData) => {
      mockDocs.set(id, { ...data });
    }),
  };
}

const mockTransactionGet = jest.fn(async (ref: MockDocumentRef) => {
  const data = mockDocs.get(ref.id);
  return {
    exists: Boolean(data),
    data: () => data,
  };
});
const mockTransactionSet = jest.fn(
  async (ref: MockDocumentRef, data: MockDocData) => {
    mockDocs.set(ref.id, { ...data });
  },
);
const mockTransactionUpdate = jest.fn(
  async (ref: MockDocumentRef, update: MockDocData) => {
    applyUpdate(ref.id, update);
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
      doc: (id: string) => makeDocRef(collectionName, id),
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

describe("reporting access token repository", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
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

  it("issues an admin-specific token without storing the plaintext value", async () => {
    const { issueReportingAccessToken } =
      await import("../repositories/reporting-tokens.repository");

    const issued = await issueReportingAccessToken(fullAdminContext);

    expect(issued.token).toMatch(/^rpt_access_/);
    expect(issued.expiresInSeconds).toBe(86400);
    expect(issued.quota.limit).toBe(1);
    expect(issued.issuedTo).toEqual({
      uid: "admin-1",
      email: "admin@example.com",
    });
    expect(JSON.stringify([...mockDocs.values()])).not.toContain(issued.token);
    expect([...mockDocs.values()][0]).toMatchObject({
      adminUid: "admin-1",
      adminEmail: "admin@example.com",
      tokenType: "Bearer",
      scope: "reporting",
    });
  });

  it("enforces the per-minute token quota", async () => {
    const { issueReportingAccessToken, verifyReportingAccessToken } =
      await import("../repositories/reporting-tokens.repository");
    const { isAdminRepositoryError } =
      await import("../repositories/admin-errors");

    const issued = await issueReportingAccessToken(fullAdminContext);

    await expect(
      verifyReportingAccessToken(issued.token, "/open-api/reporting/patients"),
    ).resolves.toMatchObject({
      ok: true,
      quota: {
        limit: 1,
        remaining: 0,
      },
    });
    await expect(
      verifyReportingAccessToken(issued.token, "/open-api/reporting/patients"),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    try {
      await verifyReportingAccessToken(issued.token);
    } catch (error) {
      expect(isAdminRepositoryError(error)).toBe(true);
    }
  });

  it("refreshes by revoking the old token and returning a replacement", async () => {
    const {
      issueReportingAccessToken,
      refreshReportingAccessToken,
      verifyReportingAccessToken,
    } = await import("../repositories/reporting-tokens.repository");

    const issued = await issueReportingAccessToken(fullAdminContext);
    const refreshed = await refreshReportingAccessToken(issued.token);

    expect(refreshed.token).toMatch(/^rpt_access_/);
    expect(refreshed.token).not.toBe(issued.token);
    await expect(
      verifyReportingAccessToken(issued.token),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      verifyReportingAccessToken(refreshed.token),
    ).resolves.toMatchObject({
      ok: true,
    });
  });
});

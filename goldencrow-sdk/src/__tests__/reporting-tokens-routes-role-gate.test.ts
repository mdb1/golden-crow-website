// Route + REAL repository: the role gate for reporting integration clients
// lives in reporting-tokens.repository.ts (assertCanManageIntegrationClients),
// so this suite runs the real module against a fake Firestore to prove that
// a non-global admin is refused before any read or write happens.
import type { FastifyInstance } from "fastify";
import type { AdminContext, AdminRole } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

type StoredDoc = Record<string, unknown> | undefined;

const mockStoredClients = new Map<string, StoredDoc>();
const mockTransactionUpdate = jest.fn();
const mockTransactionSet = jest.fn();
const mockRunTransaction = jest.fn(
  async (
    handler: (transaction: {
      get: (ref: { id: string }) => Promise<unknown>;
      update: jest.Mock;
      set: jest.Mock;
    }) => Promise<unknown>,
  ) =>
    handler({
      get: async (ref) => {
        const data = mockStoredClients.get(ref.id);
        return { exists: Boolean(data), data: () => data };
      },
      update: mockTransactionUpdate,
      set: mockTransactionSet,
    }),
);
const mockCollection = jest.fn((name: string) => ({
  doc: (id?: string) => ({ id: id ?? `${name}-auto` }),
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
}));

const OWNER = makeAdminContext({
  uid: "owner-uid",
  email: "owner@example.com",
});

function storeClient(clientId: string, createdByUid: string) {
  mockStoredClients.set(clientId, {
    clientId,
    name: "Lab integration",
    clientSecretHash: "old-hash",
    scopes: ["reporting:read", "reporting:write"],
    quotaPerMinute: 5,
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    createdByUid,
    createdByEmail: `${createdByUid}@example.com`,
  });
}

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  mockStoredClients.clear();
  storeClient("gci_live_owned", OWNER.uid);
  currentContext = OWNER;
  const { reportingIntegrationClientRoutes } = await import(
    "../routes/reporting-tokens.routes.js"
  );
  fastify = await buildRouteServer(
    reportingIntegrationClientRoutes,
    () => currentContext,
  );
});

afterEach(async () => {
  await fastify.close();
});

const NON_GLOBAL_ROLES: AdminRole[] = [
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
  "patient",
  "transport_dispatcher",
  "organization_publisher",
  "individual_publisher",
];

const WRITE_AND_READ_ENDPOINTS = [
  {
    method: "POST" as const,
    url: "/reporting/integration-clients",
    payload: { name: "Lab" },
  },
  { method: "GET" as const, url: "/reporting/integration-clients" },
  { method: "GET" as const, url: "/reporting/integration-clients/events" },
  {
    method: "POST" as const,
    url: "/reporting/integration-clients/gci_live_owned/secret/rotate",
  },
  {
    method: "POST" as const,
    url: "/reporting/integration-clients/gci_live_owned/revoke",
  },
];

describe("reporting integration clients — role gate (real repository)", () => {
  it.each(NON_GLOBAL_ROLES)(
    "refuses role %s with 403 on every endpoint without touching Firestore",
    async (role) => {
      currentContext = makeAdminContext({ role, uid: "intruder-uid" });

      for (const { method, url, payload } of WRITE_AND_READ_ENDPOINTS) {
        const response = await fastify.inject({ method, url, payload });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({
          error: "Only full admins can manage reporting integration clients.",
        });
      }

      expect(mockCollection).not.toHaveBeenCalled();
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
    },
  );

  it("lets a full admin rotate the secret of a client they created", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/reporting/integration-clients/gci_live_owned/secret/rotate",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().client_secret).toMatch(/^gcs_live_/);
    expect(mockTransactionUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects a client id without the gci_live_ prefix before opening a transaction", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/reporting/integration-clients/not-a-client/secret/rotate",
    });

    expect(response.statusCode).toBe(401);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("lets GOD MODE (bootstrap) revoke any admin's client", async () => {
    storeClient("gci_live_other", "other-admin-uid");
    currentContext = makeAdminContext({ uid: "god-uid", isBootstrap: true });

    const response = await fastify.inject({
      method: "POST",
      url: "/reporting/integration-clients/gci_live_other/revoke",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().client.status).toBe("revoked");
  });

  // BUG (suspected, ownership): GET /reporting/integration-clients scopes a
  // non-bootstrap admin to the clients THEY created (whereEquals createdByUid,
  // reporting-tokens.repository.ts:1012) and creation is limited to one active
  // client per actor — i.e. clients are owned. But rotate
  // (reporting-tokens.repository.ts:1078) and revoke (:1130) only check the
  // role, never `createdByUid`. A second full admin who learns another admin's
  // client_id can mint a fresh client_secret for that integration (taking it
  // over and breaking the owner's integration) or revoke it.
  it.failing(
    "refuses a full admin rotating the secret of ANOTHER admin's client",
    async () => {
      storeClient("gci_live_other", "other-admin-uid");

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients/gci_live_other/secret/rotate",
      });

      expect([403, 404]).toContain(response.statusCode);
      expect(response.body).not.toContain("gcs_live_");
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
    },
  );

  it.failing(
    "refuses a full admin revoking ANOTHER admin's client",
    async () => {
      storeClient("gci_live_other", "other-admin-uid");

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients/gci_live_other/revoke",
      });

      expect([403, 404]).toContain(response.statusCode);
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
    },
  );
});

// Route-level tests for the reporting integration-client admin endpoints
// (create / list / events / rotate secret / revoke). The route enforces
// "an admin context exists"; the role gate (global admin or bootstrap) lives in
// the repository and is covered by reporting-tokens-routes-role-gate.test.ts.
import type { FastifyInstance } from "fastify";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockCreateReportingIntegrationClient = jest.fn();
const mockListReportingIntegrationClientAccessEvents = jest.fn();
const mockListReportingIntegrationClients = jest.fn();
const mockRevokeReportingIntegrationClient = jest.fn();
const mockRotateReportingIntegrationClientSecret = jest.fn();

jest.mock("../repositories/reporting-tokens.repository.js", () => ({
  createReportingIntegrationClient: mockCreateReportingIntegrationClient,
  listReportingIntegrationClientAccessEvents:
    mockListReportingIntegrationClientAccessEvents,
  listReportingIntegrationClients: mockListReportingIntegrationClients,
  revokeReportingIntegrationClient: mockRevokeReportingIntegrationClient,
  rotateReportingIntegrationClientSecret:
    mockRotateReportingIntegrationClientSecret,
}));

const allRepositoryMocks = [
  mockCreateReportingIntegrationClient,
  mockListReportingIntegrationClientAccessEvents,
  mockListReportingIntegrationClients,
  mockRevokeReportingIntegrationClient,
  mockRotateReportingIntegrationClientSecret,
];

const endpoints = [
  { method: "GET" as const, url: "/reporting/integration-clients" },
  {
    method: "POST" as const,
    url: "/reporting/integration-clients",
    payload: { name: "Lab integration" },
  },
  { method: "GET" as const, url: "/reporting/integration-clients/events" },
  {
    method: "POST" as const,
    url: "/reporting/integration-clients/gci_live_abc/secret/rotate",
  },
  {
    method: "POST" as const,
    url: "/reporting/integration-clients/gci_live_abc/revoke",
  },
];

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  currentContext = makeAdminContext();
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

describe("reporting integration-client routes", () => {
  it.each(endpoints)(
    "$method $url returns 401 without an admin context and calls no repository",
    async ({ method, url, payload }) => {
      currentContext = undefined;

      const response = await fastify.inject({ method, url, payload });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "No authenticated admin context",
      });
      for (const mock of allRepositoryMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it.each(endpoints)(
    "$method $url surfaces the repository's 403 for a non-global admin",
    async ({ method, url, payload }) => {
      currentContext = makeAdminContext({
        role: "institution_admin",
        institutionId: "INS-1",
      });
      const forbidden = new AdminRepositoryError(
        "Only full admins can manage reporting integration clients.",
        403,
      );
      for (const mock of allRepositoryMocks) {
        mock.mockRejectedValue(forbidden);
      }

      const response = await fastify.inject({ method, url, payload });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Only full admins can manage reporting integration clients.",
      });
    },
  );

  describe("POST /reporting/integration-clients", () => {
    it.each([
      ["a missing name", {}],
      ["a blank name", { name: "   " }],
      ["a name longer than 120 characters", { name: "x".repeat(121) }],
      ["a zero quota", { name: "Lab", quotaPerMinute: 0 }],
      ["a fractional quota", { name: "Lab", quotaPerMinute: 1.5 }],
      [
        "caller-chosen scopes (strict body)",
        { name: "Lab", scopes: ["reporting:admin"] },
      ],
      ["a caller-chosen client id (strict body)", { name: "Lab", clientId: "x" }],
    ])("rejects %s with 400", async (_, payload) => {
      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients",
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateReportingIntegrationClient).not.toHaveBeenCalled();
    });

    it("creates the client for the calling admin and returns 201", async () => {
      mockCreateReportingIntegrationClient.mockResolvedValue({
        client_id: "gci_live_new",
        has_client_secret: false,
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients",
        payload: { name: "  Lab integration  ", quotaPerMinute: 5 },
      });

      expect(response.statusCode).toBe(201);
      expect(mockCreateReportingIntegrationClient).toHaveBeenCalledWith(
        currentContext,
        { name: "Lab integration", quotaPerMinute: 5 },
      );
      expect(response.json()).toEqual({
        client_id: "gci_live_new",
        has_client_secret: false,
      });
    });

    it("maps the one-active-client conflict to 409", async () => {
      mockCreateReportingIntegrationClient.mockRejectedValue(
        new AdminRepositoryError(
          "Revoke the active integration client before creating a new one.",
          409,
        ),
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients",
        payload: { name: "Lab" },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("listing", () => {
    it("coerces limit and passes the cursor through", async () => {
      mockListReportingIntegrationClients.mockResolvedValue({
        clients: [],
        nextCursor: null,
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/reporting/integration-clients?limit=10&cursor=2026-10-01T00%3A00%3A00.000Z",
      });

      expect(response.statusCode).toBe(200);
      expect(mockListReportingIntegrationClients).toHaveBeenCalledWith(
        currentContext,
        { limit: 10, cursor: "2026-10-01T00:00:00.000Z" },
      );
    });

    it.each(["0", "-1", "abc", "2.5"])(
      "rejects limit=%s with 400",
      async (limit) => {
        const response = await fastify.inject({
          method: "GET",
          url: `/reporting/integration-clients/events?limit=${limit}`,
        });

        expect(response.statusCode).toBe(400);
        expect(
          mockListReportingIntegrationClientAccessEvents,
        ).not.toHaveBeenCalled();
      },
    );
  });

  describe("secret rotation and revocation", () => {
    it("rotates the secret of the addressed client", async () => {
      mockRotateReportingIntegrationClientSecret.mockResolvedValue({
        client_id: "gci_live_abc",
        client_secret: "gcs_live_once",
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients/gci_live_abc/secret/rotate",
      });

      expect(response.statusCode).toBe(200);
      expect(mockRotateReportingIntegrationClientSecret).toHaveBeenCalledWith(
        currentContext,
        "gci_live_abc",
      );
      expect(mockRevokeReportingIntegrationClient).not.toHaveBeenCalled();
    });

    it("maps rotating a revoked client to the repository's 401", async () => {
      mockRotateReportingIntegrationClientSecret.mockRejectedValue(
        new AdminRepositoryError("Integration client was revoked.", 401),
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients/gci_live_abc/secret/rotate",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "Integration client was revoked.",
      });
    });

    it("revokes the addressed client", async () => {
      mockRevokeReportingIntegrationClient.mockResolvedValue({
        client: { client_id: "gci_live_abc", status: "revoked" },
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients/gci_live_abc/revoke",
      });

      expect(response.statusCode).toBe(200);
      expect(mockRevokeReportingIntegrationClient).toHaveBeenCalledWith(
        currentContext,
        "gci_live_abc",
      );
    });

    it("maps an unknown client to 404", async () => {
      mockRevokeReportingIntegrationClient.mockRejectedValue(
        new AdminRepositoryError("Integration client not found.", 404),
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/reporting/integration-clients/gci_live_missing/revoke",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

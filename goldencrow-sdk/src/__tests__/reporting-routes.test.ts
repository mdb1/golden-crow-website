// Route-level tests for the public reporting Open API (/internal/openapi/*).
// These paths are exempt from the session-cookie middleware, so the ONLY gate
// is the Bearer token check inside reporting.routes.ts. Every protected
// endpoint must refuse without a verified token and must never reach the
// repository when the token is refused.
import type { FastifyInstance } from "fastify";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import { buildRouteServer } from "./support/route-harness.js";

const mockGetReportingPatient = jest.fn();
const mockGetReportingTwoPQCaseByCode = jest.fn();
const mockRecordUploadedReportNotification = jest.fn();
const mockExchangeReportingClientCredentials = jest.fn();
const mockVerifyReportingAccessToken = jest.fn();

jest.mock("../repositories/reporting.repository.js", () => ({
  getReportingPatient: mockGetReportingPatient,
  getReportingTwoPQCaseByCode: mockGetReportingTwoPQCaseByCode,
  recordUploadedReportNotification: mockRecordUploadedReportNotification,
}));

jest.mock("../repositories/reporting-tokens.repository.js", () => ({
  exchangeReportingClientCredentials: mockExchangeReportingClientCredentials,
  verifyReportingAccessToken: mockVerifyReportingAccessToken,
}));

const TOKEN = "rpt_access_valid-token";

async function buildServer(): Promise<FastifyInstance> {
  const { reportingRoutes } = await import("../routes/reporting.routes.js");
  // The Open API never carries an admin context.
  return buildRouteServer(reportingRoutes, () => undefined);
}

function protectedRequests() {
  return [
    {
      name: "GET patients (query)",
      method: "GET" as const,
      url: "/internal/openapi/reporting/patients?patientId=PAT-00001",
    },
    {
      name: "GET patients/:patientId",
      method: "GET" as const,
      url: "/internal/openapi/reporting/patients/PAT-00001",
    },
    {
      name: "POST reports/upload",
      method: "POST" as const,
      url: "/internal/openapi/reporting/reports/upload",
      payload: {
        caseCode: "ABC123",
        download_url: "https://files.example.com/ABC123.pdf",
      },
    },
    {
      name: "GET 2pq/cases/:caseCode",
      method: "GET" as const,
      url: "/internal/openapi/reporting/2pq/cases/ABC123",
    },
  ];
}

function expectNoRepositoryReads() {
  expect(mockGetReportingPatient).not.toHaveBeenCalled();
  expect(mockGetReportingTwoPQCaseByCode).not.toHaveBeenCalled();
  expect(mockRecordUploadedReportNotification).not.toHaveBeenCalled();
}

describe("reporting Open API routes", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVerifyReportingAccessToken.mockResolvedValue({ clientId: "gci_live_1" });
    fastify = await buildServer();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe("POST /internal/openapi/oauth/token", () => {
    it("exchanges client credentials without requiring a bearer token", async () => {
      mockExchangeReportingClientCredentials.mockResolvedValue({
        access_token: "rpt_access_new",
        token_type: "Bearer",
        expires_in: 86400,
        scope: "reporting:read reporting:write",
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/oauth/token",
        payload: {
          grant_type: "client_credentials",
          client_id: " gci_live_abc ",
          client_secret: "gcs_live_secret",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockExchangeReportingClientCredentials).toHaveBeenCalledWith({
        grant_type: "client_credentials",
        client_id: "gci_live_abc",
        client_secret: "gcs_live_secret",
      });
      expect(mockVerifyReportingAccessToken).not.toHaveBeenCalled();
      expect(response.json()).toMatchObject({
        access_token: "rpt_access_new",
        token_type: "Bearer",
      });
    });

    it.each([
      [
        "an unsupported grant_type",
        {
          grant_type: "password",
          client_id: "gci_live_abc",
          client_secret: "gcs_live_secret",
        },
      ],
      [
        "a missing client_secret",
        { grant_type: "client_credentials", client_id: "gci_live_abc" },
      ],
      [
        "a blank client_id",
        {
          grant_type: "client_credentials",
          client_id: "   ",
          client_secret: "gcs_live_secret",
        },
      ],
      [
        "unknown extra fields (strict body)",
        {
          grant_type: "client_credentials",
          client_id: "gci_live_abc",
          client_secret: "gcs_live_secret",
          scope: "admin",
        },
      ],
    ])("rejects %s with 400 before touching the repository", async (_, payload) => {
      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/oauth/token",
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(mockExchangeReportingClientCredentials).not.toHaveBeenCalled();
    });

    it("maps invalid credentials from the repository to 401 without echoing the secret", async () => {
      mockExchangeReportingClientCredentials.mockRejectedValue(
        new AdminRepositoryError("Invalid client credentials.", 401),
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/oauth/token",
        payload: {
          grant_type: "client_credentials",
          client_id: "gci_live_abc",
          client_secret: "gcs_live_wrong-secret",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "Invalid client credentials." });
      expect(response.body).not.toContain("gcs_live_wrong-secret");
    });
  });

  describe("bearer token gate", () => {
    it.each(protectedRequests())(
      "$name: 401 without an Authorization header and no repository access",
      async ({ method, url, payload }) => {
        const response = await fastify.inject({ method, url, payload });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: "Missing reporting access token.",
        });
        expect(mockVerifyReportingAccessToken).not.toHaveBeenCalled();
        expectNoRepositoryReads();
      },
    );

    it.each([
      ["a non-Bearer scheme", `Basic ${TOKEN}`],
      ["a bare token without scheme", TOKEN],
      ["an empty Bearer value", "Bearer    "],
      ["the scheme glued to the token", `Bearer${TOKEN}`],
    ])(
      "treats %s as a missing token (401) without verifying it",
      async (_, authorization) => {
        const response = await fastify.inject({
          method: "GET",
          url: "/internal/openapi/reporting/patients/PAT-00001",
          headers: { authorization },
        });

        expect(response.statusCode).toBe(401);
        expect(mockVerifyReportingAccessToken).not.toHaveBeenCalled();
        expectNoRepositoryReads();
      },
    );

    it.each([
      ["an invalid token", "Invalid access token.", 401],
      ["an expired token", "Access token expired.", 401],
      ["a revoked token", "Access token was revoked.", 401],
      ["a revoked client", "Integration client was revoked.", 401],
      ["an exhausted quota", "Client quota exceeded.", 429],
    ])(
      "propagates %s as %s/%i and never reads data",
      async (_, message, statusCode) => {
        mockVerifyReportingAccessToken.mockRejectedValue(
          new AdminRepositoryError(message, statusCode),
        );

        for (const request of protectedRequests()) {
          const response = await fastify.inject({
            method: request.method,
            url: request.url,
            payload: request.payload,
            headers: { authorization: `Bearer ${TOKEN}` },
          });

          expect(response.statusCode).toBe(statusCode);
          expect(response.json()).toEqual({ error: message });
        }

        expectNoRepositoryReads();
      },
    );

    it("accepts a case-insensitive scheme and trims the token before verifying", async () => {
      mockGetReportingPatient.mockResolvedValue({ id: "PAT-00001" });

      const response = await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/patients/PAT-00001",
        headers: { authorization: `bearer   ${TOKEN}  ` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockVerifyReportingAccessToken).toHaveBeenCalledWith(
        TOKEN,
        "/open-api/reporting/patients",
      );
    });

    it("asks for the WRITE scope on the upload endpoint and refuses a read-only token", async () => {
      mockVerifyReportingAccessToken.mockRejectedValue(
        new AdminRepositoryError("Access token scope is insufficient.", 403),
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/reporting/reports/upload",
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: {
          caseCode: "ABC123",
          download_url: "https://files.example.com/ABC123.pdf",
        },
      });

      expect(response.statusCode).toBe(403);
      // The repository derives the required scope from the endpoint string:
      // anything containing "/reports/upload" needs reporting:write.
      const [, endpoint] = mockVerifyReportingAccessToken.mock.calls[0];
      expect(endpoint).toContain("/reports/upload");
      expectNoRepositoryReads();
    });

    it("verifies read endpoints with endpoint names that do NOT require write scope", async () => {
      mockGetReportingPatient.mockResolvedValue({ id: "PAT-00001" });
      mockGetReportingTwoPQCaseByCode.mockResolvedValue({
        main_case: { id: "CASE-1", patient_id: "PAT-00001" },
      });

      await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/patients?caseCode=abc123",
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/2pq/cases/abc123",
        headers: { authorization: `Bearer ${TOKEN}` },
      });

      const endpoints = mockVerifyReportingAccessToken.mock.calls.map(
        ([, endpoint]) => endpoint as string,
      );
      expect(endpoints).toEqual([
        "/open-api/reporting/patients",
        "/open-api/reporting/2pq/cases/{caseCode}",
      ]);
      for (const endpoint of endpoints) {
        expect(endpoint).not.toContain("/reports/upload");
      }
    });
  });

  describe("GET /internal/openapi/reporting/patients", () => {
    it.each([
      ["neither patientId nor caseCode", ""],
      ["both patientId and caseCode", "?patientId=PAT-1&caseCode=ABC123"],
      ["a caseCode shorter than 6 characters", "?caseCode=ABC12"],
      ["a caseCode with symbols", "?caseCode=AB%2F123"],
      ["unknown query fields (strict)", "?patientId=PAT-1&email=a%40b.com"],
    ])("rejects %s with 400", async (_, query) => {
      const response = await fastify.inject({
        method: "GET",
        url: `/internal/openapi/reporting/patients${query}`,
        headers: { authorization: `Bearer ${TOKEN}` },
      });

      expect(response.statusCode).toBe(400);
      expect(mockGetReportingPatient).not.toHaveBeenCalled();
    });

    it("looks the patient up by an upper-cased caseCode", async () => {
      mockGetReportingPatient.mockResolvedValue({ id: "PAT-00001" });

      const response = await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/patients?caseCode=abc123",
        headers: { authorization: `Bearer ${TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockGetReportingPatient).toHaveBeenCalledWith({
        caseCode: "ABC123",
      });
      expect(response.json()).toEqual({ patient: { id: "PAT-00001" } });
    });

    it("maps a repository 404 to 404", async () => {
      mockGetReportingPatient.mockRejectedValue(
        new AdminRepositoryError("Patient not found.", 404),
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/patients/PAT-404",
        headers: { authorization: `Bearer ${TOKEN}` },
      });

      expect(response.statusCode).toBe(404);
      expect(mockGetReportingPatient).toHaveBeenCalledWith({
        patientId: "PAT-404",
      });
    });
  });

  describe("POST /internal/openapi/reporting/reports/upload", () => {
    it.each([
      ["an invalid download_url", { caseCode: "ABC123", download_url: "not a url" }],
      ["a missing download_url", { caseCode: "ABC123" }],
      [
        "a 7-character caseCode",
        { caseCode: "ABC1234", download_url: "https://files.example.com/a.pdf" },
      ],
      [
        "client-chosen storage fields (strict body)",
        {
          caseCode: "ABC123",
          download_url: "https://files.example.com/a.pdf",
          patientId: "PAT-OTHER",
        },
      ],
    ])("rejects %s with 400", async (_, payload) => {
      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/reporting/reports/upload",
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expectNoRepositoryReads();
    });

    it("records the upload against the patient that owns the case", async () => {
      mockGetReportingTwoPQCaseByCode.mockResolvedValue({
        main_case: { id: "CASE-00001", patient_id: "PAT-STALE" },
        patient: { id: "PAT-00001" },
      });
      mockRecordUploadedReportNotification.mockResolvedValue({
        reportId: "2pq-abc123",
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/reporting/reports/upload",
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: {
          caseCode: "abc123",
          download_url: "https://files.example.com/ABC123.pdf",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockGetReportingTwoPQCaseByCode).toHaveBeenCalledWith("ABC123");
      expect(mockRecordUploadedReportNotification).toHaveBeenCalledTimes(1);
      expect(mockRecordUploadedReportNotification.mock.calls[0][0]).toMatchObject({
        patientId: "PAT-00001",
        twoPQCaseId: "CASE-00001",
        reportId: "2pq-abc123",
        reportCode: "ABC123",
        fileName: "ABC123.pdf",
        contentType: "application/pdf",
        reportType: "2pq",
        downloadUrl: "https://files.example.com/ABC123.pdf",
      });
      expect(response.json()).toEqual({ reportId: "2pq-abc123" });
    });

    it("returns 422 and records nothing when the case has no patient", async () => {
      mockGetReportingTwoPQCaseByCode.mockResolvedValue({
        main_case: { id: "CASE-00001" },
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/internal/openapi/reporting/reports/upload",
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: {
          caseCode: "ABC123",
          download_url: "https://files.example.com/ABC123.pdf",
        },
      });

      expect(response.statusCode).toBe(422);
      expect(mockRecordUploadedReportNotification).not.toHaveBeenCalled();
    });
  });

  describe("GET /internal/openapi/reporting/2pq/cases/:caseCode", () => {
    it("rejects a malformed caseCode with 400", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/2pq/cases/AB-123",
        headers: { authorization: `Bearer ${TOKEN}` },
      });

      expect(response.statusCode).toBe(400);
      expect(mockGetReportingTwoPQCaseByCode).not.toHaveBeenCalled();
    });

    it("returns the case snapshot for a valid token", async () => {
      mockGetReportingTwoPQCaseByCode.mockResolvedValue({
        main_case: { id: "CASE-00001" },
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/internal/openapi/reporting/2pq/cases/abc123",
        headers: { authorization: `Bearer ${TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockGetReportingTwoPQCaseByCode).toHaveBeenCalledWith("ABC123");
      expect(response.json()).toEqual({
        caseSnapshot: { main_case: { id: "CASE-00001" } },
      });
    });
  });
});

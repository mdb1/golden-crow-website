// Route-level tests for /reports/*: behind the canManageLegacyModeration gate
// (global admins only). Uses the REAL gate from roles.repository.
import type { FastifyInstance } from "fastify";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext, AdminRole } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => ({})),
  adminStorageFor: jest.fn(() => ({})),
}));

const mockListReports = jest.fn();
const mockGetReportById = jest.fn();
const mockGetReportOwnerExistence = jest.fn();
const mockDeleteReport = jest.fn();
const mockPublishStoredFileAsReportCode = jest.fn();

jest.mock("../repositories/reports.repository.js", () => ({
  listReports: mockListReports,
  getReportById: mockGetReportById,
  getReportOwnerExistence: mockGetReportOwnerExistence,
  deleteReport: mockDeleteReport,
  publishStoredFileAsReportCode: mockPublishStoredFileAsReportCode,
}));

const repositoryMocks = [
  mockListReports,
  mockGetReportById,
  mockGetReportOwnerExistence,
  mockDeleteReport,
  mockPublishStoredFileAsReportCode,
];

const endpoints = [
  { method: "GET" as const, url: "/reports" },
  { method: "GET" as const, url: "/reports/report-1" },
  { method: "GET" as const, url: "/reports/owners/owner-1/exists" },
  {
    method: "POST" as const,
    url: "/reports/publish-from-file-storage",
    payload: { fileId: "file-1", reportCode: "RPT001" },
  },
  { method: "DELETE" as const, url: "/reports/report-1" },
];

const DENIED_ROLES: AdminRole[] = [
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
  "patient",
  "transport_dispatcher",
  "organization_publisher",
  "individual_publisher",
];

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  currentContext = makeAdminContext({ role: "full_admin" });
  const { reportRoutes } = await import("../routes/reports.routes.js");
  fastify = await buildRouteServer(reportRoutes, () => currentContext);
});

afterEach(async () => {
  await fastify.close();
});

describe("/reports gate", () => {
  it("refuses a request without an admin context with 403", async () => {
    currentContext = undefined;

    for (const { method, url, payload } of endpoints) {
      const response = await fastify.inject({ method, url, payload });
      expect(response.statusCode).toBe(403);
    }
    for (const mock of repositoryMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each(DENIED_ROLES)(
    "refuses role %s on every endpoint and never calls the repository",
    async (role) => {
      currentContext = makeAdminContext({
        role,
        institutionId: "INS-1",
        patientId: "PAT-1",
      });

      for (const { method, url, payload } of endpoints) {
        const response = await fastify.inject({ method, url, payload });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: "Full admin access required" });
      }
      for (const mock of repositoryMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it("still refuses a bootstrap flag on a non-global role", async () => {
    currentContext = makeAdminContext({
      role: "institution_admin",
      isBootstrap: true,
    });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/reports/report-1",
    });

    expect(response.statusCode).toBe(403);
    expect(mockDeleteReport).not.toHaveBeenCalled();
  });
});

describe("/reports endpoints for a global admin", () => {
  it.each(["full_admin", "2pq_admin"] as const)(
    "lets %s delete a report",
    async (role) => {
      currentContext = makeAdminContext({ role });
      mockDeleteReport.mockResolvedValue({
        deleted: true,
        storageDeleted: false,
      });

      const response = await fastify.inject({
        method: "DELETE",
        url: "/reports/report-1",
      });

      expect(response.statusCode).toBe(200);
      expect(mockDeleteReport).toHaveBeenCalledWith("report-1");
      expect(response.json()).toEqual({ deleted: true, storageDeleted: false });
    },
  );

  it("passes list filters and the fixed page size", async () => {
    mockListReports.mockResolvedValue({ reports: [], nextCursor: null });

    const response = await fastify.inject({
      method: "GET",
      url: "/reports?userId=user-1&source=2pq&startAfter=report-9",
    });

    expect(response.statusCode).toBe(200);
    expect(mockListReports).toHaveBeenCalledWith(
      { userId: "user-1", source: "2pq" },
      50,
      "report-9",
    );
  });

  it("rejects an unknown source with 400", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/reports?source=dropbox",
    });

    expect(response.statusCode).toBe(400);
    expect(mockListReports).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing reportCode", { fileId: "file-1" }],
    ["an empty fileId", { fileId: "", reportCode: "RPT001" }],
  ])("rejects publish-from-file-storage with %s (400)", async (_, payload) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/reports/publish-from-file-storage",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockPublishStoredFileAsReportCode).not.toHaveBeenCalled();
  });

  it("publishes a stored file and maps repository conflicts", async () => {
    mockPublishStoredFileAsReportCode.mockResolvedValueOnce({ reportId: "r-1" });
    mockPublishStoredFileAsReportCode.mockRejectedValueOnce(
      new AdminRepositoryError("Report code already used.", 409),
    );

    const ok = await fastify.inject({
      method: "POST",
      url: "/reports/publish-from-file-storage",
      payload: { fileId: "file-1", reportCode: "RPT001" },
    });
    const conflict = await fastify.inject({
      method: "POST",
      url: "/reports/publish-from-file-storage",
      payload: { fileId: "file-1", reportCode: "RPT001" },
    });

    expect(ok.statusCode).toBe(200);
    expect(mockPublishStoredFileAsReportCode).toHaveBeenNthCalledWith(1, {
      fileId: "file-1",
      reportCode: "RPT001",
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: "Report code already used.",
      errorName: "AdminRepositoryError",
      statusCode: 409,
    });
  });

  it("returns 404 for an unknown report", async () => {
    mockGetReportById.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "GET",
      url: "/reports/missing",
    });

    expect(response.statusCode).toBe(404);
  });

  it("checks owner existence for the addressed owner", async () => {
    mockGetReportOwnerExistence.mockResolvedValue({ exists: true });

    const response = await fastify.inject({
      method: "GET",
      url: "/reports/owners/owner-1/exists",
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetReportOwnerExistence).toHaveBeenCalledWith("owner-1");
    expect(mockGetReportById).not.toHaveBeenCalled();
  });
});

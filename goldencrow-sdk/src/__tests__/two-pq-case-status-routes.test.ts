import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockUpdateTwoPQRecordForContext = jest.fn();
const mockBeginOperation = jest.fn();
const mockUpdateOperation = jest.fn();
const mockCompleteOperation = jest.fn();
const mockFailOperation = jest.fn();
const mockGetOperation = jest.fn();

jest.mock("../repositories/two-pq.repository.js", () => ({
  createTwoPQRecordForContext: jest.fn(),
  deleteTwoPQRecordForContext: jest.fn(),
  getTwoPQDetailForContext: jest.fn(),
  linkCaseToBatchForContext: jest.fn(),
  linkSamplingToCaseForContext: jest.fn(),
  listTwoPQRecordsForContext: jest.fn(),
  replaceTwoPQRecordForContext: jest.fn(),
  unlinkCaseFromBatchForContext: jest.fn(),
  unlinkSamplingFromCaseForContext: jest.fn(),
  updateTwoPQRecordForContext: mockUpdateTwoPQRecordForContext,
}));

jest.mock("../repositories/two-pq-forms.repository.js", () => ({
  archiveTwoPQFormForContext: jest.fn(),
  createTwoPQFormForContext: jest.fn(),
  deleteTwoPQFormDraftForContext: jest.fn(),
  deleteTwoPQFormForContext: jest.fn(),
  getTwoPQFormDraftForContext: jest.fn(),
  getTwoPQFormForContext: jest.fn(),
  listTwoPQFormsForContext: jest.fn(),
  upsertTwoPQFormDraftForContext: jest.fn(),
}));

jest.mock("../repositories/two-pq-auto-sync.repository.js", () => ({
  buildTwoPQCaseFileStorageSnapshot: jest.fn(),
}));

jest.mock(
  "../repositories/two-pq-case-status-operation.repository.js",
  () => ({
    beginTwoPQCaseStatusOperation: mockBeginOperation,
    completeTwoPQCaseStatusOperation: mockCompleteOperation,
    failTwoPQCaseStatusOperation: mockFailOperation,
    getTwoPQCaseStatusOperation: mockGetOperation,
    updateTwoPQCaseStatusOperation: mockUpdateOperation,
  }),
);

const adminContext: AdminContext = {
  email: "admin@example.com",
  uid: "admin-1",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

function operation(status: "running" | "success" | "error" = "success") {
  return {
    id: "operation-123456789",
    caseId: "CASE-00022",
    targetCaseStatus: "lab_processing",
    actorEmail: "admin@example.com",
    status,
    steps: [],
    startedAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-28T10:01:00.000Z",
    expiresAt: "2026-09-29T10:00:00.000Z",
  };
}

async function buildTestServer() {
  const { twoPQRoutes } = await import("../routes/two-pq.routes.js");
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    request.adminContext = adminContext;
  });
  await fastify.register(twoPQRoutes);
  return fastify;
}

describe("2PQ case-status progress routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBeginOperation.mockResolvedValue(operation("running"));
    mockUpdateOperation.mockResolvedValue(operation("running"));
    mockCompleteOperation.mockResolvedValue(operation("success"));
    mockFailOperation.mockResolvedValue(operation("error"));
    mockGetOperation.mockResolvedValue(operation("running"));
  });

  it("tracks a PATCH operation and returns its completed progress", async () => {
    mockUpdateTwoPQRecordForContext.mockImplementation(
      async (_context, _areaKey, _recordId, _payload, options) => {
        await options.reportCaseStatusProgress({
          step: "case",
          status: "success",
        });
        return { id: "CASE-00022", caseStatus: "lab_processing" };
      },
    );
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "PATCH",
      url: "/2pq/cases/CASE-00022",
      headers: {
        "x-two-pq-status-operation-id": "operation-123456789",
      },
      payload: { caseStatus: "lab_processing" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockBeginOperation).toHaveBeenCalledWith({
      operationId: "operation-123456789",
      caseId: "CASE-00022",
      targetCaseStatus: "lab_processing",
      actorEmail: "admin@example.com",
    });
    expect(mockUpdateOperation).toHaveBeenCalledWith(
      "operation-123456789",
      { step: "case", status: "success" },
    );
    expect(mockCompleteOperation).toHaveBeenCalledWith(
      "operation-123456789",
    );
    expect(response.json()).toMatchObject({
      record: { id: "CASE-00022", caseStatus: "lab_processing" },
      operation: { status: "success" },
    });
    await fastify.close();
  });

  it("persists a failed operation before returning the mutation error", async () => {
    mockUpdateTwoPQRecordForContext.mockRejectedValue(
      new Error("Sampling update failed."),
    );
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "PATCH",
      url: "/2pq/cases/CASE-00022",
      headers: {
        "x-two-pq-status-operation-id": "operation-123456789",
      },
      payload: { caseStatus: "lab_processing" },
    });

    expect(response.statusCode).toBe(500);
    expect(mockFailOperation).toHaveBeenCalledWith(
      "operation-123456789",
      expect.objectContaining({ message: "Sampling update failed." }),
    );
    expect(mockCompleteOperation).not.toHaveBeenCalled();
    await fastify.close();
  });

  it("lets only the initiating admin poll the operation", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/cases/CASE-00022/status-operations/operation-123456789",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ operation: operation("running") });
    await fastify.close();
  });
});

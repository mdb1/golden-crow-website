import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockDeleteRoleAccountStepForContext = jest.fn();
const mockListOrphanedOwnerArtifactsForContext = jest.fn();
const mockListOrphanedTwoPQAssignmentsForContext = jest.fn();

jest.mock("../repositories/roles.repository.js", () => ({
  deleteRoleAccountStepForContext: mockDeleteRoleAccountStepForContext,
  deleteRoleUserForContext: jest.fn(),
  getUserRoleForContext: jest.fn(),
  listOrphanedOwnerArtifactsForContext:
    mockListOrphanedOwnerArtifactsForContext,
  listOrphanedTwoPQAssignmentsForContext:
    mockListOrphanedTwoPQAssignmentsForContext,
  listTransportDispatchersForContext: jest.fn(),
  listUserRolesForContext: jest.fn(),
  upsertUserRoleForContext: jest.fn(),
  ROLE_ACCOUNT_DELETION_STEPS: [
    "linked_entity",
    "private_profile",
    "public_profile",
    "community",
    "reports",
    "objects",
    "learning",
    "firebase_auth",
    "role",
  ],
}));

const adminContext: AdminContext = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: false,
  projectAccess: ["mydnamap"],
};

async function buildTestServer() {
  const { rolesRoutes } = await import("../routes/roles.routes.js");
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    request.adminContext = adminContext;
  });
  await fastify.register(rolesRoutes);
  return fastify;
}

describe("role deletion routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListOrphanedOwnerArtifactsForContext.mockResolvedValue({
      items: [],
      nextCursors: { code: null, record: null },
    });
    mockListOrphanedTwoPQAssignmentsForContext.mockResolvedValue({
      items: [],
      nextCursors: { patients: null, cases: null, batches: null },
    });
  });

  it("passes bounded 2PQ orphan-review pagination to the repository", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "GET",
      url: "/roles/deletion/orphaned-two-pq-assignments?entityKind=doctor&entityId=DOC-00001&limit=20&patientCursor=PAT-00020&caseCursor=CASE-00020&batchesDone=1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockListOrphanedTwoPQAssignmentsForContext).toHaveBeenCalledWith(
      adminContext,
      {
        entityKind: "doctor",
        entityId: "DOC-00001",
        limit: 20,
        patientCursor: "PAT-00020",
        caseCursor: "CASE-00020",
        batchCursor: undefined,
        patientsDone: false,
        casesDone: false,
        batchesDone: true,
      },
    );
    await fastify.close();
  });

  it("passes bounded orphan-review pagination to the repository", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "GET",
      url: "/roles/deletion/orphaned-artifacts?kind=reports&ownerIds=owner-1%2Cowner-2&limit=20&codeCursor=RPT001&recordDone=1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockListOrphanedOwnerArtifactsForContext).toHaveBeenCalledWith(
      adminContext,
      {
        kind: "reports",
        ownerIds: ["owner-1", "owner-2"],
        limit: 20,
        codeCursor: "RPT001",
        recordCursor: undefined,
        codeDone: false,
        recordDone: true,
      },
    );
    await fastify.close();
  });

  it("treats the deprecated stored_files cleanup request as a preserving no-op", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "DELETE",
      url: "/roles/member%40example.com/deletion/stored_files",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      step: "stored_files",
      status: "not_found",
      deletedCount: 0,
      message:
        "No stored file metadata was deleted. Stored files are intentionally preserved during account cleanup.",
    });
    expect(mockDeleteRoleAccountStepForContext).not.toHaveBeenCalled();
    await fastify.close();
  });
});

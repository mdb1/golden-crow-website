import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockDeleteRoleAccountStepForContext = jest.fn();

jest.mock("../repositories/roles.repository.js", () => ({
  deleteRoleAccountStepForContext: mockDeleteRoleAccountStepForContext,
  deleteRoleUserForContext: jest.fn(),
  getUserRoleForContext: jest.fn(),
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

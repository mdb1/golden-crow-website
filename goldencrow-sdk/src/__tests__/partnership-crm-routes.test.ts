import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockDeletePartnershipCrmOrganization = jest.fn();

jest.mock("../repositories/partnership-crm.repository.js", () => ({
  PARTNERSHIP_CRM_ACTIVITY_TYPES: [
    "created",
    "updated",
    "status",
    "note",
    "email",
    "import",
  ],
  PARTNERSHIP_CRM_STATUSES: [
    "new",
    "contacted",
    "replied",
    "meeting",
    "partner",
    "no_response",
    "not_interested",
    "not_a_fit",
  ],
  createPartnershipCrmActivity: jest.fn(),
  createPartnershipCrmOrganization: jest.fn(),
  deletePartnershipCrmOrganization: mockDeletePartnershipCrmOrganization,
  getPartnershipCrmOrganization: jest.fn(),
  importPartnershipCrmOrganizations: jest.fn(),
  listPartnershipCrmActivities: jest.fn(),
  listPartnershipCrmOrganizations: jest.fn(),
  previewPartnershipCrmImport: jest.fn(),
  sendPartnershipCrmOrganizationEmail: jest.fn(),
  updatePartnershipCrmOrganization: jest.fn(),
}));

const bootstrapContext: AdminContext = {
  email: "god@example.com",
  uid: "god-1",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  projectAccess: ["mydnamap"],
};

async function buildTestServer(context: AdminContext | null = bootstrapContext) {
  const { partnershipCrmRoutes } = await import(
    "../routes/partnership-crm.routes.js"
  );
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    request.adminContext = context ?? undefined;
  });
  await fastify.register(partnershipCrmRoutes);
  return fastify;
}

describe("partnership CRM routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeletePartnershipCrmOrganization.mockResolvedValue(undefined);
  });

  it("returns a JSON success payload after deleting an organization", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/organizations/org-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      organizationId: "org-1",
    });
    expect(mockDeletePartnershipCrmOrganization).toHaveBeenCalledWith(
      bootstrapContext,
      "org-1",
    );
  });
});

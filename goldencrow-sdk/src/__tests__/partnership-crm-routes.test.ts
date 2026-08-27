import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockDeletePartnershipCrmOrganization = jest.fn();
const mockDeletePartnershipCrmTemplate = jest.fn();

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
  PARTNERSHIP_CRM_TEMPLATE_STATUSES: ["active", "inactive", "archived"],
  createPartnershipCrmActivity: jest.fn(),
  createPartnershipCrmOrganization: jest.fn(),
  createPartnershipCrmTemplate: jest.fn(),
  deletePartnershipCrmOrganization: mockDeletePartnershipCrmOrganization,
  deletePartnershipCrmTemplate: mockDeletePartnershipCrmTemplate,
  getPartnershipCrmOrganization: jest.fn(),
  getPartnershipCrmTemplate: jest.fn(),
  importPartnershipCrmOrganizations: jest.fn(),
  listPartnershipCrmActivities: jest.fn(),
  listPartnershipCrmOrganizations: jest.fn(),
  listPartnershipCrmTemplates: jest.fn(),
  previewPartnershipCrmImport: jest.fn(),
  sendPartnershipCrmOrganizationEmail: jest.fn(),
  updatePartnershipCrmOrganization: jest.fn(),
  updatePartnershipCrmTemplate: jest.fn(),
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

async function buildTestServer(
  context: AdminContext | null = bootstrapContext,
) {
  const { partnershipCrmRoutes } =
    await import("../routes/partnership-crm.routes.js");
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
    mockDeletePartnershipCrmTemplate.mockResolvedValue(undefined);
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

  it("returns a JSON success payload after deleting a template", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/templates/tpl-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      templateId: "tpl-1",
    });
    expect(mockDeletePartnershipCrmTemplate).toHaveBeenCalledWith(
      bootstrapContext,
      "tpl-1",
    );
  });
});

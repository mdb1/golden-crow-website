import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockDeletePartnershipCrmOrganization = jest.fn();
const mockDeletePartnershipCrmProfessional = jest.fn();
const mockDeletePartnershipCrmTemplate = jest.fn();
const mockCreatePartnershipCrmProfessional = jest.fn();

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
  PARTNERSHIP_CRM_TEMPLATE_AUDIENCES: ["organizations", "professionals"],
  createPartnershipCrmActivity: jest.fn(),
  createPartnershipCrmOrganization: jest.fn(),
  createPartnershipCrmProfessional: mockCreatePartnershipCrmProfessional,
  createPartnershipCrmProfessionalActivity: jest.fn(),
  createPartnershipCrmTemplate: jest.fn(),
  deletePartnershipCrmOrganization: mockDeletePartnershipCrmOrganization,
  deletePartnershipCrmProfessional: mockDeletePartnershipCrmProfessional,
  deletePartnershipCrmTemplate: mockDeletePartnershipCrmTemplate,
  getPartnershipCrmOrganization: jest.fn(),
  getPartnershipCrmProfessional: jest.fn(),
  getPartnershipCrmTemplate: jest.fn(),
  importPartnershipCrmOrganizations: jest.fn(),
  importPartnershipCrmProfessionals: jest.fn(),
  listPartnershipCrmActivities: jest.fn(),
  listPartnershipCrmOrganizations: jest.fn(),
  listPartnershipCrmProfessionalActivities: jest.fn(),
  listPartnershipCrmProfessionals: jest.fn(),
  listPartnershipCrmTemplates: jest.fn(),
  previewPartnershipCrmImport: jest.fn(),
  previewPartnershipCrmProfessionalImport: jest.fn(),
  sendPartnershipCrmOrganizationEmail: jest.fn(),
  sendPartnershipCrmProfessionalEmail: jest.fn(),
  updatePartnershipCrmOrganization: jest.fn(),
  updatePartnershipCrmProfessional: jest.fn(),
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
    mockDeletePartnershipCrmProfessional.mockResolvedValue(undefined);
    mockDeletePartnershipCrmTemplate.mockResolvedValue(undefined);
    mockCreatePartnershipCrmProfessional.mockResolvedValue({
      id: "pro-1",
      name: "Dra. Ada Genome",
    });
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

  it("returns a JSON success payload after deleting a professional", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/professionals/pro-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      professionalId: "pro-1",
    });
    expect(mockDeletePartnershipCrmProfessional).toHaveBeenCalledWith(
      bootstrapContext,
      "pro-1",
    );
  });

  it("accepts professional outreach research fields on create", async () => {
    const fastify = await buildTestServer();

    const payload = {
      name: "Dra. Ada Genome",
      category: "pro_clinical_geneticists",
      title: "Genetista clinica",
      primaryAffiliation: "Laboratorio Argenetics",
      potentialPocketGenesEditorFit:
        "Clinical genetics, genetic testing, result interpretation and patient education.",
      emailRoute:
        "Publicly listed professional or official institutional contact address; verify recipient context before outreach.",
      linkedInRoute: "Official LinkedIn page of the affiliated organization.",
      researchBasis:
        "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
      website: "https://argenetics.example",
      country: "AR",
      status: "new",
      email: "ada@argenetics.example",
      linkedIn: "https://linkedin.com/company/argenetics",
      lastContactAt: null,
      notes: "",
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/professionals",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreatePartnershipCrmProfessional).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        primaryAffiliation: "Laboratorio Argenetics",
        potentialPocketGenesEditorFit:
          "Clinical genetics, genetic testing, result interpretation and patient education.",
        emailRoute:
          "Publicly listed professional or official institutional contact address; verify recipient context before outreach.",
        linkedInRoute: "Official LinkedIn page of the affiliated organization.",
        researchBasis:
          "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
      }),
    );
  });
});

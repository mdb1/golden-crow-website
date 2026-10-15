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
const mockGetPartnershipCrmVisualFilters = jest.fn();
const mockGetPartnershipCrmSentEmailLog = jest.fn();
const mockImportPartnershipCrmOrganizations = jest.fn();
const mockImportPartnershipCrmProfessionals = jest.fn();
const mockImportPartnershipCrmTemplate = jest.fn();
const mockListPartnershipCrmSentEmailLog = jest.fn();
const mockListPartnershipCrmTemplates = jest.fn();
const mockPreviewPartnershipCrmProfessionalImport = jest.fn();
const mockUpdatePartnershipCrmOrganizationFavorite = jest.fn();
const mockUpdatePartnershipCrmOrganizationStatus = jest.fn();
const mockUpdatePartnershipCrmProfessionalFavorite = jest.fn();
const mockUpdatePartnershipCrmProfessionalStatus = jest.fn();
const mockUpdatePartnershipCrmTemplateFavorite = jest.fn();
const mockConsumePartnershipCrmDailyUsage = jest.fn();

jest.mock("../repositories/partnership-crm.repository.js", () => ({
  PartnershipCrmUsageError: class PartnershipCrmUsageError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly code: string,
      public readonly usage?: unknown,
    ) {
      super(message);
    }
  },
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
  consumePartnershipCrmDailyUsage: mockConsumePartnershipCrmDailyUsage,
  deletePartnershipCrmOrganization: mockDeletePartnershipCrmOrganization,
  deletePartnershipCrmProfessional: mockDeletePartnershipCrmProfessional,
  deletePartnershipCrmTemplate: mockDeletePartnershipCrmTemplate,
  getPartnershipCrmOrganization: jest.fn(),
  getPartnershipCrmProfessional: jest.fn(),
  getPartnershipCrmSentEmailLog: mockGetPartnershipCrmSentEmailLog,
  getPartnershipCrmTemplate: jest.fn(),
  getPartnershipCrmVisualFilters: mockGetPartnershipCrmVisualFilters,
  importPartnershipCrmOrganizations: mockImportPartnershipCrmOrganizations,
  importPartnershipCrmProfessionals: mockImportPartnershipCrmProfessionals,
  importPartnershipCrmTemplate: mockImportPartnershipCrmTemplate,
  listPartnershipCrmActivities: jest.fn(),
  listPartnershipCrmOrganizations: jest.fn(),
  listPartnershipCrmProfessionalActivities: jest.fn(),
  listPartnershipCrmProfessionals: jest.fn(),
  listPartnershipCrmSentEmailLog: mockListPartnershipCrmSentEmailLog,
  listPartnershipCrmTemplates: mockListPartnershipCrmTemplates,
  previewPartnershipCrmImport: jest.fn(),
  previewPartnershipCrmProfessionalImport:
    mockPreviewPartnershipCrmProfessionalImport,
  sendPartnershipCrmOrganizationEmail: jest.fn(),
  sendPartnershipCrmProfessionalEmail: jest.fn(),
  updatePartnershipCrmOrganization: jest.fn(),
  updatePartnershipCrmOrganizationFavorite:
    mockUpdatePartnershipCrmOrganizationFavorite,
  updatePartnershipCrmOrganizationStatus:
    mockUpdatePartnershipCrmOrganizationStatus,
  updatePartnershipCrmProfessional: jest.fn(),
  updatePartnershipCrmProfessionalFavorite:
    mockUpdatePartnershipCrmProfessionalFavorite,
  updatePartnershipCrmProfessionalStatus:
    mockUpdatePartnershipCrmProfessionalStatus,
  updatePartnershipCrmTemplate: jest.fn(),
  updatePartnershipCrmTemplateFavorite: mockUpdatePartnershipCrmTemplateFavorite,
}));

const bootstrapContext: AdminContext = {
  email: "god@example.com",
  uid: "god-1",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

const crmUsageHeaders = {
  "x-crm-usage-surface": "crm",
  "x-crm-usage-event-id": "3ec7cd24-f57b-4f36-a9de-a2c24e10db94",
};

const plantillasUsageHeaders = {
  "x-crm-usage-surface": "plantillas",
  "x-crm-usage-event-id": "f54ed157-bdf4-48a0-a047-518779fc640a",
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
    mockListPartnershipCrmSentEmailLog.mockResolvedValue({
      emails: [],
      nextCursor: undefined,
    });
    mockGetPartnershipCrmSentEmailLog.mockResolvedValue({
      id: "email-1",
      targetKind: "organizations",
      targetId: "org-1",
      targetName: "Genome Lab",
      from: "federico@goldencrowvs.com",
      to: "ada@genomelab.example",
      subject: "Pocket Genes + Genome Lab",
      body: "Hola Ada",
      sentAt: "2026-09-01T12:00:00.000Z",
    });
    mockImportPartnershipCrmOrganizations.mockResolvedValue({
      results: [
        {
          rowId: "row-1",
          action: "created",
          organizationId: "crm_import_org_hash",
        },
      ],
      summary: {
        total: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        invalid: 0,
      },
    });
    mockImportPartnershipCrmProfessionals.mockResolvedValue({
      results: [
        {
          rowId: "row-1",
          action: "created",
          professionalId: "crm_import_pro_hash",
        },
      ],
      summary: {
        total: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        invalid: 0,
      },
    });
    mockImportPartnershipCrmTemplate.mockResolvedValue({
      action: "updated",
      template: {
        id: "tpl-1",
        name: "Lab outreach",
        audience: "organizations",
        category: "org_genomics_laboratories",
        subject: "New subject",
        body: "New body",
        status: "active",
        notes: "",
        is_favorite: false,
      },
    });
    mockListPartnershipCrmTemplates.mockResolvedValue({
      templates: [],
      nextCursor: undefined,
      partial: false,
      scanned: 0,
      asOf: "2026-09-10T12:00:00.000Z",
    });
    mockPreviewPartnershipCrmProfessionalImport.mockResolvedValue({
      rows: [],
      summary: {
        total: 0,
        valid: 0,
        invalid: 0,
        missingEmail: 0,
        duplicates: 0,
      },
    });
    mockCreatePartnershipCrmProfessional.mockResolvedValue({
      id: "pro-1",
      name: "Dra. Ada Genome",
    });
    mockUpdatePartnershipCrmOrganizationStatus.mockResolvedValue({
      id: "org-1",
      name: "Genome Lab",
      status: "meeting",
    });
    mockUpdatePartnershipCrmProfessionalStatus.mockResolvedValue({
      id: "pro-1",
      name: "Dra. Ada Genome",
      status: "partner",
    });
    mockUpdatePartnershipCrmOrganizationFavorite.mockResolvedValue({
      id: "org-1",
      name: "Genome Lab",
      is_favorite: true,
    });
    mockUpdatePartnershipCrmProfessionalFavorite.mockResolvedValue({
      id: "pro-1",
      name: "Dra. Ada Genome",
      is_favorite: true,
    });
    mockUpdatePartnershipCrmTemplateFavorite.mockResolvedValue({
      id: "tpl-1",
      name: "Lab outreach",
      is_favorite: true,
    });
    mockGetPartnershipCrmVisualFilters.mockResolvedValue({
      targetKind: "organizations",
      facets: {
        status: { key: "status", total: 0, buckets: [] },
        category: { key: "category", total: 0, buckets: [] },
        country: { key: "country", total: 0, buckets: [] },
        linkedInState: { key: "linkedInState", total: 0, buckets: [] },
      },
    });
    mockConsumePartnershipCrmDailyUsage.mockResolvedValue({
      duplicate: false,
      usage: {
        surface: "crm",
        used: 1,
        limit: 100,
        percentage: 1,
        remaining: 99,
        resetAt: "2026-09-11T07:00:00.000Z",
        locked: false,
      },
    });
  });

  it("consumes one page-load unit and returns the daily usage state", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/daily-usage/page-load",
      headers: {
        "x-crm-usage-surface": "crm",
        "x-crm-usage-event-id": "c7c7e213-38b6-4e14-80a1-d43ab741398e",
      },
      payload: {
        surface: "crm",
        eventId: "c7c7e213-38b6-4e14-80a1-d43ab741398e",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      usage: expect.objectContaining({ used: 1, limit: 100 }),
    });
    expect(mockConsumePartnershipCrmDailyUsage).toHaveBeenCalledWith(
      bootstrapContext,
      "crm",
      "c7c7e213-38b6-4e14-80a1-d43ab741398e",
      "page_load",
    );
  });

  it("rejects mismatched page-load usage headers before consuming quota", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/daily-usage/page-load",
      headers: {
        "x-crm-usage-surface": "plantillas",
        "x-crm-usage-event-id": "b6c821d9-a59a-4a27-9c99-34e21a130c91",
      },
      payload: {
        surface: "crm",
        eventId: "c7c7e213-38b6-4e14-80a1-d43ab741398e",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "CRM page-load usage headers must match the request body.",
      code: "CRM_USAGE_HEADER_BODY_MISMATCH",
    });
    expect(mockConsumePartnershipCrmDailyUsage).not.toHaveBeenCalled();
  });

  it("rejects a read-bearing route before the repository when usage intent is absent", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/organizations/org-1",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "A valid CRM usage event id is required.",
      code: "CRM_USAGE_EVENT_REQUIRED",
    });
    expect(mockDeletePartnershipCrmOrganization).not.toHaveBeenCalled();
  });

  it("rejects a duplicate usage event before repeating the action", async () => {
    const fastify = await buildTestServer();
    mockConsumePartnershipCrmDailyUsage.mockResolvedValueOnce({
      duplicate: true,
      usage: {
        surface: "crm",
        used: 18,
        limit: 100,
        percentage: 18,
        remaining: 82,
        resetAt: "2026-09-11T07:00:00.000Z",
        locked: false,
      },
    });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/organizations/org-1",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "CRM_USAGE_EVENT_ALREADY_CONSUMED",
        usage: expect.objectContaining({ used: 18 }),
      }),
    );
    expect(mockDeletePartnershipCrmOrganization).not.toHaveBeenCalled();
  });

  it("fails closed before the source repository when usage state is corrupt", async () => {
    const { PartnershipCrmUsageError } = await import(
      "../repositories/partnership-crm.repository.js"
    );
    const fastify = await buildTestServer();
    mockConsumePartnershipCrmDailyUsage.mockRejectedValueOnce(
      new PartnershipCrmUsageError(
        "CRM usage tracking is unavailable. Fresh CRM actions are disabled.",
        503,
        "CRM_USAGE_UNAVAILABLE",
      ),
    );

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/organizations/org-1",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "CRM usage tracking is unavailable. Fresh CRM actions are disabled.",
      code: "CRM_USAGE_UNAVAILABLE",
    });
    expect(mockDeletePartnershipCrmOrganization).not.toHaveBeenCalled();
  });

  it("returns a JSON success payload after deleting an organization", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/organizations/org-1",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      deleted: true,
      organizationId: "org-1",
    }));
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
      headers: plantillasUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      deleted: true,
      templateId: "tpl-1",
    }));
    expect(mockDeletePartnershipCrmTemplate).toHaveBeenCalledWith(
      bootstrapContext,
      "tpl-1",
    );
  });

  it("imports one Plantillas row through the bounded atomic endpoint", async () => {
    const fastify = await buildTestServer();
    const payload = {
      name: "Lab outreach",
      audience: "organizations" as const,
      category: "org_genomics_laboratories",
      subject: "New subject",
      body: "New body",
      status: "active" as const,
      notes: "CSV note",
      is_favorite: false,
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/templates/import",
      headers: plantillasUsageHeaders,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        action: "updated",
        template: expect.objectContaining({ id: "tpl-1" }),
      }),
    );
    expect(mockImportPartnershipCrmTemplate).toHaveBeenCalledWith(
      bootstrapContext,
      payload,
    );
    expect(mockConsumePartnershipCrmDailyUsage).toHaveBeenCalledWith(
      bootstrapContext,
      "plantillas",
      plantillasUsageHeaders["x-crm-usage-event-id"],
      "import",
    );
  });

  it("uses the CRM-only email-template alias for composer reads", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/partnership-crm/email-templates?audience=organizations&limit=5",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(mockListPartnershipCrmTemplates).toHaveBeenCalledWith(
      bootstrapContext,
      { audience: "organizations", limit: 5 },
    );
    expect(mockConsumePartnershipCrmDailyUsage).toHaveBeenCalledWith(
      bootstrapContext,
      "crm",
      crmUsageHeaders["x-crm-usage-event-id"],
      "list",
    );
  });

  it.each([
    {
      url: "/admin/partnership-crm/templates?limit=5",
      headers: crmUsageHeaders,
    },
    {
      url: "/admin/partnership-crm/email-templates?limit=5",
      headers: plantillasUsageHeaders,
    },
  ])("rejects a usage surface that does not own $url", async ({ url, headers }) => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({ method: "GET", url, headers });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "CRM usage surface does not match this route.",
      code: "CRM_USAGE_SURFACE_INVALID",
    });
    expect(mockListPartnershipCrmTemplates).not.toHaveBeenCalled();
    expect(mockConsumePartnershipCrmDailyUsage).not.toHaveBeenCalled();
  });

  it("returns a JSON success payload after deleting a professional", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/partnership-crm/professionals/pro-1",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      deleted: true,
      professionalId: "pro-1",
    }));
    expect(mockDeletePartnershipCrmProfessional).toHaveBeenCalledWith(
      bootstrapContext,
      "pro-1",
    );
  });

  it("updates only an organization's status through the dedicated PATCH route", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/partnership-crm/organizations/org-1/status",
      headers: crmUsageHeaders,
      payload: { status: "meeting" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      organization: expect.objectContaining({
        id: "org-1",
        status: "meeting",
      }),
    }));
    expect(mockUpdatePartnershipCrmOrganizationStatus).toHaveBeenCalledWith(
      bootstrapContext,
      "org-1",
      "meeting",
    );
  });

  it("updates only a professional's status through the dedicated PATCH route", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/partnership-crm/professionals/pro-1/status",
      headers: crmUsageHeaders,
      payload: { status: "partner" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      professional: expect.objectContaining({
        id: "pro-1",
        status: "partner",
      }),
    }));
    expect(mockUpdatePartnershipCrmProfessionalStatus).toHaveBeenCalledWith(
      bootstrapContext,
      "pro-1",
      "partner",
    );
  });

  it.each([
    {
      url: "/admin/partnership-crm/organizations/org-1/favorite",
      headers: crmUsageHeaders,
      responseKey: "organization",
      repository: mockUpdatePartnershipCrmOrganizationFavorite,
      id: "org-1",
    },
    {
      url: "/admin/partnership-crm/professionals/pro-1/favorite",
      headers: crmUsageHeaders,
      responseKey: "professional",
      repository: mockUpdatePartnershipCrmProfessionalFavorite,
      id: "pro-1",
    },
    {
      url: "/admin/partnership-crm/templates/tpl-1/favorite",
      headers: plantillasUsageHeaders,
      responseKey: "template",
      repository: mockUpdatePartnershipCrmTemplateFavorite,
      id: "tpl-1",
    },
    {
      url: "/admin/partnership-crm/email-templates/tpl-1/favorite",
      headers: crmUsageHeaders,
      responseKey: "template",
      repository: mockUpdatePartnershipCrmTemplateFavorite,
      id: "tpl-1",
    },
  ])(
    "updates only the favorite flag through $url",
    async ({ url, headers, responseKey, repository, id }) => {
      const fastify = await buildTestServer();

      const response = await fastify.inject({
        method: "PATCH",
        url,
        headers,
        payload: { is_favorite: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          [responseKey]: expect.objectContaining({ id, is_favorite: true }),
        }),
      );
      expect(repository).toHaveBeenCalledWith(bootstrapContext, id, true);
    },
  );

  it("rejects extra fields from a favorite-only PATCH", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/partnership-crm/organizations/org-1/favorite",
      headers: crmUsageHeaders,
      payload: { is_favorite: true, notes: "must not be accepted" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdatePartnershipCrmOrganizationFavorite).not.toHaveBeenCalled();
  });

  it("rejects extra fields from a status-only PATCH", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/partnership-crm/organizations/org-1/status",
      headers: crmUsageHeaders,
      payload: {
        status: "meeting",
        name: "This field must not be accepted",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdatePartnershipCrmOrganizationStatus).not.toHaveBeenCalled();
  });

  it("rejects an invalid CRM status before calling the repository", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/partnership-crm/professionals/pro-1/status",
      headers: crmUsageHeaders,
      payload: { status: "qualified" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdatePartnershipCrmProfessionalStatus).not.toHaveBeenCalled();
  });

  it("returns paginated sent CRM email logs", async () => {
    const fastify = await buildTestServer();
    mockListPartnershipCrmSentEmailLog.mockResolvedValue({
      emails: [
        {
          id: "email-1",
          targetKind: "organizations",
          targetId: "org-1",
          targetName: "Genome Lab",
          from: "federico@goldencrowvs.com",
          to: "ada@genomelab.example",
          subject: "Pocket Genes + Genome Lab",
          body: "",
          sentAt: "2026-09-01T12:00:00.000Z",
          templateName: "Lab outreach",
        },
      ],
      nextCursor: "2026-09-01T12:00:00.000Z",
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/partnership-crm/sent-email-log?limit=10",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      emails: [
        expect.objectContaining({
          subject: "Pocket Genes + Genome Lab",
          templateName: "Lab outreach",
        }),
      ],
      nextCursor: "2026-09-01T12:00:00.000Z",
    }));
    expect(mockListPartnershipCrmSentEmailLog).toHaveBeenCalledWith(
      bootstrapContext,
      { limit: 10 },
    );
  });

  it("returns one full sent CRM email only after its detail route is requested", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/partnership-crm/sent-email-log/email-1",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        email: expect.objectContaining({
          id: "email-1",
          body: "Hola Ada",
        }),
      }),
    );
    expect(mockGetPartnershipCrmSentEmailLog).toHaveBeenCalledWith(
      bootstrapContext,
      "email-1",
    );
    expect(mockListPartnershipCrmSentEmailLog).not.toHaveBeenCalled();
  });

  it("returns visual filter facets for CRM organizations", async () => {
    const fastify = await buildTestServer();
    mockGetPartnershipCrmVisualFilters.mockResolvedValue({
      targetKind: "organizations",
      facets: {
        status: {
          key: "status",
          total: 3,
          buckets: [{ value: "new", count: 3 }],
        },
        category: { key: "category", total: 3, buckets: [] },
        country: { key: "country", total: 3, buckets: [] },
        linkedInState: { key: "linkedInState", total: 3, buckets: [] },
      },
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/partnership-crm/organizations/visual-filters?status=contacted&linkedInState=has_linkedin",
      headers: crmUsageHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        targetKind: "organizations",
        facets: expect.objectContaining({
          status: expect.objectContaining({
            buckets: [{ value: "new", count: 3 }],
          }),
        }),
      }),
    );
    expect(mockGetPartnershipCrmVisualFilters).toHaveBeenCalledWith(
      bootstrapContext,
      "organizations",
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
      is_favorite: true,
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/professionals",
      headers: crmUsageHeaders,
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
        is_favorite: true,
      }),
    );
  });

  it("accepts timezone-offset datetimes on professional import preview", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/professionals/import-preview",
      headers: crmUsageHeaders,
      payload: {
        professionals: [
          {
            rowId: "row-1",
            name: "Cesar Sanchez Sarmiento",
            category: "pro_reproductive_specialists,pro_fertility_specialists",
            country: "AR",
            status: "replied",
            is_favorite: true,
            lastContactAt: "2026-08-25T14:29:00-03:00",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockPreviewPartnershipCrmProfessionalImport).toHaveBeenCalledWith(
      bootstrapContext,
      expect.arrayContaining([
        expect.objectContaining({
          lastContactAt: "2026-08-25T14:29:00-03:00",
          is_favorite: true,
        }),
      ]),
    );
  });

  it.each([
    {
      label: "organization",
      url: "/admin/partnership-crm/import",
      field: "organizations",
      repository: mockImportPartnershipCrmOrganizations,
      row: {
        rowId: "row-1",
        idempotencyKey: "upload-session:organization-row-1",
        duplicateAction: "import",
        name: "Retry-safe laboratory",
      },
    },
    {
      label: "professional",
      url: "/admin/partnership-crm/professionals/import",
      field: "professionals",
      repository: mockImportPartnershipCrmProfessionals,
      row: {
        rowId: "row-1",
        idempotencyKey: "upload-session:professional-row-1",
        duplicateAction: "import",
        name: "Dr. Retry Safe",
      },
    },
  ])(
    "forwards the same $label idempotency key on a lost-response retry",
    async ({ url, field, repository, row }) => {
      const fastify = await buildTestServer();
      const payload = { [field]: [row] };
      const eventIds = [
        "c34117db-0415-48e5-860b-cfa004120bfa",
        "919c9757-cdb0-4365-bbb5-f59441c7e421",
      ];

      for (const eventId of eventIds) {
        const response = await fastify.inject({
          method: "POST",
          url,
          headers: {
            "x-crm-usage-surface": "crm",
            "x-crm-usage-event-id": eventId,
          },
          payload,
        });
        expect(response.statusCode).toBe(201);
      }

      expect(repository).toHaveBeenCalledTimes(2);
      expect(repository).toHaveBeenNthCalledWith(1, bootstrapContext, [row]);
      expect(repository).toHaveBeenNthCalledWith(2, bootstrapContext, [row]);
    },
  );

  it("rejects multi-row import previews before duplicate lookups can fan out", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/partnership-crm/professionals/import-preview",
      headers: crmUsageHeaders,
      payload: {
        professionals: [
          { rowId: "row-1", name: "Ada One" },
          { rowId: "row-2", name: "Ada Two" },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockPreviewPartnershipCrmProfessionalImport).not.toHaveBeenCalled();
  });
});

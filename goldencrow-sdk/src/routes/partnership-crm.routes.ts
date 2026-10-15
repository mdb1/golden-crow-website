import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  PARTNERSHIP_CRM_ACTIVITY_TYPES,
  PARTNERSHIP_CRM_STATUSES,
  PARTNERSHIP_CRM_TEMPLATE_AUDIENCES,
  PARTNERSHIP_CRM_TEMPLATE_STATUSES,
  PartnershipCrmUsageError,
  consumePartnershipCrmDailyUsage,
  createPartnershipCrmActivity,
  createPartnershipCrmOrganization,
  createPartnershipCrmProfessional,
  createPartnershipCrmProfessionalActivity,
  createPartnershipCrmTemplate,
  deletePartnershipCrmOrganization,
  deletePartnershipCrmProfessional,
  deletePartnershipCrmTemplate,
  getPartnershipCrmOrganization,
  getPartnershipCrmProfessional,
  getPartnershipCrmSentEmailLog,
  getPartnershipCrmTemplate,
  getPartnershipCrmVisualFilters,
  importPartnershipCrmOrganizations,
  importPartnershipCrmProfessionals,
  importPartnershipCrmTemplate,
  listPartnershipCrmActivities,
  listPartnershipCrmOrganizations,
  listPartnershipCrmProfessionalActivities,
  listPartnershipCrmProfessionals,
  listPartnershipCrmSentEmailLog,
  listPartnershipCrmTemplates,
  previewPartnershipCrmImport,
  previewPartnershipCrmProfessionalImport,
  sendPartnershipCrmOrganizationEmail,
  sendPartnershipCrmProfessionalEmail,
  updatePartnershipCrmOrganization,
  updatePartnershipCrmOrganizationFavorite,
  updatePartnershipCrmOrganizationStatus,
  updatePartnershipCrmProfessional,
  updatePartnershipCrmProfessionalFavorite,
  updatePartnershipCrmProfessionalStatus,
  updatePartnershipCrmTemplate,
  updatePartnershipCrmTemplateFavorite,
  type PartnershipCrmDailyUsage,
  type PartnershipCrmUsageSurface,
} from "../repositories/partnership-crm.repository.js";

const CrmStatusSchema = z.enum(PARTNERSHIP_CRM_STATUSES);
const CrmStatusBodySchema = z.object({ status: CrmStatusSchema }).strict();
const CrmFavoriteBodySchema = z.object({ is_favorite: z.boolean() }).strict();
const CrmActivityTypeSchema = z.enum(PARTNERSHIP_CRM_ACTIVITY_TYPES);
const CrmTemplateStatusSchema = z.enum(PARTNERSHIP_CRM_TEMPLATE_STATUSES);
const CrmTemplateAudienceSchema = z.enum(PARTNERSHIP_CRM_TEMPLATE_AUDIENCES);
const OptionalStringSchema = z.string().trim().max(2000).optional();
const CrmCategoryStringSchema = z.string().trim().max(2000).optional();
const CrmCountryStringSchema = z.string().trim().max(500).optional();
const CrmTemplateCategoryStringSchema = z.string().trim().max(90).optional();
const CrmDateTimeSchema = z
  .string()
  .trim()
  .datetime({ offset: true })
  .nullable()
  .optional();
const OrganizationBodySchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: CrmCategoryStringSchema,
  website: z.string().trim().max(500).optional(),
  country: CrmCountryStringSchema,
  status: CrmStatusSchema.optional(),
  contactName: z.string().trim().max(140).optional(),
  contactEmail: z.string().trim().toLowerCase().max(180).optional(),
  contactLinkedIn: z.string().trim().max(500).optional(),
  lastContactAt: CrmDateTimeSchema,
  notes: OptionalStringSchema,
  is_favorite: z.boolean().optional(),
});
const OrganizationImportRowSchema = OrganizationBodySchema.partial().extend({
  rowId: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  duplicateAction: z
    .enum(["skip", "update", "import", "fill_missing", "replace_variables"])
    .optional(),
  duplicateOrganizationId: z.string().trim().max(160).optional(),
});
const ProfessionalBodySchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: CrmCategoryStringSchema,
  title: z.string().trim().max(180).optional(),
  primaryAffiliation: z.string().trim().max(180).optional(),
  potentialPocketGenesEditorFit: OptionalStringSchema,
  emailRoute: OptionalStringSchema,
  linkedInRoute: OptionalStringSchema,
  researchBasis: OptionalStringSchema,
  website: z.string().trim().max(500).optional(),
  country: CrmCountryStringSchema,
  status: CrmStatusSchema.optional(),
  email: z.string().trim().toLowerCase().max(180).optional(),
  linkedIn: z.string().trim().max(500).optional(),
  lastContactAt: CrmDateTimeSchema,
  notes: OptionalStringSchema,
  is_favorite: z.boolean().optional(),
});
const ProfessionalImportRowSchema = ProfessionalBodySchema.partial().extend({
  rowId: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  duplicateAction: z
    .enum(["skip", "update", "import", "fill_missing", "replace_variables"])
    .optional(),
  duplicateProfessionalId: z.string().trim().max(160).optional(),
});
const OrganizationParamsSchema = z.object({
  organizationId: z.string().trim().min(1),
});
const ProfessionalParamsSchema = z.object({
  professionalId: z.string().trim().min(1),
});
const UsageEventIdSchema = z.string().trim().uuid();
const DeepSearchSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true")
  .optional();
const ListOrganizationsQuerySchema = z.object({
  cursor: z.string().trim().max(1000).optional(),
  limit: z.coerce.number().int().positive().max(10).optional(),
  query: z.string().trim().max(180).optional(),
  status: z.string().trim().max(40).optional(),
  category: CrmCategoryStringSchema,
  country: CrmCountryStringSchema,
  linkedInState: z.enum(["has_linkedin", "missing_linkedin"]).optional(),
  deep: DeepSearchSchema,
});
const ListActivitiesQuerySchema = z.object({
  cursor: z.string().trim().max(1000).optional(),
  limit: z.coerce.number().int().positive().max(10).optional(),
});
const TemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(180),
  audience: CrmTemplateAudienceSchema.optional(),
  category: CrmTemplateCategoryStringSchema,
  subject: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(12000),
  status: CrmTemplateStatusSchema.optional(),
  notes: OptionalStringSchema,
  is_favorite: z.boolean().optional(),
});
const TemplateParamsSchema = z.object({
  templateId: z.string().trim().min(1),
});
const SentEmailLogParamsSchema = z
  .object({
    emailLogId: z.string().trim().min(1).max(160),
  })
  .strict();
const ListTemplatesQuerySchema = z.object({
  cursor: z.string().trim().max(1000).optional(),
  limit: z.coerce.number().int().positive().max(10).optional(),
  query: z.string().trim().max(180).optional(),
  status: z.string().trim().max(40).optional(),
  category: CrmTemplateCategoryStringSchema,
  audience: CrmTemplateAudienceSchema.optional(),
  deep: DeepSearchSchema,
});
const ActivityBodySchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().max(4000).optional(),
  type: CrmActivityTypeSchema.optional(),
});
const ImportRowsBodySchema = z.object({
  organizations: z.array(OrganizationImportRowSchema).length(1),
});
const ProfessionalImportRowsBodySchema = z.object({
  professionals: z.array(ProfessionalImportRowSchema).length(1),
});
const DailyUsagePageLoadSchema = z
  .object({
    surface: z.enum(["crm", "plantillas"]),
    eventId: UsageEventIdSchema,
  })
  .strict();
const EmailBodySchema = z.object({
  to: z.string().trim().toLowerCase().email().max(180),
  subject: z.string().trim().min(1).max(180),
  text: z.string().trim().min(1).max(12000),
  html: z.string().trim().max(24000).optional(),
  templateId: z.string().trim().max(160).optional(),
  templateKey: z.string().trim().max(80).optional(),
});

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (error instanceof PartnershipCrmUsageError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      usage: error.usage,
    });
  }

  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

function crmUsageKind(method: string, routeUrl: string) {
  if (routeUrl.includes("import-preview")) return "import_preview";
  if (routeUrl.endsWith("/import")) return "import";
  if (routeUrl.endsWith("/email")) return "email";
  if (routeUrl.includes("/activities")) return "activities";
  if (routeUrl.includes("visual-filters")) return "visual_filters";
  if (method === "GET" && /:\w+/.test(routeUrl)) return "detail";
  if (method === "GET") return "list";
  if (method === "DELETE") return "delete";
  return "mutation";
}

function defaultUsageSurface(routeUrl: string): PartnershipCrmUsageSurface {
  return routeUrl.startsWith("/admin/partnership-crm/templates")
    ? "plantillas"
    : "crm";
}

function requestHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function partnershipCrmRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();
  const usageByRequest = new WeakMap<object, PartnershipCrmDailyUsage>();
  const pageLoadRoute = "/admin/partnership-crm/daily-usage/page-load";

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
    }

    const routeUrl = request.routeOptions.url ?? request.url.split("?")[0] ?? "";
    if (routeUrl === pageLoadRoute) {
      return;
    }

    const eventId = requestHeaderValue(
      request.headers["x-crm-usage-event-id"],
    );
    const parsedEventId = UsageEventIdSchema.safeParse(eventId);
    if (!parsedEventId.success) {
      return reply.status(400).send({
        error: "A valid CRM usage event id is required.",
        code: "CRM_USAGE_EVENT_REQUIRED",
      });
    }

    const defaultSurface = defaultUsageSurface(routeUrl);
    const declaredSurface = requestHeaderValue(
      request.headers["x-crm-usage-surface"],
    );
    const surface = (declaredSurface || defaultSurface) as PartnershipCrmUsageSurface;
    if (
      !["crm", "plantillas"].includes(surface) ||
      surface !== defaultSurface
    ) {
      return reply.status(400).send({
        error: "CRM usage surface does not match this route.",
        code: "CRM_USAGE_SURFACE_INVALID",
      });
    }

    try {
      const consumed = await consumePartnershipCrmDailyUsage(
        request.adminContext,
        surface,
        parsedEventId.data,
        crmUsageKind(request.method, routeUrl),
      );
      if (consumed.duplicate) {
        return reply.status(409).send({
          error: "CRM usage event was already consumed.",
          code: "CRM_USAGE_EVENT_ALREADY_CONSUMED",
          usage: consumed.usage,
        });
      }
      usageByRequest.set(request, consumed.usage);
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.addHook("onSend", async (request, _reply, payload) => {
    const usage = usageByRequest.get(request);
    if (!usage || typeof payload !== "string") {
      return payload;
    }

    try {
      const parsed = JSON.parse(payload) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return payload;
      }
      return JSON.stringify({
        ...(parsed as Record<string, unknown>),
        usage,
      });
    } catch {
      return payload;
    }
  });

  f.post(
    pageLoadRoute,
    { schema: { body: DailyUsagePageLoadSchema } },
    async (request, reply) => {
      const declaredSurface = requestHeaderValue(
        request.headers["x-crm-usage-surface"],
      );
      const declaredEventId = requestHeaderValue(
        request.headers["x-crm-usage-event-id"],
      );
      if (
        declaredSurface !== request.body.surface ||
        declaredEventId !== request.body.eventId
      ) {
        return reply.status(400).send({
          error: "CRM page-load usage headers must match the request body.",
          code: "CRM_USAGE_HEADER_BODY_MISMATCH",
        });
      }

      try {
        const consumed = await consumePartnershipCrmDailyUsage(
          request.adminContext!,
          request.body.surface,
          request.body.eventId,
          "page_load",
        );
        return reply.send({ usage: consumed.usage });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/templates",
    { schema: { querystring: ListTemplatesQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmTemplates(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/sent-email-log",
    { schema: { querystring: ListActivitiesQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmSentEmailLog(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/sent-email-log/:emailLogId",
    { schema: { params: SentEmailLogParamsSchema } },
    async (request, reply) => {
      try {
        const email = await getPartnershipCrmSentEmailLog(
          request.adminContext!,
          request.params.emailLogId,
        );
        return reply.send({ email });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/templates",
    { schema: { body: TemplateBodySchema } },
    async (request, reply) => {
      try {
        const template = await createPartnershipCrmTemplate(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/templates/import",
    { schema: { body: TemplateBodySchema } },
    async (request, reply) => {
      try {
        const result = await importPartnershipCrmTemplate(
          request.adminContext!,
          request.body,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/templates/:templateId",
    { schema: { params: TemplateParamsSchema } },
    async (request, reply) => {
      try {
        const template = await getPartnershipCrmTemplate(
          request.adminContext!,
          request.params.templateId,
        );
        return reply.send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/partnership-crm/templates/:templateId",
    {
      schema: {
        params: TemplateParamsSchema,
        body: TemplateBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const template = await updatePartnershipCrmTemplate(
          request.adminContext!,
          request.params.templateId,
          request.body,
        );
        return reply.send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/admin/partnership-crm/templates/:templateId/favorite",
    {
      schema: {
        params: TemplateParamsSchema,
        body: CrmFavoriteBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const template = await updatePartnershipCrmTemplateFavorite(
          request.adminContext!,
          request.params.templateId,
          request.body.is_favorite,
        );
        return reply.send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/partnership-crm/templates/:templateId",
    { schema: { params: TemplateParamsSchema } },
    async (request, reply) => {
      try {
        await deletePartnershipCrmTemplate(
          request.adminContext!,
          request.params.templateId,
        );
        return reply.send({
          deleted: true,
          templateId: request.params.templateId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/email-templates",
    { schema: { querystring: ListTemplatesQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmTemplates(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/email-templates",
    { schema: { body: TemplateBodySchema } },
    async (request, reply) => {
      try {
        const template = await createPartnershipCrmTemplate(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/email-templates/:templateId",
    { schema: { params: TemplateParamsSchema } },
    async (request, reply) => {
      try {
        const template = await getPartnershipCrmTemplate(
          request.adminContext!,
          request.params.templateId,
        );
        return reply.send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/partnership-crm/email-templates/:templateId",
    {
      schema: {
        params: TemplateParamsSchema,
        body: TemplateBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const template = await updatePartnershipCrmTemplate(
          request.adminContext!,
          request.params.templateId,
          request.body,
        );
        return reply.send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/admin/partnership-crm/email-templates/:templateId/favorite",
    {
      schema: {
        params: TemplateParamsSchema,
        body: CrmFavoriteBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const template = await updatePartnershipCrmTemplateFavorite(
          request.adminContext!,
          request.params.templateId,
          request.body.is_favorite,
        );
        return reply.send({ template });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/partnership-crm/email-templates/:templateId",
    { schema: { params: TemplateParamsSchema } },
    async (request, reply) => {
      try {
        await deletePartnershipCrmTemplate(
          request.adminContext!,
          request.params.templateId,
        );
        return reply.send({
          deleted: true,
          templateId: request.params.templateId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/organizations",
    { schema: { querystring: ListOrganizationsQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmOrganizations(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/organizations",
    { schema: { body: OrganizationBodySchema } },
    async (request, reply) => {
      try {
        const organization = await createPartnershipCrmOrganization(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/organizations/visual-filters",
    { schema: { querystring: ListOrganizationsQuerySchema } },
    async (request, reply) => {
      try {
        const result = await getPartnershipCrmVisualFilters(
          request.adminContext!,
          "organizations",
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/organizations/:organizationId",
    { schema: { params: OrganizationParamsSchema } },
    async (request, reply) => {
      try {
        const organization = await getPartnershipCrmOrganization(
          request.adminContext!,
          request.params.organizationId,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/partnership-crm/organizations/:organizationId",
    {
      schema: {
        params: OrganizationParamsSchema,
        body: OrganizationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const organization = await updatePartnershipCrmOrganization(
          request.adminContext!,
          request.params.organizationId,
          request.body,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/admin/partnership-crm/organizations/:organizationId/status",
    {
      schema: {
        params: OrganizationParamsSchema,
        body: CrmStatusBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const organization = await updatePartnershipCrmOrganizationStatus(
          request.adminContext!,
          request.params.organizationId,
          request.body.status,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/admin/partnership-crm/organizations/:organizationId/favorite",
    {
      schema: {
        params: OrganizationParamsSchema,
        body: CrmFavoriteBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const organization = await updatePartnershipCrmOrganizationFavorite(
          request.adminContext!,
          request.params.organizationId,
          request.body.is_favorite,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/partnership-crm/organizations/:organizationId",
    { schema: { params: OrganizationParamsSchema } },
    async (request, reply) => {
      try {
        await deletePartnershipCrmOrganization(
          request.adminContext!,
          request.params.organizationId,
        );
        return reply.send({
          deleted: true,
          organizationId: request.params.organizationId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/professionals",
    { schema: { querystring: ListOrganizationsQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmProfessionals(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/professionals",
    { schema: { body: ProfessionalBodySchema } },
    async (request, reply) => {
      try {
        const professional = await createPartnershipCrmProfessional(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ professional });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/professionals/visual-filters",
    { schema: { querystring: ListOrganizationsQuerySchema } },
    async (request, reply) => {
      try {
        const result = await getPartnershipCrmVisualFilters(
          request.adminContext!,
          "professionals",
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/professionals/:professionalId",
    { schema: { params: ProfessionalParamsSchema } },
    async (request, reply) => {
      try {
        const professional = await getPartnershipCrmProfessional(
          request.adminContext!,
          request.params.professionalId,
        );
        return reply.send({ professional });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/partnership-crm/professionals/:professionalId",
    {
      schema: {
        params: ProfessionalParamsSchema,
        body: ProfessionalBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const professional = await updatePartnershipCrmProfessional(
          request.adminContext!,
          request.params.professionalId,
          request.body,
        );
        return reply.send({ professional });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/admin/partnership-crm/professionals/:professionalId/status",
    {
      schema: {
        params: ProfessionalParamsSchema,
        body: CrmStatusBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const professional = await updatePartnershipCrmProfessionalStatus(
          request.adminContext!,
          request.params.professionalId,
          request.body.status,
        );
        return reply.send({ professional });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/admin/partnership-crm/professionals/:professionalId/favorite",
    {
      schema: {
        params: ProfessionalParamsSchema,
        body: CrmFavoriteBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const professional = await updatePartnershipCrmProfessionalFavorite(
          request.adminContext!,
          request.params.professionalId,
          request.body.is_favorite,
        );
        return reply.send({ professional });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/partnership-crm/professionals/:professionalId",
    { schema: { params: ProfessionalParamsSchema } },
    async (request, reply) => {
      try {
        await deletePartnershipCrmProfessional(
          request.adminContext!,
          request.params.professionalId,
        );
        return reply.send({
          deleted: true,
          professionalId: request.params.professionalId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/organizations/:organizationId/activities",
    {
      schema: {
        params: OrganizationParamsSchema,
        querystring: ListActivitiesQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmActivities(
          request.adminContext!,
          request.params.organizationId,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/organizations/:organizationId/activities",
    {
      schema: {
        params: OrganizationParamsSchema,
        body: ActivityBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const activity = await createPartnershipCrmActivity(
          request.adminContext!,
          request.params.organizationId,
          request.body,
        );
        return reply.status(201).send({ activity });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/partnership-crm/professionals/:professionalId/activities",
    {
      schema: {
        params: ProfessionalParamsSchema,
        querystring: ListActivitiesQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await listPartnershipCrmProfessionalActivities(
          request.adminContext!,
          request.params.professionalId,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/professionals/:professionalId/activities",
    {
      schema: {
        params: ProfessionalParamsSchema,
        body: ActivityBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const activity = await createPartnershipCrmProfessionalActivity(
          request.adminContext!,
          request.params.professionalId,
          request.body,
        );
        return reply.status(201).send({ activity });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/import-preview",
    { schema: { body: ImportRowsBodySchema } },
    async (request, reply) => {
      try {
        const result = await previewPartnershipCrmImport(
          request.adminContext!,
          request.body.organizations,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/import",
    { schema: { body: ImportRowsBodySchema } },
    async (request, reply) => {
      try {
        const result = await importPartnershipCrmOrganizations(
          request.adminContext!,
          request.body.organizations,
        );
        return reply.status(201).send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/professionals/import-preview",
    { schema: { body: ProfessionalImportRowsBodySchema } },
    async (request, reply) => {
      try {
        const result = await previewPartnershipCrmProfessionalImport(
          request.adminContext!,
          request.body.professionals,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/professionals/import",
    { schema: { body: ProfessionalImportRowsBodySchema } },
    async (request, reply) => {
      try {
        const result = await importPartnershipCrmProfessionals(
          request.adminContext!,
          request.body.professionals,
        );
        return reply.status(201).send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/organizations/:organizationId/email",
    {
      schema: {
        params: OrganizationParamsSchema,
        body: EmailBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await sendPartnershipCrmOrganizationEmail(
          request.adminContext!,
          request.params.organizationId,
          request.body,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/partnership-crm/professionals/:professionalId/email",
    {
      schema: {
        params: ProfessionalParamsSchema,
        body: EmailBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await sendPartnershipCrmProfessionalEmail(
          request.adminContext!,
          request.params.professionalId,
          request.body,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );
}

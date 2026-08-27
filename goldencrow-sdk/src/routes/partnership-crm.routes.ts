import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  PARTNERSHIP_CRM_ACTIVITY_TYPES,
  PARTNERSHIP_CRM_STATUSES,
  createPartnershipCrmActivity,
  createPartnershipCrmOrganization,
  deletePartnershipCrmOrganization,
  getPartnershipCrmOrganization,
  importPartnershipCrmOrganizations,
  listPartnershipCrmActivities,
  listPartnershipCrmOrganizations,
  previewPartnershipCrmImport,
  sendPartnershipCrmOrganizationEmail,
  updatePartnershipCrmOrganization,
} from "../repositories/partnership-crm.repository.js";

const CrmStatusSchema = z.enum(PARTNERSHIP_CRM_STATUSES);
const CrmActivityTypeSchema = z.enum(PARTNERSHIP_CRM_ACTIVITY_TYPES);
const OptionalStringSchema = z.string().trim().max(2000).optional();
const OrganizationBodySchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().max(90).optional(),
  website: z.string().trim().max(500).optional(),
  country: z.string().trim().max(90).optional(),
  status: CrmStatusSchema.optional(),
  contactName: z.string().trim().max(140).optional(),
  contactEmail: z.string().trim().toLowerCase().max(180).optional(),
  contactLinkedIn: z.string().trim().max(500).optional(),
  lastContactAt: z.string().trim().datetime().nullable().optional(),
  notes: OptionalStringSchema,
});
const OrganizationImportRowSchema = OrganizationBodySchema.partial().extend({
  rowId: z.string().trim().max(80).optional(),
  duplicateAction: z.enum(["skip", "update", "import"]).optional(),
  duplicateOrganizationId: z.string().trim().max(160).optional(),
});
const OrganizationParamsSchema = z.object({
  organizationId: z.string().trim().min(1),
});
const ListOrganizationsQuerySchema = z.object({
  cursor: z.string().trim().datetime().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  query: z.string().trim().max(180).optional(),
  status: z.string().trim().max(40).optional(),
  category: z.string().trim().max(90).optional(),
  country: z.string().trim().max(90).optional(),
  emailState: z.enum(["has_email", "missing_email"]).optional(),
});
const ListActivitiesQuerySchema = z.object({
  cursor: z.string().trim().datetime().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
const ActivityBodySchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().max(4000).optional(),
  type: CrmActivityTypeSchema.optional(),
});
const ImportRowsBodySchema = z.object({
  organizations: z.array(OrganizationImportRowSchema).min(1).max(500),
});
const EmailBodySchema = z.object({
  to: z.string().trim().toLowerCase().email().max(180),
  subject: z.string().trim().min(1).max(180),
  text: z.string().trim().min(1).max(12000),
  templateKey: z.string().trim().max(80).optional(),
});

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

export async function partnershipCrmRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
    }
  });

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
}

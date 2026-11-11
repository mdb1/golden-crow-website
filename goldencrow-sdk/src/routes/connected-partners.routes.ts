import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PartnerIdSchema,
  PartnerInputSchema,
  PartnerLinkIdSchema,
} from "../contracts/connected-partners.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createPartner,
  deletePartners,
  getPartner,
  listPartners,
  listPartnerLinkOptions,
  updatePartner,
} from "../repositories/connected-partners.repository.js";

const ParamsSchema = z.object({ partnerId: PartnerIdSchema }).strict();
const ROUTE = "/admin/connected-partners";

export async function connectedPartnersRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();
  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }
    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
    }
  });
  f.setErrorHandler((error, _request, reply) => {
    if (isAdminRepositoryError(error)) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    return reply.send(error);
  });
  f.addHook("onSend", async (request, reply, payload) => {
    if (request.method === "GET") reply.header("Cache-Control", "private, no-store");
    return payload;
  });

  f.get(
    ROUTE,
    {
      schema: {
        querystring: z.object({ cursor: PartnerIdSchema.optional() }).strict(),
      },
    },
    async (request) =>
      listPartners(request.adminContext!, request.query.cursor),
  );

  f.get(
    `${ROUTE}/link-options`,
    {
      schema: {
        querystring: z.object({
          kind: z.enum(["organization", "individual", "app"]),
          cursor: PartnerLinkIdSchema.optional(),
          organizationId: PartnerLinkIdSchema.optional(),
          individualPublisherId: PartnerLinkIdSchema.optional(),
          id: PartnerLinkIdSchema.optional(),
        }).strict(),
      },
    },
    async (request) => listPartnerLinkOptions(request.adminContext!, request.query),
  );

  f.get(
    `${ROUTE}/:partnerId`,
    {
      schema: { params: ParamsSchema },
    },
    async (request) => ({
      partner: await getPartner(
        request.adminContext!,
        request.params.partnerId,
      ),
    }),
  );

  f.post(
    ROUTE,
    {
      schema: { body: PartnerInputSchema },
    },
    async (request, reply) =>
      reply.status(201).send({
        partner: await createPartner(request.adminContext!, request.body),
      }),
  );

  f.put(
    `${ROUTE}/:partnerId`,
    {
      schema: { params: ParamsSchema, body: PartnerInputSchema },
    },
    async (request) => ({
      partner: await updatePartner(
        request.adminContext!,
        request.params.partnerId,
        request.body,
      ),
    }),
  );

  f.post(
    `${ROUTE}/delete`,
    {
      schema: {
        body: z
          .object({ ids: z.array(PartnerIdSchema).min(1).max(500) })
          .strict(),
      },
    },
    async (request) => deletePartners(request.adminContext!, request.body.ids),
  );
}

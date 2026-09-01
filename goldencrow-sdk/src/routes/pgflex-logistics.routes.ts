import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  PGFLEX_LOGISTICS_LIST_SCOPES,
  PGFLEX_LOGISTICS_SHIPMENT_TYPES,
  PGFLEX_LOGISTICS_STATUSES,
  createPGFlexLogisticsItemForContext,
  deletePGFlexLogisticsItemForContext,
  getPGFlexLogisticsItemForContext,
  listPGFlexLogisticsForContext,
  replacePGFlexLogisticsItemForContext,
  updatePGFlexLogisticsItemForContext,
} from "../repositories/pgflex-logistics.repository.js";

const PGFlexLogisticsListScopeSchema = z.enum(PGFLEX_LOGISTICS_LIST_SCOPES);
const PGFlexLogisticsShipmentTypeSchema = z.enum(
  PGFLEX_LOGISTICS_SHIPMENT_TYPES,
);
const PGFlexLogisticsStatusSchema = z.enum(PGFLEX_LOGISTICS_STATUSES);
const OptionalStringSchema = z.string().trim().max(2000).optional();
const PGFlexLogisticsBodySchema = z.object({
  identifier: z.string().trim().min(1).max(160),
  shipmentType: PGFlexLogisticsShipmentTypeSchema.optional(),
  description: OptionalStringSchema,
  linked_codes: z.string().trim().max(600).optional(),
  dispatcherId: z.string().trim().max(180).optional(),
  dispatcherFirebaseId: z.string().trim().max(180).optional(),
  dispatcherEmail: z.string().trim().email().max(180).optional(),
  dispatched_id: z.string().trim().max(180).optional(),
  origin: z.string().trim().min(1).max(240),
  destination: z.string().trim().max(240).optional(),
  pickupTime: z.string().trim().max(120).optional(),
  status: PGFlexLogisticsStatusSchema.optional(),
});
const PGFlexLogisticsPatchBodySchema =
  PGFlexLogisticsBodySchema.partial().refine(
    (payload) => Object.keys(payload).length > 0,
    "At least one PGFlex logistics field is required.",
  );
const PGFlexLogisticsParamsSchema = z.object({
  itemId: z.string().trim().min(1),
});
const PGFlexLogisticsListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  scope: PGFlexLogisticsListScopeSchema.optional(),
});

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

export async function pgflexLogisticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    if (
      request.adminContext.role !== "full_admin" &&
      request.adminContext.role !== "transport_dispatcher"
    ) {
      return reply
        .status(403)
        .send({ error: "PGFlex logistics access required" });
    }
  });

  f.get(
    "/pgflex/logistics",
    { schema: { querystring: PGFlexLogisticsListQuerySchema } },
    async (request, reply) => {
      try {
        return reply.send(
          await listPGFlexLogisticsForContext(
            request.adminContext!,
            request.query,
          ),
        );
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/pgflex/logistics",
    { schema: { body: PGFlexLogisticsBodySchema } },
    async (request, reply) => {
      try {
        const item = await createPGFlexLogisticsItemForContext(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ item });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/pgflex/logistics/:itemId",
    { schema: { params: PGFlexLogisticsParamsSchema } },
    async (request, reply) => {
      try {
        const item = await getPGFlexLogisticsItemForContext(
          request.adminContext!,
          request.params.itemId,
        );
        return reply.send({ item });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/pgflex/logistics/:itemId",
    {
      schema: {
        params: PGFlexLogisticsParamsSchema,
        body: PGFlexLogisticsBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const item = await replacePGFlexLogisticsItemForContext(
          request.adminContext!,
          request.params.itemId,
          request.body,
        );
        return reply.send({ item });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.patch(
    "/pgflex/logistics/:itemId",
    {
      schema: {
        params: PGFlexLogisticsParamsSchema,
        body: PGFlexLogisticsPatchBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const item = await updatePGFlexLogisticsItemForContext(
          request.adminContext!,
          request.params.itemId,
          request.body,
        );
        return reply.send({ item });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/pgflex/logistics/:itemId",
    { schema: { params: PGFlexLogisticsParamsSchema } },
    async (request, reply) => {
      try {
        return reply.send(
          await deletePGFlexLogisticsItemForContext(
            request.adminContext!,
            request.params.itemId,
          ),
        );
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );
}

import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  SUPPORT_SERVICE_OFFER_STATUSES,
  SUPPORT_SERVICE_STAGES,
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
  createSupportServiceOffer,
  createSupportServiceTransaction,
  deleteSupportServiceOffer,
  deleteSupportServiceTransaction,
  getSupportServiceOffer,
  getSupportServiceTransaction,
  listSupportServiceOffers,
  listSupportServiceTransactions,
  updateSupportServiceOffer,
  updateSupportServiceTransaction,
} from "../repositories/support-services.repository.js";

const ServiceStageSchema = z.enum(SUPPORT_SERVICE_STAGES);
const OfferStatusSchema = z.enum(SUPPORT_SERVICE_OFFER_STATUSES);
const TransactionStatusSchema = z.enum(SUPPORT_SERVICE_TRANSACTION_STATUSES);
const ServiceIdSchema = z
  .string()
  .trim()
  .regex(/^pgs_[a-z0-9_]+$/, "Use a pgs_* service ID.");
const ProviderIdSchema = z
  .string()
  .trim()
  .regex(/^pgp_[a-z0-9_]+$/, "Use a pgp_* provider ID.");
const RequestIdSchema = z
  .string()
  .trim()
  .regex(/^pgr_[a-z0-9_]+$/, "Use a pgr_* request ID.");
const JsonObjectSchema = z.record(z.string(), z.unknown());
const JsonObjectArraySchema = z.array(JsonObjectSchema).max(50);
const ObjectRefSchema = z.object({
  objectId: z.string().trim().min(1).max(160),
  revision: z.coerce.number().int().positive(),
});
const TransactionSlotSchema = z.object({
  role: z.string().trim().min(1).max(120),
  objectRef: ObjectRefSchema,
});
const ListQuerySchema = z.object({
  cursor: z.string().trim().datetime().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  query: z.string().trim().max(180).optional(),
  status: z.string().trim().max(40).optional(),
});
const ListOffersQuerySchema = ListQuerySchema.extend({
  stage: z.string().trim().max(40).optional(),
});
const ListTransactionsQuerySchema = ListQuerySchema.extend({
  serviceId: z.string().trim().max(160).optional(),
});
const OfferBodySchema = z.object({
  serviceId: ServiceIdSchema,
  serviceVersion: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(180),
  providerId: ProviderIdSchema,
  stages: z.array(ServiceStageSchema).min(1).max(3).optional(),
  status: OfferStatusSchema.optional(),
  availability: z.string().trim().max(120).optional(),
  description: z.string().trim().max(4000).optional(),
  shortContract: z.string().trim().max(500).optional(),
  providerWork: z.string().trim().max(4000).optional(),
  formShape: JsonObjectSchema.optional(),
  inputSlots: JsonObjectArraySchema.optional(),
  outputSlots: JsonObjectArraySchema.optional(),
  acceptedConditions: z.array(z.string().trim().max(1000)).max(30).optional(),
  scopeRules: z.array(z.string().trim().max(1000)).max(30).optional(),
  commercialTerms: JsonObjectSchema.optional(),
});
const TransactionBodySchema = z.object({
  requestId: RequestIdSchema,
  serviceId: ServiceIdSchema,
  serviceVersion: z.string().trim().min(1).max(40).optional(),
  status: TransactionStatusSchema.optional(),
  requesterEmail: z.string().trim().toLowerCase().max(180).optional(),
  subjectId: z.string().trim().max(160).optional(),
  formRef: ObjectRefSchema,
  inputs: z.array(TransactionSlotSchema).max(50).optional(),
  outputs: z.array(TransactionSlotSchema).max(50).optional(),
  notes: z.string().trim().max(4000).optional(),
});
const OfferParamsSchema = z.object({
  offerId: z.string().trim().min(1),
});
const TransactionParamsSchema = z.object({
  transactionId: z.string().trim().min(1),
});

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

export async function supportServicesRoutes(
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

  f.get(
    "/admin/support-services/offers",
    { schema: { querystring: ListOffersQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listSupportServiceOffers(
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
    "/admin/support-services/offers",
    { schema: { body: OfferBodySchema } },
    async (request, reply) => {
      try {
        const offer = await createSupportServiceOffer(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ offer });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/offers/:offerId",
    { schema: { params: OfferParamsSchema } },
    async (request, reply) => {
      try {
        const offer = await getSupportServiceOffer(
          request.adminContext!,
          request.params.offerId,
        );
        return reply.send({ offer });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/support-services/offers/:offerId",
    {
      schema: {
        params: OfferParamsSchema,
        body: OfferBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const offer = await updateSupportServiceOffer(
          request.adminContext!,
          request.params.offerId,
          request.body,
        );
        return reply.send({ offer });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/support-services/offers/:offerId",
    { schema: { params: OfferParamsSchema } },
    async (request, reply) => {
      try {
        await deleteSupportServiceOffer(
          request.adminContext!,
          request.params.offerId,
        );
        return reply.send({
          deleted: true,
          offerId: request.params.offerId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/transactions",
    { schema: { querystring: ListTransactionsQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listSupportServiceTransactions(
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
    "/admin/support-services/transactions",
    { schema: { body: TransactionBodySchema } },
    async (request, reply) => {
      try {
        const transaction = await createSupportServiceTransaction(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/transactions/:transactionId",
    { schema: { params: TransactionParamsSchema } },
    async (request, reply) => {
      try {
        const transaction = await getSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
        );
        return reply.send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/support-services/transactions/:transactionId",
    {
      schema: {
        params: TransactionParamsSchema,
        body: TransactionBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const transaction = await updateSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
          request.body,
        );
        return reply.send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/support-services/transactions/:transactionId",
    { schema: { params: TransactionParamsSchema } },
    async (request, reply) => {
      try {
        await deleteSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
        );
        return reply.send({
          deleted: true,
          transactionId: request.params.transactionId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );
}

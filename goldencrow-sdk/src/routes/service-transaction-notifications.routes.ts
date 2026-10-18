import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { notifySupportServiceTransactionOwner } from "../repositories/support-services.repository.js";
import { NATIVE_SERVICE_TRANSACTION_NOTIFICATION_ID_PATTERN } from "../lib/service-transaction-owner-notification-contract.js";

const NotificationParamsSchema = z
  .object({
    transactionId: z
      .string()
      .trim()
      .regex(
        NATIVE_SERVICE_TRANSACTION_NOTIFICATION_ID_PATTERN,
        "Use a canonical native-app service transaction ID.",
      ),
  })
  .strict();

const NotificationBodySchema = z
  .object({
    requestedByUserEmail: z.string().trim().toLowerCase().email().max(320),
  })
  .strict();

export async function serviceTransactionNotificationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/service-transactions/:transactionId/notify-owner",
    {
      schema: {
        params: NotificationParamsSchema,
        body: NotificationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await notifySupportServiceTransactionOwner(
          request.params.transactionId,
          request.body.requestedByUserEmail,
        );
        return reply
          .status(result.status === "in_progress" ? 202 : 200)
          .send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        request.log.error(
          { err: error },
          "Service transaction owner notification failed unexpectedly.",
        );
        return reply.status(500).send({
          error: "Service transaction owner notification failed.",
        });
      }
    },
  );
}

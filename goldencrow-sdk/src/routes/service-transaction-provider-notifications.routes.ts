import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  SERVICE_TRANSACTION_PROVIDER_NOTIFICATION_MAX_EMAIL_LENGTH,
  SERVICE_TRANSACTION_PROVIDER_NOTIFICATION_MAX_NAME_LENGTH,
} from "../lib/service-transaction-provider-notification-contract.js";
import { sendServiceTransactionProviderBestEffortEmail } from "../lib/service-transaction-provider-best-effort-email.js";
import { requireServiceNotificationAccessToken } from "../lib/service-notification-route-auth.js";

const ProviderNotificationBodySchema = z
  .object({
    providerContactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(SERVICE_TRANSACTION_PROVIDER_NOTIFICATION_MAX_EMAIL_LENGTH),
    requestedByUserEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(SERVICE_TRANSACTION_PROVIDER_NOTIFICATION_MAX_EMAIL_LENGTH),
    serviceName: z
      .string()
      .trim()
      .min(1)
      .max(SERVICE_TRANSACTION_PROVIDER_NOTIFICATION_MAX_NAME_LENGTH),
  })
  .strict();

export async function serviceTransactionProviderNotificationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // The native app already has these values when it creates the transaction.
  // Trusting that bounded payload keeps this best-effort notification at zero
  // Firestore reads and writes. Copy and links remain server-owned.
  f.post(
    "/service-transactions/notify-provider",
    {
      onRequest: requireServiceNotificationAccessToken,
      schema: {
        body: ProviderNotificationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        await sendServiceTransactionProviderBestEffortEmail({
          providerContactEmail: request.body.providerContactEmail,
          requestedByUserEmail: request.body.requestedByUserEmail,
          serviceName: request.body.serviceName,
        });

        return reply.status(200).send({ status: "sent" });
      } catch (error) {
        request.log.error(
          { err: error },
          "Service transaction provider notification email failed unexpectedly.",
        );
        return reply.status(502).send({
          error: "Provider notification email could not be sent.",
        });
      }
    },
  );
}

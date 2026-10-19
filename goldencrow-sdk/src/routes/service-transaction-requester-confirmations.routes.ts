import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_EMAIL_LENGTH,
  SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_ITEMS,
  SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_NAME_LENGTH,
} from "../lib/service-transaction-requester-confirmation-contract.js";
import { sendServiceTransactionRequesterConfirmationEmail } from "../lib/service-transaction-requester-confirmation-email.js";
import { requireServiceNotificationAccessToken } from "../lib/service-notification-route-auth.js";

const RequesterConfirmationItemSchema = z
  .object({
    serviceName: z
      .string()
      .trim()
      .min(1)
      .max(SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_NAME_LENGTH),
    providerName: z
      .string()
      .trim()
      .min(1)
      .max(SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_NAME_LENGTH),
  })
  .strict();

const RequesterConfirmationBodySchema = z
  .object({
    requestedByUserEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_EMAIL_LENGTH),
    items: z
      .array(RequesterConfirmationItemSchema)
      .min(1)
      .max(SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_ITEMS),
  })
  .strict();

export async function serviceTransactionRequesterConfirmationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // This native-app command deliberately trusts the just-committed batch in
  // the request body so it can remain a zero-Firestore-operation path. Keep
  // the schema strict and bounded: callers may choose only the recipient and
  // row labels; all actual message copy and links stay server-owned.
  f.post(
    "/service-transactions/notify-requester",
    {
      onRequest: requireServiceNotificationAccessToken,
      schema: {
        body: RequesterConfirmationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        await sendServiceTransactionRequesterConfirmationEmail({
          requesterEmail: request.body.requestedByUserEmail,
          items: request.body.items,
        });

        return reply.status(200).send({
          status: "sent",
          itemCount: request.body.items.length,
        });
      } catch (error) {
        request.log.error(
          { err: error },
          "Service transaction requester confirmation email failed unexpectedly.",
        );
        return reply.status(502).send({
          error: "Requester confirmation email could not be sent.",
        });
      }
    },
  );
}

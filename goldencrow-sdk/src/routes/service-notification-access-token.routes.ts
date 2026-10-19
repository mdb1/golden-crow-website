import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isServiceNotificationTokenError } from "../lib/service-notification-access-token.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { exchangeServiceNotificationClientCredentials } from "../repositories/reporting-tokens.repository.js";

const ServiceNotificationTokenRequestSchema = z
  .object({
    grant_type: z.literal("client_credentials"),
    client_id: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^gci_live_[A-Za-z0-9_-]+$/),
    client_secret: z.string().trim().min(1).max(512),
  })
  .strict();

export async function serviceNotificationAccessTokenRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/service-transactions/notification-token",
    {
      schema: {
        body: ServiceNotificationTokenRequestSchema,
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");

      try {
        const result = await exchangeServiceNotificationClientCredentials(
          request.body,
        );
        return reply.status(200).send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (isServiceNotificationTokenError(error)) {
          request.log.error(
            { err: error },
            "Service notification access-token issuance failed.",
          );
          return reply.status(error.statusCode).send({
            error:
              error.statusCode === 500
                ? "Service notification authentication is unavailable."
                : error.message,
          });
        }

        throw error;
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { exchangePublisherAccessCode } from "../repositories/publisher-access-code.repository.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";

export async function publisherAccessCodeRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();
  f.post(
    "/publisher-portal/access-code",
    {
      schema: {
        body: z
          .object({
            email: z.string().trim().toLowerCase().email().max(254),
            accessKey: z.string().min(1).max(2048),
          })
          .strict(),
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return reply.send(
          await exchangePublisherAccessCode(
            request.body.email,
            request.body.accessKey,
          ),
        );
      } catch (error) {
        return reply
          .status(isAdminRepositoryError(error) ? error.statusCode : 503)
          .send({
            error: isAdminRepositoryError(error)
              ? error.message
              : "Publisher access is temporarily unavailable. Try again.",
          });
      }
    },
  );
}

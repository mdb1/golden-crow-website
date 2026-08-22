import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { createReportingIntegrationClient } from "../repositories/reporting-tokens.repository.js";

const CreateReportingIntegrationClientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    quotaPerMinute: z.number().int().positive().optional(),
  })
  .strict();

export async function reportingIntegrationClientRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/reporting/integration-clients",
    {
      schema: {
        body: CreateReportingIntegrationClientSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const client = await createReportingIntegrationClient(
          request.adminContext,
          request.body,
        );
        return reply.status(201).send(client);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );
}

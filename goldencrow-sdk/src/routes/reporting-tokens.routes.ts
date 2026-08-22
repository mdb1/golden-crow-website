import { FastifyInstance } from "fastify";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { issueReportingAccessToken } from "../repositories/reporting-tokens.repository.js";

export async function reportingTokenRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post("/reporting/access-tokens", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    try {
      const token = await issueReportingAccessToken(request.adminContext);
      return reply.status(201).send(token);
    } catch (error) {
      if (isAdminRepositoryError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      throw error;
    }
  });
}

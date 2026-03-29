import { FastifyInstance } from "fastify";
import { getDashboardStats } from "../repositories/stats.repository.js";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";

export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/stats", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }

    const stats = await getDashboardStats();
    return reply.send(stats);
  });
}

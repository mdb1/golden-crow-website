import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { getUserProgress } from "../repositories/progress.repository.js";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";

export async function progressRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  // GET /users/:userId/progress — fetch learning progress for a user
  f.get(
    "/users/:userId/progress",
    {
      schema: {
        params: z.object({
          userId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const progress = await getUserProgress(request.params.userId);
      if (!progress) {
        return reply.status(404).send({ error: "Progress not found" });
      }
      return reply.send({ progress });
    }
  );
}

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { listGymDocuments } from "../repositories/gym-documents.repository.js";

export async function gymDocumentsRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/members/:uid/documents",
    {
      schema: {
        params: z.object({ uid: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const documents = await listGymDocuments(request.params.uid);
        return reply.send({ documents });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );
}

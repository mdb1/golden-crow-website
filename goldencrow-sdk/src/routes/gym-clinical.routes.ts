import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  getClinicalHistory,
  listClinicalHistories,
} from "../repositories/gym-clinical.repository.js";

export async function gymClinicalRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/members/:uid/clinical-histories",
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
        const histories = await listClinicalHistories(request.params.uid);
        return reply.send({ histories });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.get(
    "/members/:uid/clinical-histories/:histId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          histId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const history = await getClinicalHistory(
          request.params.uid,
          request.params.histId
        );
        return reply.send({ history });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );
}

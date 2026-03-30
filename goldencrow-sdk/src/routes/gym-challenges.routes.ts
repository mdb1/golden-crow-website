import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createChallenge,
  deleteChallenge,
  getChallenge,
  listChallenges,
  updateChallenge,
} from "../repositories/gym-challenges.repository.js";

const ChallengeTypeSchema = z.enum([
  "workoutCount",
  "attendanceStreak",
  "nutritionCompliance",
]);

export async function gymChallengesRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/challenges", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    const challenges = await listChallenges();
    return reply.send({ challenges });
  });

  f.post(
    "/challenges",
    {
      schema: {
        body: z.object({
          gymId: z.string().optional(),
          name: z.string().min(1),
          description: z.string().min(1),
          targetValue: z.number().int().min(1),
          deadline: z.string().min(1),
          type: ChallengeTypeSchema,
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const challenge = await createChallenge(request.body);
        return reply.send({ challenge });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.get(
    "/challenges/:id",
    {
      schema: {
        params: z.object({
          id: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const challenge = await getChallenge(request.params.id);
        return reply.send({ challenge });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.put(
    "/challenges/:id",
    {
      schema: {
        params: z.object({
          id: z.string().min(1),
        }),
        body: z.object({
          gymId: z.string().optional(),
          name: z.string().min(1).optional(),
          description: z.string().min(1).optional(),
          targetValue: z.number().int().min(1).optional(),
          deadline: z.string().min(1).optional(),
          type: ChallengeTypeSchema.optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const challenge = await updateChallenge(request.params.id, request.body);
        return reply.send({ challenge });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.delete(
    "/challenges/:id",
    {
      schema: {
        params: z.object({
          id: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteChallenge(request.params.id);
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );
}

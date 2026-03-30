import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createAchievement,
  deleteAchievement,
  getAchievement,
  listAchievements,
  updateAchievement,
} from "../repositories/gym-achievements.repository.js";

const TriggerTypeSchema = z.enum([
  "workoutCount",
  "attendanceStreak",
  "evaluationMilestone",
  "profileComplete",
]);

export async function gymAchievementsRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/achievements", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    const achievements = await listAchievements();
    return reply.send({ achievements });
  });

  f.post(
    "/achievements",
    {
      schema: {
        body: z.object({
          name: z.string().min(1),
          description: z.string().min(1),
          iconName: z.string().optional().default(""),
          xpReward: z.number().int().min(0),
          triggerType: TriggerTypeSchema,
          triggerThreshold: z.number().int().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const achievement = await createAchievement(request.body);
        return reply.send({ achievement });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.get(
    "/achievements/:id",
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
        const achievement = await getAchievement(request.params.id);
        return reply.send({ achievement });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.put(
    "/achievements/:id",
    {
      schema: {
        params: z.object({
          id: z.string().min(1),
        }),
        body: z.object({
          name: z.string().min(1).optional(),
          description: z.string().min(1).optional(),
          iconName: z.string().min(1).optional(),
          xpReward: z.number().int().min(0).optional(),
          triggerType: TriggerTypeSchema.optional(),
          triggerThreshold: z.number().int().min(1).optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const achievement = await updateAchievement(request.params.id, request.body);
        return reply.send({ achievement });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.delete(
    "/achievements/:id",
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
        const result = await deleteAchievement(request.params.id);
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

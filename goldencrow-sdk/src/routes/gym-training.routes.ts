import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  listTrainingPlans,
  getTrainingPlan,
  createTrainingPlan,
  updateTrainingPlan,
  deleteTrainingPlan,
} from "../repositories/gym-training.repository.js";
import type { TrainingPlanWeekDay } from "../types/gym.types.js";

const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetSets: z.number().int(),
  targetReps: z.number().int(),
  targetWeightKg: z.number().optional(),
  restSeconds: z.number().int(),
  instructions: z.string().optional(),
  videoURL: z.string().optional(),
  orderIndex: z.number().int(),
});

const WeekDaySchema = z.object({
  id: z.string(),
  label: z.string(),
  exercises: z.array(ExerciseSchema),
});

export async function gymTrainingRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /gym/members/:uid/training-plans
  f.get(
    "/members/:uid/training-plans",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const plans = await listTrainingPlans(request.params.uid);
        return reply.send({ plans });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // POST /gym/members/:uid/training-plans
  f.post(
    "/members/:uid/training-plans",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
        }),
        body: z.object({
          trainerName: z.string().min(1),
          name: z.string().min(1),
          startDate: z.string().min(1),
          endDate: z.string().optional(),
          days: z.array(WeekDaySchema),
          gymId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const plan = await createTrainingPlan(
          request.params.uid,
          request.body as Parameters<typeof createTrainingPlan>[1]
        );
        return reply.status(201).send({ plan });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // GET /gym/members/:uid/training-plans/:planId
  f.get(
    "/members/:uid/training-plans/:planId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          planId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const plan = await getTrainingPlan(
          request.params.uid,
          request.params.planId
        );
        return reply.send({ plan });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // PUT /gym/members/:uid/training-plans/:planId
  f.put(
    "/members/:uid/training-plans/:planId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          planId: z.string().min(1),
        }),
        body: z.object({
          trainerName: z.string().optional(),
          name: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          days: z.array(WeekDaySchema).optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const plan = await updateTrainingPlan(
          request.params.uid,
          request.params.planId,
          request.body as { trainerName?: string; name?: string; startDate?: string; endDate?: string; days?: TrainingPlanWeekDay[] }
        );
        return reply.send({ plan });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // DELETE /gym/members/:uid/training-plans/:planId
  f.delete(
    "/members/:uid/training-plans/:planId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          planId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteTrainingPlan(
          request.params.uid,
          request.params.planId
        );
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

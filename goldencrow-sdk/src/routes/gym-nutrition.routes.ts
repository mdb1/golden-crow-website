import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createNutritionPlan,
  deleteNutritionPlan,
  getNutritionPlan,
  listNutritionPlans,
  updateNutritionPlan,
} from "../repositories/gym-nutrition.repository.js";

const FoodSchema = z.object({
  id: z.string(),
  name: z.string(),
  portionDescription: z.string(),
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

const MealSchema = z.object({
  id: z.string(),
  name: z.string(),
  orderIndex: z.number().int(),
  foods: z.array(FoodSchema),
});

const DaySchema = z.object({
  id: z.string(),
  label: z.string(),
  meals: z.array(MealSchema),
});

export async function gymNutritionRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/members/:uid/nutrition-plans",
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
        const plans = await listNutritionPlans(request.params.uid);
        return reply.send({ plans });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.post(
    "/members/:uid/nutrition-plans",
    {
      schema: {
        params: z.object({ uid: z.string().min(1) }),
        body: z.object({
          nutritionistName: z.string().min(1),
          name: z.string().min(1),
          startDate: z.string().min(1),
          endDate: z.string().optional(),
          days: z.array(DaySchema),
          gymId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const plan = await createNutritionPlan(request.params.uid, request.body);
        return reply.send({ plan });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.get(
    "/members/:uid/nutrition-plans/:planId",
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
        const plan = await getNutritionPlan(request.params.uid, request.params.planId);
        return reply.send({ plan });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.put(
    "/members/:uid/nutrition-plans/:planId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          planId: z.string().min(1),
        }),
        body: z.object({
          nutritionistName: z.string().optional(),
          name: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          days: z.array(DaySchema).optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const plan = await updateNutritionPlan(
          request.params.uid,
          request.params.planId,
          request.body
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

  f.delete(
    "/members/:uid/nutrition-plans/:planId",
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
        const result = await deleteNutritionPlan(request.params.uid, request.params.planId);
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

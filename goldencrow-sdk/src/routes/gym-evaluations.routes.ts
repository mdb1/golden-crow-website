import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  listEvaluations,
  getEvaluation,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
} from "../repositories/gym-evaluations.repository.js";
import type {
  StrengthAssessment,
  MobilityAssessment,
  AnthropometryAssessment,
  PainAssessment,
} from "../types/gym.types.js";

const StrengthSchema = z.object({
  exerciseName: z.string(),
  weightKg: z.number(),
  reps: z.number().int(),
  notes: z.string().optional(),
});

const MobilitySchema = z.object({
  jointName: z.string(),
  rangeOfMotionDegrees: z.number(),
  side: z.string().optional(),
  notes: z.string().optional(),
});

const AnthroSchema = z.object({
  weightKg: z.number().optional(),
  heightCm: z.number().optional(),
  bodyFatPercent: z.number().optional(),
  bmi: z.number().optional(),
  waistCm: z.number().optional(),
  hipCm: z.number().optional(),
  chestCm: z.number().optional(),
  armCm: z.number().optional(),
  thighCm: z.number().optional(),
});

const PainSchema = z.object({
  bodyArea: z.string(),
  painScale: z.number().int().min(0).max(10),
  notes: z.string().optional(),
});

export async function gymEvaluationsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /gym/members/:uid/evaluations
  f.get(
    "/members/:uid/evaluations",
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
        const evaluations = await listEvaluations(request.params.uid);
        return reply.send({ evaluations });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // POST /gym/members/:uid/evaluations
  f.post(
    "/members/:uid/evaluations",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
        }),
        body: z.object({
          evaluatorName: z.string().min(1),
          date: z.string().min(1),
          clinicalHistoryId: z.string().optional(),
          strength: z.array(StrengthSchema).optional(),
          mobility: z.array(MobilitySchema).optional(),
          anthropometry: AnthroSchema.optional(),
          pain: z.array(PainSchema).optional(),
          gymId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const evaluation = await createEvaluation(
          request.params.uid,
          request.body as Parameters<typeof createEvaluation>[1]
        );
        return reply.status(201).send({ evaluation });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // GET /gym/members/:uid/evaluations/:evalId
  f.get(
    "/members/:uid/evaluations/:evalId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          evalId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const evaluation = await getEvaluation(
          request.params.uid,
          request.params.evalId
        );
        return reply.send({ evaluation });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // PUT /gym/members/:uid/evaluations/:evalId
  f.put(
    "/members/:uid/evaluations/:evalId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          evalId: z.string().min(1),
        }),
        body: z.object({
          evaluatorName: z.string().optional(),
          date: z.string().optional(),
          clinicalHistoryId: z.string().optional(),
          strength: z.array(StrengthSchema).optional(),
          mobility: z.array(MobilitySchema).optional(),
          anthropometry: AnthroSchema.optional(),
          pain: z.array(PainSchema).optional(),
          gymId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const evaluation = await updateEvaluation(
          request.params.uid,
          request.params.evalId,
          request.body as Partial<{ evaluatorName: string; date: string; clinicalHistoryId: string; strength: StrengthAssessment[]; mobility: MobilityAssessment[]; anthropometry: AnthropometryAssessment; pain: PainAssessment[]; gymId: string }>
        );
        return reply.send({ evaluation });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // DELETE /gym/members/:uid/evaluations/:evalId
  f.delete(
    "/members/:uid/evaluations/:evalId",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
          evalId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteEvaluation(
          request.params.uid,
          request.params.evalId
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

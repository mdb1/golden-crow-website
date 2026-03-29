import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  listUsers,
  getUserById,
  getUserVerificationSummaries,
  isVerificationEmailError,
  sendUserVerificationEmail,
  updateUserProfile,
  deleteUserCascade,
} from "../repositories/users.repository.js";

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  // GET /users — list all users with optional pagination
  f.get(
    "/users",
    {
      schema: {
        querystring: z.object({
          pageToken: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const result = await listUsers(request.query.pageToken);
      return reply.send(result);
    }
  );

  // GET /users/:userId — fetch a single user by UID
  f.get(
    "/users/:userId",
    {
      schema: {
        params: z.object({
          userId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const user = await getUserById(request.params.userId);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }
      return reply.send({ user });
    }
  );

  f.post(
    "/users/verification-summaries",
    {
      schema: {
        body: z.object({
          ids: z.array(z.string().min(1)).max(100),
        }),
      },
    },
    async (request, reply) => {
      const summaries = await getUserVerificationSummaries(request.body.ids);
      return reply.send({ summaries });
    }
  );

  f.post(
    "/users/:userId/send-email-verification",
    {
      schema: {
        params: z.object({
          userId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      try {
        const result = await sendUserVerificationEmail(request.params.userId);
        return reply.send(result);
      } catch (error) {
        if (isVerificationEmailError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  // PUT /users/:userId — update Firestore profile fields
  f.put(
    "/users/:userId",
    {
      schema: {
        params: z.object({
          userId: z.string().min(1),
        }),
        body: z.object({
          displayName: z.string().min(1).max(100).optional(),
          age: z.union([z.number().int().min(0).max(150), z.string().max(50)]).optional(),
          sex: z.string().max(50).optional(),
          country: z.string().max(100).optional(),
          conditions: z.array(z.string()).optional(),
          iconName: z.string().optional(),
          iconColorHex: z.string().optional(),
          hiddenFields: z.array(z.string()).optional(),
          patientID: z.string().optional(),
          onboardingCompleted: z.boolean().optional(),
          visibilitySettings: z.record(z.string(), z.boolean()).optional(),
          lastReportDate: z.string().max(100).optional(),
          profileImage: z.string().url().or(z.literal("")).optional(),
          photoURL: z.string().url().or(z.literal("")).optional(),
          emailVerified: z.boolean().optional(),
          disabled: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const result = await updateUserProfile(request.params.userId, request.body);
      if (!result) {
        return reply.status(404).send({ error: "User not found" });
      }
      return reply.send({ user: result });
    }
  );

  // DELETE /users/:userId — cascade-delete user and all associated data
  f.delete(
    "/users/:userId",
    {
      schema: {
        params: z.object({
          userId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const result = await deleteUserCascade(request.params.userId);
      return reply.send(result);
    }
  );
}

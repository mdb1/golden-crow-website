import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createGymMember,
  deleteGymMember,
  getGymMember,
  listGymMembers,
  updateGymMember,
} from "../repositories/gym-members.repository.js";

export async function gymMembersRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/members",
    {
      schema: {
        querystring: z.object({
          query: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      const members = await listGymMembers(request.query.query);
      return reply.send({ members });
    }
  );

  f.post(
    "/members",
    {
      schema: {
        body: z.object({
          uid: z.string().min(1),
          displayName: z.string().min(1),
          photoURL: z.string().optional(),
          age: z.string().optional(),
          gender: z.string().optional(),
          goals: z.array(z.string()).optional(),
          gymId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const member = await createGymMember(request.body);
        return reply.send({ member });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/members/:uid",
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
        const member = await getGymMember(request.params.uid);
        return reply.send({ member });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.put(
    "/members/:uid",
    {
      schema: {
        params: z.object({
          uid: z.string().min(1),
        }),
        body: z.object({
          displayName: z.string().optional(),
          photoURL: z.string().optional(),
          age: z.string().optional(),
          gender: z.string().optional(),
          goals: z.array(z.string()).optional(),
          gymId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const member = await updateGymMember(request.params.uid, request.body);
        return reply.send({ member });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.delete(
    "/members/:uid",
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
        const result = await deleteGymMember(request.params.uid);
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

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  getUserRoleForContext,
  listUserRolesForContext,
  upsertUserRoleForContext,
} from "../repositories/roles.repository.js";

const RoleSchema = z.enum([
  "full_admin",
  "organization_publisher",
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
  "patient",
]);

export async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/roles", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    const roles = await listUserRolesForContext(request.adminContext);
    return reply.send({ roles });
  });

  f.get(
    "/roles/:emailKey",
    {
      schema: {
        params: z.object({
          emailKey: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      const role = await getUserRoleForContext(request.adminContext, request.params.emailKey);
      if (!role) {
        return reply.status(404).send({ error: "Role record not found" });
      }

      return reply.send({ role });
    }
  );

  f.put(
    "/roles/:emailKey",
    {
      schema: {
        params: z.object({
          emailKey: z.string().min(1),
        }),
        body: z.object({
          role: RoleSchema,
          organizationId: z.string().optional(),
          institutionId: z.string().optional(),
          doctorId: z.string().optional(),
          patientId: z.string().optional(),
          isActive: z.boolean(),
          displayName: z.string().optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const role = await upsertUserRoleForContext(
          request.adminContext,
          request.params.emailKey,
          request.body
        );

        return reply.send({ role });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );
}

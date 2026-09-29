import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  deleteRoleAccountStepForContext,
  deleteRoleUserForContext,
  getUserRoleForContext,
  listOrphanedOwnerArtifactsForContext,
  listTransportDispatchersForContext,
  listUserRolesForContext,
  upsertUserRoleForContext,
  ROLE_ACCOUNT_DELETION_STEPS,
} from "../repositories/roles.repository.js";

const RoleSchema = z.enum([
  "full_admin",
  "2pq_admin",
  "organization_publisher",
  "individual_publisher",
  "transport_dispatcher",
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
  "patient",
]);

const ROLE_ACCOUNT_DELETION_ROUTE_STEPS = [
  ...ROLE_ACCOUNT_DELETION_STEPS,
  "stored_files",
] as const;

function sendRoleDeletionStepError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) {
  const baseError =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unexpected error");
  const statusCode = isAdminRepositoryError(error) ? error.statusCode : 500;
  const requestContext = {
    id: request.id,
    method: request.method,
    url: request.url,
    params: request.params,
  };

  if (statusCode === 500) {
    request.log.error(
      { err: error, request: requestContext },
      "Role account cleanup step failed",
    );
  }

  return reply.status(statusCode).send({
    error:
      statusCode === 500
        ? "Role account cleanup step failed."
        : baseError.message,
    message: baseError.message,
    errorName: baseError.name || "Error",
    statusCode,
    hint:
      statusCode === 500
        ? "Use the cleanup stage log, request id, and server trace to diagnose the failed deletion request."
        : "The cleanup request was rejected by a role validation or permission rule.",
    request: requestContext,
    stack: statusCode === 500 ? baseError.stack : undefined,
  });
}

export async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/roles", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    const roles = await listUserRolesForContext(request.adminContext);
    return reply.send({ roles });
  });

  f.get("/roles/transport-dispatchers/options", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    try {
      const dispatchers = await listTransportDispatchersForContext(
        request.adminContext,
      );
      return reply.send({ dispatchers });
    } catch (error) {
      if (isAdminRepositoryError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      throw error;
    }
  });

  f.get(
    "/roles/deletion/orphaned-artifacts",
    {
      schema: {
        querystring: z.object({
          kind: z.enum(["reports", "objects"]),
          ownerIds: z.string().min(1),
          limit: z.coerce.number().int().min(1).max(20).default(20),
          codeCursor: z.string().min(1).optional(),
          recordCursor: z.string().min(1).optional(),
          codeDone: z.literal("1").optional(),
          recordDone: z.literal("1").optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const result = await listOrphanedOwnerArtifactsForContext(
          request.adminContext,
          {
            kind: request.query.kind,
            ownerIds: request.query.ownerIds.split(","),
            limit: request.query.limit,
            codeCursor: request.query.codeCursor,
            recordCursor: request.query.recordCursor,
            codeDone: request.query.codeDone === "1",
            recordDone: request.query.recordDone === "1",
          },
        );
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

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
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      const role = await getUserRoleForContext(
        request.adminContext,
        request.params.emailKey,
      );
      if (!role) {
        return reply.status(404).send({ error: "Role record not found" });
      }

      return reply.send({ role });
    },
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
          individualId: z.string().optional(),
          institutionId: z.string().optional(),
          doctorId: z.string().optional(),
          patientId: z.string().optional(),
          isActive: z.boolean(),
          is_preferred_asignee: z.boolean().optional(),
          displayName: z.string().optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const role = await upsertUserRoleForContext(
          request.adminContext,
          request.params.emailKey,
          request.body,
        );

        return reply.send({ role });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.delete(
    "/roles/:emailKey/deletion/:step",
    {
      schema: {
        params: z.object({
          emailKey: z.string().min(1),
          step: z.enum(ROLE_ACCOUNT_DELETION_ROUTE_STEPS),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      // Compatibility for backoffice bundles older than v3.255. Stored files
      // intentionally survive account deletion and this is not a cleanup step.
      if (request.params.step === "stored_files") {
        return reply.send({
          step: "stored_files",
          status: "not_found",
          deletedCount: 0,
          message:
            "No stored file metadata was deleted. Stored files are intentionally preserved during account cleanup.",
        });
      }

      try {
        const result = await deleteRoleAccountStepForContext(
          request.adminContext,
          request.params.emailKey,
          request.params.step,
        );
        return reply.send(result);
      } catch (error) {
        return sendRoleDeletionStepError(request, reply, error);
      }
    },
  );

  f.delete(
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
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteRoleUserForContext(
          request.adminContext,
          request.params.emailKey,
        );

        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );
}

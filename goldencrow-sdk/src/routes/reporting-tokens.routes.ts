import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createReportingIntegrationClient,
  listReportingIntegrationClientAccessEvents,
  listReportingIntegrationClients,
  revokeReportingIntegrationClient,
  rotateReportingIntegrationClientSecret,
} from "../repositories/reporting-tokens.repository.js";
import type { AdminContext } from "../types/sdk.types.js";

const CreateReportingIntegrationClientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    quotaPerMinute: z.number().int().positive().optional(),
  })
  .strict();

const ListReportingIntegrationClientsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().trim().min(1).optional(),
});

const ReportingIntegrationClientParamsSchema = z.object({
  clientId: z.string().trim().min(1),
});

function requireAdminContext(request: FastifyRequest, reply: FastifyReply) {
  const adminContext = request.adminContext as AdminContext | undefined;
  if (!adminContext) {
    reply.status(401).send({ error: "No authenticated admin context" });
    return null;
  }

  return adminContext;
}

export async function reportingIntegrationClientRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/reporting/integration-clients",
    {
      schema: {
        querystring: ListReportingIntegrationClientsQuerySchema,
      },
    },
    async (request, reply) => {
      const adminContext = requireAdminContext(request, reply);
      if (!adminContext) {
        return reply;
      }

      try {
        return reply.send(
          await listReportingIntegrationClients(adminContext, request.query),
        );
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.post(
    "/reporting/integration-clients",
    {
      schema: {
        body: CreateReportingIntegrationClientSchema,
      },
    },
    async (request, reply) => {
      const adminContext = requireAdminContext(request, reply);
      if (!adminContext) {
        return reply;
      }

      try {
        const client = await createReportingIntegrationClient(
          adminContext,
          request.body,
        );
        return reply.status(201).send(client);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.get(
    "/reporting/integration-clients/events",
    {
      schema: {
        querystring: ListReportingIntegrationClientsQuerySchema,
      },
    },
    async (request, reply) => {
      const adminContext = requireAdminContext(request, reply);
      if (!adminContext) {
        return reply;
      }

      try {
        return reply.send(
          await listReportingIntegrationClientAccessEvents(
            adminContext,
            request.query,
          ),
        );
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.post(
    "/reporting/integration-clients/:clientId/secret/rotate",
    {
      schema: {
        params: ReportingIntegrationClientParamsSchema,
      },
    },
    async (request, reply) => {
      const adminContext = requireAdminContext(request, reply);
      if (!adminContext) {
        return reply;
      }

      try {
        return reply.send(
          await rotateReportingIntegrationClientSecret(
            adminContext,
            request.params.clientId,
          ),
        );
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.post(
    "/reporting/integration-clients/:clientId/revoke",
    {
      schema: {
        params: ReportingIntegrationClientParamsSchema,
      },
    },
    async (request, reply) => {
      const adminContext = requireAdminContext(request, reply);
      if (!adminContext) {
        return reply;
      }

      try {
        return reply.send(
          await revokeReportingIntegrationClient(
            adminContext,
            request.params.clientId,
          ),
        );
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );
}

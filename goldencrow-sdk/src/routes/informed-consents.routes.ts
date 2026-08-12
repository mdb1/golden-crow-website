import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  INFORMED_CONSENT_FILE_MAX_BYTES,
  createInformedConsentForContext,
  getInformedConsentFileForContext,
  listInformedConsentPatientsForContext,
  listInformedConsentsForContext,
} from "../repositories/informed-consents.repository.js";

const CursorSchema = z.object({ cursor: z.string().min(1).optional() });
const ConsentFileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  size: z.number().int().min(1).max(INFORMED_CONSENT_FILE_MAX_BYTES),
  content: z.string().min(1).max(1_100_000),
});

function sendError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}

export async function informedConsentRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/2pq/informed-consents",
    { schema: { querystring: CursorSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        return await listInformedConsentsForContext(
          request.adminContext,
          request.query.cursor,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.get(
    "/2pq/informed-consents/patients",
    { schema: { querystring: CursorSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        return await listInformedConsentPatientsForContext(
          request.adminContext,
          request.query.cursor,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.post(
    "/2pq/informed-consents",
    {
      schema: {
        body: z.object({
          patientId: z.string().min(1).optional(),
          file: ConsentFileSchema,
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        const record = await createInformedConsentForContext(
          request.adminContext,
          request.body,
        );
        return reply.status(201).send({ record });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.get(
    "/2pq/informed-consents/:consentId/file",
    {
      schema: {
        params: z.object({ consentId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        const file = await getInformedConsentFileForContext(
          request.adminContext,
          request.params.consentId,
        );
        const fallbackName = file.name.replace(/["\\\r\n]/g, "_");
        return reply
          .header("Cache-Control", "private, no-store")
          .header(
            "Content-Disposition",
            `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          )
          .type(file.type)
          .send(file.bytes);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}

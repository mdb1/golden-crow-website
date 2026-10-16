import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  INFORMED_CONSENT_FILE_MAX_BYTES,
  createInformedConsentForContext,
  deleteInformedConsentForContext,
  getCaseConsentTraceabilityForContext,
  getInformedConsentDetailForContext,
  getInformedConsentFileForContext,
  listInformedConsentCasesForContext,
  listInformedConsentPatientsForContext,
  listInformedConsentsForContext,
  sendInformedConsentEmailForContext,
  setInformedConsentCaseForContext,
} from "../repositories/informed-consents.repository.js";
import { SAVED_SIGNATURE_MAX_DATA_URL_LENGTH } from "../lib/saved-signature.js";

const CursorSchema = z.object({ cursor: z.string().min(1).optional() });
const PatientCaseCursorSchema = CursorSchema.extend({
  patientId: z.string().min(1),
});
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

  f.get(
    "/2pq/informed-consents/cases",
    { schema: { querystring: PatientCaseCursorSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        return await listInformedConsentCasesForContext(
          request.adminContext,
          request.query.patientId,
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
      bodyLimit: 1_500_000,
      schema: {
        body: z
          .object({
            patientId: z.string().min(1).optional(),
            caseId: z.string().min(1).optional(),
            flowMode: z.enum(["guided", "direct"]).optional(),
            savedSignature: z
              .string()
              .min(1)
              .max(SAVED_SIGNATURE_MAX_DATA_URL_LENGTH)
              .optional(),
            file: ConsentFileSchema,
          })
          .superRefine((body, context) => {
            if (body.flowMode === "guided" && !body.savedSignature) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["savedSignature"],
                message: "Guided uploads require a saved signature.",
              });
            }
            if (body.flowMode !== "guided" && body.savedSignature) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["savedSignature"],
                message: "Only guided uploads may include a saved signature.",
              });
            }
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

  f.post(
    "/2pq/informed-consents/email",
    {
      schema: {
        body: z.object({
          patientId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        return await sendInformedConsentEmailForContext(
          request.adminContext,
          request.body,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.get(
    "/2pq/cases/:caseId/informed-consent",
    {
      schema: {
        params: z.object({ caseId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        return await getCaseConsentTraceabilityForContext(
          request.adminContext,
          request.params.caseId,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.get(
    "/2pq/informed-consents/:consentId",
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
        return await getInformedConsentDetailForContext(
          request.adminContext,
          request.params.consentId,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.patch(
    "/2pq/informed-consents/:consentId/case",
    {
      schema: {
        params: z.object({ consentId: z.string().min(1) }),
        body: z.object({ caseId: z.string().min(1).nullable() }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        return await setInformedConsentCaseForContext(
          request.adminContext,
          request.params.consentId,
          request.body.caseId,
        );
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

  f.delete(
    "/2pq/informed-consents/:consentId",
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
        return await deleteInformedConsentForContext(
          request.adminContext,
          request.params.consentId,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}

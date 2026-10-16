import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  INFORMED_CONSENT_FILE_MAX_BYTES,
  createInformedConsentForContext,
  deleteInformedConsentForContext,
  getCaseConsentTraceabilityForContext,
  getInformedConsentDraftForContext,
  getInformedConsentDraftStatusForContext,
  getInformedConsentDetailForContext,
  getInformedConsentFileForContext,
  getSavedInformedConsentSignatureForContext,
  listInformedConsentCasesForContext,
  listInformedConsentPatientsForContext,
  listInformedConsentsForContext,
  sendInformedConsentEmailForContext,
  setInformedConsentCaseForContext,
  upsertInformedConsentDraftForContext,
} from "../repositories/informed-consents.repository.js";
import { SAVED_SIGNATURE_MAX_DATA_URL_LENGTH } from "../lib/saved-signature.js";

const CursorSchema = z.object({ cursor: z.string().min(1).optional() });
const PatientCaseCursorSchema = CursorSchema.extend({
  patientId: z.string().min(1),
});
const SavedSignatureQuerySchema = z.object({
  patientId: z.string().trim().min(1).optional(),
});
const ConsentFileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  size: z.number().int().min(1).max(INFORMED_CONSENT_FILE_MAX_BYTES),
  content: z.string().min(1).max(1_100_000),
});
const ConsentDraftStepSchema = z.enum([
  "method",
  "download",
  "data",
  "signature",
  "editor",
  "preview",
  "direct-download",
  "direct-sign",
  "direct-upload",
]);
const ConsentDraftSignatureMethodSchema = z
  .enum(["draw", "import", "saved"])
  .nullable();
const ConsentDraftPlacementSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().min(0.08).max(0.5),
  })
  .strict();
const ConsentDraftMutationSchema = z
  .object({
    expectedRevision: z.number().int().min(1).nullable(),
    schemaVersion: z.literal(1),
    mode: z.enum(["guided", "direct"]),
    activeStepId: ConsentDraftStepSchema,
    visitedStepIds: z.array(ConsentDraftStepSchema).min(1).max(6),
    patientName: z.string().max(200),
    patientDocument: z.string().max(100),
    signatureDate: z.string().max(10),
    hasPartner: z.boolean(),
    partnerName: z.string().max(200),
    patientSignatureDataUrl: z
      .string()
      .min(1)
      .max(SAVED_SIGNATURE_MAX_DATA_URL_LENGTH)
      .nullable(),
    partnerSignatureDataUrl: z
      .string()
      .min(1)
      .max(SAVED_SIGNATURE_MAX_DATA_URL_LENGTH)
      .nullable(),
    patientSignatureMethod: ConsentDraftSignatureMethodSchema,
    partnerSignatureMethod: ConsentDraftSignatureMethodSchema,
    patientPlacement: ConsentDraftPlacementSchema,
    partnerPlacement: ConsentDraftPlacementSchema,
    selectedRole: z.enum(["patient", "partner"]),
  })
  .strict()
  .superRefine((body, context) => {
    const allowedSteps = new Set(
      body.mode === "guided"
        ? ["method", "download", "data", "signature", "editor", "preview"]
        : ["method", "direct-download", "direct-sign", "direct-upload"],
    );
    if (!allowedSteps.has(body.activeStepId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activeStepId"],
        message: "The active consent step does not match the draft mode.",
      });
    }
    const uniqueSteps = new Set(body.visitedStepIds);
    if (
      uniqueSteps.size !== body.visitedStepIds.length ||
      body.visitedStepIds.some((step) => !allowedSteps.has(step)) ||
      !body.visitedStepIds.includes(body.activeStepId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitedStepIds"],
        message: "Visited consent steps are invalid for the draft mode.",
      });
    }
    if (body.patientSignatureDataUrl && !body.patientSignatureMethod) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["patientSignatureMethod"],
        message: "A patient signature method is required.",
      });
    }
    if (body.partnerSignatureDataUrl && !body.partnerSignatureMethod) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["partnerSignatureMethod"],
        message: "A partner signature method is required.",
      });
    }
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

  f.get(
    "/2pq/informed-consents/saved-signature",
    { schema: { querystring: SavedSignatureQuerySchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        const result = await getSavedInformedConsentSignatureForContext(
          request.adminContext,
          request.query.patientId,
        );
        return reply.header("Cache-Control", "private, no-store").send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  f.get("/2pq/informed-consents/draft/status", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated context" });
    }
    try {
      const draft = await getInformedConsentDraftStatusForContext(
        request.adminContext,
      );
      return reply.header("Cache-Control", "private, no-store").send({ draft });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  f.get("/2pq/informed-consents/draft", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated context" });
    }
    try {
      const draft = await getInformedConsentDraftForContext(
        request.adminContext,
      );
      return reply.header("Cache-Control", "private, no-store").send({ draft });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  f.put(
    "/2pq/informed-consents/draft",
    {
      bodyLimit: 450_000,
      schema: { body: ConsentDraftMutationSchema },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      try {
        const savedDraft = await upsertInformedConsentDraftForContext(
          request.adminContext,
          request.body,
        );
        const draft = {
          mode: savedDraft.mode,
          activeStepId: savedDraft.activeStepId,
          updatedAt: savedDraft.updatedAt,
          revision: savedDraft.revision,
        };
        return reply.send({ draft });
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
            expectedDraftRevision: z
              .number()
              .int()
              .min(1)
              .nullable()
              .optional(),
            signatureAttestationAccepted: z.literal(true).optional(),
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
            if (
              body.flowMode !== "guided" &&
              body.signatureAttestationAccepted
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["signatureAttestationAccepted"],
                message:
                  "Only guided uploads may include a signature attestation.",
              });
            }
          }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated context" });
      }
      if (
        request.adminContext.role === "patient" &&
        !Object.prototype.hasOwnProperty.call(
          request.body,
          "expectedDraftRevision",
        )
      ) {
        return reply.status(400).send({
          error:
            "Patient consent uploads require a draft revision expectation.",
        });
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

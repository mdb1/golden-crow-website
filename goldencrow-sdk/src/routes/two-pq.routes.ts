import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createTwoPQFormForContext,
  getTwoPQFormForContext,
  listTwoPQFormsForContext,
} from "../repositories/two-pq-forms.repository.js";
import {
  createTwoPQRecordForContext,
  deleteTwoPQRecordForContext,
  getTwoPQDetailForContext,
  linkCaseToBatchForContext,
  linkSamplingToCaseForContext,
  listTwoPQRecordsForContext,
  replaceTwoPQRecordForContext,
  unlinkCaseFromBatchForContext,
  unlinkSamplingFromCaseForContext,
  updateTwoPQRecordForContext,
} from "../repositories/two-pq.repository.js";

const TwoPQAreaKeySchema = z.enum([
  "cases",
  "sampling",
  "shipments",
  "sequencing",
  "reports",
  "clients",
]);

const TwoPQMutationSchema = z.object({
  institutionId: z.string().optional(),
  doctorId: z.string().optional(),
  patientId: z.string().optional(),
  parent_batch: z.string().optional(),
  parent_case: z.string().optional(),
  three_letter_code: z.string().optional(),
  stored_file_id: z.string().optional(),
  caseLabel: z.string().optional(),
  caseStatus: z.string().optional(),
  caseType: z.string().optional(),
  priority: z.string().optional(),
  sampleId: z.string().optional(),
  shipmentId: z.string().optional(),
  trackingNumber: z.string().optional(),
  requestedAt: z.string().optional(),
  dueAt: z.string().optional(),
  sampleType: z.string().optional(),
  collectionDate: z.string().optional(),
  receptionDate: z.string().optional(),
  processingStatus: z.string().optional(),
  runId: z.string().optional(),
  qcStatus: z.string().optional(),
  carrier: z.string().optional(),
  dispatchDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  deliveryStatus: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  platform: z.string().optional(),
  scheduling: z.string().optional(),
  analysisStatus: z.string().optional(),
  providerName: z.string().optional(),
  providerFormat: z.string().optional(),
  phoneNumber: z.string().optional(),
  reportCode: z.string().optional(),
  uploadedReportId: z.string().optional(),
  clientCaseStatus: z.string().optional(),
  reportDelivery: z.string().optional(),
  clientName: z.string().optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  preferredLanguage: z.string().optional(),
  country: z.string().optional(),
  roleEmail: z.string().optional(),
  accessStatus: z.string().optional(),
  communicationStatus: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQPatientInformationSchema = z.object({
  institutionId: z.string().optional(),
  doctorId: z.string().optional(),
  email: z.string().optional(),
  fullName: z.string().optional(),
  medicalRecordNumber: z.string().optional(),
  birthDate: z.string().optional(),
  sex: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().optional(),
});

const TwoPQInstitutionInformationSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  legalName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQIntegerInputSchema = z.union([z.number(), z.string()]);
const TwoPQBooleanAnswerSchema = z.union([z.boolean(), z.string()]);

const TwoPQMedicalInformationSchema = z.object({
  previousConceptionsCount: TwoPQIntegerInputSchema.optional(),
  previousMiscarriagesCount: TwoPQIntegerInputSchema.optional(),
  previousBirthsCount: TwoPQIntegerInputSchema.optional(),
  previousCyclesCount: TwoPQIntegerInputSchema.optional(),
  maleFactor: TwoPQBooleanAnswerSchema.optional(),
  otherBackground: z.string().optional(),
  clinicalIndication: z.string().optional(),
  suspectedDiagnosis: z.string().optional(),
  symptoms: z.string().optional(),
  familyHistory: z.string().optional(),
  requestingDoctor: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQPreviousGeneticTestsSchema = z.object({
  pgtASr: TwoPQBooleanAnswerSchema.optional(),
  karyotype: TwoPQBooleanAnswerSchema.optional(),
  pgtResult: z.string().optional(),
  karyotypeResult: z.string().optional(),
  hasPreviousTests: z.string().optional(),
  testDescription: z.string().optional(),
  labName: z.string().optional(),
  testDate: z.string().optional(),
  resultSummary: z.string().optional(),
  reportAvailable: z.string().optional(),
});

const TwoPQRequestedTestSchema = z.object({
  pgtA: TwoPQBooleanAnswerSchema.optional(),
  pgtSr: TwoPQBooleanAnswerSchema.optional(),
  reportsMosaicism: TwoPQBooleanAnswerSchema.optional(),
  reportsSex: TwoPQBooleanAnswerSchema.optional(),
  requestReason: z.string().optional(),
  requestDate: z.string().optional(),
  testName: z.string().optional(),
  testCode: z.string().optional(),
  priority: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQSampleInformationSchema = z.object({
  fivCenter: z.string().optional(),
  centerCode: z.string().optional(),
  requestingDoctorFirstName: z.string().optional(),
  requestingDoctorLastName: z.string().optional(),
  sampleType: z.string().optional(),
  processedByFirstName: z.string().optional(),
  processedByLastName: z.string().optional(),
  processDate: z.string().optional(),
  boxCode: z.string().optional(),
  sampleId: z.string().optional(),
  collectionDate: z.string().optional(),
  collectionSite: z.string().optional(),
  collectorName: z.string().optional(),
  storageCondition: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQCaseInformationSchema = z.object({
  caseLabel: z.string().optional(),
  caseStatus: z.string().optional(),
  caseType: z.string().optional(),
  priority: z.string().optional(),
  trackingNumber: z.string().optional(),
  requestedAt: z.string().optional(),
  dueAt: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQSamplingInformationSchema = z.object({
  sampleId: z.string().optional(),
  sampleType: z.string().optional(),
  processingStatus: z.string().optional(),
  collectionDate: z.string().optional(),
  receptionDate: z.string().optional(),
  runId: z.string().optional(),
  qcStatus: z.string().optional(),
  notes: z.string().optional(),
});

const TwoPQFormMutationSchema = z.discriminatedUnion("formType", [
  z.object({
    formType: z.literal("study_request"),
    selectedPatientId: z.string().optional(),
    selectedInstitutionId: z.string().optional(),
    patientInformation: TwoPQPatientInformationSchema,
    medicalInformation: TwoPQMedicalInformationSchema,
    previousGeneticTests: TwoPQPreviousGeneticTestsSchema,
    requestedTest: TwoPQRequestedTestSchema,
    institutionInformation: TwoPQInstitutionInformationSchema,
  }),
  z.object({
    formType: z.literal("sample"),
    selectedPatientId: z.string().optional(),
    selectedInstitutionId: z.string().optional(),
    selectedCaseId: z.string().optional(),
    patientInformation: TwoPQPatientInformationSchema,
    requestedTest: TwoPQRequestedTestSchema,
    sampleInformation: TwoPQSampleInformationSchema,
    caseInformation: TwoPQCaseInformationSchema.optional(),
    samplingInformation: z.array(TwoPQSamplingInformationSchema).optional(),
  }),
]);

function buildUnexpectedRouteErrorPayload(
  error: unknown,
  request: Pick<FastifyRequest, "method" | "url" | "params" | "query" | "body">
) {
  const baseError =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unexpected error");

  return {
    error: baseError.message || "Unexpected internal error.",
    errorName: baseError.name || "Error",
    hint: "Check the request payload, linked entity scope, and the stack trace below.",
    request: {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
      body: request.body,
    },
    stack: baseError.stack,
  };
}

function sendTwoPQRouteError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown
) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({
      error: error.message,
      errorName: error.name,
      statusCode: error.statusCode,
      hint: "This request was rejected by a 2PQ validation or permission rule.",
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        body: request.body,
      },
    });
  }

  const payload = buildUnexpectedRouteErrorPayload(error, request);
  request.log.error(
    {
      err: error,
      request: payload.request,
    },
    "Unhandled 2PQ route error"
  );
  return reply.status(500).send(payload);
}

export async function twoPQRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/2pq/forms", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    try {
      const forms = await listTwoPQFormsForContext(request.adminContext);
      return reply.send({ forms });
    } catch (error) {
      return sendTwoPQRouteError(request, reply, error);
    }
  });

  f.post(
    "/2pq/forms",
    {
      schema: {
        body: TwoPQFormMutationSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const form = await createTwoPQFormForContext(
          request.adminContext,
          request.body
        );
        return reply.status(201).send({ form });
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.get(
    "/2pq/forms/:formId",
    {
      schema: {
        params: z.object({
          formId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const form = await getTwoPQFormForContext(
          request.adminContext,
          request.params.formId
        );
        return reply.send({ form });
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.get(
    "/2pq/:areaKey",
    {
      schema: {
        params: z.object({
          areaKey: TwoPQAreaKeySchema,
        }),
        querystring: z.object({
          institutionId: z.string().optional(),
          doctorId: z.string().optional(),
          patientId: z.string().optional(),
          query: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      const records = await listTwoPQRecordsForContext(
        request.adminContext,
        request.params.areaKey,
        request.query
      );
      return reply.send({ records });
    }
  );

  f.post(
    "/2pq/:areaKey",
    {
      schema: {
        params: z.object({
          areaKey: TwoPQAreaKeySchema,
        }),
        body: TwoPQMutationSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const record = await createTwoPQRecordForContext(
          request.adminContext,
          request.params.areaKey,
          request.body
        );
        return reply.send({ record });
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.get(
    "/2pq/:areaKey/:recordId",
    {
      schema: {
        params: z.object({
          areaKey: TwoPQAreaKeySchema,
          recordId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const detail = await getTwoPQDetailForContext(
          request.adminContext,
          request.params.areaKey,
          request.params.recordId
        );
        return reply.send(detail);
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.put(
    "/2pq/:areaKey/:recordId",
    {
      schema: {
        params: z.object({
          areaKey: TwoPQAreaKeySchema,
          recordId: z.string().min(1),
        }),
        body: TwoPQMutationSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const record = await replaceTwoPQRecordForContext(
          request.adminContext,
          request.params.areaKey,
          request.params.recordId,
          request.body
        );
        return reply.send({ record });
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.patch(
    "/2pq/:areaKey/:recordId",
    {
      schema: {
        params: z.object({
          areaKey: TwoPQAreaKeySchema,
          recordId: z.string().min(1),
        }),
        body: TwoPQMutationSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const record = await updateTwoPQRecordForContext(
          request.adminContext,
          request.params.areaKey,
          request.params.recordId,
          request.body
        );
        return reply.send({ record });
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.delete(
    "/2pq/:areaKey/:recordId",
    {
      schema: {
        params: z.object({
          areaKey: TwoPQAreaKeySchema,
          recordId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteTwoPQRecordForContext(
          request.adminContext,
          request.params.areaKey,
          request.params.recordId
        );
        return reply.send(result);
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.post(
    "/2pq/relations/batches/:batchId/cases/:caseId",
    {
      schema: {
        params: z.object({
          batchId: z.string().min(1),
          caseId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await linkCaseToBatchForContext(
          request.adminContext,
          request.params.batchId,
          request.params.caseId
        );
        return reply.send(result);
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.delete(
    "/2pq/relations/batches/:batchId/cases/:caseId",
    {
      schema: {
        params: z.object({
          batchId: z.string().min(1),
          caseId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await unlinkCaseFromBatchForContext(
          request.adminContext,
          request.params.batchId,
          request.params.caseId
        );
        return reply.send(result);
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.post(
    "/2pq/relations/cases/:caseId/samplings/:samplingId",
    {
      schema: {
        params: z.object({
          caseId: z.string().min(1),
          samplingId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await linkSamplingToCaseForContext(
          request.adminContext,
          request.params.caseId,
          request.params.samplingId
        );
        return reply.send(result);
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );

  f.delete(
    "/2pq/relations/cases/:caseId/samplings/:samplingId",
    {
      schema: {
        params: z.object({
          caseId: z.string().min(1),
          samplingId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await unlinkSamplingFromCaseForContext(
          request.adminContext,
          request.params.caseId,
          request.params.samplingId
        );
        return reply.send(result);
      } catch (error) {
        return sendTwoPQRouteError(request, reply, error);
      }
    }
  );
}

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
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

export async function twoPQRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
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
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );
}

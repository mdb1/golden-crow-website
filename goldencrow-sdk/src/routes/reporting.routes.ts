import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { ENV } from "../config/env.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  getReportingPatient,
  getReportingTwoPQCaseByCode,
  recordUploadedReportNotification,
} from "../repositories/reporting.repository.js";
import {
  refreshReportingAccessToken,
  verifyReportingAccessToken,
} from "../repositories/reporting-tokens.repository.js";

const PatientLookupQuerySchema = z
  .object({
    patientId: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    medicalRecordNumber: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.patientId || value.email || value.medicalRecordNumber),
    "Provide patientId, email, or medicalRecordNumber",
  );

const UploadedReportNotificationSchema = z.object({
  patientId: z.string().trim().min(1),
  reportId: z.string().trim().min(1).optional(),
  reportCode: z.string().trim().min(1).optional(),
  bucket: z.string().trim().min(1),
  key: z.string().trim().min(1),
  fileName: z.string().trim().min(1).optional(),
  contentType: z.string().trim().min(1).optional(),
  size: z.number().finite().nonnegative().optional(),
  uploadedAt: z.string().trim().datetime().optional(),
  providerName: z.string().trim().min(1).optional(),
  providerFormat: z.string().trim().min(1).optional(),
  reportType: z.string().trim().min(1).optional(),
  sampleId: z.string().trim().min(1).optional(),
  downloadUrl: z.string().trim().url().optional(),
});

const TwoPQCaseLookupParamsSchema = z.object({
  caseCode: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9]{6}$/,
      "caseCode must contain exactly 6 letters or numbers",
    ),
});

const ReportingAccessTokenVerificationSchema = z
  .object({
    token: z.string().trim().min(1),
    endpoint: z.string().trim().min(1).optional(),
  })
  .strict();

const ReportingAccessTokenRefreshSchema = z
  .object({
    token: z.string().trim().min(1),
  })
  .strict();

function getInternalOpenApiToken(request: FastifyRequest) {
  const headerValue = request.headers["x-goldencrow-internal-token"];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value?.trim();
}

function requireInternalOpenApiToken(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!ENV.GOLDENCROW_OPENAPI_INTERNAL_TOKEN) {
    reply
      .status(503)
      .send({ error: "Internal OpenAPI token is not configured" });
    return false;
  }

  if (
    getInternalOpenApiToken(request) !== ENV.GOLDENCROW_OPENAPI_INTERNAL_TOKEN
  ) {
    reply.status(401).send({ error: "Invalid internal OpenAPI token" });
    return false;
  }

  return true;
}

export async function reportingRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!requireInternalOpenApiToken(request, reply)) {
      return reply;
    }
  });

  f.post(
    "/internal/openapi/reporting/tokens/verify",
    {
      schema: {
        body: ReportingAccessTokenVerificationSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await verifyReportingAccessToken(
          request.body.token,
          request.body.endpoint,
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

  f.post(
    "/internal/openapi/reporting/tokens/refresh",
    {
      schema: {
        body: ReportingAccessTokenRefreshSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await refreshReportingAccessToken(request.body.token);
        return reply.status(201).send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.get(
    "/internal/openapi/reporting/patients",
    {
      schema: {
        querystring: PatientLookupQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const patient = await getReportingPatient(request.query);
        return reply.send({ patient });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.get(
    "/internal/openapi/reporting/patients/:patientId",
    {
      schema: {
        params: z.object({
          patientId: z.string().trim().min(1),
        }),
      },
    },
    async (request, reply) => {
      try {
        const patient = await getReportingPatient({
          patientId: request.params.patientId,
        });
        return reply.send({ patient });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.post(
    "/internal/openapi/reporting/reports/upload",
    {
      schema: {
        body: UploadedReportNotificationSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await recordUploadedReportNotification(request.body);
        return reply.status(201).send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.get(
    "/internal/openapi/reporting/2pq/cases/:caseCode",
    {
      schema: {
        params: TwoPQCaseLookupParamsSchema,
      },
    },
    async (request, reply) => {
      try {
        const caseSnapshot = await getReportingTwoPQCaseByCode(
          request.params.caseCode,
        );
        return reply.send({ caseSnapshot });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );
}

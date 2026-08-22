import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  getReportingPatient,
  getReportingTwoPQCaseByCode,
  recordUploadedReportNotification,
  type ReportUploadNotificationInput,
} from "../repositories/reporting.repository.js";
import {
  exchangeReportingClientCredentials,
  verifyReportingAccessToken,
} from "../repositories/reporting-tokens.repository.js";

const PatientLookupQuerySchema = z
  .object({
    patientId: z.string().trim().min(1),
  })
  .strict();

const CaseCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{6}$/,
    "caseCode must contain exactly 6 letters or numbers",
  )
  .transform((value) => value.toUpperCase());

const CaseCodeUploadNotificationSchema = z
  .object({
    caseCode: CaseCodeSchema,
    download_url: z.string().trim().url("download_url must be a valid URL."),
  })
  .strict();

const UploadedReportNotificationSchema = CaseCodeUploadNotificationSchema;

type UploadedReportNotificationBody = z.infer<
  typeof UploadedReportNotificationSchema
>;

const TwoPQCaseLookupParamsSchema = z.object({
  caseCode: CaseCodeSchema,
});

const OAuthTokenRequestSchema = z
  .object({
    grant_type: z.literal("client_credentials"),
    client_id: z.string().trim().min(1),
    client_secret: z.string().trim().min(1),
  })
  .strict();

function getBearerToken(request: FastifyRequest) {
  const headerValue = request.headers.authorization;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function requireReportingAccessToken(
  request: FastifyRequest,
  reply: FastifyReply,
  endpoint: string,
) {
  const token = getBearerToken(request);
  if (!token) {
    reply.status(401).send({ error: "Missing reporting access token." });
    return false;
  }

  try {
    await verifyReportingAccessToken(token, endpoint);
  } catch (error) {
    if (isAdminRepositoryError(error)) {
      reply.status(error.statusCode).send({ error: error.message });
      return false;
    }

    throw error;
  }

  return true;
}

function reportsBucketName() {
  return (
    process.env.GOLDENCROW_REPORTING_REPORTS_BUCKET?.trim() ||
    process.env.REPORTING_REPORTS_BUCKET?.trim() ||
    "goldencrow-reporting-reports"
  );
}

function reportsKeyPrefix() {
  return (
    process.env.GOLDENCROW_REPORTING_REPORTS_PREFIX?.trim() || "reports/2pq"
  ).replace(/^\/+|\/+$/g, "");
}

function reportKeyForCaseCode(caseCode: string) {
  const prefix = reportsKeyPrefix();
  return prefix ? `${prefix}/${caseCode}.pdf` : `${caseCode}.pdf`;
}

function reportUploadPayloadForCaseCode(
  caseCode: string,
  patientId: string,
  downloadUrl: string,
): ReportUploadNotificationInput {
  return {
    patientId,
    reportId: `2pq-${caseCode.toLowerCase()}`,
    reportCode: caseCode,
    bucket: reportsBucketName(),
    key: reportKeyForCaseCode(caseCode),
    fileName: `${caseCode}.pdf`,
    contentType: "application/pdf",
    uploadedAt: new Date().toISOString(),
    providerName: "aws-s3",
    providerFormat: "pdf",
    reportType: "2pq",
    sampleId: caseCode,
    downloadUrl,
  };
}

async function normalizeUploadNotificationBody(
  body: UploadedReportNotificationBody,
): Promise<ReportUploadNotificationInput> {
  const caseSnapshot = await getReportingTwoPQCaseByCode(body.caseCode);
  const patientId =
    caseSnapshot.patient?.id ?? caseSnapshot.main_case.patient_id;
  if (!patientId) {
    throw new Error("2PQ case does not have a patient id.");
  }

  if (typeof patientId !== "string") {
    throw new Error("2PQ case does not have a patient id.");
  }

  return reportUploadPayloadForCaseCode(
    body.caseCode,
    patientId,
    body.download_url,
  );
}

function adminErrorResponse(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  if (
    error instanceof Error &&
    error.message === "2PQ case does not have a patient id."
  ) {
    return reply.status(422).send({ error: error.message });
  }

  throw error;
}

export async function reportingRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/internal/openapi/oauth/token",
    {
      schema: {
        body: OAuthTokenRequestSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await exchangeReportingClientCredentials(request.body);
        return reply.send(result);
      } catch (error) {
        return adminErrorResponse(reply, error);
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
      if (
        !(await requireReportingAccessToken(
          request,
          reply,
          "/open-api/reporting/patients",
        ))
      ) {
        return reply;
      }

      try {
        const patient = await getReportingPatient(request.query);
        return reply.send({ patient });
      } catch (error) {
        return adminErrorResponse(reply, error);
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
      if (
        !(await requireReportingAccessToken(
          request,
          reply,
          "/open-api/reporting/patients",
        ))
      ) {
        return reply;
      }

      try {
        const patient = await getReportingPatient({
          patientId: request.params.patientId,
        });
        return reply.send({ patient });
      } catch (error) {
        return adminErrorResponse(reply, error);
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
      if (
        !(await requireReportingAccessToken(
          request,
          reply,
          "/open-api/reporting/reports/upload",
        ))
      ) {
        return reply;
      }

      try {
        const result = await recordUploadedReportNotification(
          await normalizeUploadNotificationBody(request.body),
        );
        return reply.status(201).send(result);
      } catch (error) {
        return adminErrorResponse(reply, error);
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
      if (
        !(await requireReportingAccessToken(
          request,
          reply,
          "/open-api/reporting/2pq/cases/{caseCode}",
        ))
      ) {
        return reply;
      }

      try {
        const caseSnapshot = await getReportingTwoPQCaseByCode(
          request.params.caseCode,
        );
        return reply.send({ caseSnapshot });
      } catch (error) {
        return adminErrorResponse(reply, error);
      }
    },
  );
}

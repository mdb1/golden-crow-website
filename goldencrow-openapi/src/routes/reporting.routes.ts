import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ENV } from "../config/env.js";
import { SdkBridgeError, sdkBridgeFetch } from "../sdk-client.js";

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

function getBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function requireReportingToken(request: FastifyRequest, reply: FastifyReply) {
  if (!ENV.REPORTING_API_TOKEN) {
    reply.status(503).send({ error: "Reporting API token is not configured" });
    return false;
  }

  if (getBearerToken(request) !== ENV.REPORTING_API_TOKEN) {
    reply.status(401).send({ error: "Invalid reporting API token" });
    return false;
  }

  return true;
}

function sendSdkBridgeError(reply: FastifyReply, error: SdkBridgeError) {
  const payload =
    error.responseBody && typeof error.responseBody === "object"
      ? error.responseBody
      : { error: error.message };

  return reply.status(error.statusCode).send(payload);
}

function patientLookupPath(query: z.infer<typeof PatientLookupQuerySchema>) {
  const params = new URLSearchParams();
  if (query.patientId) {
    params.set("patientId", query.patientId);
  }
  if (query.email) {
    params.set("email", query.email);
  }
  if (query.medicalRecordNumber) {
    params.set("medicalRecordNumber", query.medicalRecordNumber);
  }
  return `/internal/openapi/reporting/patients?${params.toString()}`;
}

export async function reportingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onRequest", async (request, reply) => {
    if (!requireReportingToken(request, reply)) {
      return reply;
    }
  });

  fastify.get("/v1/reporting/patients", async (request, reply) => {
    const parsedQuery = PatientLookupQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: parsedQuery.error.issues[0]?.message ?? "Invalid query.",
      });
    }

    try {
      const result = await sdkBridgeFetch(patientLookupPath(parsedQuery.data));
      return reply.send(result);
    } catch (error) {
      if (error instanceof SdkBridgeError) {
        return sendSdkBridgeError(reply, error);
      }
      throw error;
    }
  });

  fastify.post("/v1/reporting/reports/uploaded", async (request, reply) => {
    const parsedBody = UploadedReportNotificationSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: parsedBody.error.issues[0]?.message ?? "Invalid request body.",
      });
    }

    try {
      const result = await sdkBridgeFetch(
        "/internal/openapi/reporting/reports/uploaded",
        {
          method: "POST",
          body: parsedBody.data,
        },
      );
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof SdkBridgeError) {
        return sendSdkBridgeError(reply, error);
      }
      throw error;
    }
  });

  fastify.get("/v1/reporting/2pq/cases/:caseCode", async (request, reply) => {
    const parsedParams = TwoPQCaseLookupParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: parsedParams.error.issues[0]?.message ?? "Invalid path params.",
      });
    }

    try {
      const result = await sdkBridgeFetch(
        `/internal/openapi/reporting/2pq/cases/${encodeURIComponent(
          parsedParams.data.caseCode,
        )}`,
      );
      return reply.send(result);
    } catch (error) {
      if (error instanceof SdkBridgeError) {
        return sendSdkBridgeError(reply, error);
      }
      throw error;
    }
  });
}

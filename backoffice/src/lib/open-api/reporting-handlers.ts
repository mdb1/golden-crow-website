import "server-only";

import { z } from "zod";
import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";
import { getReportingApiToken } from "@/lib/reporting-api-token";
import { resolveSdkBaseUrl } from "@/lib/sdk-url";

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

class SdkBridgeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: unknown,
  ) {
    super("SDK bridge request failed");
  }
}

function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

function incomingHost(request: Request) {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    undefined
  );
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function requireReportingToken(request: Request) {
  if (getBearerToken(request) !== getReportingApiToken()) {
    return json({ error: "Invalid reporting API token" }, 401);
  }
  return null;
}

function optionalQueryValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) ?? undefined;
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

async function sdkBridgeFetch(
  request: Request,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const internalToken = process.env.GOLDENCROW_OPENAPI_INTERNAL_TOKEN?.trim();
  if (!internalToken) {
    throw new SdkBridgeError(503, {
      error: "Internal OpenAPI token is not configured",
    });
  }

  const targetUrl = new URL(
    path,
    resolveSdkBaseUrl({ currentHost: incomingHost(request) }),
  );
  const headers = new Headers({
    "x-goldencrow-internal-token": internalToken,
  });
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }

  const response = await fetch(targetUrl, {
    method: init.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
  const text = await response.text();
  let parsedBody: unknown;
  if (text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = text;
    }
  }

  if (!response.ok) {
    throw new SdkBridgeError(
      response.status,
      parsedBody ?? { error: `${response.status} ${response.statusText}` },
    );
  }

  return parsedBody;
}

function bridgeErrorResponse(error: SdkBridgeError) {
  return json(
    error.responseBody && typeof error.responseBody === "object"
      ? error.responseBody
      : { error: String(error.responseBody) },
    error.statusCode,
  );
}

export function handleOpenApiDocument(request: Request) {
  return json(buildReportingOpenApiDocument(publicOrigin(request)));
}

export async function handlePatientLookup(request: Request) {
  const authError = requireReportingToken(request);
  if (authError) {
    return authError;
  }

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = PatientLookupQuerySchema.safeParse({
    patientId: optionalQueryValue(searchParams, "patientId"),
    email: optionalQueryValue(searchParams, "email"),
    medicalRecordNumber: optionalQueryValue(searchParams, "medicalRecordNumber"),
  });
  if (!parsedQuery.success) {
    return json(
      { error: parsedQuery.error.issues[0]?.message ?? "Invalid query." },
      400,
    );
  }

  try {
    return json(
      await sdkBridgeFetch(request, patientLookupPath(parsedQuery.data)),
    );
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

export async function handleUploadedReportNotification(request: Request) {
  const authError = requireReportingToken(request);
  if (authError) {
    return authError;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsedBody = UploadedReportNotificationSchema.safeParse(payload);
  if (!parsedBody.success) {
    return json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
      400,
    );
  }

  try {
    return json(
      await sdkBridgeFetch(
        request,
        "/internal/openapi/reporting/reports/uploaded",
        {
          method: "POST",
          body: parsedBody.data,
        },
      ),
      201,
    );
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

export async function handleTwoPQCaseLookup(request: Request, caseCode: string) {
  const authError = requireReportingToken(request);
  if (authError) {
    return authError;
  }

  const parsedParams = TwoPQCaseLookupParamsSchema.safeParse({ caseCode });
  if (!parsedParams.success) {
    return json(
      { error: parsedParams.error.issues[0]?.message ?? "Invalid path params." },
      400,
    );
  }

  try {
    return json(
      await sdkBridgeFetch(
        request,
        `/internal/openapi/reporting/2pq/cases/${encodeURIComponent(
          parsedParams.data.caseCode,
        )}`,
      ),
    );
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

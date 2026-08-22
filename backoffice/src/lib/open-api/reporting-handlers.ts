import "server-only";

import { z } from "zod";
import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";
import { resolveSdkBaseUrl } from "@/lib/sdk-url";

const PatientLookupQuerySchema = z
  .object({
    patientId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.patientId), "Provide patientId");

type PublicRecord = Record<string, unknown>;

const CaseCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{6}$/,
    "caseCode must contain exactly 6 letters or numbers",
  )
  .transform((value) => value.toUpperCase());

const UploadReportNotificationSchema = z
  .object({
    caseCode: CaseCodeSchema,
  })
  .strict();

const TwoPQCaseLookupParamsSchema = z.object({
  caseCode: CaseCodeSchema,
});

class SdkBridgeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: unknown,
  ) {
    super("SDK bridge request failed");
  }
}

function isRecord(value: unknown): value is PublicRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getInternalOpenApiToken() {
  return process.env.GOLDENCROW_OPENAPI_INTERNAL_TOKEN?.trim();
}

function publicUploadNotificationResponse(response: unknown, caseCode: string) {
  if (!isRecord(response)) {
    return response;
  }

  return {
    ...response,
    caseCode,
  };
}

function publicTwoPQCaseResponse(response: unknown) {
  if (!isRecord(response)) {
    return response;
  }

  return response.caseSnapshot ?? response;
}

function publicPatientLookupResponse(response: unknown) {
  if (!isRecord(response)) {
    return response;
  }

  return isRecord(response.patient) ? response.patient : response;
}

function publicReportingTokenResponse(response: unknown) {
  if (!isRecord(response)) {
    return response;
  }

  const { issuedTo: _issuedTo, ...publicResponse } = response;
  return publicResponse;
}

function internalTwoPQCaseSnapshot(response: unknown) {
  if (!isRecord(response)) {
    return null;
  }

  const snapshot = response.caseSnapshot ?? response;
  return isRecord(snapshot) ? snapshot : null;
}

function internalPatientIdFromTwoPQCaseSnapshot(snapshot: PublicRecord | null) {
  if (!snapshot) {
    return undefined;
  }

  const patient = isRecord(snapshot.patient) ? snapshot.patient : null;
  const mainCase = isRecord(snapshot.main_case) ? snapshot.main_case : null;
  return stringValue(patient?.id) ?? stringValue(mainCase?.patient_id);
}

function twoPQCaseLookupPath(caseCode: string) {
  return `/internal/openapi/reporting/2pq/cases/${encodeURIComponent(
    caseCode,
  )}`;
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

function internalUploadNotificationPayload(
  caseCode: string,
  patientId: string,
) {
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
  };
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

async function requireReportingAccessToken(request: Request, endpoint: string) {
  const token = getBearerToken(request);
  if (!token) {
    return json({ error: "Missing reporting access token." }, 401);
  }

  try {
    await sdkBridgeFetch(request, "/internal/openapi/reporting/tokens/verify", {
      method: "POST",
      body: {
        token,
        endpoint,
      },
    });
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
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
  return `/internal/openapi/reporting/patients?${params.toString()}`;
}

async function sdkBridgeFetch(
  request: Request,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const internalToken = getInternalOpenApiToken();
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
  const authError = await requireReportingAccessToken(
    request,
    "/open-api/reporting/patients",
  );
  if (authError) {
    return authError;
  }

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.has("email") || searchParams.has("medicalRecordNumber")) {
    return json({ error: "Only patientId lookup is supported." }, 400);
  }

  const parsedQuery = PatientLookupQuerySchema.safeParse({
    patientId: optionalQueryValue(searchParams, "patientId"),
  });
  if (!parsedQuery.success) {
    return json(
      { error: parsedQuery.error.issues[0]?.message ?? "Invalid query." },
      400,
    );
  }

  try {
    const sdkResponse = await sdkBridgeFetch(
      request,
      patientLookupPath(parsedQuery.data),
    );
    return json(publicPatientLookupResponse(sdkResponse));
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

export async function handleReportUploadNotification(request: Request) {
  const authError = await requireReportingAccessToken(
    request,
    "/open-api/reporting/reports/upload",
  );
  if (authError) {
    return authError;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsedBody = UploadReportNotificationSchema.safeParse(payload);
  if (!parsedBody.success) {
    return json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
      400,
    );
  }

  try {
    const { caseCode } = parsedBody.data;
    const caseResponse = await sdkBridgeFetch(
      request,
      twoPQCaseLookupPath(caseCode),
    );
    const patientId = internalPatientIdFromTwoPQCaseSnapshot(
      internalTwoPQCaseSnapshot(caseResponse),
    );
    if (!patientId) {
      return json({ error: "2PQ case does not have a patient id." }, 422);
    }

    const sdkResponse = await sdkBridgeFetch(
      request,
      "/internal/openapi/reporting/reports/upload",
      {
        method: "POST",
        body: internalUploadNotificationPayload(caseCode, patientId),
      },
    );
    return json(publicUploadNotificationResponse(sdkResponse, caseCode), 201);
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

export async function handleTwoPQCaseLookup(
  request: Request,
  caseCode: string,
) {
  const authError = await requireReportingAccessToken(
    request,
    "/open-api/reporting/2pq/cases/{caseCode}",
  );
  if (authError) {
    return authError;
  }

  const parsedParams = TwoPQCaseLookupParamsSchema.safeParse({ caseCode });
  if (!parsedParams.success) {
    return json(
      {
        error: parsedParams.error.issues[0]?.message ?? "Invalid path params.",
      },
      400,
    );
  }

  try {
    const sdkResponse = await sdkBridgeFetch(
      request,
      twoPQCaseLookupPath(parsedParams.data.caseCode),
    );
    return json(publicTwoPQCaseResponse(sdkResponse));
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

export async function handleReportingTokenRefresh(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return json({ error: "Missing reporting access token." }, 401);
  }

  try {
    const sdkResponse = await sdkBridgeFetch(
      request,
      "/internal/openapi/reporting/tokens/refresh",
      {
        method: "POST",
        body: { token },
      },
    );
    return json(publicReportingTokenResponse(sdkResponse), 201);
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

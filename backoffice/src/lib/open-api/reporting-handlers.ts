import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";
import { getReportingApiToken } from "@/lib/reporting-api-token";
import { resolveSdkBaseUrl } from "@/lib/sdk-url";

const PatientLookupQuerySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    medicalRecordNumber: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => Boolean(value.email || value.medicalRecordNumber),
    "Provide email or medicalRecordNumber",
  );

const UploadedReportNotificationSchema = z.object({
  patientRef: z.string().trim().min(1),
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

type PublicRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is PublicRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getInternalOpenApiToken() {
  return process.env.GOLDENCROW_OPENAPI_INTERNAL_TOKEN?.trim();
}

function patientRefSigningSecret() {
  const configuredSecret = process.env.GOLDENCROW_PATIENT_REF_SECRET?.trim();
  const secret = configuredSecret || getInternalOpenApiToken();
  if (!secret) {
    throw new SdkBridgeError(503, {
      error: "Internal OpenAPI token is not configured",
    });
  }

  return secret;
}

function signPatientRefPayload(payload: string) {
  return createHmac("sha256", patientRefSigningSecret())
    .update(payload)
    .digest("base64url");
}

function createPatientRef(patientId: string) {
  const payload = Buffer.from(JSON.stringify({ patientId }), "utf8").toString(
    "base64url",
  );
  return `gcp_${payload}.${signPatientRefPayload(payload)}`;
}

function decodePatientRef(patientRef: string) {
  const normalized = patientRef.trim();
  if (!normalized.startsWith("gcp_")) {
    throw new SdkBridgeError(400, { error: "Invalid patientRef." });
  }

  const [payload, signature] = normalized.slice(4).split(".");
  if (!payload || !signature) {
    throw new SdkBridgeError(400, { error: "Invalid patientRef." });
  }

  const expectedSignature = signPatientRefPayload(payload);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "base64url");
  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new SdkBridgeError(400, { error: "Invalid patientRef." });
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new SdkBridgeError(400, { error: "Invalid patientRef." });
  }

  if (!isRecord(decodedPayload)) {
    throw new SdkBridgeError(400, { error: "Invalid patientRef." });
  }

  const patientId = stringValue(decodedPayload.patientId);
  if (!patientId) {
    throw new SdkBridgeError(400, { error: "Invalid patientRef." });
  }

  return patientId;
}

function publicPatientRecord(patient: unknown, fallbackPatientRef?: string) {
  if (!isRecord(patient)) {
    return patient;
  }

  const { id, ...patientData } = patient;
  const patientId = stringValue(id);
  const patientRef = patientId
    ? createPatientRef(patientId)
    : fallbackPatientRef;

  return patientRef ? { ...patientData, patientRef } : patientData;
}

function publicPatientLookupResponse(response: unknown) {
  if (!isRecord(response)) {
    return response;
  }

  return {
    ...response,
    patient: publicPatientRecord(response.patient),
  };
}

function publicUploadNotificationResponse(
  response: unknown,
  patientRef: string,
) {
  if (!isRecord(response)) {
    return response;
  }

  const { patientId: _patientId, ...responseData } = response;
  return {
    ...responseData,
    patientRef,
  };
}

function publicTwoPQScope(scope: unknown) {
  if (!isRecord(scope)) {
    return scope;
  }

  const { patientId, ...scopeData } = scope;
  const normalizedPatientId = stringValue(patientId);
  const patientRef = normalizedPatientId
    ? createPatientRef(normalizedPatientId)
    : undefined;

  return patientRef ? { ...scopeData, patientRef } : scopeData;
}

function publicTwoPQEntity(entity: unknown) {
  if (!isRecord(entity)) {
    return entity;
  }

  return {
    ...entity,
    scope: publicTwoPQScope(entity.scope),
  };
}

function publicTwoPQCaseSnapshot(snapshot: unknown) {
  if (!isRecord(snapshot)) {
    return snapshot;
  }

  const mainCase = isRecord(snapshot.main_case) ? snapshot.main_case : null;
  const patientId =
    stringValue(isRecord(snapshot.patient) ? snapshot.patient.id : undefined) ??
    stringValue(mainCase?.patient_id);
  const patientRef = patientId ? createPatientRef(patientId) : undefined;

  let publicMainCase: unknown = snapshot.main_case;
  if (mainCase) {
    const { patient_id: _patientId, ...mainCaseData } = mainCase;
    publicMainCase = {
      ...mainCaseData,
      patient_ref: patientRef ?? null,
    };
  }

  let publicEntities = snapshot.entities;
  if (isRecord(snapshot.entities)) {
    publicEntities = {
      ...snapshot.entities,
      cases: Array.isArray(snapshot.entities.cases)
        ? snapshot.entities.cases.map(publicTwoPQEntity)
        : snapshot.entities.cases,
      samplings: Array.isArray(snapshot.entities.samplings)
        ? snapshot.entities.samplings.map(publicTwoPQEntity)
        : snapshot.entities.samplings,
    };
  }

  return {
    ...snapshot,
    main_case: publicMainCase,
    patient: publicPatientRecord(snapshot.patient, patientRef),
    entities: publicEntities,
  };
}

function publicTwoPQCaseResponse(response: unknown) {
  if (!isRecord(response)) {
    return response;
  }

  return publicTwoPQCaseSnapshot(response.caseSnapshot ?? response);
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
  const authError = requireReportingToken(request);
  if (authError) {
    return authError;
  }

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = PatientLookupQuerySchema.safeParse({
    email: optionalQueryValue(searchParams, "email"),
    medicalRecordNumber: optionalQueryValue(
      searchParams,
      "medicalRecordNumber",
    ),
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
    const { patientRef, ...publicPayload } = parsedBody.data;
    const patientId = decodePatientRef(patientRef);
    const sdkResponse = await sdkBridgeFetch(
      request,
      "/internal/openapi/reporting/reports/uploaded",
      {
        method: "POST",
        body: {
          ...publicPayload,
          patientId,
        },
      },
    );
    return json(publicUploadNotificationResponse(sdkResponse, patientRef), 201);
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
  const authError = requireReportingToken(request);
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
      `/internal/openapi/reporting/2pq/cases/${encodeURIComponent(
        parsedParams.data.caseCode,
      )}`,
    );
    return json(publicTwoPQCaseResponse(sdkResponse));
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

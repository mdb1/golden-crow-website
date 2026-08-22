import "server-only";

import { z } from "zod";
import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";
import { resolveSdkBaseUrl } from "@/lib/sdk-url";

type PublicRecord = Record<string, unknown>;

const CaseCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{6}$/,
    "caseCode must contain exactly 6 letters or numbers",
  )
  .transform((value) => value.toUpperCase());

const PatientLookupQuerySchema = z
  .object({
    patientId: z.string().trim().min(1).optional(),
    caseCode: CaseCodeSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.patientId && !value.caseCode) {
      context.addIssue({
        code: "custom",
        message: "Provide patientId or caseCode.",
      });
    }

    if (value.patientId && value.caseCode) {
      context.addIssue({
        code: "custom",
        message: "Use either patientId or caseCode, not both.",
      });
    }
  });

const UploadReportNotificationSchema = z
  .object({
    caseCode: CaseCodeSchema,
    download_url: z.string().trim().url("download_url must be a valid URL."),
  })
  .strict();

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

function twoPQCaseLookupPath(caseCode: string) {
  return `/internal/openapi/reporting/2pq/cases/${encodeURIComponent(
    caseCode,
  )}`;
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

function requireReportingAccessToken(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return json({ error: "Missing reporting access token." }, 401);
  }

  return token;
}

function optionalQueryValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) ?? undefined;
}

function patientLookupPath(query: z.infer<typeof PatientLookupQuerySchema>) {
  const params = new URLSearchParams();
  if (query.patientId) {
    params.set("patientId", query.patientId);
  }
  if (query.caseCode) {
    params.set("caseCode", query.caseCode);
  }
  return `/internal/openapi/reporting/patients?${params.toString()}`;
}

async function sdkBridgeFetch(
  request: Request,
  path: string,
  init: { method?: string; body?: unknown; bearerToken?: string } = {},
) {
  const targetUrl = new URL(
    path,
    resolveSdkBaseUrl({ currentHost: incomingHost(request) }),
  );
  const headers = new Headers();
  if (init.bearerToken) {
    headers.set("authorization", `Bearer ${init.bearerToken}`);
  }
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
  const accessToken = requireReportingAccessToken(request);
  if (accessToken instanceof Response) {
    return accessToken;
  }

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.has("email") || searchParams.has("medicalRecordNumber")) {
    return json(
      { error: "Only patientId or caseCode lookup is supported." },
      400,
    );
  }

  const parsedQuery = PatientLookupQuerySchema.safeParse({
    patientId: optionalQueryValue(searchParams, "patientId"),
    caseCode: optionalQueryValue(searchParams, "caseCode"),
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
      { bearerToken: accessToken },
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
  const accessToken = requireReportingAccessToken(request);
  if (accessToken instanceof Response) {
    return accessToken;
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
    const { caseCode, download_url } = parsedBody.data;
    const sdkResponse = await sdkBridgeFetch(
      request,
      "/internal/openapi/reporting/reports/upload",
      {
        method: "POST",
        body: { caseCode, download_url },
        bearerToken: accessToken,
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
  const accessToken = requireReportingAccessToken(request);
  if (accessToken instanceof Response) {
    return accessToken;
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
      { bearerToken: accessToken },
    );
    return json(publicTwoPQCaseResponse(sdkResponse));
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

export async function handleOAuthTokenExchange(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsedBody = OAuthTokenRequestSchema.safeParse(payload);
  if (!parsedBody.success) {
    return json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
      400,
    );
  }

  try {
    const sdkResponse = await sdkBridgeFetch(
      request,
      "/internal/openapi/oauth/token",
      {
        method: "POST",
        body: parsedBody.data,
      },
    );
    return json(sdkResponse);
  } catch (error) {
    if (error instanceof SdkBridgeError) {
      return bridgeErrorResponse(error);
    }
    throw error;
  }
}

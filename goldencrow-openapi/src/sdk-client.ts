import { ENV } from "./config/env.js";

export class SdkBridgeError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "SdkBridgeError";
  }
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function responseMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

export async function sdkBridgeFetch<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  if (!ENV.GOLDENCROW_OPENAPI_INTERNAL_TOKEN) {
    throw new SdkBridgeError("Internal OpenAPI token is not configured.", 503);
  }

  const headers = new Headers({
    "x-goldencrow-internal-token": ENV.GOLDENCROW_OPENAPI_INTERNAL_TOKEN,
  });
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }

  const response = await fetch(joinUrl(ENV.GOLDENCROW_SDK_URL, path), {
    method: init.method ?? "GET",
    headers,
    body,
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
      responseMessage(parsedBody, `${response.status} ${response.statusText}`),
      response.status,
      parsedBody,
    );
  }

  return parsedBody as T;
}

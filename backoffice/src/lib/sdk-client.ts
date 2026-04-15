const SDK_PROXY_PATH = "/api/sdk";

export class SdkRequestError extends Error {
  status: number;
  method: string;
  path: string;
  details: string;

  constructor({
    status,
    method,
    path,
    message,
    details,
  }: {
    status: number;
    method: string;
    path: string;
    message: string;
    details: string;
  }) {
    super(message);
    this.name = "SdkRequestError";
    this.status = status;
    this.method = method;
    this.path = path;
    this.details = details;
  }
}

function hasRequestBody(body: RequestInit["body"]) {
  if (body == null) {
    return false;
  }

  if (typeof body === "string") {
    return body.length > 0;
  }

  return true;
}

async function buildSdkRequestError(
  response: Response,
  method: string,
  path: string
) {
  const rawText = await response.text();
  let parsedMessage: string | undefined;

  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        parsedMessage = parsed.error.trim();
      } else if (typeof parsed.message === "string" && parsed.message.trim()) {
        parsedMessage = parsed.message.trim();
      }
    } catch {
      parsedMessage = undefined;
    }
  }

  const message =
    (parsedMessage ?? rawText.trim()) ||
    `${response.status} ${response.statusText}`.trim() ||
    "SDK request failed.";
  const details = [
    `Request: ${method} ${path}`,
    `Status: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    rawText ? `Response:\n${rawText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return new SdkRequestError({
    status: response.status,
    method,
    path,
    message,
    details,
  });
}

/**
 * Client-side SDK fetch. Used by "use client" components.
 * Relies on credentials: "include" to send the session cookie from the browser.
 */
export async function sdkFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const includesBody = hasRequestBody(init?.body);
  if (includesBody) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  } else {
    headers.delete("Content-Type");
  }

  const res = await fetch(`${SDK_PROXY_PATH}${path}`, {
    ...init,
    method,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    throw await buildSdkRequestError(res, method, path);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

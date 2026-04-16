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
  path: string,
  requestBodyDetails?: string
) {
  const rawText = await response.text();
  let parsedMessage: string | undefined;
  let parsedBody: Record<string, unknown> | undefined;

  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText) as Record<string, unknown>;
      if (typeof parsedBody.error === "string" && parsedBody.error.trim()) {
        parsedMessage = parsedBody.error.trim();
      } else if (typeof parsedBody.message === "string" && parsedBody.message.trim()) {
        parsedMessage = parsedBody.message.trim();
      }
    } catch {
      parsedBody = undefined;
    }
  }

  const message =
    (parsedMessage ?? rawText.trim()) ||
    `${response.status} ${response.statusText}`.trim() ||
    "SDK request failed.";
  const details = [
    `Request: ${method} ${path}`,
    requestBodyDetails ? `Request body:\n${requestBodyDetails}` : null,
    `Status: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    `Response content-type: ${response.headers.get("content-type") ?? "unknown"}`,
    response.headers.get("x-vercel-id")
      ? `Vercel request id: ${response.headers.get("x-vercel-id")}`
      : null,
    parsedBody && typeof parsedBody.errorName === "string"
      ? `Error name: ${parsedBody.errorName}`
      : null,
    parsedBody && typeof parsedBody.statusCode === "number"
      ? `SDK status code: ${parsedBody.statusCode}`
      : null,
    parsedBody && typeof parsedBody.hint === "string"
      ? `Hint: ${parsedBody.hint}`
      : null,
    parsedBody
      ? `Response JSON:\n${JSON.stringify(parsedBody, null, 2)}`
      : rawText
        ? `Response:\n${rawText}`
        : "Response body: <empty>",
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
    let requestBodyDetails: string | undefined;
    if (typeof init?.body === "string" && init.body.trim()) {
      try {
        requestBodyDetails = JSON.stringify(JSON.parse(init.body), null, 2);
      } catch {
        requestBodyDetails = init.body;
      }
    }

    throw await buildSdkRequestError(res, method, path, requestBodyDetails);
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

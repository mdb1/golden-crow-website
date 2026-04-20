import { cookies, headers } from "next/headers";
import { resolveSdkBaseUrl } from "@/lib/sdk-url";

function hasRequestBody(body: RequestInit["body"]) {
  if (body == null) {
    return false;
  }

  if (typeof body === "string") {
    return body.length > 0;
  }

  return true;
}

async function buildSdkServerError(
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

  return new Error(
    [
      `SDK ${method} ${path} failed: ${message}`,
      requestBodyDetails ? `Request body:\n${requestBodyDetails}` : null,
      `Response content-type: ${response.headers.get("content-type") ?? "unknown"}`,
      response.headers.get("x-vercel-id")
        ? `Vercel request id: ${response.headers.get("x-vercel-id")}`
        : null,
      parsedBody && typeof parsedBody.errorName === "string"
        ? `Error name: ${parsedBody.errorName}`
        : null,
      parsedBody
        ? `Response JSON:\n${JSON.stringify(parsedBody, null, 2)}`
        : rawText
          ? `Response:\n${rawText}`
          : "Response body: <empty>",
    ]
      .filter(Boolean)
      .join("\n\n")
  );
}

function resolveSdkTargetUrl(headerStore: Headers, path: string): string {
  const sdkBaseUrl = resolveSdkBaseUrl({
    currentHost: headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? undefined,
  });

  return `${sdkBaseUrl}${path}`;
}

/**
 * Server-side SDK fetch. Used by Server Components and Route Handlers.
 * Forwards the session cookie from the incoming request to the SDK.
 */
export async function sdkFetchServer<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const requestHeaders = new Headers(init?.headers);
  if (hasRequestBody(init?.body)) {
    if (!requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }
  } else {
    requestHeaders.delete("Content-Type");
  }
  const cookieStore = await cookies();
  const headerStore = await headers();
  const sessionCookie = cookieStore.get("session");
  if (sessionCookie) {
    requestHeaders.set("Cookie", `session=${sessionCookie.value}`);
  }

  // Server components can call the SDK directly and forward the session cookie.
  // This avoids fragile self-fetches against the current Next.js host/protocol.
  const res = await fetch(resolveSdkTargetUrl(headerStore, path), {
    ...init,
    method,
    headers: requestHeaders,
    cache: "no-store",
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

    throw await buildSdkServerError(res, method, path, requestBodyDetails);
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

import { cookies, headers } from "next/headers";

function hasRequestBody(body: RequestInit["body"]) {
  if (body == null) {
    return false;
  }

  if (typeof body === "string") {
    return body.length > 0;
  }

  return true;
}

async function buildSdkServerError(response: Response, method: string, path: string) {
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

  return new Error([`SDK ${method} ${path} failed: ${message}`, rawText ? `Response:\n${rawText}` : null].filter(Boolean).join("\n\n"));
}

function resolveProxyBaseUrl(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (host) {
    const protocol =
      headerStore.get("x-forwarded-proto") ??
      (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
}

function resolveSdkTargetUrl(headerStore: Headers, path: string): string {
  const sdkBaseUrl =
    process.env.GOLDENCROW_SDK_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_SDK_URL?.replace(/\/$/, "");

  if (sdkBaseUrl) {
    return `${sdkBaseUrl}${path}`;
  }

  return `${resolveProxyBaseUrl(headerStore)}/api/sdk${path}`;
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
    throw await buildSdkServerError(res, method, path);
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

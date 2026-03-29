import { cookies, headers } from "next/headers";

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
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set("Content-Type", "application/json");
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
    headers: requestHeaders,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`SDK ${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

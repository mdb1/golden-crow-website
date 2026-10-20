import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveSdkBaseUrl } from "@/lib/sdk-url";

const SESSION_RECOVERY_HEADER = "x-sdk-session-recovery";
const EXPECTED_SESSION_UID_HEADER = "x-expected-session-uid";
const EXPECTED_SESSION_EMAIL_HEADER = "x-expected-session-email";
const EXPECTED_SESSION_PROJECT_HEADER = "x-expected-session-project";
const EXPECTED_SESSION_SURFACE_HEADER = "x-expected-session-surface";

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function identityRejected(
  message: string,
  code = "SESSION_RECOVERY_IDENTITY_MISMATCH",
) {
  return Response.json(
    { error: message, code },
    { status: 401 },
  );
}

function pageSessionMatches(
  session: Session | null,
  expected: {
    email: string;
    project: string;
    surface: string;
  },
) {
  return Boolean(
    session?.user &&
      normalizedEmail(session.user.email) === expected.email &&
      session.user.project === expected.project &&
      session.user.accessSurface === expected.surface,
  );
}

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ sdkPath: string[] }> }
) {
  const { sdkPath } = await context.params;
  const incomingRequestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? undefined;
  const sdkBaseUrl = resolveSdkBaseUrl({ currentHost: incomingRequestHost });
  const targetUrl = new URL(`${sdkBaseUrl}/${sdkPath.join("/")}`);
  targetUrl.search = new URL(request.url).search;
  const path = sdkPath.join("/");
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text();

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const isSessionRecovery =
    path === "auth/login" && headers.get(SESSION_RECOVERY_HEADER) === "1";
  const expectedPageIdentity = {
    uid: headers.get(EXPECTED_SESSION_UID_HEADER)?.trim() ?? "",
    email: normalizedEmail(headers.get(EXPECTED_SESSION_EMAIL_HEADER)),
    project: headers.get(EXPECTED_SESSION_PROJECT_HEADER)?.trim() ?? "",
    surface: headers.get(EXPECTED_SESSION_SURFACE_HEADER)?.trim() ?? "",
  };
  const hasPageIdentityBinding =
    !path.startsWith("auth/") &&
    [
      EXPECTED_SESSION_EMAIL_HEADER,
      EXPECTED_SESSION_PROJECT_HEADER,
      EXPECTED_SESSION_SURFACE_HEADER,
    ].some((header) => headers.has(header));

  headers.delete(SESSION_RECOVERY_HEADER);
  headers.delete(EXPECTED_SESSION_EMAIL_HEADER);
  headers.delete(EXPECTED_SESSION_PROJECT_HEADER);
  headers.delete(EXPECTED_SESSION_SURFACE_HEADER);
  if (isSessionRecovery) {
    headers.delete(EXPECTED_SESSION_UID_HEADER);
  }

  if (isSessionRecovery) {
    let pageSession: Session | null;
    try {
      pageSession = await getServerSession(authOptions);
    } catch {
      return identityRejected("The page session could not be verified.");
    }

    let requestedSurface = "";
    try {
      requestedSurface = body
        ? String((JSON.parse(body) as { surface?: unknown }).surface ?? "")
        : "";
    } catch {
      return identityRejected("The session recovery request is invalid.");
    }

    if (
      !expectedPageIdentity.uid ||
      !expectedPageIdentity.email ||
      !expectedPageIdentity.project ||
      !expectedPageIdentity.surface ||
      !pageSessionMatches(pageSession, expectedPageIdentity) ||
      requestedSurface !== expectedPageIdentity.surface
    ) {
      return identityRejected(
        "The page session changed. Sign in with the original account to continue.",
      );
    }
  } else if (hasPageIdentityBinding) {
    let pageSession: Session | null;
    try {
      pageSession = await getServerSession(authOptions);
    } catch {
      return identityRejected(
        "The page session could not be verified.",
        "SESSION_IDENTITY_MISMATCH",
      );
    }

    if (
      !expectedPageIdentity.uid ||
      !expectedPageIdentity.email ||
      !expectedPageIdentity.project ||
      !expectedPageIdentity.surface ||
      !pageSessionMatches(pageSession, expectedPageIdentity)
    ) {
      return identityRejected(
        "The page session changed. Sign in again to continue.",
        "SESSION_IDENTITY_MISMATCH",
      );
    }

    headers.set("x-project", expectedPageIdentity.project);
  } else if (!path.startsWith("auth/")) {
    // Inject project context from NextAuth session (per D-07).
    try {
      const pageSession = await getServerSession(authOptions);
      if (pageSession?.user?.project) {
        headers.set("x-project", pageSession.user.project);
      }
    } catch {
      // Session read failure is non-fatal — SDK will enforce access via cookie.
    }
  }

  if (!body || body.length === 0) {
    headers.delete("content-type");
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  const responseBuffer = await response.arrayBuffer();

  if (isSessionRecovery && response.ok) {
    let verifiedIdentity: { uid?: unknown; email?: unknown } = {};
    try {
      verifiedIdentity = JSON.parse(
        new TextDecoder().decode(responseBuffer),
      ) as { uid?: unknown; email?: unknown };
    } catch {
      return identityRejected(
        "The renewed session identity could not be verified.",
      );
    }

    if (
      verifiedIdentity.uid !== expectedPageIdentity.uid ||
      normalizedEmail(
        typeof verifiedIdentity.email === "string"
          ? verifiedIdentity.email
          : null,
      ) !== expectedPageIdentity.email
    ) {
      return identityRejected(
        "The renewed session belongs to a different account.",
      );
    }
  }

  if (!response.ok && responseBuffer.byteLength === 0) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
    return new Response(
      JSON.stringify({
        error: `SDK returned an empty ${response.status} response.`,
        errorName: "SdkProxyError",
        hint: "The upstream SDK failed before returning a response body. Use the Vercel request id to inspect the SDK logs.",
        upstream: {
          method,
          path: `/${sdkPath.join("/")}`,
          targetUrl: targetUrl.toString(),
        },
      }),
      {
        status: response.status,
        headers: responseHeaders,
      }
    );
  }

  return new Response(responseBuffer, {
    status: response.status,
    headers: responseHeaders,
  });
}

export { proxyRequest as GET };
export { proxyRequest as POST };
export { proxyRequest as PUT };
export { proxyRequest as PATCH };
export { proxyRequest as DELETE };
export { proxyRequest as OPTIONS };

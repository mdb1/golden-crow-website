import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const SDK_URL =
  process.env.GOLDENCROW_SDK_URL ??
  process.env.NEXT_PUBLIC_SDK_URL ??
  "http://localhost:3000";

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ sdkPath: string[] }> }
) {
  const { sdkPath } = await context.params;
  const targetUrl = new URL(`${SDK_URL}/${sdkPath.join("/")}`);
  targetUrl.search = new URL(request.url).search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  // Inject project context from NextAuth session (per D-07)
  // Skip for auth routes — they don't need project context
  const path = sdkPath.join("/");
  if (!path.startsWith("auth/")) {
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.project) {
        headers.set("x-project", session.user.project);
      }
    } catch {
      // Session read failure is non-fatal — SDK will enforce access via cookie
    }
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text();
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

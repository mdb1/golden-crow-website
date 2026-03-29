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

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text();

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");

  return new Response(response.body, {
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

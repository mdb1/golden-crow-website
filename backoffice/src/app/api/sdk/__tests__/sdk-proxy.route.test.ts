// __tests__/sdk-proxy.route.test.ts — /api/sdk/[...sdkPath] pass-through.
//
// Pins what the proxy forwards to the SDK (method, path, query, body, the
// caller's headers incl. cookies) and what it strips (host, connection,
// content-length, content-type on empty bodies, content-encoding on the way
// back), the x-project injection from the NextAuth session, and the JSON
// envelope for an empty upstream error. `fetch` is a jest mock.

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock("@/lib/auth", () => ({ authOptions: { marker: "authOptions" } }));

import * as route from "@/app/api/sdk/[...sdkPath]/route";

const SDK = "https://sdk.test";
const fetchMock = jest.fn();
const realFetch = global.fetch;

function ctx(...segments: string[]) {
  return { params: Promise.resolve({ sdkPath: segments }) };
}

function lastFetch(): { url: string; init: RequestInit & { headers: Headers } } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init };
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ ok: 1 }), {
      status: 200,
      headers: { "content-type": "application/json", "content-encoding": "gzip", "x-up": "1" },
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  mockGetServerSession.mockReset().mockResolvedValue({ user: { project: "pocketgyms" } });
  process.env.GOLDENCROW_SDK_URL = SDK;
});

afterAll(() => {
  global.fetch = realFetch;
  delete process.env.GOLDENCROW_SDK_URL;
});

it("exports the same handler for every method", () => {
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
    expect(route[m]).toBe(route.GET);
  }
});

it("GET: forwards path + query, caller cookies/auth, no body, strips hop headers; injects x-project", async () => {
  const res = await route.GET(
    new Request("https://backoffice.test/api/sdk/admin/users?limit=5&q=a%20b", {
      headers: {
        cookie: "next-auth.session-token=s; GcFitnessAuthToken=g",
        authorization: "Bearer t",
        host: "backoffice.test",
        connection: "keep-alive",
        "content-type": "application/json",
        "x-expected-session-uid": "publisher-1",
      },
    }),
    ctx("admin", "users"),
  );
  const { url, init } = lastFetch();
  expect(url).toBe(`${SDK}/admin/users?limit=5&q=a%20b`);
  expect(init.method).toBe("GET");
  expect(init.body).toBeUndefined();
  expect(init.cache).toBe("no-store");
  expect(init.redirect).toBe("manual");
  expect(init.headers.get("cookie")).toBe("next-auth.session-token=s; GcFitnessAuthToken=g");
  expect(init.headers.get("authorization")).toBe("Bearer t");
  expect(init.headers.get("host")).toBeNull();
  expect(init.headers.get("connection")).toBeNull();
  expect(init.headers.get("content-type")).toBeNull();
  expect(init.headers.get("x-expected-session-uid")).toBe("publisher-1");
  expect(init.headers.get("x-project")).toBe("pocketgyms");
  expect(mockGetServerSession).toHaveBeenCalledWith({ marker: "authOptions" });

  expect(res.status).toBe(200);
  expect(res.headers.get("content-encoding")).toBeNull();
  expect(res.headers.get("x-up")).toBe("1");
  await expect(res.json()).resolves.toEqual({ ok: 1 });
});

it.each(["POST", "PUT", "PATCH", "DELETE"])("%s: forwards the text body and content-type, drops content-length", async (method) => {
  await route.POST(
    new Request("https://backoffice.test/api/sdk/things", {
      method,
      headers: { "content-type": "application/json", "content-length": "11" },
      body: '{"a":"b c"}',
    }),
    ctx("things"),
  );
  const { init } = lastFetch();
  expect(init.method).toBe(method);
  expect(init.body).toBe('{"a":"b c"}');
  expect(init.headers.get("content-type")).toBe("application/json");
  expect(init.headers.get("content-length")).toBeNull();
});

it("POST with an empty body sends no body and no content-type", async () => {
  await route.POST(
    new Request("https://backoffice.test/api/sdk/things", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }),
    ctx("things"),
  );
  const { init } = lastFetch();
  expect(init.body).toBeUndefined();
  expect(init.headers.get("content-type")).toBeNull();
});

it("auth/* paths never read the session nor inject x-project", async () => {
  await route.GET(new Request("https://backoffice.test/api/sdk/auth/context"), ctx("auth", "context"));
  expect(mockGetServerSession).not.toHaveBeenCalled();
  expect(lastFetch().init.headers.get("x-project")).toBeNull();
});

it("session recovery requires the same live page session and verified SDK identity", async () => {
  mockGetServerSession.mockResolvedValue({
    user: {
      email: "publisher@example.com",
      project: "mydnamap",
      accessSurface: "publisher-portal",
    },
  });
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "ok",
        uid: "publisher-1",
        email: "publisher@example.com",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=fresh; Path=/; HttpOnly",
        },
      },
    ),
  );

  const res = await route.POST(
    new Request("https://backoffice.test/api/sdk/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sdk-session-recovery": "1",
        "x-expected-session-uid": "publisher-1",
        "x-expected-session-email": "publisher@example.com",
        "x-expected-session-project": "mydnamap",
        "x-expected-session-surface": "publisher-portal",
      },
      body: JSON.stringify({
        idToken: "firebase-token",
        surface: "publisher-portal",
      }),
    }),
    ctx("auth", "login"),
  );

  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("session=fresh");
  const { init } = lastFetch();
  expect(init.headers.get("x-sdk-session-recovery")).toBeNull();
  expect(init.headers.get("x-expected-session-uid")).toBeNull();
  expect(init.headers.get("x-expected-session-email")).toBeNull();
  expect(init.headers.get("x-expected-session-project")).toBeNull();
  expect(init.headers.get("x-expected-session-surface")).toBeNull();
});

it("binds protected workbench requests to the same live page session", async () => {
  mockGetServerSession.mockResolvedValue({
    user: {
      email: "publisher@example.com",
      project: "mydnamap",
      accessSurface: "publisher-portal",
    },
  });

  const res = await route.GET(
    new Request("https://backoffice.test/api/sdk/admin/support-services/offers", {
      headers: {
        "x-expected-session-uid": "publisher-1",
        "x-expected-session-email": "publisher@example.com",
        "x-expected-session-project": "mydnamap",
        "x-expected-session-surface": "publisher-portal",
      },
    }),
    ctx("admin", "support-services", "offers"),
  );

  expect(res.status).toBe(200);
  const { init } = lastFetch();
  expect(init.headers.get("x-project")).toBe("mydnamap");
  expect(init.headers.get("x-expected-session-uid")).toBe("publisher-1");
  expect(init.headers.get("x-expected-session-email")).toBeNull();
  expect(init.headers.get("x-expected-session-project")).toBeNull();
  expect(init.headers.get("x-expected-session-surface")).toBeNull();
});

it("rejects a stale workbench request after the page account changes", async () => {
  mockGetServerSession.mockResolvedValue({
    user: {
      email: "different@example.com",
      project: "mydnamap",
      accessSurface: "publisher-portal",
    },
  });

  const res = await route.POST(
    new Request("https://backoffice.test/api/sdk/admin/support-services/offers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-expected-session-uid": "publisher-1",
        "x-expected-session-email": "publisher@example.com",
        "x-expected-session-project": "mydnamap",
        "x-expected-session-surface": "publisher-portal",
      },
      body: JSON.stringify({ name: "Unsaved offer" }),
    }),
    ctx("admin", "support-services", "offers"),
  );

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({
    error: "The page session changed. Sign in again to continue.",
    code: "SESSION_IDENTITY_MISMATCH",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects session recovery before the SDK call when the page session ended", async () => {
  mockGetServerSession.mockResolvedValue(null);

  const res = await route.POST(
    new Request("https://backoffice.test/api/sdk/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sdk-session-recovery": "1",
        "x-expected-session-uid": "publisher-1",
        "x-expected-session-email": "publisher@example.com",
        "x-expected-session-project": "mydnamap",
        "x-expected-session-surface": "publisher-portal",
      },
      body: JSON.stringify({
        idToken: "firebase-token",
        surface: "publisher-portal",
      }),
    }),
    ctx("auth", "login"),
  );

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({
    error:
      "The page session changed. Sign in with the original account to continue.",
    code: "SESSION_RECOVERY_IDENTITY_MISMATCH",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not forward an SDK recovery cookie for a different verified uid", async () => {
  mockGetServerSession.mockResolvedValue({
    user: {
      email: "publisher@example.com",
      project: "mydnamap",
      accessSurface: "publisher-portal",
    },
  });
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "ok",
        uid: "different-publisher",
        email: "publisher@example.com",
      }),
      {
        status: 200,
        headers: { "set-cookie": "session=wrong; Path=/; HttpOnly" },
      },
    ),
  );

  const res = await route.POST(
    new Request("https://backoffice.test/api/sdk/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sdk-session-recovery": "1",
        "x-expected-session-uid": "publisher-1",
        "x-expected-session-email": "publisher@example.com",
        "x-expected-session-project": "mydnamap",
        "x-expected-session-surface": "publisher-portal",
      },
      body: JSON.stringify({
        idToken: "firebase-token",
        surface: "publisher-portal",
      }),
    }),
    ctx("auth", "login"),
  );

  expect(res.status).toBe(401);
  expect(res.headers.get("set-cookie")).toBeNull();
  expect(await res.json()).toEqual({
    error: "The renewed session belongs to a different account.",
    code: "SESSION_RECOVERY_IDENTITY_MISMATCH",
  });
});

it("session read failure is non-fatal (request still forwarded, no x-project)", async () => {
  mockGetServerSession.mockRejectedValue(new Error("jwt decode"));
  const res = await route.GET(new Request("https://backoffice.test/api/sdk/x"), ctx("x"));
  expect(res.status).toBe(200);
  expect(lastFetch().init.headers.get("x-project")).toBeNull();
});

it("a session project OVERRIDES a caller-supplied x-project", async () => {
  await route.GET(
    new Request("https://backoffice.test/api/sdk/x", { headers: { "x-project": "mydnamap" } }),
    ctx("x"),
  );
  expect(lastFetch().init.headers.get("x-project")).toBe("pocketgyms");
});

it("without a session project, a caller-supplied x-project passes through (the SDK does not read it)", async () => {
  mockGetServerSession.mockResolvedValue(null);
  await route.GET(
    new Request("https://backoffice.test/api/sdk/x", { headers: { "x-project": "mydnamap" } }),
    ctx("x"),
  );
  expect(lastFetch().init.headers.get("x-project")).toBe("mydnamap");
});

it("upstream error with a body is passed through verbatim (status + body)", async () => {
  fetchMock.mockResolvedValue(new Response('{"error":"nope"}', { status: 403, headers: { "content-type": "application/json" } }));
  const res = await route.GET(new Request("https://backoffice.test/api/sdk/x"), ctx("x"));
  expect(res.status).toBe(403);
  await expect(res.text()).resolves.toBe('{"error":"nope"}');
});

it("upstream EMPTY error → JSON envelope with the upstream status, method and path", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 502 }));
  const res = await route.DELETE(
    new Request("https://backoffice.test/api/sdk/a/b?z=1", { method: "DELETE" }),
    ctx("a", "b"),
  );
  expect(res.status).toBe(502);
  expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
  await expect(res.json()).resolves.toEqual({
    error: "SDK returned an empty 502 response.",
    errorName: "SdkProxyError",
    hint: expect.any(String),
    upstream: { method: "DELETE", path: "/a/b", targetUrl: `${SDK}/a/b?z=1` },
  });
});

it("upstream redirects are NOT followed — the 3xx is returned to the browser", async () => {
  fetchMock.mockResolvedValue(new Response("", { status: 302, headers: { location: "https://elsewhere" } }));
  const res = await route.GET(new Request("https://backoffice.test/api/sdk/x"), ctx("x"));
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("https://elsewhere");
});

it("the production backoffice host always targets the production SDK (env is ignored)", async () => {
  await route.GET(
    new Request("https://golden-crow-backoffice.vercel.app/api/sdk/x", {
      headers: { "x-forwarded-host": "golden-crow-backoffice.vercel.app" },
    }),
    ctx("x"),
  );
  expect(lastFetch().url).toBe("https://golden-crow-sdk.vercel.app/x");
});

it("a spoofed x-forwarded-host can only pick between the fixed SDK origins, never an arbitrary host", async () => {
  await route.GET(
    new Request("https://backoffice.test/api/sdk/x", { headers: { "x-forwarded-host": "evil.example" } }),
    ctx("x"),
  );
  expect(new URL(lastFetch().url).origin).toBe(SDK);
});

it("`..` segments cannot leave the SDK origin", async () => {
  await route.GET(new Request("https://backoffice.test/api/sdk/x"), ctx("..", "..", "@evil.example", "x"));
  expect(new URL(lastFetch().url).origin).toBe(SDK);
});

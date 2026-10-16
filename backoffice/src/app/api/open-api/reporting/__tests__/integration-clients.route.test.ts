// __tests__/integration-clients.route.test.ts
//
// The four admin-only reporting integration-client routes. Authz comes from
// the SDK's /auth/context (via getAdminContextServer → sdkFetchServer); only
// global admins (full_admin / 2pq_admin) or bootstrap accounts may proceed.
// `sdkFetchServer` is mocked: /auth/context returns the caller's context, and
// every other call is recorded so tests assert exactly what was forwarded —
// and that a denied caller forwarded NOTHING.
//
// Note on 401 vs 403: these routes have no 401. An unauthenticated caller
// makes /auth/context throw, which surfaces as a 500 carrying the SDK error.

const mockSdkCalls: Array<{ path: string; init?: RequestInit }> = [];
let mockContext: Record<string, unknown> | Error = {};
let mockSdkResult: unknown = { ok: true };
let mockSdkError: Error | null = null;

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(async (path: string, init?: RequestInit) => {
    if (path === "/auth/context") {
      if (mockContext instanceof Error) throw mockContext;
      return { context: mockContext, capabilities: [] };
    }
    mockSdkCalls.push({ path, init });
    if (mockSdkError) throw mockSdkError;
    return mockSdkResult;
  }),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

import { GET as listClients, POST as createClient } from "@/app/api/open-api/reporting/integration-clients/route";
import { GET as listEvents } from "@/app/api/open-api/reporting/integration-clients/events/route";
import { POST as revoke } from "@/app/api/open-api/reporting/integration-clients/[clientId]/revoke/route";
import { POST as rotate } from "@/app/api/open-api/reporting/integration-clients/[clientId]/secret/rotate/route";

const BASE = "https://backoffice.test/api/open-api/reporting/integration-clients";

function ctx(role: string, isBootstrap = false) {
  return {
    email: "x@example.com",
    uid: "u1",
    role,
    isBootstrap,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    projectAccess: ["mydnamap"],
  };
}

function params(clientId: string) {
  return { params: Promise.resolve({ clientId }) };
}

function postJson(url: string, body: string) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body });
}

beforeEach(() => {
  mockSdkCalls.length = 0;
  mockContext = ctx("full_admin");
  mockSdkResult = { ok: true };
  mockSdkError = null;
});

// Each route exercised as a uniform callable for the shared authz matrix.
const ROUTES: Array<[string, () => Promise<Response>]> = [
  ["GET list", () => listClients(new Request(BASE))],
  ["POST create", () => createClient(postJson(BASE, JSON.stringify({ name: "Acme" })))],
  ["GET events", () => listEvents(new Request(`${BASE}/events`))],
  ["POST revoke", () => revoke(new Request(`${BASE}/c1/revoke`, { method: "POST" }), params("c1"))],
  ["POST rotate", () => rotate(new Request(`${BASE}/c1/secret/rotate`, { method: "POST" }), params("c1"))],
];

describe.each(ROUTES)("%s — authz", (_name, call) => {
  it.each(["full_admin", "2pq_admin"])("global admin %s → allowed", async (role) => {
    mockContext = ctx(role);
    const res = await call();
    expect(res.status).toBeLessThan(300);
    expect(mockSdkCalls).toHaveLength(1);
  });

  it("bootstrap account with a non-admin role → allowed", async () => {
    mockContext = ctx("institution_operator", true);
    const res = await call();
    expect(res.status).toBeLessThan(300);
    expect(mockSdkCalls).toHaveLength(1);
  });

  it.each(["institution_admin", "institution_operator", "organization_publisher", "patient", ""])(
    "role %j (not bootstrap) → 403, nothing forwarded",
    async (role) => {
      mockContext = ctx(role);
      const res = await call();
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
      expect(mockSdkCalls).toEqual([]);
    },
  );

  it("unauthenticated (SDK /auth/context throws) → 401 without the SDK error, nothing forwarded", async () => {
    mockContext = new Error("SDK GET /auth/context failed: Unauthorized");
    const res = await call();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Not signed in." });
    expect(mockSdkCalls).toEqual([]);
  });

  it("SDK failure on the forwarded call → 500 with its message", async () => {
    mockSdkError = new Error("SDK boom");
    const res = await call();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "SDK boom" });
  });
});

describe("non-Error throws fall back to a route-specific message", () => {
  it.each([
    ["list", () => listClients(new Request(BASE)), "Could not manage reporting integration clients."],
    ["events", () => listEvents(new Request(`${BASE}/events`)), "Could not load reporting API access events."],
    ["revoke", () => revoke(new Request(BASE), params("c1")), "Could not revoke reporting integration client."],
    ["rotate", () => rotate(new Request(BASE), params("c1")), "Could not rotate reporting integration client secret."],
  ])("%s", async (_n, call, message) => {
    mockSdkError = "string-thrown" as unknown as Error;
    const res = await call();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: message });
  });
});

describe("GET list / events — query validation + forwarding", () => {
  it.each([
    [listClients, BASE, "/reporting/integration-clients"],
    [listEvents, `${BASE}/events`, "/reporting/integration-clients/events"],
  ] as const)("forwards limit + cursor (%#)", async (route, url, sdkPath) => {
    mockSdkResult = { items: [{ id: "c1" }], nextCursor: null };
    const res = await route(new Request(`${url}?limit=25&cursor=abc&ignored=1`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [{ id: "c1" }], nextCursor: null });
    expect(mockSdkCalls).toEqual([{ path: `${sdkPath}?limit=25&cursor=abc`, init: undefined }]);
  });

  it.each([
    [listClients, BASE, "/reporting/integration-clients"],
    [listEvents, `${BASE}/events`, "/reporting/integration-clients/events"],
  ] as const)("no query → bare SDK path (%#)", async (route, url, sdkPath) => {
    await route(new Request(url));
    expect(mockSdkCalls[0].path).toBe(sdkPath);
  });

  it.each(["limit=0", "limit=-1", "limit=1.5", "limit=abc", "cursor=%20%20"])(
    "invalid query %s → 400 BEFORE any auth/SDK call",
    async (q) => {
      for (const [route, url] of [
        [listClients, BASE],
        [listEvents, `${BASE}/events`],
      ] as const) {
        mockContext = new Error("must not be reached");
        const res = await route(new Request(`${url}?${q}`));
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(typeof body.error).toBe("string");
      }
      expect(mockSdkCalls).toEqual([]);
    },
  );
});

describe("POST create — body validation", () => {
  it("201 with the SDK's client, forwarding only the trimmed name", async () => {
    mockSdkResult = { id: "c9", name: "Acme", clientSecret: "shown-once" };
    const res = await createClient(postJson(BASE, JSON.stringify({ name: "  Acme  " })));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: "c9", name: "Acme", clientSecret: "shown-once" });
    expect(mockSdkCalls).toEqual([
      {
        path: "/reporting/integration-clients",
        init: { method: "POST", body: JSON.stringify({ name: "Acme" }) },
      },
    ]);
  });

  it.each([
    ["not JSON", "nope", "Invalid JSON body."],
  ])("%s → 400 %s", async (_l, body, error) => {
    const res = await createClient(postJson(BASE, body));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error });
    expect(mockSdkCalls).toEqual([]);
  });

  it.each([
    ["missing name", {}],
    ["blank name", { name: "   " }],
    ["name too long", { name: "x".repeat(121) }],
    ["non-string name", { name: 42 }],
    ["extra key (strict)", { name: "Acme", scopes: ["admin"] }],
  ])("zod: %s → 400, nothing forwarded", async (_l, body) => {
    const res = await createClient(postJson(BASE, JSON.stringify(body)));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error.length).toBeGreaterThan(0);
    expect(mockSdkCalls).toEqual([]);
  });

  it("120-char name is accepted", async () => {
    const res = await createClient(postJson(BASE, JSON.stringify({ name: "x".repeat(120) })));
    expect(res.status).toBe(201);
  });

  it("body is validated before authz — an unauthorized caller with a bad body sees 400", async () => {
    mockContext = ctx("patient");
    const res = await createClient(postJson(BASE, "{}"));
    expect(res.status).toBe(400);
  });
});

describe("revoke / rotate — clientId is URL-encoded into a single SDK path segment", () => {
  it.each([
    [revoke, "/revoke"],
    [rotate, "/secret/rotate"],
  ] as const)("plain id (%#)", async (route, suffix) => {
    mockSdkResult = { id: "c1", revokedAt: "now" };
    const res = await route(new Request(BASE, { method: "POST" }), params("c1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "c1", revokedAt: "now" });
    expect(mockSdkCalls).toEqual([
      { path: `/reporting/integration-clients/c1${suffix}`, init: { method: "POST" } },
    ]);
  });

  it.each([
    [revoke, "/revoke"],
    [rotate, "/secret/rotate"],
  ] as const)("traversal id cannot escape the client segment (%#)", async (route, suffix) => {
    await route(new Request(BASE, { method: "POST" }), params("../../admin?x=1#"));
    expect(mockSdkCalls[0].path).toBe(
      `/reporting/integration-clients/..%2F..%2Fadmin%3Fx%3D1%23${suffix}`,
    );
  });
});

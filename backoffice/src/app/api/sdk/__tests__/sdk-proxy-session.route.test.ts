// sdk-proxy-session.route.test.ts — /api/sdk/[...sdkPath] with the REAL
// backoffice session reader (#470), not a mocked getServerSession.
//
// Pins that the SDK proxy's x-project injection and page-identity binding
// work with the new cookie AND with a real next-auth v4 cookie (transition),
// and that a forged / expired cookie is treated as "no session".

import fixtures from "@/lib/__tests__/fixtures/next-auth-v4-sessions.json";
import {
  SECURE_SESSION_COOKIE_NAME,
  encodeSessionToken,
} from "@/lib/backoffice-session";

let mockCookies: Record<string, string> = {};
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in mockCookies ? { name, value: mockCookies[name] } : undefined,
    getAll: () => Object.entries(mockCookies).map(([name, value]) => ({ name, value })),
  }),
}));

import * as route from "@/app/api/sdk/[...sdkPath]/route";

const SDK = "https://sdk.test";
const LEGACY = "__Secure-next-auth.session-token";
const fetchMock = jest.fn();
const realFetch = global.fetch;
const savedSecret = process.env.NEXTAUTH_SECRET;

function ctx(...segments: string[]) {
  return { params: Promise.resolve({ sdkPath: segments }) };
}

function forwarded() {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return init.headers as Headers;
}

const binding = {
  "x-expected-session-uid": "uid-ada",
  "x-expected-session-email": "ada@example.com",
  "x-expected-session-project": "mydnamap",
  "x-expected-session-surface": "publisher-portal",
};

beforeEach(() => {
  mockCookies = {};
  process.env.NEXTAUTH_SECRET = fixtures.secret;
  process.env.GOLDENCROW_SDK_URL = SDK;
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
  process.env.NEXTAUTH_SECRET = savedSecret;
  delete process.env.GOLDENCROW_SDK_URL;
});

it("injects x-project from the new cookie", async () => {
  mockCookies[SECURE_SESSION_COOKIE_NAME] = await encodeSessionToken(
    { email: "a@b.c", project: "pocket-gyms" },
    fixtures.secret,
  );
  await route.GET(new Request("https://bo.test/api/sdk/admin/users"), ctx("admin", "users"));
  expect(forwarded().get("x-project")).toBe("pocket-gyms");
});

it("injects x-project from a real next-auth v4 cookie (transition)", async () => {
  mockCookies[LEGACY] = fixtures.pocketGyms;
  await route.GET(new Request("https://bo.test/api/sdk/admin/users"), ctx("admin", "users"));
  expect(forwarded().get("x-project")).toBe("pocket-gyms");
});

it.each([
  ["expired legacy", { [LEGACY]: fixtures.expired }],
  ["foreign-secret legacy", { [LEGACY]: fixtures.otherSecret }],
  ["forged new", { [SECURE_SESSION_COOKIE_NAME]: "forged" }],
])("%s cookie → no x-project (treated as signed out)", async (_label, cookies) => {
  mockCookies = cookies;
  await route.GET(new Request("https://bo.test/api/sdk/admin/users"), ctx("admin", "users"));
  expect(forwarded().get("x-project")).toBeNull();
});

it("page-identity binding passes with the matching legacy session", async () => {
  mockCookies[LEGACY] = fixtures.publisherPortal;
  const res = await route.GET(
    new Request("https://bo.test/api/sdk/support-services", { headers: binding }),
    ctx("support-services"),
  );
  expect(res.status).toBe(200);
  expect(forwarded().get("x-project")).toBe("mydnamap");
});

it("page-identity binding is rejected with a forged cookie (no SDK call)", async () => {
  mockCookies[SECURE_SESSION_COOKIE_NAME] = await encodeSessionToken(
    { email: "ada@example.com", project: "mydnamap", accessSurface: "publisher-portal" },
    "attacker-secret",
  );
  const res = await route.GET(
    new Request("https://bo.test/api/sdk/support-services", { headers: binding }),
    ctx("support-services"),
  );
  expect(res.status).toBe(401);
  expect((await res.json()).code).toBe("SESSION_IDENTITY_MISMATCH");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("page-identity binding is rejected when the session is another surface", async () => {
  mockCookies[LEGACY] = fixtures.backoffice;
  const res = await route.GET(
    new Request("https://bo.test/api/sdk/support-services", { headers: binding }),
    ctx("support-services"),
  );
  expect(res.status).toBe(401);
});

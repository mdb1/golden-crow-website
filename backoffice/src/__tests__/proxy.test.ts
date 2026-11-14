// __tests__/proxy.test.ts — the Next 16 `proxy.ts` (middleware).
//
// Pins: which auth stack each path is routed to (the Pocket Genes session
// gate with real cookies, incl. a real next-auth v4 one — #470), which paths
// are public, the
// gc-fitness session-cookie config handed to next-firebase-auth-edge's
// authMiddleware (which owns validation + refresh), the redirects for a
// missing / invalid / email-less session, the hard 500 on missing env, and
// the `config.matcher` (which paths reach the proxy at all).

import { NextRequest, NextResponse } from "next/server";

const mockAuthMiddleware = jest.fn();
jest.mock("next-firebase-auth-edge", () => ({
  authMiddleware: (...a: unknown[]) => mockAuthMiddleware(...a),
}));

import proxy, { config } from "@/proxy";
import { setGcFitnessAuthEnv } from "@/lib/test-utils/fake-firestore-c";
import fixtures from "@/lib/__tests__/fixtures/next-auth-v4-sessions.json";
import {
  SECURE_SESSION_COOKIE_NAME,
  SESSION_UPDATE_AGE_SECONDS,
  decodeSessionToken,
  encodeSessionToken,
} from "@/lib/backoffice-session";

const LEGACY = "__Secure-next-auth.session-token";

type AuthOpts = {
  loginPath: string;
  logoutPath: string;
  apiKey: string;
  cookieName: string;
  cookieSignatureKeys: string[];
  cookieSerializeOptions: Record<string, unknown>;
  serviceAccount: Record<string, unknown>;
  handleValidToken: (
    t: { decodedToken: Record<string, unknown> },
    h: Headers,
  ) => Promise<Response>;
  handleInvalidToken: () => Promise<Response>;
  handleError: (e: unknown) => Promise<Response>;
};

function req(path: string, cookies: Record<string, string> = {}) {
  const headers = new Headers();
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(path, "https://bo.test"), { headers });
}

async function route(
  path: string,
  cookies?: Record<string, string>,
): Promise<{ res: Response; handler: string | null }> {
  const res = (await proxy(req(path, cookies))) as Response;
  return { res, handler: res.headers.get("x-handler") };
}

function setCookieNames(res: Response) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split("=")[0]);
}

function isNext(res: Response) {
  return res.headers.get("x-middleware-next") === "1";
}

function authOpts(): AuthOpts {
  return mockAuthMiddleware.mock.calls[
    mockAuthMiddleware.mock.calls.length - 1
  ][1] as AuthOpts;
}

let errSpy: jest.SpyInstance;
const savedSecret = process.env.NEXTAUTH_SECRET;
afterAll(() => {
  process.env.NEXTAUTH_SECRET = savedSecret;
});
beforeEach(() => {
  setGcFitnessAuthEnv();
  process.env.NEXTAUTH_SECRET = fixtures.secret;
  mockAuthMiddleware
    .mockReset()
    .mockResolvedValue(
      new Response(null, { status: 298, headers: { "x-handler": "firebase" } }),
    );
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("routing to auth stacks", () => {
  it.each([
    ["/patient-portal/home", "/patient-portal/login"],
    ["/pgflex/logistics", "/pgflex/login"],
    ["/publisher-portal/home", "/publisher-portal/login"],
    ["/", "/login"],
    ["/users", "/login"],
    ["/2pq-dashboard", "/login"],
  ])("%s without a session → 307 %s?callbackUrl=<path>", async (path, signIn) => {
    const { res } = await route(`${path}?tab=2`);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(`https://bo.test${signIn}`);
    expect(location.searchParams.get("callbackUrl")).toBe(`${path}?tab=2`);
    expect(mockAuthMiddleware).not.toHaveBeenCalled();
  });

  it.each([
    "/patient-portal/login",
    "/patient-portal/complete-profile",
    "/pgflex/login",
    "/pgflex/complete-profile",
    "/publisher-portal/login",
    "/publisher-portal/complete-profile",
    "/PocketGenesSDK_Terminos_y_Condiciones.pdf",
    "/Pocket_Genes_Guia_App_Personalizada.pdf",
    "/open-api",
    "/open-api/reporting/v1/x",
    "/gc-fitness/login",
    "/gc-fitness/forbidden",
    "/gc-fitness/wiki",
    "/gc-fitness/wiki/getting-started",
    "/api/gc-fitness/login",
    "/api/gc-fitness/logout",
  ])("%s is public (NextResponse.next, no auth stack)", async (path) => {
    const { res, handler } = await route(path);
    expect(isNext(res)).toBe(true);
    expect(handler).toBeNull();
    expect(mockAuthMiddleware).not.toHaveBeenCalled();
  });

  it.each([
    "/patient-portal/login/extra",
    "/pgflex/login/",
    "/gc-fitness/login/x",
    "/gc-fitness/wikiX",
    "/open-apix",
  ])("%s is NOT treated as a public page (exact match only)", async (path) => {
    const { res } = await route(path);
    expect(isNext(res)).toBe(false);
  });

  it("/pgflex/login. (trailing dot typo) → redirect to /pgflex/login", async () => {
    const { res } = await route("/pgflex/login.");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://bo.test/pgflex/login");
  });

  it.each([
    "/gc-fitness",
    "/gc-fitness/clients",
    "/api/gc-fitness/storage-image",
  ])("%s → gc-fitness Firebase session gate", async (path) => {
    const { handler } = await route(path);
    expect(handler).toBe("firebase");
    expect(mockAuthMiddleware).toHaveBeenCalledTimes(1);
  });

  it("legacy /gc-fitness/clients/mirror:{email} → redirect to pending/{encoded email} WITHOUT auth", async () => {
    const { res } = await route("/gc-fitness/clients/mirror:a%2Bb%40x.com");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://bo.test/gc-fitness/clients/pending/a%2Bb%40x.com",
    );
    expect(mockAuthMiddleware).not.toHaveBeenCalled();
  });

  it("legacy mirror with a malformed escape keeps the raw value (re-encoded)", async () => {
    const { res } = await route("/gc-fitness/clients/mirror:%E0%A4%A");
    expect(res.headers.get("location")).toBe(
      "https://bo.test/gc-fitness/clients/pending/%25E0%25A4%25A",
    );
  });
});

describe("Pocket Genes session gate (was NextAuth withAuth, #470)", () => {
  const SURFACES = [
    ["/", "/login"],
    ["/patient-portal/home", "/patient-portal/login"],
    ["/pgflex/logistics", "/pgflex/login"],
    ["/publisher-portal/home", "/publisher-portal/login"],
  ] as const;

  it.each(SURFACES)(
    "%s: a REAL next-auth v4 cookie passes and is re-issued as the new cookie",
    async (path) => {
      const { res } = await route(path, { [LEGACY]: fixtures.backoffice });
      // `/` with a backoffice surface passes; sub-surfaces have no surface check.
      expect(isNext(res)).toBe(true);
      expect(setCookieNames(res)).toEqual([SECURE_SESSION_COOKIE_NAME]);
      const value = res.headers
        .getSetCookie()[0]
        .split(";")[0]
        .slice(SECURE_SESSION_COOKIE_NAME.length + 1);
      await expect(decodeSessionToken(value, fixtures.secret)).resolves.toMatchObject({
        email: "ada@example.com",
        project: "mydnamap",
        accessSurface: "backoffice",
      });
    },
  );

  it.each(SURFACES)(
    "%s: expired / forged / foreign-secret cookies → its own login",
    async (path, signIn) => {
      for (const cookies of <Record<string, string>[]>[
        { [LEGACY]: fixtures.expired },
        { [LEGACY]: fixtures.otherSecret },
        { [SECURE_SESSION_COOKIE_NAME]: "forged.token.value.x.y" },
        { [SECURE_SESSION_COOKIE_NAME]: await encodeSessionToken({ email: "a@b.c" }, "attacker") },
      ]) {
        const { res } = await route(path, cookies);
        expect(res.status).toBe(307);
        expect(new URL(res.headers.get("location")!).pathname).toBe(signIn);
      }
    },
  );

  it.each([
    ["pgflex", "https://bo.test/pgflex/logistics"],
    ["publisherPortal", "https://bo.test/publisher-portal/home"],
  ] as const)(
    "main surface: a %s session is redirected to its own surface (legacy cookie too)",
    async (fixture, location) => {
      const { res } = await route("/users", { [LEGACY]: fixtures[fixture] });
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(location);
      // Still migrated on the way through.
      expect(setCookieNames(res)).toEqual([SECURE_SESSION_COOKIE_NAME]);
    },
  );

  it("main surface: backoffice and patient-portal sessions pass (the layouts route the rest)", async () => {
    for (const fixture of ["backoffice", "patientPortal", "noSurface", "pocketGyms"] as const) {
      const { res } = await route("/users", { [LEGACY]: fixtures[fixture] });
      expect(isNext(res)).toBe(true);
    }
  });

  it("a fresh new cookie passes without being rewritten", async () => {
    const token = await encodeSessionToken({ email: "a@b.c", accessSurface: "backoffice" }, fixtures.secret);
    const { res } = await route("/users", { [SECURE_SESSION_COOKIE_NAME]: token });
    expect(isNext(res)).toBe(true);
    expect(setCookieNames(res)).toEqual([]);
  });

  it("a day-old new cookie is rolled (30-day rolling session like next-auth)", async () => {
    const realNow = Date.now;
    Date.now = () => realNow() - (SESSION_UPDATE_AGE_SECONDS + 60) * 1000;
    const token = await encodeSessionToken({ email: "a@b.c" }, fixtures.secret);
    Date.now = realNow;
    const { res } = await route("/users", { [SECURE_SESSION_COOKIE_NAME]: token });
    expect(isNext(res)).toBe(true);
    expect(setCookieNames(res)).toEqual([SECURE_SESSION_COOKIE_NAME]);
  });

  it("missing NEXTAUTH_SECRET fails closed (redirect to login)", async () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    const { res } = await route("/users", { [LEGACY]: fixtures.backoffice });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("the gc-fitness cookie never opens a Pocket Genes surface (isolated circuits)", async () => {
    const { res } = await route("/users", { GcFitnessAuthToken: "anything" });
    expect(res.status).toBe(307);
    expect(mockAuthMiddleware).not.toHaveBeenCalled();
  });
});

describe("gc-fitness session gate", () => {
  it.each([
    "GC_FITNESS_COOKIE_SIGNATURE_KEY",
    "NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY",
    "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID",
    "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL",
    "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY",
  ])(
    "missing %s → hard 500 (no redirect loop), never reaches authMiddleware",
    async (key) => {
      delete process.env[key];
      const { res } = await route("/gc-fitness/clients");
      expect(res.status).toBe(500);
      await expect(res.text()).resolves.toMatch(/misconfigured/);
      expect(mockAuthMiddleware).not.toHaveBeenCalled();
      expect(String(errSpy.mock.calls[0]?.[1])).toContain(key);
    },
  );

  it("public pages still work with env missing", async () => {
    delete process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY;
    const { res } = await route("/gc-fitness/login");
    expect(isNext(res)).toBe(true);
  });

  it("hands the locked cookie config to authMiddleware (which validates + refreshes the cookie)", async () => {
    const r = req("/gc-fitness/clients");
    await proxy(r);
    expect(mockAuthMiddleware.mock.calls[0][0]).toBe(r);
    expect(authOpts()).toMatchObject({
      loginPath: "/api/gc-fitness/login",
      logoutPath: "/api/gc-fitness/logout",
      apiKey: "test-api-key",
      cookieName: "GcFitnessAuthToken",
      cookieSignatureKeys: ["test-sig"],
      cookieSerializeOptions: {
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 12 * 60 * 60 * 24,
      },
      serviceAccount: {
        projectId: "gcfitness-test",
        clientEmail: "svc@example.com",
        privateKey: "pk",
      },
    });
  });

  it("secure cookie in production", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      await proxy(req("/gc-fitness/clients"));
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev as string;
    }
    expect(authOpts().cookieSerializeOptions.secure).toBe(true);
  });

  it("missing / expired / tampered cookie (handleInvalidToken) → redirect to /gc-fitness/login", async () => {
    await proxy(req("/gc-fitness/clients/c1"));
    const res = await authOpts().handleInvalidToken();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://bo.test/gc-fitness/login",
    );
  });

  it("verification error (handleError) → redirect to /gc-fitness/login", async () => {
    await proxy(req("/gc-fitness/clients/c1"));
    const res = await authOpts().handleError(new Error("jwks"));
    expect(res.headers.get("location")).toBe(
      "https://bo.test/gc-fitness/login",
    );
  });

  it("valid token without email → /gc-fitness/forbidden", async () => {
    await proxy(req("/gc-fitness/clients"));
    const res = await authOpts().handleValidToken(
      { decodedToken: { uid: "u" } },
      new Headers(),
    );
    expect(res.headers.get("location")).toBe(
      "https://bo.test/gc-fitness/forbidden",
    );
  });

  it("valid token with email → next() carrying the refreshed request headers", async () => {
    await proxy(req("/gc-fitness/clients"));
    const headers = new Headers({ "x-refreshed": "1" });
    const res = await authOpts().handleValidToken(
      { decodedToken: { uid: "u", email: "A@x.com" } },
      headers,
    );
    expect(isNext(res)).toBe(true);
    expect(res.headers.get("x-middleware-override-headers")).toContain(
      "x-refreshed",
    );
    expect(res.headers.get("x-middleware-request-x-refreshed")).toBe("1");
  });

  it("the proxy gate does NOT check the trainer role (a client token passes; pages/actions enforce it)", async () => {
    await proxy(req("/gc-fitness/clients"));
    const res = await authOpts().handleValidToken(
      { decodedToken: { uid: "c", email: "c@x.com", role: "client" } },
      new Headers(),
    );
    expect(isNext(res)).toBe(true);
  });
});

describe("config.matcher", () => {
  const [catchAll, ...rest] = config.matcher;
  const catchAllRe = new RegExp(`^${catchAll}$`);

  it("lists the explicit surfaces", () => {
    expect(rest).toEqual([
      "/patient-portal/:path*",
      "/pgflex/:path*",
      "/publisher-portal/:path*",
      "/gc-fitness/:path*",
      "/api/gc-fitness/login",
      "/api/gc-fitness/logout",
    ]);
  });

  it.each([
    "/",
    "/users",
    "/2pq-dashboard/forms",
    "/api/other",
    "/foo",
    "/god-mode",
  ])("catch-all covers %s (Pocket Genes session gate)", (path) =>
    expect(catchAllRe.test(path)).toBe(true),
  );

  it.each([
    "/login",
    "/access-denied",
    "/botfarm",
    "/api/auth/session",
    "/api/sdk/admin/users",
    "/api/publisher-app/palette-overrides",
    "/api/publisher-app/customization-catalog/colors",
    "/open-api/x",
    "/_next/static/chunk.js",
    "/_next/image",
    "/favicon.ico",
    "/PocketGenesSDK_Terminos_y_Condiciones.pdf",
    "/Pocket_Genes_Guia_App_Personalizada.pdf",
    "/gc-fitness/clients",
    "/api/gc-fitness/storage-image",
    "/patient-portal/x",
    "/pgflex/x",
    "/publisher-portal/x",
    "/f/r/abc",
    "/.well-known/apple-app-site-association",
    "/__/auth/handler",
  ])("catch-all excludes %s", (path) =>
    expect(catchAllRe.test(path)).toBe(false),
  );

  it("/api/gc-fitness/* (other than login/logout) never reaches the proxy — handlers self-authenticate", () => {
    const reachable = (p: string) => catchAllRe.test(p) || rest.includes(p);
    expect(reachable("/api/gc-fitness/storage-image")).toBe(false);
    expect(reachable("/api/gc-fitness/login")).toBe(true);
  });

  it("/api/publisher-app/* never reaches the browser-surface redirect — handlers self-authenticate", () => {
    const reachable = (p: string) => catchAllRe.test(p) || rest.includes(p);
    expect(reachable("/api/publisher-app/palette-overrides")).toBe(false);
    expect(
      reachable("/api/publisher-app/customization-catalog/colors"),
    ).toBe(false);
  });

  it("exclusions are PREFIX matches (e.g. /login-anything, /botfarmX skip the proxy)", () => {
    expect(catchAllRe.test("/login-anything")).toBe(false);
    expect(catchAllRe.test("/botfarmX")).toBe(false);
    expect(catchAllRe.test("/fX")).toBe(true); // `f/` needs the slash
  });
});

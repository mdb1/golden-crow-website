// auth-routes.test.ts
//
// POST /auth/login, POST /auth/logout and GET /auth/context, driven through
// the WHOLE app (buildServer) so the cookie plugin, the global auth hook and
// PUBLIC_PATHS are all in the loop (epic #451, "confidence without CI").

import type { FastifyInstance } from "fastify";
import type { AdminContext } from "../types/sdk.types.js";
import { contextFor } from "./helpers/app-harness.js";

const mockVerifyIdToken = jest.fn();
const mockCreateSessionCookie = jest.fn();
const mockVerifySessionCookie = jest.fn();
const mockResolveAdminContext = jest.fn();

jest.mock("../config/firebase.js", () => {
  const { inertFirebaseHandle } = jest.requireActual("./helpers/app-harness");
  return {
    adminAuthFor: jest.fn(() => ({
      verifyIdToken: mockVerifyIdToken,
      createSessionCookie: mockCreateSessionCookie,
      verifySessionCookie: mockVerifySessionCookie,
    })),
    adminDbFor: jest.fn(() => inertFirebaseHandle("db")),
    adminStorageFor: jest.fn(() => inertFirebaseHandle("storage")),
    adminAppFor: jest.fn(() => inertFirebaseHandle("app")),
  };
});

jest.mock("../repositories/roles.repository.js", () => ({
  ...jest.requireActual("../repositories/roles.repository.js"),
  resolveAdminContext: mockResolveAdminContext,
}));

const FIVE_DAYS_MS = 1000 * 60 * 60 * 24 * 5;
const DECODED = { uid: "user-uid", email: "user@example.com" };

let app: FastifyInstance;
const originalNodeEnv = process.env.NODE_ENV;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = originalNodeEnv;
  mockVerifyIdToken.mockResolvedValue(DECODED);
  mockCreateSessionCookie.mockResolvedValue("minted-session-cookie");
  mockVerifySessionCookie.mockResolvedValue(DECODED);
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function login(payload: unknown) {
  return app.inject({ method: "POST", url: "/auth/login", payload: payload as object });
}

function setCookieHeaders(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  if (raw === undefined) return [];
  return [raw].flat().map(String);
}

function attributes(setCookie: string): Map<string, string | true> {
  const [, ...parts] = setCookie.split(";").map((p) => p.trim());
  const map = new Map<string, string | true>();
  for (const part of parts) {
    const [k, ...v] = part.split("=");
    map.set(k!.toLowerCase(), v.length ? v.join("=") : true);
  }
  return map;
}

describe("POST /auth/login — input validation", () => {
  it.each([
    ["no body", undefined],
    ["empty object", {}],
    ["empty idToken", { idToken: "" }],
    ["non-string idToken", { idToken: 42 }],
    ["unknown surface", { idToken: "tok", surface: "admin" }],
  ])("400 on %s, before any token verification", async (_label, payload) => {
    const res = await login(payload);
    expect(res.statusCode).toBe(400);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(mockCreateSessionCookie).not.toHaveBeenCalled();
    expect(setCookieHeaders(res)).toEqual([]);
  });
});

describe("POST /auth/login — token verification", () => {
  it("401 Invalid ID token when verifyIdToken throws", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("auth/id-token-revoked"));
    const res = await login({ idToken: "bad" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid ID token" });
    expect(mockResolveAdminContext).not.toHaveBeenCalled();
    expect(mockCreateSessionCookie).not.toHaveBeenCalled();
    expect(setCookieHeaders(res)).toEqual([]);
  });

  it("verifies the ID token WITH revocation checking (checkRevoked=true)", async () => {
    mockResolveAdminContext.mockResolvedValue(contextFor(["backoffice"]));
    await login({ idToken: "the-id-token" });
    expect(mockVerifyIdToken).toHaveBeenCalledWith("the-id-token", true);
    expect(mockResolveAdminContext).toHaveBeenCalledWith({
      email: "user@example.com",
      uid: "user-uid",
    });
  });

  it("401 (no cookie) when minting the session cookie fails", async () => {
    mockResolveAdminContext.mockResolvedValue(contextFor(["backoffice"]));
    mockCreateSessionCookie.mockRejectedValue(new Error("TOKEN_EXPIRED"));
    const res = await login({ idToken: "tok" });
    expect(res.statusCode).toBe(401);
    expect(setCookieHeaders(res)).toEqual([]);
  });
});

type SurfaceName = "backoffice" | "patient-portal" | "pgflex" | "publisher-portal";
const CONTEXT_FOR_SURFACE: Record<SurfaceName, AdminContext> = {
  backoffice: contextFor(["backoffice"]),
  "patient-portal": contextFor(["patient"]),
  pgflex: contextFor(["pgflex"]),
  "publisher-portal": contextFor(["publisher"]),
};
const SURFACES = Object.keys(CONTEXT_FOR_SURFACE) as SurfaceName[];

const MATRIX = SURFACES.flatMap((requested) =>
  SURFACES.map((holder) => ({ requested, holder })),
);

describe("POST /auth/login — surface × account matrix", () => {
  it.each(MATRIX.filter((c) => c.requested === c.holder))(
    "200 + session cookie: $holder account signing in on $requested",
    async ({ requested, holder }) => {
      mockResolveAdminContext.mockResolvedValue(CONTEXT_FOR_SURFACE[holder]);
      const res = await login({ idToken: "tok", surface: requested });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok", uid: DECODED.uid, email: DECODED.email });
      expect(mockCreateSessionCookie).toHaveBeenCalledWith("tok", {
        expiresIn: FIVE_DAYS_MS,
      });
      const cookies = setCookieHeaders(res);
      expect(cookies).toHaveLength(1);
      expect(cookies[0]!.startsWith("session=minted-session-cookie;")).toBe(true);
    },
  );

  it.each(MATRIX.filter((c) => c.requested !== c.holder))(
    "403 WRONG_AUTH_SURFACE: $holder account signing in on $requested",
    async ({ requested, holder }) => {
      mockResolveAdminContext.mockResolvedValue(CONTEXT_FOR_SURFACE[holder]);
      const res = await login({ idToken: "tok", surface: requested });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        code: "WRONG_AUTH_SURFACE",
        requiredSurface: holder,
      });
      expect(res.json().error).toMatch(/must sign in through the .* login\./);
      expect(mockCreateSessionCookie).not.toHaveBeenCalled();
      expect(setCookieHeaders(res)).toEqual([]);
    },
  );

  it("surface defaults to backoffice when omitted", async () => {
    mockResolveAdminContext.mockResolvedValue(CONTEXT_FOR_SURFACE["patient-portal"]);
    const denied = await login({ idToken: "tok" });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ requiredSurface: "patient-portal" });

    mockResolveAdminContext.mockResolvedValue(CONTEXT_FOR_SURFACE.backoffice);
    const allowed = await login({ idToken: "tok" });
    expect(allowed.statusCode).toBe(200);
  });

  it("names the right login page in the error message", async () => {
    const expected: Record<SurfaceName, string> = {
      backoffice: "backoffice",
      "patient-portal": "patient portal",
      pgflex: "PGFlex",
      "publisher-portal": "publisher portal",
    };
    for (const holder of SURFACES) {
      mockResolveAdminContext.mockResolvedValue(CONTEXT_FOR_SURFACE[holder]);
      const requested = holder === "backoffice" ? "pgflex" : "backoffice";
      const res = await login({ idToken: "tok", surface: requested });
      expect(res.json().error).toBe(
        `This account must sign in through the ${expected[holder]} login.`,
      );
    }
  });

  it("backoffice + patient account: backoffice is the required surface for a denied portal", async () => {
    mockResolveAdminContext.mockResolvedValue(contextFor(["backoffice", "patient"]));
    const res = await login({ idToken: "tok", surface: "pgflex" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ requiredSurface: "backoffice" });
  });

  it.each([
    ["no context", null],
    ["context with no surface", contextFor([])],
  ])("403 ACCOUNT_NOT_AUTHORIZED with %s", async (_label, context) => {
    mockResolveAdminContext.mockResolvedValue(context);
    for (const surface of SURFACES) {
      const res = await login({ idToken: "tok", surface });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Account not authorized",
        code: "ACCOUNT_NOT_AUTHORIZED",
      });
    }
    expect(mockCreateSessionCookie).not.toHaveBeenCalled();
  });
});

describe("POST /auth/login — session cookie attributes", () => {
  beforeEach(() => {
    mockResolveAdminContext.mockResolvedValue(contextFor(["backoffice"]));
  });

  it("httpOnly, SameSite=Strict, Path=/, Max-Age=5 days, NOT Secure outside production", async () => {
    process.env.NODE_ENV = "development";
    const res = await login({ idToken: "tok" });
    const attrs = attributes(setCookieHeaders(res)[0]!);
    expect(attrs.get("httponly")).toBe(true);
    expect(attrs.get("samesite")).toBe("Strict");
    expect(attrs.get("path")).toBe("/");
    expect(attrs.get("max-age")).toBe("432000");
    expect(attrs.has("secure")).toBe(false);
  });

  it("adds Secure in production", async () => {
    process.env.NODE_ENV = "production";
    const res = await login({ idToken: "tok" });
    const attrs = attributes(setCookieHeaders(res)[0]!);
    expect(attrs.get("secure")).toBe(true);
    expect(attrs.get("httponly")).toBe(true);
    expect(attrs.get("samesite")).toBe("Strict");
    expect(attrs.get("max-age")).toBe("432000");
  });
});

describe("POST /auth/logout", () => {
  it("is public and clears the session cookie on Path=/", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    const cookies = setCookieHeaders(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.startsWith("session=;")).toBe(true);
    const attrs = attributes(cookies[0]!);
    expect(attrs.get("path")).toBe("/");
    const expires = attrs.get("expires");
    expect(typeof expires).toBe("string");
    expect(new Date(expires as string).getTime()).toBeLessThanOrEqual(Date.now());
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
  });
});

describe("GET /auth/context", () => {
  it("401 without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/context" });
    expect(res.statusCode).toBe(401);
    expect(mockResolveAdminContext).not.toHaveBeenCalled();
  });

  it("401 with a revoked session", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("revoked"));
    const res = await app.inject({
      method: "GET",
      url: "/auth/context",
      cookies: { session: "revoked" },
    });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ["backoffice", contextFor(["backoffice"])],
    ["patient portal", contextFor(["patient"], { patientId: "p1" })],
    ["PGFlex", contextFor(["pgflex"])],
    ["publisher portal", contextFor(["publisher"], { organizationId: "org-1" })],
  ])("returns context + capabilities for a %s session", async (_label, context) => {
    const { getAdminCapabilities } = jest.requireActual(
      "../repositories/roles.repository.js",
    );
    mockResolveAdminContext.mockResolvedValue(context);
    const res = await app.inject({
      method: "GET",
      url: "/auth/context",
      cookies: { session: "valid" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.context).toEqual(context);
    expect(body.capabilities).toEqual(getAdminCapabilities(context));
    expect(body.capabilities).toContain(`role:${context.role}`);
  });
});

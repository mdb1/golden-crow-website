// __tests__/login-logout.route.test.ts
//
// POST /api/gc-fitness/login and /logout, called with real Request objects.
// Firebase Admin Auth is a jest mock; Firestore is the in-memory fake so the
// test asserts the WRITTEN users/{uid} doc and the claims passed to
// setCustomUserClaims. `setAuthCookies` is mocked to capture the cookie
// options (the session-cookie contract).
//
// #379 regression: login used to read `decoded.customClaims` (always
// undefined) and WIPED the admin claim on every sign-in. The claim tests
// below pin that admin / extra roles survive a login.

import { FakeFirestore } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockAuth = {
  verifyIdToken: jest.fn(),
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
};

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => mockAuth,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
jest.mock("next-firebase-auth-edge/lib/next/cookies", () => {
  const actual = jest.requireActual("next-firebase-auth-edge/lib/next/cookies");
  return {
    ...actual,
    setAuthCookies: jest.fn(async () => {
      const { NextResponse } = jest.requireActual("next/server");
      const res = NextResponse.json({ ok: true });
      res.headers.append("set-cookie", "GcFitnessAuthToken=minted; Path=/; HttpOnly");
      return res;
    }),
  };
});

import { setAuthCookies } from "next-firebase-auth-edge/lib/next/cookies";

import { POST as login } from "@/app/api/gc-fitness/login/route";
import { POST as logout } from "@/app/api/gc-fitness/logout/route";
import { setGcFitnessAuthEnv } from "@/lib/test-utils/fake-firestore-c";

const mockSetAuthCookies = setAuthCookies as jest.MockedFunction<typeof setAuthCookies>;

function loginRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://backoffice.test/api/gc-fitness/login", {
    method: "POST",
    headers,
  });
}

function decoded(extra: Record<string, unknown> = {}) {
  return { uid: "u1", email: "Coach@Example.com", name: "Coach One", picture: "https://p/1.jpg", ...extra };
}

let errSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockDb.current = new FakeFirestore();
  mockAuth.verifyIdToken.mockReset().mockResolvedValue(decoded());
  mockAuth.getUser.mockReset().mockResolvedValue({ customClaims: undefined });
  mockAuth.setCustomUserClaims.mockReset().mockResolvedValue(undefined);
  mockSetAuthCookies.mockClear();
  setGcFitnessAuthEnv();
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  errSpy.mockRestore();
  warnSpy.mockRestore();
});

describe("POST /api/gc-fitness/login — env + header", () => {
  it.each([
    "NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY",
    "GC_FITNESS_COOKIE_SIGNATURE_KEY",
    "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID",
    "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL",
    "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY",
  ])("missing %s → 500, no token verification, no cookie", async (key) => {
    delete process.env[key];
    const res = await login(loginRequest("Bearer tok"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Server misconfigured" });
    expect(mockAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0]?.[1])).toContain(key);
  });

  it.each([
    ["no header", undefined],
    ["non-bearer scheme", "Basic abc"],
    ["bearer with no token", "Bearer    "],
  ])("%s → 400", async (_label, header) => {
    const res = await login(loginRequest(header));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing Authorization: Bearer <idToken> header",
    });
    expect(mockAuth.verifyIdToken).not.toHaveBeenCalled();
  });

  it("scheme is case-insensitive and the token is trimmed", async () => {
    await login(loginRequest("bEaReR   tok-123  "));
    expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("tok-123");
  });

  it("invalid ID token → 403 Authentication failed, nothing written", async () => {
    mockAuth.verifyIdToken.mockRejectedValue(new Error("auth/argument-error"));
    const res = await login(loginRequest("Bearer forged"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Authentication failed" });
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(mockDb.current!.writes).toEqual([]);
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
  });

  it("token without email → 403 Missing email", async () => {
    mockAuth.verifyIdToken.mockResolvedValue({ uid: "u1" });
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Missing email" });
    expect(mockDb.current!.writes).toEqual([]);
  });
});

describe("POST /api/gc-fitness/login — client accounts are rejected", () => {
  it("role=client claim → 403, no claims/profile/cookie written", async () => {
    mockAuth.verifyIdToken.mockResolvedValue(decoded({ role: "client" }));
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "This account is a client. Please use the app.",
    });
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(mockDb.current!.writes).toEqual([]);
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
  });

  it("users/{uid}.role=client (no claim) → 403, profile NOT promoted to trainer", async () => {
    mockDb.current!.seed("users/u1", { role: "client", coachId: "coach-x" });
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(403);
    expect(mockDb.current!.doc("users/u1")).toEqual({ role: "client", coachId: "coach-x" });
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe("POST /api/gc-fitness/login — claims (#379)", () => {
  async function claimsAfterLogin(existing: Record<string, unknown> | undefined) {
    mockAuth.getUser.mockResolvedValue({ customClaims: existing });
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(200);
    expect(mockAuth.getUser).toHaveBeenCalledWith("u1");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledTimes(1);
    expect(mockAuth.setCustomUserClaims.mock.calls[0][0]).toBe("u1");
    return mockAuth.setCustomUserClaims.mock.calls[0][1] as Record<string, unknown>;
  }

  it("fresh account → promoted to trainer, admin false", async () => {
    await expect(claimsAfterLogin(undefined)).resolves.toEqual({
      role: "trainer",
      roles: ["trainer"],
      admin: false,
    });
  });

  it("admin in roles[] SURVIVES login (role/roles/admin)", async () => {
    await expect(
      claimsAfterLogin({ role: "trainer", roles: ["admin", "trainer"], admin: true }),
    ).resolves.toEqual({ role: "trainer", roles: ["trainer", "admin"], admin: true });
  });

  it("role:'admin' (no trainer) SURVIVES as a role and gains trainer", async () => {
    await expect(claimsAfterLogin({ role: "admin" })).resolves.toEqual({
      role: "trainer",
      roles: ["admin", "trainer"],
      admin: true,
    });
  });

  it.failing("SECURITY GAP: legacy admin:true-only claim is WIPED by login (auth-helpers treats it as admin)", async () => {
    // auth-helpers.normalizeRolesFromToken and admin-actions.rolesFromClaims
    // both treat `admin: true` as the admin role; login must not drop it.
    const claims = await claimsAfterLogin({ admin: true });
    expect(claims.admin).toBe(true);
    expect(claims.roles).toEqual(expect.arrayContaining(["admin", "trainer"]));
  });

  it("unrelated custom claims and extra roles are preserved (spread)", async () => {
    await expect(
      claimsAfterLogin({ roles: ["Engineering"], coachId: null, tier: "pro" }),
    ).resolves.toEqual({
      coachId: null,
      tier: "pro",
      role: "trainer",
      roles: ["engineering", "trainer"],
      admin: false,
    });
  });

  it("claim write failure is non-fatal: profile + cookie still happen", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValue(new Error("quota"));
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    expect(mockDb.current!.doc("users/u1")).toMatchObject({ role: "trainer" });
    expect(mockSetAuthCookies).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/gc-fitness/login — profile upsert + session cookie", () => {
  it("new user: writes the trainer profile with token name/picture", async () => {
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(200);
    const writes = mockDb.current!.writesTo("users/");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: "set", path: "users/u1", merge: true });
    expect(writes[0].data).toEqual({
      email: "coach@example.com",
      displayName: "Coach One",
      photoURL: "https://p/1.jpg",
      role: "trainer",
      coachId: null,
      preferences: {},
      fcmTokens: [],
      deleted: false,
      createdAt: { __fv: "serverTimestamp" },
      updatedAt: { __fv: "serverTimestamp" },
    });
  });

  it("existing user: keeps displayName/photo/preferences/fcmTokens/createdAt", async () => {
    mockDb.current!.seed("users/u1", {
      displayName: "Custom",
      photoURL: "https://custom",
      preferences: { units: "kg" },
      fcmTokens: ["tok"],
      createdAt: "2025-01-01",
      role: "trainer",
    });
    await login(loginRequest("Bearer t"));
    expect(mockDb.current!.writesTo("users/")[0].data).toMatchObject({
      displayName: "Custom",
      photoURL: "https://custom",
      preferences: { units: "kg" },
      fcmTokens: ["tok"],
      createdAt: "2025-01-01",
    });
  });

  it("no name/picture on token → email local-part + null photo", async () => {
    mockAuth.verifyIdToken.mockResolvedValue({ uid: "u1", email: "solo@x.io" });
    await login(loginRequest("Bearer t"));
    expect(mockDb.current!.writesTo("users/")[0].data).toMatchObject({
      displayName: "solo",
      photoURL: null,
    });
  });

  it("mints the GcFitnessAuthToken cookie with the locked options and forwards the response", async () => {
    const req = loginRequest("Bearer t");
    const res = await login(req);
    expect(res.headers.get("set-cookie")).toContain("GcFitnessAuthToken=minted");
    expect(mockSetAuthCookies).toHaveBeenCalledWith(req.headers, {
      apiKey: "test-api-key",
      cookieName: "GcFitnessAuthToken",
      cookieSignatureKeys: ["test-sig"],
      cookieSerializeOptions: {
        path: "/",
        httpOnly: true,
        secure: false, // NODE_ENV=test
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
      await login(loginRequest("Bearer t"));
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev as string;
    }
    const opts = mockSetAuthCookies.mock.calls[0][1] as {
      cookieSerializeOptions: { secure: boolean };
    };
    expect(opts.cookieSerializeOptions.secure).toBe(true);
  });

  it("profile write failure → 403 and no cookie", async () => {
    jest.spyOn(mockDb.current!, "applyWrite").mockImplementation(() => {
      throw new Error("firestore down");
    });
    const res = await login(loginRequest("Bearer t"));
    expect(res.status).toBe(403);
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
  });
});

describe("POST /api/gc-fitness/logout", () => {
  it("expires the GcFitnessAuthToken cookie (and its refresh sibling) with matching flags", async () => {
    const res = logout(
      new Request("https://backoffice.test/api/gc-fitness/logout", {
        method: "POST",
        headers: { cookie: "GcFitnessAuthToken=abc" },
      }),
    );
    const setCookies = res.headers.getSetCookie();
    const main = setCookies.find((c) => c.startsWith("GcFitnessAuthToken="));
    expect(main).toBeDefined();
    expect(main).toMatch(/GcFitnessAuthToken=;/);
    expect(main).toMatch(/Path=\//);
    expect(main).toMatch(/HttpOnly/i);
    expect(main).toMatch(/SameSite=lax/i);
    expect(main).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
    // Every cookie this emits clears something — never sets a value.
    for (const c of setCookies) expect(c).toMatch(/^[^=]+=;/);
  });
});

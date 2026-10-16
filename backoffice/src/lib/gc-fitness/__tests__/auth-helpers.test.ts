// __tests__/auth-helpers.test.ts
//
// Pins the gc-fitness auth gate (`auth-helpers.ts`) over a mocked
// `next-firebase-auth-edge.getTokens`:
//   - role parsing from `role` (string), `roles` (array) and `admin: true`,
//     trimmed + lower-cased + de-duplicated;
//   - "Forbidden" for every AUTH failure (no cookie, wrong role) vs a
//     different, descriptive error for missing env (a deploy bug);
//   - the exact cookie / service-account config handed to getTokens;
//   - getCurrentTrainerIdToken returns the raw ID token only for trainers.

const mockCookieStore = { marker: "cookie-store" };
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));

import { getTokens } from "next-firebase-auth-edge";

import {
  getCurrentAdmin,
  getCurrentGCFitnessUser,
  getCurrentTrainer,
  getCurrentTrainerIdToken,
} from "@/lib/gc-fitness/auth-helpers";
import { setGcFitnessAuthEnv } from "@/lib/test-utils/fake-firestore-c";

const mockGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const ENV_KEYS = [
  "NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY",
  "GC_FITNESS_COOKIE_SIGNATURE_KEY",
  "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID",
  "GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL",
  "GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY",
] as const;

function signedIn(decoded: Record<string, unknown>, token = "raw-id-token") {
  mockGetTokens.mockResolvedValue({
    token,
    decodedToken: { uid: "u1", email: "Coach@Example.COM", ...decoded },
  } as unknown as Awaited<ReturnType<typeof getTokens>>);
}

beforeEach(() => {
  mockGetTokens.mockReset();
  setGcFitnessAuthEnv();
});

describe("getCurrentGCFitnessUser — role parsing", () => {
  it("reads a single `role` string, trimmed and lower-cased; email is lower-cased", async () => {
    signedIn({ role: "  Trainer " });
    await expect(getCurrentGCFitnessUser()).resolves.toEqual({
      uid: "u1",
      email: "coach@example.com",
      isTrainer: true,
      isAdmin: false,
      roles: ["trainer"],
    });
  });

  it("merges `role` + `roles[]` (dedup, ignores blanks and non-strings)", async () => {
    signedIn({ role: "trainer", roles: ["TRAINER", " admin ", "", "   ", 7, null] });
    const user = await getCurrentGCFitnessUser();
    expect(user.roles).toEqual(["trainer", "admin"]);
    expect(user.isTrainer).toBe(true);
    expect(user.isAdmin).toBe(true);
  });

  it("legacy `admin: true` alone grants admin (but not trainer)", async () => {
    signedIn({ admin: true });
    const user = await getCurrentGCFitnessUser();
    expect(user.roles).toEqual(["admin"]);
    expect(user.isAdmin).toBe(true);
    expect(user.isTrainer).toBe(false);
  });

  it("`admin` must be the boolean true — a truthy string does not grant admin", async () => {
    signedIn({ admin: "true", role: "client" });
    const user = await getCurrentGCFitnessUser();
    expect(user.isAdmin).toBe(false);
    expect(user.roles).toEqual(["client"]);
  });

  it("a non-array `roles` is ignored", async () => {
    signedIn({ roles: "admin" });
    const user = await getCurrentGCFitnessUser();
    expect(user.roles).toEqual([]);
    expect(user.isAdmin).toBe(false);
  });

  it("missing email → empty string, not a crash", async () => {
    mockGetTokens.mockResolvedValue({
      token: "t",
      decodedToken: { uid: "u2", role: "trainer" },
    } as unknown as Awaited<ReturnType<typeof getTokens>>);
    await expect(getCurrentGCFitnessUser()).resolves.toMatchObject({ uid: "u2", email: "" });
  });

  it("passes the GcFitnessAuthToken cookie + decoded service-account key to getTokens", async () => {
    signedIn({ role: "trainer" });
    await getCurrentGCFitnessUser();
    expect(mockGetTokens).toHaveBeenCalledWith(mockCookieStore, {
      apiKey: "test-api-key",
      cookieName: "GcFitnessAuthToken",
      cookieSignatureKeys: ["test-sig"],
      serviceAccount: {
        projectId: "gcfitness-test",
        clientEmail: "svc@example.com",
        privateKey: "pk",
      },
    });
  });

  it("no session (getTokens → null) → Forbidden", async () => {
    mockGetTokens.mockResolvedValue(null);
    await expect(getCurrentGCFitnessUser()).rejects.toThrow(/^Forbidden$/);
  });
});

describe.each([
  ["getCurrentGCFitnessUser", getCurrentGCFitnessUser],
  ["getCurrentTrainer", getCurrentTrainer],
  ["getCurrentAdmin", getCurrentAdmin],
  ["getCurrentTrainerIdToken", getCurrentTrainerIdToken],
] as const)("%s — missing env is a config error, not Forbidden", (_name, fn) => {
  it.each(ENV_KEYS)("missing %s → descriptive error, getTokens never called", async (key) => {
    delete process.env[key];
    let caught: unknown;
    try {
      await fn();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/server misconfigured/);
    expect((caught as Error).message).not.toBe("Forbidden");
    expect(mockGetTokens).not.toHaveBeenCalled();
  });
});

describe("getCurrentTrainer", () => {
  it("returns the trainer identity with isAdmin/roles carried through", async () => {
    signedIn({ roles: ["trainer", "admin"] });
    await expect(getCurrentTrainer()).resolves.toEqual({
      uid: "u1",
      email: "coach@example.com",
      role: "trainer",
      isAdmin: true,
      roles: ["trainer", "admin"],
    });
  });

  it.each([
    ["client", { role: "client" }],
    ["admin-only", { admin: true }],
    ["no roles", {}],
  ])("%s → Forbidden", async (_label, claims) => {
    signedIn(claims);
    await expect(getCurrentTrainer()).rejects.toThrow(/^Forbidden$/);
  });

  it("no session → Forbidden", async () => {
    mockGetTokens.mockResolvedValue(null);
    await expect(getCurrentTrainer()).rejects.toThrow(/^Forbidden$/);
  });
});

describe("getCurrentAdmin", () => {
  it("admin via legacy `admin: true` claim → admin identity, isTrainer false", async () => {
    signedIn({ admin: true });
    await expect(getCurrentAdmin()).resolves.toEqual({
      uid: "u1",
      email: "coach@example.com",
      role: "admin",
      isTrainer: false,
      roles: ["admin"],
    });
  });

  it("admin via roles[] keeps isTrainer", async () => {
    signedIn({ role: "trainer", roles: ["admin"] });
    await expect(getCurrentAdmin()).resolves.toMatchObject({ role: "admin", isTrainer: true });
  });

  it("trainer without admin → Forbidden", async () => {
    signedIn({ role: "trainer" });
    await expect(getCurrentAdmin()).rejects.toThrow(/^Forbidden$/);
  });
});

describe("getCurrentTrainerIdToken", () => {
  it("returns the RAW cookie ID token (not the decoded token) for a trainer", async () => {
    signedIn({ roles: ["Trainer"] }, "eyJ.raw.jwt");
    await expect(getCurrentTrainerIdToken()).resolves.toEqual({
      uid: "u1",
      idToken: "eyJ.raw.jwt",
    });
    expect(mockGetTokens).toHaveBeenCalledWith(
      mockCookieStore,
      expect.objectContaining({ cookieName: "GcFitnessAuthToken" }),
    );
  });

  it("admin without trainer → Forbidden (never hands out a token)", async () => {
    signedIn({ admin: true });
    await expect(getCurrentTrainerIdToken()).rejects.toThrow(/^Forbidden$/);
  });

  it("no session → Forbidden", async () => {
    mockGetTokens.mockResolvedValue(null);
    await expect(getCurrentTrainerIdToken()).rejects.toThrow(/^Forbidden$/);
  });
});

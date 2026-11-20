// session-revocation.test.ts — #482.
//
// A demoted / deactivated / deleted coach must lose the backoffice on the next
// request, not when the 12-day cookie expires. Pins:
//   - the reader (`assertSessionNotRevoked`): revoked (auth_time before
//     tokensValidAfterTime), disabled and deleted users → Forbidden; a live
//     user → its CURRENT claims; failures are never cached;
//   - the auth helper end to end: a coach whose claims lost `trainer` (or whose
//     tokens were revoked) is refused even though the cookie still says trainer;
//   - the writers: `revokeSessionsIfBackofficeRoleLost` only revokes when a
//     backoffice role goes away (a client changing coach keeps the app session).

jest.unmock("@/lib/gc-fitness/session-revocation");

const mockGetUser = jest.fn();
const mockRevoke = jest.fn();
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessAuth: () => ({ getUser: mockGetUser, revokeRefreshTokens: mockRevoke }),
}));
jest.mock("next/headers", () => ({ cookies: jest.fn(async () => ({})) }));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));

import { getTokens } from "next-firebase-auth-edge";

import {
  getCurrentAdmin,
  getCurrentTrainer,
  getCurrentTrainerIdToken,
} from "@/lib/gc-fitness/auth-helpers";
import {
  assertSessionNotRevoked,
  backofficeRolesFromClaims,
  resetSessionRevocationCacheForTests,
  revokeSessionsIfBackofficeRoleLost,
} from "@/lib/gc-fitness/session-revocation";
import { setGcFitnessAuthEnv } from "@/lib/test-utils/fake-firestore-c";

const mockGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const SIGNED_IN_AT = 1_800_000_000; // auth_time, seconds

function cookieSays(claims: Record<string, unknown>) {
  mockGetTokens.mockResolvedValue({
    token: "raw-id-token",
    decodedToken: { uid: "coach1", email: "c@x.com", auth_time: SIGNED_IN_AT, ...claims },
  } as unknown as Awaited<ReturnType<typeof getTokens>>);
}

function userRecord(over: Record<string, unknown> = {}) {
  return {
    uid: "coach1",
    disabled: false,
    tokensValidAfterTime: new Date((SIGNED_IN_AT - 60) * 1000).toUTCString(),
    customClaims: { role: "trainer", roles: ["trainer"] },
    ...over,
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRevoke.mockReset();
  mockGetTokens.mockReset();
  resetSessionRevocationCacheForTests();
  setGcFitnessAuthEnv();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("assertSessionNotRevoked", () => {
  it("live user → current custom claims", async () => {
    mockGetUser.mockResolvedValue(userRecord());
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).resolves.toEqual({
      customClaims: { role: "trainer", roles: ["trainer"] },
    });
    expect(mockGetUser).toHaveBeenCalledWith("coach1");
  });

  it("tokens revoked after sign-in → Forbidden", async () => {
    mockGetUser.mockResolvedValue(
      userRecord({ tokensValidAfterTime: new Date((SIGNED_IN_AT + 1) * 1000).toUTCString() }),
    );
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).rejects.toThrow(/^Forbidden$/);
  });

  it("a session without auth_time (0) is treated as older than any revocation", async () => {
    mockGetUser.mockResolvedValue(userRecord());
    await expect(assertSessionNotRevoked("coach1", 0)).rejects.toThrow(/^Forbidden$/);
  });

  it("disabled account → Forbidden", async () => {
    mockGetUser.mockResolvedValue(userRecord({ disabled: true }));
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).rejects.toThrow(/^Forbidden$/);
  });

  it("deleted account (getUser throws) → Forbidden, fail closed", async () => {
    mockGetUser.mockRejectedValue(Object.assign(new Error("nope"), { code: "auth/user-not-found" }));
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).rejects.toThrow(/^Forbidden$/);
  });

  it("missing customClaims → {} (no roles), never the token's snapshot", async () => {
    mockGetUser.mockResolvedValue(userRecord({ customClaims: undefined }));
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).resolves.toEqual({
      customClaims: {},
    });
  });

  it("reuses a successful lookup for the same session, but never caches a refusal", async () => {
    mockGetUser.mockResolvedValue(userRecord());
    await assertSessionNotRevoked("coach1", SIGNED_IN_AT);
    await assertSessionNotRevoked("coach1", SIGNED_IN_AT);
    expect(mockGetUser).toHaveBeenCalledTimes(1);

    resetSessionRevocationCacheForTests();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValueOnce(userRecord({ disabled: true }));
    mockGetUser.mockResolvedValueOnce(userRecord());
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).rejects.toThrow(/^Forbidden$/);
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).resolves.toBeTruthy();
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  it("revoking a uid drops its cached lookups", async () => {
    mockGetUser.mockResolvedValue(userRecord());
    await assertSessionNotRevoked("coach1", SIGNED_IN_AT);
    await revokeSessionsIfBackofficeRoleLost("coach1", { role: "trainer" }, { role: "client" }, "t");
    mockGetUser.mockResolvedValue(userRecord({ disabled: true }));
    await expect(assertSessionNotRevoked("coach1", SIGNED_IN_AT)).rejects.toThrow(/^Forbidden$/);
  });
});

describe("auth helper honors revocation (the next request after a demotion)", () => {
  it("cookie still says trainer but the claims were demoted → getCurrentTrainer Forbidden", async () => {
    cookieSays({ role: "trainer", roles: ["trainer"] });
    mockGetUser.mockResolvedValue(userRecord({ customClaims: { role: "client" } }));
    await expect(getCurrentTrainer()).rejects.toThrow(/^Forbidden$/);
    await expect(getCurrentTrainerIdToken()).rejects.toThrow(/^Forbidden$/);
  });

  it("admin role removed → getCurrentAdmin Forbidden, trainer still allowed", async () => {
    cookieSays({ role: "trainer", roles: ["trainer", "admin"], admin: true });
    mockGetUser.mockResolvedValue(userRecord({ customClaims: { role: "trainer", roles: ["trainer"] } }));
    await expect(getCurrentAdmin()).rejects.toThrow(/^Forbidden$/);
    await expect(getCurrentTrainer()).resolves.toMatchObject({ uid: "coach1", isAdmin: false });
  });

  it("refresh tokens revoked → Forbidden even with an intact trainer claim", async () => {
    cookieSays({ role: "trainer" });
    mockGetUser.mockResolvedValue(
      userRecord({ tokensValidAfterTime: new Date((SIGNED_IN_AT + 5) * 1000).toUTCString() }),
    );
    await expect(getCurrentTrainer()).rejects.toThrow(/^Forbidden$/);
  });

  it("deactivated (disabled) account → Forbidden", async () => {
    cookieSays({ role: "trainer" });
    mockGetUser.mockResolvedValue(userRecord({ disabled: true }));
    await expect(getCurrentTrainer()).rejects.toThrow(/^Forbidden$/);
  });

  it("a promotion applies immediately too (fresh claims win over the cookie)", async () => {
    cookieSays({ role: "trainer" });
    mockGetUser.mockResolvedValue(
      userRecord({ customClaims: { role: "trainer", roles: ["trainer", "admin"], admin: true } }),
    );
    await expect(getCurrentAdmin()).resolves.toMatchObject({ uid: "coach1", isTrainer: true });
  });
});

describe("revokeSessionsIfBackofficeRoleLost", () => {
  it.each([
    ["trainer → client", { role: "trainer", roles: ["trainer"] }, { role: "client" }, true],
    ["admin dropped", { roles: ["trainer", "admin"], admin: true }, { roles: ["trainer"] }, true],
    ["client → client (coach transfer)", { role: "client", coachId: "a" }, { role: "client", coachId: "b" }, false],
    ["role string flips but roles[] keeps trainer", { role: "trainer", roles: ["trainer"] }, { role: "client", roles: ["trainer"] }, false],
    ["promotion", { role: "trainer" }, { role: "trainer", roles: ["trainer", "admin"], admin: true }, false],
    ["no previous claims", undefined, { role: "client" }, false],
  ])("%s → revoke=%s", async (_label, before, after, expected) => {
    mockRevoke.mockResolvedValue(undefined);
    await expect(
      revokeSessionsIfBackofficeRoleLost("u1", before as Record<string, unknown> | undefined, after, "t"),
    ).resolves.toBe(expected);
    expect(mockRevoke).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it("a failing revoke is logged, never thrown (the Firestore side already committed)", async () => {
    mockRevoke.mockRejectedValue(new Error("boom"));
    await expect(
      revokeSessionsIfBackofficeRoleLost("u1", { role: "trainer" }, { role: "client" }, "t"),
    ).resolves.toBe(true);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("backofficeRolesFromClaims", () => {
  it("keeps only trainer/admin, normalized", () => {
    expect(backofficeRolesFromClaims({ role: " Trainer ", roles: ["client", "ADMIN"] })).toEqual([
      "trainer",
      "admin",
    ]);
    expect(backofficeRolesFromClaims({ admin: true })).toEqual(["admin"]);
    expect(backofficeRolesFromClaims({ admin: "true", role: "client" })).toEqual([]);
    expect(backofficeRolesFromClaims(null)).toEqual([]);
  });
});

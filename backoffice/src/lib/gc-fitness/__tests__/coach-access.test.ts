// coach-access.test.ts — #510.
//
// Pins who may hold `trainer` (decideCoachGrant) and the two admin writers
// that remove / restore it. Asserts the WRITTEN users doc, allowlist doc and
// claims — the login reads exactly those.

import { FakeFirestore } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockAuth = {
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(async () => undefined),
  revokeRefreshTokens: jest.fn(async () => undefined),
};
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => mockAuth,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
const mockGetCurrentAdmin = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: () => mockGetCurrentAdmin(),
}));

import {
  claimsWithTrainer,
  claimsWithoutTrainer,
  decideCoachGrant,
  disableCoach,
  reactivateCoach,
} from "@/lib/gc-fitness/coach-access";

const ADMIN = { uid: "admin1", email: "admin@x.io", role: "admin", isTrainer: true, roles: ["trainer", "admin"] };

beforeEach(() => {
  mockDb.current = new FakeFirestore();
  mockGetCurrentAdmin.mockReset().mockResolvedValue(ADMIN);
  mockAuth.getUser.mockReset();
  mockAuth.setCustomUserClaims.mockClear();
  mockAuth.revokeRefreshTokens.mockClear();
  delete process.env.GC_FITNESS_TEAM_ALLOWLIST;
});

describe("decideCoachGrant", () => {
  it("coach claims → grant via claims", async () => {
    await expect(
      decideCoachGrant({ claims: { role: "trainer" }, userDoc: null, email: "a@x.io" }),
    ).resolves.toEqual({ grant: true, via: "claims" });
    await expect(
      decideCoachGrant({ claims: { admin: true }, userDoc: null, email: "a@x.io" }),
    ).resolves.toEqual({ grant: true, via: "claims" });
  });

  it("allowlist (env or enabled doc) → grant; disabled doc → no", async () => {
    process.env.GC_FITNESS_TEAM_ALLOWLIST = " A@X.io ,b@x.io";
    await expect(decideCoachGrant({ claims: {}, userDoc: null, email: "a@x.io" })).resolves.toEqual({
      grant: true,
      via: "allowlist",
    });
    mockDb.current!.seed("coach_allowlist/c@x.io", { enabled: true });
    mockDb.current!.seed("coach_allowlist/d@x.io", { enabled: false });
    await expect(decideCoachGrant({ claims: {}, userDoc: null, email: "C@x.io" })).resolves.toMatchObject({ grant: true });
    await expect(decideCoachGrant({ claims: {}, userDoc: null, email: "d@x.io" })).resolves.toEqual({
      grant: false,
      reason: "not-a-coach",
    });
  });

  it("nothing explicit → refused, even with a trainer doc", async () => {
    await expect(
      decideCoachGrant({ claims: undefined, userDoc: { role: "trainer" }, email: "z@x.io" }),
    ).resolves.toEqual({ grant: false, reason: "not-a-coach" });
  });

  it("coachDisabled beats claims and allowlist", async () => {
    process.env.GC_FITNESS_TEAM_ALLOWLIST = "a@x.io";
    await expect(
      decideCoachGrant({ claims: { role: "trainer" }, userDoc: { coachDisabled: true }, email: "a@x.io" }),
    ).resolves.toEqual({ grant: false, reason: "coach-disabled" });
  });
});

describe("claims helpers", () => {
  it("claimsWithoutTrainer keeps admin and unrelated keys", () => {
    expect(claimsWithoutTrainer({ role: "trainer", roles: ["trainer"], admin: false, tier: "pro" })).toEqual({
      tier: "pro",
      roles: [],
      admin: false,
    });
    expect(claimsWithoutTrainer({ role: "trainer", roles: ["trainer", "admin", "Ops"], admin: true })).toEqual({
      role: "admin",
      roles: ["ops", "admin"],
      admin: true,
    });
  });

  it("claimsWithTrainer adds trainer and mirrors admin", () => {
    expect(claimsWithTrainer({ role: "admin", tier: "pro" })).toEqual({
      tier: "pro",
      role: "trainer",
      roles: ["admin", "trainer"],
      admin: true,
    });
  });
});

describe("disableCoach / reactivateCoach", () => {
  function seedCoach() {
    mockDb.current!.seed("users/coach1", { role: "trainer", email: "coach@x.io" });
    mockDb.current!.seed("coach_allowlist/coach@x.io", { email: "coach@x.io", enabled: true });
    mockAuth.getUser.mockResolvedValue({
      uid: "coach1",
      email: "coach@x.io",
      customClaims: { role: "trainer", roles: ["trainer"], admin: false },
    });
  }

  it("disable: marks the doc, strips trainer, disables the allowlist entry, revokes sessions, logs", async () => {
    seedCoach();
    await expect(disableCoach({ coachUid: "coach1" })).resolves.toEqual({ ok: true, uid: "coach1" });
    expect(mockDb.current!.doc("users/coach1")).toMatchObject({
      role: "trainer",
      coachDisabled: true,
      coachDisabledBy: "admin1",
    });
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("coach1", { roles: [], admin: false });
    expect(mockDb.current!.doc("coach_allowlist/coach@x.io")).toMatchObject({ enabled: false });
    expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith("coach1");
    expect(mockDb.current!.writes.some((w) => w.path.startsWith("admin_operations/"))).toBe(true);
  });

  it("disable then a fresh login decision refuses the role", async () => {
    seedCoach();
    await disableCoach({ coachUid: "coach1" });
    await expect(
      decideCoachGrant({
        claims: { role: "trainer" }, // a stale token's claims
        userDoc: mockDb.current!.doc("users/coach1"),
        email: "coach@x.io",
      }),
    ).resolves.toEqual({ grant: false, reason: "coach-disabled" });
  });

  it("reactivate: clears the mark, restores trainer, re-enables the allowlist entry", async () => {
    seedCoach();
    await disableCoach({ coachUid: "coach1" });
    mockAuth.getUser.mockResolvedValue({ uid: "coach1", email: "coach@x.io", customClaims: { roles: [], admin: false } });
    await expect(reactivateCoach({ coachUid: "coach1" })).resolves.toEqual({ ok: true, uid: "coach1" });
    const doc = mockDb.current!.doc("users/coach1")!;
    expect(doc.coachDisabled).toBeUndefined();
    expect(mockAuth.setCustomUserClaims).toHaveBeenLastCalledWith("coach1", {
      role: "trainer",
      roles: ["trainer"],
      admin: false,
    });
    expect(mockDb.current!.doc("coach_allowlist/coach@x.io")).toMatchObject({ enabled: true });
  });

  it("refusals RETURN failures and write nothing", async () => {
    seedCoach();
    const before = mockDb.current!.writes.length;
    await expect(disableCoach({ coachUid: "admin1" })).resolves.toMatchObject({ ok: false });
    mockDb.current!.seed("users/client1", { role: "client" });
    await expect(disableCoach({ coachUid: "client1" })).resolves.toMatchObject({ ok: false });
    await expect(disableCoach({ coachUid: "" })).resolves.toMatchObject({ ok: false });
    mockGetCurrentAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(disableCoach({ coachUid: "coach1" })).resolves.toEqual({ ok: false, error: "Forbidden" });
    await expect(reactivateCoach({ coachUid: "coach1" })).resolves.toEqual({ ok: false, error: "Forbidden" });
    expect(mockDb.current!.writes.length).toBe(before);
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

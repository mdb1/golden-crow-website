// __tests__/admin-coachless-actions.test.ts
//
// God-mode actions on the coach-less users surface. All Admin-SDK, all
// admin-gated. The destructive one, `deleteCoachlessUser`, carries three guards
// that are the only thing keeping it from wiping the wrong account:
//   1. target must be an ACTIVE COACH-LESS CLIENT (not a coach, not a coached
//      client, not already deleted);
//   2. the typed email must match the target's email (case-insensitive);
//   3. zod on uid / non-empty confirmation.
// Refusals assert NOTHING was written (Firestore write log, Storage, Auth).
// The happy path runs the REAL `deleteClientCascade` against the fake store.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-admin-b").fakeFieldValueModule,
);

const mockGetCurrentAdmin = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: () => mockGetCurrentAdmin(),
}));

const mockDb: { current: unknown } = { current: null };
const mockAuth = {
  getUser: jest.fn(),
  deleteUser: jest.fn(async () => undefined),
  setCustomUserClaims: jest.fn(),
};
const mockDeleteFiles = jest.fn(async (_opts: { prefix: string }) => undefined);
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => mockAuth,
  gcFitnessStorage: () => ({ bucket: () => ({ deleteFiles: mockDeleteFiles }) }),
}));

import {
  deleteCoachlessUser,
  getCoachlessUserProfile,
  listCoachlessUsersWithStats,
  setUserEntitlementTier,
} from "@/lib/gc-fitness/admin-coachless-actions";
import { FakeFirestore, FV_SERVER_TIMESTAMP } from "@/lib/test-utils/fake-firestore-admin-b";

const ADMIN = {
  uid: "admin-1",
  email: "admin@example.com",
  role: "admin" as const,
  isTrainer: false,
  roles: ["admin"],
};

const SOLO = "solo-user1";
const SOLO2 = "solo-user2";
const COACHED = "coached-1";
const COACH = "coach-A1";
const GUEST = "guest-user1";
const GONE = "deleted-u1";

let db: FakeFirestore;

beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeFirestore({
    users: {
      [SOLO]: {
        role: "client",
        email: "Solo@Example.com",
        displayName: "Solo",
        timezone: "UTC",
        locale: "es",
        birthDate: "1990-01-01",
        entitlement: { tier: "premium", source: "revenuecat", productId: "p1" },
      },
      [SOLO2]: { role: "client", email: "a-first@example.com", coachId: "" },
      [COACHED]: { role: "client", email: "coached@example.com", coachId: COACH },
      [COACH]: { role: "trainer", email: "coach@example.com" },
      [GUEST]: { role: "client", isGuest: true, email: "" },
      [GONE]: { role: "client", deleted: true, email: "gone@example.com" },
    },
    workout_templates: {
      t1: { trainerId: SOLO, name: { es: "Mi rutina" }, exercises: [{}, {}], tags: ["a", 1], updatedAt: "2026-05-02" },
      t2: { trainerId: SOLO, name: { en: "Old" }, deleted: true, tag: "legacy", updatedAt: "2026-05-03" },
    },
    habits: {
      h1: { clientId: SOLO, clientOwned: true },
      h2: { clientId: SOLO },
    },
    workout_logs: { l1: { clientId: SOLO, startedAt: "2026-05-01T10:00:00.000Z" } },
    progress_photos: { p1: { clientId: SOLO, createdAt: "2026-05-01T10:00:00.000Z" } },
    habit_logs: {
      hl1: { clientId: SOLO, civilDate: "2026-05-01", value: true },
      hl2: { clientId: SOLO, civilDate: "2026-05-02", value: false },
    },
    [`users/${SOLO}/body_weight_logs`]: {
      w1: { valueKg: 70.5, recordedAt: "2026-05-01T08:00:00.000Z" },
    },
    chats: { [SOLO]: { clientId: SOLO } },
  });
  mockDb.current = db;
  mockGetCurrentAdmin.mockResolvedValue(ADMIN);
  mockAuth.getUser.mockResolvedValue({
    uid: SOLO,
    providerData: [{ providerId: "google.com" }],
    emailVerified: true,
    disabled: false,
    metadata: { lastSignInTime: "Fri, 01 May 2026 10:00:00 GMT", creationTime: undefined },
  });
});

function expectNoMutation() {
  expect(db.writes).toEqual([]);
  expect(mockDeleteFiles).not.toHaveBeenCalled();
  expect(mockAuth.deleteUser).not.toHaveBeenCalled();
}

describe.each([
  ["listCoachlessUsersWithStats", () => listCoachlessUsersWithStats()],
  ["getCoachlessUserProfile", () => getCoachlessUserProfile(SOLO)],
  ["setUserEntitlementTier", () => setUserEntitlementTier({ uid: SOLO, tier: "premium" })],
  ["deleteCoachlessUser", () => deleteCoachlessUser({ uid: SOLO, emailConfirmation: "solo@example.com" })],
])("%s — admin gate", (_name, call) => {
  it("rejects a non-admin with Forbidden and mutates nothing", async () => {
    mockGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(call()).rejects.toThrow("Forbidden");
    expectNoMutation();
    expect(mockAuth.getUser).not.toHaveBeenCalled();
  });
});

describe("listCoachlessUsersWithStats", () => {
  it("lists only active, non-guest, coach-less clients with their counts, sorted by email", async () => {
    const rows = await listCoachlessUsersWithStats();
    expect(rows.map((r) => r.uid)).toEqual([SOLO2, SOLO]);
    expect(rows[1]).toEqual({
      uid: SOLO,
      email: "Solo@Example.com",
      displayName: "Solo",
      photoURL: null,
      createdAtISO: null,
      entitlement: expect.objectContaining({ tier: "premium" }),
      stats: { routines: 2, habits: 1, progressPhotos: 1, workoutLogs: 1 },
    });
    expect(db.writes).toEqual([]);
  });
});

describe("getCoachlessUserProfile", () => {
  it("refuses a coached client, a coach, a deleted user and a missing user", async () => {
    await expect(getCoachlessUserProfile(COACHED)).rejects.toThrow("Not a coach-less client.");
    await expect(getCoachlessUserProfile(COACH)).rejects.toThrow("Not a coach-less client.");
    await expect(getCoachlessUserProfile(GONE)).rejects.toThrow("Not a coach-less client.");
    await expect(getCoachlessUserProfile("missing-1")).rejects.toThrow("User not found.");
  });

  it("returns identity, auth facts, routines (active first) and weights", async () => {
    const profile = await getCoachlessUserProfile(SOLO);
    expect(profile).toMatchObject({
      uid: SOLO,
      email: "Solo@Example.com",
      timezone: "UTC",
      locale: "es",
      birthDate: "1990-01-01",
      stats: { routines: 1, habits: 1, progressPhotos: 1, workoutLogs: 1 },
      auth: {
        providers: ["google.com"],
        emailVerified: true,
        disabled: false,
        lastSignInISO: "2026-05-01T10:00:00.000Z",
        creationISO: null,
      },
      recentWeights: [{ id: "w1", valueKg: 70.5, recordedAtISO: "2026-05-01T08:00:00.000Z" }],
      devices: [],
    });
    expect(profile.routines.map((r) => [r.id, r.deleted, r.tags, r.exerciseCount])).toEqual([
      ["t1", false, ["a"], 2],
      ["t2", true, ["legacy"], 0],
    ]);
    expect(db.writes).toEqual([]);
  });

  it("degrades to auth:null when the Auth lookup fails", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("auth down"));
    await expect(getCoachlessUserProfile(SOLO)).resolves.toMatchObject({ auth: null });
  });
});

describe("setUserEntitlementTier", () => {
  it.each([
    ["unknown tier", { uid: SOLO, tier: "gold" }],
    ["short uid", { uid: "abc", tier: "free" }],
    ["missing tier", { uid: SOLO }],
  ])("rejects %s before writing", async (_label, input) => {
    await expect(setUserEntitlementTier(input)).rejects.toThrow();
    expectNoMutation();
  });

  it("overwrites the whole entitlement map (no stale productId) and logs the override", async () => {
    await expect(setUserEntitlementTier({ uid: SOLO, tier: "free" })).resolves.toEqual({
      ok: true,
      uid: SOLO,
      tier: "free",
    });
    expect(db.writes[0]).toEqual({
      op: "set",
      path: `users/${SOLO}`,
      data: {
        entitlement: {
          tier: "free",
          source: "admin",
          productId: null,
          expiresAt: null,
          updatedAt: FV_SERVER_TIMESTAMP,
        },
      },
      options: { merge: true },
    });
    expect(db.doc("users", SOLO)?.entitlement).toEqual({
      tier: "free",
      source: "admin",
      productId: null,
      expiresAt: null,
      updatedAt: FV_SERVER_TIMESTAMP,
    });
    expect(db.writes[1]).toMatchObject({
      op: "add",
      path: expect.stringMatching(/^admin_operations\//),
      data: {
        actorUid: ADMIN.uid,
        kind: "set_entitlement",
        mode: "execute",
        targetUid: SOLO,
        status: "success",
        summary: { tier: "free", source: "admin" },
      },
    });
  });
});

describe("deleteCoachlessUser", () => {
  it.each([
    ["a coached client", COACHED, "coached@example.com"],
    ["a coach", COACH, "coach@example.com"],
    ["an already-deleted user", GONE, "gone@example.com"],
  ])("refuses %s even with the right email — nothing written or deleted", async (_l, uid, email) => {
    await expect(deleteCoachlessUser({ uid, emailConfirmation: email })).rejects.toThrow(
      "Refusing to delete: target is not an active coach-less client.",
    );
    expectNoMutation();
    expect(db.doc("users", uid)).toBeDefined();
  });

  it("refuses when the typed email does not match", async () => {
    await expect(
      deleteCoachlessUser({ uid: SOLO, emailConfirmation: "someone-else@example.com" }),
    ).rejects.toThrow("Email confirmation does not match the target user.");
    expectNoMutation();
  });

  it("refuses a missing user, empty confirmation and a short uid", async () => {
    await expect(deleteCoachlessUser({ uid: "missing-1", emailConfirmation: "x" })).rejects.toThrow(
      "User not found.",
    );
    await expect(deleteCoachlessUser({ uid: SOLO, emailConfirmation: "   " })).rejects.toThrow();
    await expect(deleteCoachlessUser({ uid: "abc", emailConfirmation: "x" })).rejects.toThrow();
    expectNoMutation();
  });

  it("refuses a user with no email even if the confirmation is blank-ish", async () => {
    // GUEST has email "" — the confirmation must be non-empty, so it can never match.
    await expect(deleteCoachlessUser({ uid: GUEST, emailConfirmation: "x" })).rejects.toThrow(
      "Email confirmation does not match the target user.",
    );
    expectNoMutation();
  });

  it("happy path (case-insensitive email): deletes the Storage prefix, cascades Firestore + Auth", async () => {
    await expect(
      deleteCoachlessUser({ uid: SOLO, emailConfirmation: "  solo@EXAMPLE.com " }),
    ).resolves.toEqual({ ok: true, deletedDocsApprox: 8 });
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: `progress_photos/${SOLO}/` });
    expect(db.doc("users", SOLO)).toBeUndefined();
    expect(db.doc("chats", SOLO)).toBeUndefined();
    expect(db.all("habits")).toEqual({});
    expect(db.all(`users/${SOLO}/body_weight_logs`)).toEqual({});
    // CURRENT behavior: the client cascade keys on clientId, so the user's
    // self-authored workout_templates (trainerId == uid) are left behind.
    expect(Object.keys(db.all("workout_templates"))).toEqual(["t1", "t2"]);
    expect(mockAuth.deleteUser).toHaveBeenCalledWith(SOLO);
    // other users untouched
    expect(db.doc("users", SOLO2)).toBeDefined();
    expect(db.doc("users", COACHED)).toBeDefined();
    const [log] = db.writesTo("admin_operations/");
    expect(log.data).toMatchObject({ kind: "delete_client_cascade", mode: "execute", targetUid: SOLO });
  });

  it("does not block the delete when the Storage cleanup fails", async () => {
    mockDeleteFiles.mockRejectedValueOnce(new Error("storage down"));
    await expect(
      deleteCoachlessUser({ uid: SOLO, emailConfirmation: "solo@example.com" }),
    ).resolves.toMatchObject({ ok: true });
    expect(db.doc("users", SOLO)).toBeUndefined();
  });
});

// __tests__/engineering-actions.test.ts
//
// `grantEngineering` / `revokeEngineering` mint and strip the `engineering`
// flag that unlocks /gc-fitness/qa-tools — a PRIVILEGE-ESCALATION surface that
// writes through the Admin SDK (rules bypassed). The only barrier is
// `assertCallerIsEngineering`: a plain trainer must not be able to grant the
// flag to themselves or anyone else. These tests pin that gate (claim OR
// /users doc flag), the zod validation, the self-revoke refusal, and the exact
// written shape.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-admin-b").fakeFieldValueModule,
);

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

const mockDb: { current: unknown } = { current: null };
const mockGetUserByEmail = jest.fn();
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => ({ getUserByEmail: mockGetUserByEmail }),
}));

import {
  grantEngineering,
  listEngineeringUsers,
  revokeEngineering,
} from "@/lib/gc-fitness/engineering-actions";
import {
  FakeFirestore,
  FV_DELETE,
  FV_SERVER_TIMESTAMP,
} from "@/lib/test-utils/fake-firestore-admin-b";

let db: FakeFirestore;

const trainer = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  email: `${uid}@example.com`,
  role: "trainer" as const,
  isAdmin: false,
  roles: ["trainer"],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeFirestore({
    users: {
      "eng-1": { email: "eng1@example.com", displayName: "Eng One", engineering: true },
      "eng-2": { email: "eng2@example.com", displayName: "Eng Two", engineering: true },
      "plain-1": { email: "plain@example.com", role: "trainer" },
      "target-1": { email: "target@example.com", role: "trainer" },
    },
  });
  mockDb.current = db;
  mockGetCurrentTrainer.mockResolvedValue(trainer("eng-1"));
  mockGetUserByEmail.mockImplementation(async (email: string) => {
    if (email === "target@example.com") return { uid: "target-1" };
    throw new Error("auth/user-not-found");
  });
});

describe("grantEngineering", () => {
  it("rejects a caller that is not signed in as a trainer (Forbidden) and writes nothing", async () => {
    mockGetCurrentTrainer.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(grantEngineering({ email: "target@example.com" })).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects a plain trainer (no claim, no doc flag) — cannot self-escalate", async () => {
    mockGetCurrentTrainer.mockResolvedValue(trainer("plain-1"));
    await expect(grantEngineering({ email: "plain@example.com" })).rejects.toThrow(
      "Engineering claim required.",
    );
    expect(db.writes).toEqual([]);
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects a trainer whose doc flag is not literally truthy (engineering: false)", async () => {
    await db.collection("users").doc("plain-1").set({ engineering: false }, { merge: true });
    db.writes.length = 0;
    mockGetCurrentTrainer.mockResolvedValue(trainer("plain-1"));
    await expect(grantEngineering({ email: "x@example.com" })).rejects.toThrow(
      "Engineering claim required.",
    );
    expect(db.writes).toEqual([]);
  });

  it("admits a caller whose engineering comes from the auth CLAIM even without the doc flag", async () => {
    mockGetCurrentTrainer.mockResolvedValue(trainer("plain-1", { engineering: true }));
    await expect(grantEngineering({ email: "target@example.com" })).resolves.toEqual({
      uid: "target-1",
      email: "target@example.com",
    });
  });

  it("rejects an invalid email before any lookup or write", async () => {
    await expect(grantEngineering({ email: "not-an-email" })).rejects.toThrow();
    await expect(grantEngineering({})).rejects.toThrow();
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("throws a friendly error when no Auth user has that email, writing nothing", async () => {
    await expect(grantEngineering({ email: "ghost@example.com" })).rejects.toThrow(
      "No Corvo user found for ghost@example.com.",
    );
    expect(db.writes).toEqual([]);
  });

  it("happy path: normalizes the email and merges engineering:true onto the target doc", async () => {
    const result = await grantEngineering({ email: "  TARGET@Example.com " });
    expect(result).toEqual({ uid: "target-1", email: "target@example.com" });
    expect(mockGetUserByEmail).toHaveBeenCalledWith("target@example.com");
    expect(db.writes).toEqual([
      {
        op: "set",
        path: "users/target-1",
        data: { engineering: true, updatedAt: FV_SERVER_TIMESTAMP },
        options: { merge: true },
      },
    ]);
    // merge keeps the existing fields
    expect(db.doc("users", "target-1")).toEqual({
      email: "target@example.com",
      role: "trainer",
      engineering: true,
      updatedAt: FV_SERVER_TIMESTAMP,
    });
  });
});

describe("revokeEngineering", () => {
  it("rejects a non-engineering trainer and writes nothing", async () => {
    mockGetCurrentTrainer.mockResolvedValue(trainer("plain-1"));
    await expect(revokeEngineering({ uid: "eng-2" })).rejects.toThrow(
      "Engineering claim required.",
    );
    expect(db.writes).toEqual([]);
    expect(db.doc("users", "eng-2")?.engineering).toBe(true);
  });

  it("rejects Forbidden callers", async () => {
    mockGetCurrentTrainer.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(revokeEngineering({ uid: "eng-2" })).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });

  it("rejects an empty uid", async () => {
    await expect(revokeEngineering({ uid: "" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("refuses to revoke the caller's own claim", async () => {
    await expect(revokeEngineering({ uid: "eng-1" })).rejects.toThrow(
      "Refusing to revoke your own engineering claim",
    );
    expect(db.writes).toEqual([]);
    expect(db.doc("users", "eng-1")?.engineering).toBe(true);
  });

  it("happy path: deletes the flag on another engineering user's doc", async () => {
    await expect(revokeEngineering({ uid: "eng-2" })).resolves.toEqual({ uid: "eng-2" });
    expect(db.writes).toEqual([
      {
        op: "set",
        path: "users/eng-2",
        data: { engineering: FV_DELETE, updatedAt: FV_SERVER_TIMESTAMP },
        options: { merge: true },
      },
    ]);
    expect(db.doc("users", "eng-2")).toEqual({
      email: "eng2@example.com",
      displayName: "Eng Two",
      updatedAt: FV_SERVER_TIMESTAMP,
    });
  });
});

describe("listEngineeringUsers", () => {
  it("rejects a non-engineering trainer", async () => {
    mockGetCurrentTrainer.mockResolvedValue(trainer("plain-1"));
    await expect(listEngineeringUsers()).rejects.toThrow("Engineering claim required.");
  });

  it("lists only engineering users, with null for non-string fields", async () => {
    await db.collection("users").doc("eng-3").set({ engineering: true, email: 42 });
    const rows = await listEngineeringUsers();
    expect(rows).toEqual(
      expect.arrayContaining([
        { uid: "eng-1", email: "eng1@example.com", displayName: "Eng One" },
        { uid: "eng-2", email: "eng2@example.com", displayName: "Eng Two" },
        { uid: "eng-3", email: null, displayName: null },
      ]),
    );
    expect(rows).toHaveLength(3);
  });
});

// __tests__/admin-actions.guards.test.ts
//
// The god-mode admin Server Actions in `admin-actions.ts` write through the
// Firebase ADMIN SDK, so firestore.rules never see them. What stands between an
// operator click (or a replayed/tampered form POST) and another coach's data is
// the code here:
//   - `getCurrentAdmin()` on EVERY action (throws "Forbidden" for non-admins);
//   - zod literals on the destructive cascades ("DELETE CLIENT"/"DELETE COACH")
//     and the dry_run vs execute split;
//   - the coach-ownership reads (`coachId === coachUid`) on deactivate /
//     unlink / remove-pending and `assertClientBelongsToCoach` on the drill-down
//     readers.
// Every refusal below asserts that NOTHING was written (fake Firestore write
// log + Auth mutators), and every happy path asserts the written document.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-admin-b").fakeFieldValueModule,
);

const mockGetCurrentAdmin = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: () => mockGetCurrentAdmin(),
}));

jest.mock("@/lib/gc-fitness/nutrition-roster", () => ({
  loadNutritionRosterSummaries: jest.fn(async () => new Map()),
}));

const mockDb: { current: unknown } = { current: null };
const mockAuth = {
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  setCustomUserClaims: jest.fn(async () => undefined),
  deleteUser: jest.fn(async () => undefined),
  updateUser: jest.fn(async () => undefined),
};
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => mockAuth,
}));

import {
  addCoachEmailToAllowlist,
  deactivateClientForCoach,
  deleteClientCascade,
  deleteCoachCascade,
  getCoachAdminDetail,
  getDeletionTargetInfo,
  listClientAssignmentsForAdmin,
  listClientHabitsForAdmin,
  listClientNutritionForAdmin,
  listCoachAllowlist,
  listCoachesForAdmin,
  listCoachOptionsForAdmin,
  listRecentCoachActivity,
  previewClientCascade,
  previewCoachCascade,
  promoteUserToAdmin,
  removeCoachEmailFromAllowlist,
  removePendingClientForCoach,
  searchUsersByEmailForAdmin,
  transferClientToCoach,
  unlinkClientFromCoach,
  getAppVersionConfig,
  updateAppVersionConfig,
} from "@/lib/gc-fitness/admin-actions";
import {
  FakeFirestore,
  FV_DELETE,
  FV_SERVER_TIMESTAMP,
} from "@/lib/test-utils/fake-firestore-admin-b";

const ADMIN = {
  uid: "admin-1",
  email: "admin@example.com",
  role: "admin" as const,
  isTrainer: false,
  roles: ["admin"],
};

// uids must be ≥ 6 chars (zod min(6)).
const COACH_A = "coach-A1";
const COACH_B = "coach-B1";
const CLIENT_A = "client-A1"; // belongs to COACH_A
const CLIENT_B = "client-B1"; // belongs to COACH_B
const SOLO = "solo-user1"; // coach-less client

let db: FakeFirestore;

function seed(): FakeFirestore {
  return new FakeFirestore({
    users: {
      [COACH_A]: { role: "trainer", deleted: false, email: "a@coach.com", displayName: "Coach A", createdAt: "2026-01-01" },
      [COACH_B]: { role: "trainer", deleted: false, email: "b@coach.com", displayName: "", photoURL: "https://p/b.png", createdAt: "2026-01-02" },
      [CLIENT_A]: { role: "client", coachId: COACH_A, deleted: false, email: "ca@x.com", createdAt: "2026-02-01" },
      [CLIENT_B]: { role: "client", coachId: COACH_B, deleted: false, email: "cb@x.com", createdAt: "2026-02-02" },
      [SOLO]: { role: "client", deleted: false, email: "solo@x.com" },
    },
    chats: {
      [CLIENT_A]: { clientId: CLIENT_A, coachId: COACH_A, unreadCount: { [COACH_A]: 2 } },
    },
    "chats/client-A1/messages": { m1: { text: "hi" } },
    workout_assignments: {
      wa1: { clientId: CLIENT_A, trainerId: COACH_A, scheduledFor: "2026-03-01", status: "completed", seriesId: "s1", recurrence: { kind: "daily" }, templateSnapshot: { name: { en: "Legs", es: "Piernas" } }, createdAt: "2026-03-01" },
      wa2: { clientId: CLIENT_A, trainerId: COACH_A, scheduledFor: "2026-03-02", status: "scheduled", seriesId: "s1", recurrence: { kind: "daily" }, templateSnapshot: { name: { en: "Legs", es: "Piernas" } }, createdAt: "2026-03-02" },
      wa3: { clientId: CLIENT_A, trainerId: COACH_A, scheduledFor: "2026-02-01", scheduledTime: "08:00", templateSnapshot: { name: "Push" }, createdAt: "2026-02-01" },
      waB: { clientId: CLIENT_B, trainerId: COACH_B, scheduledFor: "2026-03-01", createdAt: "2026-03-01" },
    },
    workout_logs: { wl1: { clientId: CLIENT_A } },
    habits: {
      h1: { clientId: CLIENT_A, trainerId: COACH_A, name: { es: "Agua" }, scheduleCadence: "daily", scheduleType: "fixed", reminderEnabled: true, createdAt: "2026-03-03" },
      h2: { clientId: CLIENT_A, trainerId: COACH_A, name: { en: "Sleep" }, deleted: true },
    },
    workout_templates: { t1: { trainerId: COACH_A, name: { es: "Rutina" }, createdAt: "2026-03-04" } },
    exercises: { e1: { trainerId: COACH_A } },
    user_mirror: {
      "pending@x.com": { coachId: COACH_A, email: "pending@x.com", pre_created: true, createdAt: "2026-03-05" },
      "other@x.com": { coachId: COACH_B, email: "other@x.com" },
    },
    coach_allowlist: {
      "new@coach.com": { email: "new@coach.com", enabled: true },
      "a@coach.com": { email: "a@coach.com", enabled: true },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db = seed();
  mockDb.current = db;
  mockGetCurrentAdmin.mockResolvedValue(ADMIN);
  mockAuth.getUser.mockImplementation(async (uid: string) => ({
    uid,
    customClaims: { role: "client", coachId: COACH_A, extra: 1 },
  }));
});

function expectNoMutation() {
  expect(db.writes).toEqual([]);
  expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
  expect(mockAuth.deleteUser).not.toHaveBeenCalled();
  expect(mockAuth.updateUser).not.toHaveBeenCalled();
}

// ── 1. Admin gate on every exported action ───────────────────────────────────

const GATED: Array<[string, () => Promise<unknown>]> = [
  ["listCoachesForAdmin", () => listCoachesForAdmin()],
  ["listCoachOptionsForAdmin", () => listCoachOptionsForAdmin()],
  ["searchUsersByEmailForAdmin", () => searchUsersByEmailForAdmin("a")],
  ["getCoachAdminDetail", () => getCoachAdminDetail(COACH_A)],
  ["addCoachEmailToAllowlist", () => addCoachEmailToAllowlist("x@coach.com")],
  ["listCoachAllowlist", () => listCoachAllowlist()],
  ["listRecentCoachActivity", () => listRecentCoachActivity()],
  ["removeCoachEmailFromAllowlist", () => removeCoachEmailFromAllowlist({ email: "new@coach.com" })],
  ["promoteUserToAdmin", () => promoteUserToAdmin({ email: "a@coach.com" })],
  ["deleteClientCascade", () => deleteClientCascade({ clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "execute" })],
  ["deleteCoachCascade", () => deleteCoachCascade({ coachUid: COACH_A, confirmation: "DELETE COACH", mode: "execute" })],
  ["previewClientCascade", () => previewClientCascade(CLIENT_A)],
  ["previewCoachCascade", () => previewCoachCascade(COACH_A)],
  ["getDeletionTargetInfo", () => getDeletionTargetInfo(CLIENT_A)],
  ["listClientNutritionForAdmin", () => listClientNutritionForAdmin(COACH_A, CLIENT_A)],
  ["listClientAssignmentsForAdmin", () => listClientAssignmentsForAdmin(COACH_A, CLIENT_A)],
  ["listClientHabitsForAdmin", () => listClientHabitsForAdmin(COACH_A, CLIENT_A)],
  ["deactivateClientForCoach", () => deactivateClientForCoach({ coachUid: COACH_A, clientUid: CLIENT_A })],
  ["transferClientToCoach", () => transferClientToCoach({ clientUid: CLIENT_A, newCoachUid: COACH_B })],
  ["unlinkClientFromCoach", () => unlinkClientFromCoach({ coachUid: COACH_A, clientUid: CLIENT_A })],
  ["removePendingClientForCoach", () => removePendingClientForCoach({ coachUid: COACH_A, email: "pending@x.com" })],
  ["getAppVersionConfig", () => getAppVersionConfig()],
  ["updateAppVersionConfig", () => updateAppVersionConfig({ ios: { minBuild: 1, latestVersion: "", storeUrl: "" }, android: { minBuild: 1, latestVersion: "", storeUrl: "" } })],
];

describe.each(GATED)("%s — admin gate", (_name, call) => {
  it("rejects a non-admin with Forbidden and mutates nothing", async () => {
    mockGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(call()).rejects.toThrow("Forbidden");
    expectNoMutation();
    expect(mockAuth.getUser).not.toHaveBeenCalled();
    expect(mockAuth.getUserByEmail).not.toHaveBeenCalled();
  });
});

// ── 2. Allowlist + promote ───────────────────────────────────────────────────

describe("addCoachEmailToAllowlist", () => {
  it("rejects an invalid email before writing", async () => {
    await expect(addCoachEmailToAllowlist("nope")).rejects.toThrow();
    await expect(addCoachEmailToAllowlist({ email: "x@y.com" })).rejects.toThrow();
    expectNoMutation();
  });

  it("writes the normalized email doc with the acting admin recorded", async () => {
    await expect(addCoachEmailToAllowlist("  NEW2@Coach.COM ")).resolves.toEqual({
      ok: true,
      email: "new2@coach.com",
    });
    expect(db.writes).toEqual([
      {
        op: "set",
        path: "coach_allowlist/new2@coach.com",
        data: {
          email: "new2@coach.com",
          enabled: true,
          createdAt: FV_SERVER_TIMESTAMP,
          createdBy: ADMIN.uid,
          updatedAt: FV_SERVER_TIMESTAMP,
          updatedBy: ADMIN.uid,
        },
        options: { merge: true },
      },
    ]);
  });
});

describe("removeCoachEmailFromAllowlist", () => {
  it("rejects an invalid / bare-string input before deleting", async () => {
    await expect(removeCoachEmailFromAllowlist({ email: "bad" })).rejects.toThrow();
    await expect(removeCoachEmailFromAllowlist("new@coach.com")).rejects.toThrow();
    expectNoMutation();
  });

  it("deletes exactly the normalized allowlist doc", async () => {
    await expect(removeCoachEmailFromAllowlist({ email: "NEW@coach.com" })).resolves.toEqual({ ok: true });
    expect(db.writes).toEqual([{ op: "delete", path: "coach_allowlist/new@coach.com" }]);
    expect(db.doc("coach_allowlist", "new@coach.com")).toBeUndefined();
  });
});

describe("listCoachAllowlist", () => {
  it("hides allowlist entries that already belong to an active trainer", async () => {
    const rows = await listCoachAllowlist();
    expect(rows).toEqual([{ email: "new@coach.com", enabled: true, updatedAtISO: null }]);
  });
});

describe("promoteUserToAdmin", () => {
  beforeEach(() => {
    mockAuth.getUserByEmail.mockResolvedValue({
      uid: "user-77",
      customClaims: { role: "trainer", coachId: "keep-me" },
    });
  });

  it("rejects an invalid email before any Auth call", async () => {
    await expect(promoteUserToAdmin({ email: "nope" })).rejects.toThrow();
    expect(mockAuth.getUserByEmail).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("keeps existing claims, adds admin + trainer (keepTrainer default true)", async () => {
    await expect(promoteUserToAdmin({ email: "A@coach.com" })).resolves.toEqual({ ok: true, uid: "user-77" });
    expect(mockAuth.getUserByEmail).toHaveBeenCalledWith("a@coach.com");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("user-77", {
      role: "trainer",
      coachId: "keep-me",
      roles: ["trainer", "admin"],
      admin: true,
    });
    expect(db.writes).toEqual([]);
  });

  it("with keepTrainer:false and no trainer claim → role admin", async () => {
    mockAuth.getUserByEmail.mockResolvedValue({ uid: "user-78", customClaims: undefined });
    await promoteUserToAdmin({ email: "x@y.com", keepTrainer: false });
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("user-78", {
      role: "admin",
      roles: ["admin"],
      admin: true,
    });
  });
});

// ── 3. Destructive cascades: confirmation literal + dry_run vs execute ───────

describe("deleteClientCascade", () => {
  it.each([
    ["wrong confirmation", { clientUid: CLIENT_A, confirmation: "delete client", mode: "execute" }],
    ["coach literal on client path", { clientUid: CLIENT_A, confirmation: "DELETE COACH", mode: "execute" }],
    ["missing confirmation", { clientUid: CLIENT_A, mode: "execute" }],
    ["unknown mode", { clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "force" }],
    ["short uid", { clientUid: "abc", confirmation: "DELETE CLIENT", mode: "execute" }],
  ])("rejects %s before any read/write", async (_label, input) => {
    await expect(deleteClientCascade(input)).rejects.toThrow();
    expectNoMutation();
  });

  it("dry_run writes ONLY the audit log, with the counted plan", async () => {
    const result = await deleteClientCascade({ clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "dry_run" });
    const plan = {
      workoutAssignments: 3,
      workoutLogs: 1,
      habits: 2,
      habitLogs: 0,
      progressPhotos: 0,
      clientGoals: 0,
      clientNotes: 0,
      chatDocExists: true,
      userDocExists: true,
      totalApprox: 8,
    };
    expect(result).toEqual({ ok: true, mode: "dry_run", deletedDocsApprox: 8 });
    expect(db.writes).toEqual([
      {
        op: "add",
        path: expect.stringMatching(/^admin_operations\//),
        data: {
          actorUid: ADMIN.uid,
          kind: "delete_client_cascade",
          mode: "dry_run",
          targetUid: CLIENT_A,
          status: "success",
          summary: plan,
          errorMessage: null,
          createdAt: FV_SERVER_TIMESTAMP,
        },
      },
    ]);
    expect(mockAuth.deleteUser).not.toHaveBeenCalled();
    expect(db.doc("users", CLIENT_A)).toBeDefined();
  });

  it("execute deletes only the target client's data, the chat tree, the user doc and Auth user", async () => {
    const result = await deleteClientCascade({ clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "execute" });
    expect(result).toEqual({ ok: true, mode: "execute", deletedDocsApprox: 8 });
    expect(db.doc("users", CLIENT_A)).toBeUndefined();
    expect(db.doc("chats", CLIENT_A)).toBeUndefined();
    expect(db.all("chats/client-A1/messages")).toEqual({});
    expect(Object.keys(db.all("workout_assignments"))).toEqual(["waB"]);
    expect(db.all("habits")).toEqual({});
    expect(mockAuth.deleteUser).toHaveBeenCalledWith(CLIENT_A);
    // other coach's client untouched
    expect(db.doc("users", CLIENT_B)).toBeDefined();
    expect(db.writes.some((w) => w.path.includes(CLIENT_B) || w.path.endsWith("/waB"))).toBe(false);
    const [log] = db.writesTo("admin_operations/");
    expect(log.data).toMatchObject({ kind: "delete_client_cascade", mode: "execute", status: "success", summary: { deletedDocsApprox: 8 } });
  });

  it("tolerates an already-deleted Auth user (idempotent)", async () => {
    mockAuth.deleteUser.mockRejectedValueOnce(new Error("auth/user-not-found"));
    await expect(
      deleteClientCascade({ clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "execute" }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("logs a failed operation and rethrows when the cascade blows up", async () => {
    const realRecursive = db.recursiveDelete.bind(db);
    db.recursiveDelete = async () => {
      throw new Error("boom");
    };
    await expect(
      deleteClientCascade({ clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "execute" }),
    ).rejects.toThrow("boom");
    const logs = db.writesTo("admin_operations/");
    expect(logs[logs.length - 1].data).toMatchObject({
      kind: "delete_client_cascade",
      mode: "execute",
      status: "failed",
      summary: {},
      errorMessage: "boom",
    });
    db.recursiveDelete = realRecursive;
  });

  // deleteClientCascade refuses a target whose stored role (or Auth claims) is
  // trainer/admin: run on a coach, the CLIENT cascade would delete their
  // /users doc + Auth user while orphaning their clients, templates and chats.
  // The refusal happens before the try, so not even a "failed" op log is written.
  it.each(["execute", "dry_run"])("refuses to run the CLIENT cascade on a coach account (%s), writing nothing", async (mode) => {
    await expect(
      deleteClientCascade({ clientUid: COACH_A, confirmation: "DELETE CLIENT", mode }),
    ).rejects.toThrow("Refusing to delete: target is a coach/admin account, not a client.");
    expect(db.doc("users", COACH_A)).toBeDefined();
    expectNoMutation();
  });

  it("refuses an admin-role user doc and a client doc whose Auth claims say trainer", async () => {
    await db.collection("users").doc("admin-user1").set({ role: "admin", email: "ops@x.com" });
    db.writes.length = 0; // seeding, not under test
    await expect(
      deleteClientCascade({ clientUid: "admin-user1", confirmation: "DELETE CLIENT", mode: "execute" }),
    ).rejects.toThrow("Refusing to delete");
    mockAuth.getUser.mockImplementationOnce(async (uid: string) => ({ uid, customClaims: { role: "trainer" } }));
    await expect(
      deleteClientCascade({ clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "execute" }),
    ).rejects.toThrow("Refusing to delete");
    expect(db.doc("users", CLIENT_A)).toBeDefined();
    expectNoMutation();
  });

  it("with coachUid (coach detail page) refuses a client of ANOTHER coach, writing nothing", async () => {
    await expect(
      deleteClientCascade({ coachUid: COACH_A, clientUid: CLIENT_B, confirmation: "DELETE CLIENT", mode: "execute" }),
    ).rejects.toThrow("Client does not belong to this coach.");
    await expect(
      deleteClientCascade({ coachUid: COACH_A, clientUid: "ghost-user1", confirmation: "DELETE CLIENT", mode: "execute" }),
    ).rejects.toThrow("Client not found.");
    expect(db.doc("users", CLIENT_B)).toBeDefined();
    expectNoMutation();
  });

  it("with the matching coachUid runs the cascade on that coach's client", async () => {
    await expect(
      deleteClientCascade({ coachUid: COACH_A, clientUid: CLIENT_A, confirmation: "DELETE CLIENT", mode: "execute" }),
    ).resolves.toEqual({ ok: true, mode: "execute", deletedDocsApprox: 8 });
    expect(db.doc("users", CLIENT_A)).toBeUndefined();
    expect(mockAuth.deleteUser).toHaveBeenCalledWith(CLIENT_A);
  });
});

describe("deleteCoachCascade", () => {
  it.each([
    ["client literal on coach path", { coachUid: COACH_A, confirmation: "DELETE CLIENT", mode: "execute" }],
    ["lowercase literal", { coachUid: COACH_A, confirmation: "delete coach", mode: "execute" }],
    ["missing mode", { coachUid: COACH_A, confirmation: "DELETE COACH" }],
    ["short uid", { coachUid: "c1", confirmation: "DELETE COACH", mode: "dry_run" }],
  ])("rejects %s before any read/write", async (_label, input) => {
    await expect(deleteCoachCascade(input)).rejects.toThrow();
    expectNoMutation();
  });

  it("dry_run writes only the audit log with the plan", async () => {
    const result = await deleteCoachCascade({ coachUid: COACH_A, confirmation: "DELETE COACH", mode: "dry_run" });
    expect(result).toEqual({ ok: true, mode: "dry_run", deletedClients: 1, deletedDocsApprox: 6 });
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({
      op: "add",
      data: {
        kind: "delete_coach_cascade",
        mode: "dry_run",
        targetUid: COACH_A,
        status: "success",
        summary: { clients: 1, workoutTemplates: 1, exercises: 1, userMirror: 1, chats: 1, coachUserDocExists: true, totalApprox: 6 },
      },
    });
  });

  it("execute removes the coach, their clients' data and their content — never the other coach's", async () => {
    const result = await deleteCoachCascade({ coachUid: COACH_A, confirmation: "DELETE COACH", mode: "execute" });
    expect(result).toMatchObject({ ok: true, mode: "execute", deletedClients: 1 });
    expect(db.doc("users", COACH_A)).toBeUndefined();
    expect(db.doc("users", CLIENT_A)).toBeUndefined();
    expect(db.all("workout_templates")).toEqual({});
    expect(db.all("exercises")).toEqual({});
    expect(Object.keys(db.all("user_mirror"))).toEqual(["other@x.com"]);
    expect(mockAuth.deleteUser).toHaveBeenCalledWith(CLIENT_A);
    expect(mockAuth.deleteUser).toHaveBeenCalledWith(COACH_A);
    expect(db.doc("users", COACH_B)).toBeDefined();
    expect(db.doc("users", CLIENT_B)).toBeDefined();
    expect(db.doc("workout_assignments", "waB")).toBeDefined();
    const logs = db.writesTo("admin_operations/");
    expect(logs[logs.length - 1].data).toMatchObject({ kind: "delete_coach_cascade", mode: "execute", status: "success" });
  });

  it("logs a failure and rethrows", async () => {
    db.recursiveDelete = async () => {
      throw new Error("kaput");
    };
    await expect(
      deleteCoachCascade({ coachUid: COACH_A, confirmation: "DELETE COACH", mode: "execute" }),
    ).rejects.toThrow("kaput");
    const logs = db.writesTo("admin_operations/");
    expect(logs[logs.length - 1].data).toMatchObject({ status: "failed", errorMessage: "kaput" });
  });
});

describe("previews + getDeletionTargetInfo (read-only)", () => {
  it("previewClientCascade / previewCoachCascade count without writing", async () => {
    await expect(previewClientCascade(CLIENT_A)).resolves.toMatchObject({ totalApprox: 8 });
    await expect(previewCoachCascade(COACH_A)).resolves.toMatchObject({ totalApprox: 6 });
    expect(db.writes).toEqual([]);
  });

  it("getDeletionTargetInfo reports existence + role", async () => {
    await expect(getDeletionTargetInfo(COACH_A)).resolves.toEqual({
      exists: true,
      role: "trainer",
      email: "a@coach.com",
      displayName: "Coach A",
    });
    await expect(getDeletionTargetInfo("missing-1")).resolves.toEqual({
      exists: false,
      role: null,
      email: null,
      displayName: null,
    });
  });
});

// ── 4. Coach-scoped mutations: ownership ─────────────────────────────────────

describe("deactivateClientForCoach", () => {
  it("refuses a client that belongs to ANOTHER coach — nothing written, Auth untouched", async () => {
    await expect(deactivateClientForCoach({ coachUid: COACH_A, clientUid: CLIENT_B })).rejects.toThrow(
      "Client does not belong to this coach.",
    );
    expectNoMutation();
    expect(db.doc("users", CLIENT_B)?.deleted).toBe(false);
  });

  it("refuses a coach-less client (no coachId)", async () => {
    await expect(deactivateClientForCoach({ coachUid: COACH_A, clientUid: SOLO })).rejects.toThrow(
      "Client does not belong to this coach.",
    );
    expectNoMutation();
  });

  it("refuses a missing client and invalid input", async () => {
    await expect(deactivateClientForCoach({ coachUid: COACH_A, clientUid: "missing-1" })).rejects.toThrow(
      "Client not found.",
    );
    await expect(deactivateClientForCoach({ coachUid: COACH_A, clientUid: "x" })).rejects.toThrow();
    await expect(deactivateClientForCoach({ clientUid: CLIENT_A })).rejects.toThrow();
    expectNoMutation();
  });

  it("happy path: soft-deletes, disables Auth, logs", async () => {
    await expect(deactivateClientForCoach({ coachUid: COACH_A, clientUid: CLIENT_A })).resolves.toEqual({ ok: true });
    expect(db.writes[0]).toEqual({
      op: "update",
      path: `users/${CLIENT_A}`,
      data: {
        deleted: true,
        deletedAt: FV_SERVER_TIMESTAMP,
        deactivatedBy: ADMIN.uid,
        updatedAt: FV_SERVER_TIMESTAMP,
      },
    });
    expect(mockAuth.updateUser).toHaveBeenCalledWith(CLIENT_A, { disabled: true });
    expect(db.writesTo("admin_operations/")[0].data).toMatchObject({
      targetUid: CLIENT_A,
      summary: { action: "deactivate_client", coachUid: COACH_A },
    });
  });

  it("still succeeds when disabling the Auth user fails (fail-soft)", async () => {
    mockAuth.updateUser.mockRejectedValueOnce(new Error("auth down"));
    await expect(deactivateClientForCoach({ coachUid: COACH_A, clientUid: CLIENT_A })).resolves.toEqual({ ok: true });
  });
});

describe("transferClientToCoach — guards", () => {
  it("refuses to move a coach", async () => {
    await expect(transferClientToCoach({ clientUid: COACH_A, newCoachUid: COACH_B })).rejects.toThrow(
      "That user is a coach, not a client",
    );
    expectNoMutation();
  });

  it("refuses a no-op transfer to the current coach", async () => {
    await expect(transferClientToCoach({ clientUid: CLIENT_A, newCoachUid: COACH_A })).rejects.toThrow(
      "Client is already linked to this coach.",
    );
    expectNoMutation();
  });

  it("refuses a destination that does not exist or is not a trainer", async () => {
    await expect(transferClientToCoach({ clientUid: CLIENT_A, newCoachUid: "missing-1" })).rejects.toThrow(
      "Destination coach not found.",
    );
    await expect(transferClientToCoach({ clientUid: CLIENT_A, newCoachUid: CLIENT_B })).rejects.toThrow(
      "Destination user is not a coach.",
    );
    await expect(transferClientToCoach({ clientUid: "missing-1", newCoachUid: COACH_B })).rejects.toThrow(
      "Client not found.",
    );
    await expect(transferClientToCoach({ clientUid: CLIENT_A })).rejects.toThrow();
    expectNoMutation();
  });

  it("happy path: re-points client doc + chat, resyncs the claim, logs from→to", async () => {
    await expect(transferClientToCoach({ clientUid: CLIENT_A, newCoachUid: COACH_B })).resolves.toEqual({
      ok: true,
      clientUid: CLIENT_A,
      newCoachUid: COACH_B,
    });
    expect(db.writes[0]).toEqual({
      op: "update",
      path: `users/${CLIENT_A}`,
      data: {
        coachId: COACH_B,
        // empty displayName → email local part
        coachDisplayName: "b",
        coachPhotoURL: "https://p/b.png",
        autoAssignedCoach: FV_DELETE,
        updatedAt: FV_SERVER_TIMESTAMP,
      },
    });
    expect(db.doc("chats", CLIENT_A)?.coachId).toBe(COACH_B);
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(CLIENT_A, {
      role: "client",
      coachId: COACH_B,
      extra: 1,
    });
    expect(db.writesTo("admin_operations/")[0].data).toMatchObject({
      kind: "transfer_client",
      summary: { fromCoachId: COACH_A, toCoachId: COACH_B },
    });
  });
});

describe("unlinkClientFromCoach", () => {
  it("refuses to unlink a client of ANOTHER coach — nothing written", async () => {
    await expect(unlinkClientFromCoach({ coachUid: COACH_A, clientUid: CLIENT_B })).rejects.toThrow(
      "Client is not linked to this coach.",
    );
    expectNoMutation();
    expect(db.doc("users", CLIENT_B)?.coachId).toBe(COACH_B);
  });

  it("refuses a trainer target, a coach-less target, a missing target and bad input", async () => {
    await expect(unlinkClientFromCoach({ coachUid: COACH_A, clientUid: COACH_B })).rejects.toThrow(
      "Client is not linked to this coach.",
    );
    await expect(unlinkClientFromCoach({ coachUid: COACH_A, clientUid: SOLO })).rejects.toThrow(
      "Client is not linked to this coach.",
    );
    await expect(unlinkClientFromCoach({ coachUid: COACH_A, clientUid: "missing-1" })).rejects.toThrow(
      "Client not found.",
    );
    await expect(unlinkClientFromCoach({ coachUid: "", clientUid: CLIENT_A })).rejects.toThrow();
    expectNoMutation();
  });

  it("happy path: clears the link on user + chat, drops the coachId claim, logs", async () => {
    await expect(unlinkClientFromCoach({ coachUid: COACH_A, clientUid: CLIENT_A })).resolves.toEqual({
      ok: true,
      clientUid: CLIENT_A,
    });
    expect(db.writes.slice(0, 2)).toEqual([
      {
        op: "update",
        path: `users/${CLIENT_A}`,
        data: {
          coachId: FV_DELETE,
          coachDisplayName: FV_DELETE,
          coachPhotoURL: FV_DELETE,
          autoAssignedCoach: FV_DELETE,
          updatedAt: FV_SERVER_TIMESTAMP,
        },
      },
      { op: "update", path: `chats/${CLIENT_A}`, data: { coachId: FV_DELETE, updatedAt: FV_SERVER_TIMESTAMP } },
    ]);
    // chat history kept
    expect(db.all("chats/client-A1/messages")).toEqual({ m1: { text: "hi" } });
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(CLIENT_A, { role: "client", extra: 1 });
    expect(db.writesTo("admin_operations/")[0].data).toMatchObject({
      kind: "unlink_client",
      summary: { action: "unlink_client", fromCoachId: COACH_A },
    });
  });
});

describe("removePendingClientForCoach", () => {
  it("refuses a pending invite owned by ANOTHER coach", async () => {
    await expect(
      removePendingClientForCoach({ coachUid: COACH_A, email: "other@x.com" }),
    ).rejects.toThrow("Pending client does not belong to this coach.");
    expectNoMutation();
    expect(db.doc("user_mirror", "other@x.com")).toBeDefined();
  });

  it("is a no-op success when the mirror doc is missing", async () => {
    await expect(
      removePendingClientForCoach({ coachUid: COACH_A, email: "ghost@x.com" }),
    ).resolves.toEqual({ ok: true });
    expectNoMutation();
  });

  it("rejects invalid email / uid", async () => {
    await expect(removePendingClientForCoach({ coachUid: COACH_A, email: "bad" })).rejects.toThrow();
    await expect(removePendingClientForCoach({ coachUid: "c", email: "pending@x.com" })).rejects.toThrow();
    expectNoMutation();
  });

  it("happy path: deletes the (normalized) mirror doc and logs against the coach", async () => {
    await expect(
      removePendingClientForCoach({ coachUid: COACH_A, email: " PENDING@x.com " }),
    ).resolves.toEqual({ ok: true });
    expect(db.writes[0]).toEqual({ op: "delete", path: "user_mirror/pending@x.com" });
    expect(db.writesTo("admin_operations/")[0].data).toMatchObject({
      targetUid: COACH_A,
      summary: { action: "remove_pending_client", email: "pending@x.com" },
    });
  });
});

// ── 5. Drill-down readers: assertClientBelongsToCoach ────────────────────────

describe.each([
  ["listClientAssignmentsForAdmin", listClientAssignmentsForAdmin],
  ["listClientHabitsForAdmin", listClientHabitsForAdmin],
  ["listClientNutritionForAdmin", listClientNutritionForAdmin],
] as const)("%s — assertClientBelongsToCoach", (_name, reader) => {
  it("hides a client of ANOTHER coach behind 'Not found'", async () => {
    await expect(reader(COACH_A, CLIENT_B)).rejects.toThrow("Not found");
  });

  it("hides a missing client", async () => {
    await expect(reader(COACH_A, "missing-1")).rejects.toThrow("Not found");
  });

  it("does not let a coach-less user be read under an unrelated coach path", async () => {
    await expect(reader(COACH_A, SOLO)).rejects.toThrow("Not found");
  });

  it("admits the coach-less self-as-coach path (uid, uid)", async () => {
    await expect(reader(SOLO, SOLO)).resolves.toBeDefined();
  });

  it("refuses self-as-coach for a COACHED client (uid, uid)", async () => {
    await expect(reader(CLIENT_A, CLIENT_A)).rejects.toThrow("Not found");
  });
});

describe("drill-down reader shapes", () => {
  it("collapses a recurring series into one row and keeps one-offs", async () => {
    const rows = await listClientAssignmentsForAdmin(COACH_A, CLIENT_A);
    expect(rows).toEqual([
      {
        id: "s1",
        title: "Piernas",
        firstDate: "2026-03-01",
        lastDate: "2026-03-02",
        scheduledTime: null,
        status: "scheduled",
        recurrenceLabel: "diaria",
        occurrences: 2,
        completedCount: 1,
      },
      {
        id: "wa3",
        title: "Push",
        firstDate: "2026-02-01",
        lastDate: "2026-02-01",
        scheduledTime: "08:00",
        status: "scheduled",
        recurrenceLabel: null,
        occurrences: 1,
        completedCount: 0,
      },
    ]);
  });

  it("lists habits active-first", async () => {
    const rows = await listClientHabitsForAdmin(COACH_A, CLIENT_A);
    expect(rows).toEqual([
      { id: "h1", name: "Agua", cadence: "daily", scheduleType: "fixed", reminderEnabled: true, deleted: false },
      { id: "h2", name: "Sleep", cadence: null, scheduleType: null, reminderEnabled: false, deleted: true },
    ]);
  });
});

// ── 6. Read-only admin dashboards (coverage of the shaping) ──────────────────

describe("admin dashboard readers", () => {
  it("listCoachesForAdmin counts clients/templates/exercises and roles from claims", async () => {
    mockAuth.getUser.mockImplementation(async (uid: string) =>
      uid === COACH_A ? { uid, customClaims: { role: "Trainer", roles: ["admin", " "], admin: true } } : Promise.reject(new Error("x")),
    );
    const rows = await listCoachesForAdmin();
    expect(rows).toEqual([
      { uid: COACH_A, email: "a@coach.com", displayName: "Coach A", roles: ["trainer", "admin"], clientsCount: 1, customWorkoutsCount: 1, customExercisesCount: 1 },
      { uid: COACH_B, email: "b@coach.com", displayName: "", roles: [], clientsCount: 1, customWorkoutsCount: 0, customExercisesCount: 0 },
    ]);
  });

  it("listCoachOptionsForAdmin drops deleted coaches and sorts by label", async () => {
    await db.collection("users").doc("coach-Z1").set({ role: "trainer", deleted: true, email: "z@c.com" });
    db.writes.length = 0;
    await expect(listCoachOptionsForAdmin()).resolves.toEqual([
      { uid: COACH_B, email: "b@coach.com", displayName: "" },
      { uid: COACH_A, email: "a@coach.com", displayName: "Coach A" },
    ]);
  });

  it("getCoachAdminDetail returns null for a missing coach and the roster for a real one", async () => {
    await expect(getCoachAdminDetail("missing-1")).resolves.toBeNull();
    const detail = await getCoachAdminDetail(COACH_A);
    expect(detail).toMatchObject({
      coach: { uid: COACH_A },
      workoutAssignmentsCount: 3,
      habitsCount: 2,
      chatsCount: 1,
      linkedClients: [{ uid: CLIENT_A, email: "ca@x.com", displayName: "", deleted: false }],
      pendingClients: [{ email: "pending@x.com", displayName: "" }],
      recentOperations: [],
    });
  });

  it("getCoachAdminDetail returns null for a non-trainer uid", async () => {
    await expect(getCoachAdminDetail(CLIENT_A)).resolves.toBeNull();
  });

  it("listRecentCoachActivity merges habit/template/assignment/mirror/first-login rows", async () => {
    const rows = await listRecentCoachActivity();
    const kinds = rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(
      expect.arrayContaining([
        "client_first_login",
        "client_pre_provisioned",
        "habit_assigned",
        "workout_assigned",
        "workout_template_created",
      ]),
    );
    const series = rows.find((r) => r.recurrenceSeriesId === "s1");
    expect(series?.occurrences).toBe(2);
    expect(series?.summary).toBe("Assigned workout: Piernas (recurring: daily)");
    expect(db.writes).toEqual([]);
  });

  it("searchUsersByEmailForAdmin returns [] for an empty query without reading", async () => {
    await expect(searchUsersByEmailForAdmin("   ")).resolves.toEqual([]);
  });
});

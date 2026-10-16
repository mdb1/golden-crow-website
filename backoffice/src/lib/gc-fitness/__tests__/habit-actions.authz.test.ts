// __tests__/habit-actions.authz.test.ts
//
// Authorization matrix for habit-actions.ts, against an in-memory Firestore so
// every test can assert the exact WRITTEN document — or that nothing was
// written. Complements habit-actions.test.ts (payload / schedule shapes).
//
// The ownership predicate `currentTrainerCanManageHabit` admits a habit when:
//   (a) habit.clientId is a client whose users/{id}.coachId === caller, OR
//   (b) it has no clientId and habit.pendingEmail is a mirror whose
//       coachId === caller, OR
//   (c) it has neither, and habit.trainerId === caller.
// Authorship alone does NOT admit a habit on a client who moved to another
// coach (the previous coach loses access after a transfer).
// Each mutating habit action is driven through all three admit paths and the
// deny paths (foreign client, foreign mirror, no client/mirror at all).

import {
  FakeFirestore,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockStorage = {
  getSignedUrl: jest.fn(async () => ["https://signed.example/upload"]),
  copy: jest.fn(async () => undefined),
  delete: jest.fn(async () => undefined),
  files: [] as string[],
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessStorage: () => ({
    bucket: (name: string) => ({
      file: (path: string) => {
        mockStorage.files.push(`${name}/${path}`);
        return {
          getSignedUrl: mockStorage.getSignedUrl,
          copy: mockStorage.copy,
          delete: mockStorage.delete,
        };
      },
    }),
  }),
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import {
  assignHabitTemplate,
  assignHabitTemplateToPending,
  createHabit,
  createHabitTemplate,
  createPendingHabit,
  deleteHabitRecurrenceFromDate,
  getHabit,
  hideGlobalHabitTemplate,
  listHabitTemplateAssignments,
  listHabitTemplates,
  listHabitsForClient,
  listHabitsForTrainer,
  listHiddenGlobalTemplateIds,
  listPendingHabits,
  mintHabitPhotoUploadUrl,
  propagateHabitTemplateContent,
  skipHabitOccurrence,
  softDeleteHabit,
  softDeleteHabitTemplate,
  unhideGlobalHabitTemplate,
  updateHabit,
  updateHabitTemplate,
} from "../habit-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

let db: FakeFirestore;

const NAME = { en: "Drink water", es: "Tomar agua" };
const VALID_HABIT = {
  clientId: "c1",
  type: "binary",
  name: NAME,
  reminderEnabled: false,
  scheduleType: "recurring",
  startsOn: "2026-06-15",
};
const VALID_UPDATE = { name: { en: "New", es: "Nuevo" }, reminderEnabled: false, scheduleType: "recurring" };

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

/** Paths written, excluding the best-effort coach_activity log. */
function dataWrites() {
  return db.writes.filter((w) => !w.path.startsWith("coach_activity/"));
}

function seedWorld() {
  db.seed("users/c1", { coachId: "coach-a" });
  db.seed("users/x1", { coachId: "coach-b" });
  db.seed("user_mirror/new@example.com", { coachId: "coach-a", pre_created: true });
  db.seed("user_mirror/theirs@example.com", { coachId: "coach-b", pre_created: true });
  db.seed("user_mirror/notpre@example.com", { coachId: "coach-a", pre_created: false });

  const habit = { type: "binary", name: NAME, reminderEnabled: true, deleted: false, startsOn: "2026-06-01" };
  db.seed("habits/h-own", { ...habit, trainerId: "coach-a", clientId: "c1" });
  db.seed("habits/h-self", { ...habit, trainerId: "c1", clientId: "c1", clientOwned: true });
  db.seed("habits/h-pending", { ...habit, trainerId: "coach-z", clientId: null, pendingEmail: "New@Example.com" });
  db.seed("habits/h-foreign", { ...habit, trainerId: "coach-b", clientId: "x1" });
  db.seed("habits/h-foreign-pending", { ...habit, trainerId: "coach-b", clientId: null, pendingEmail: "theirs@example.com" });
  db.seed("habits/h-orphan", { ...habit, trainerId: "coach-b" });
  // Authored by coach-a, but the client has since moved to coach-b.
  db.seed("habits/h-stale", { ...habit, trainerId: "coach-a", clientId: "x1" });

  const tpl = { type: "binary", name: NAME, reminderEnabled: false, scheduleType: "recurring", deleted: false };
  db.seed("habit_templates/tpl-own", { ...tpl, scope: "trainer", trainerId: "coach-a", description: { en: "d", es: "d" }, photoUrl: "https://x/p.png" });
  db.seed("habit_templates/tpl-foreign", { ...tpl, scope: "trainer", trainerId: "coach-b" });
  db.seed("habit_templates/tpl-global", { ...tpl, scope: "global", trainerId: null });
  db.seed("habit_templates/tpl-deleted", { ...tpl, scope: "trainer", trainerId: "coach-a", deleted: true });
}

beforeEach(() => {
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);
  mockStorage.files = [];
  mockStorage.getSignedUrl.mockClear();
  mockStorage.copy.mockClear();
  mockStorage.delete.mockClear();
  seedWorld();
});

describe("auth gate", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["createHabit", () => createHabit(VALID_HABIT)],
    ["createPendingHabit", () => createPendingHabit("new@example.com", VALID_HABIT)],
    ["listPendingHabits", () => listPendingHabits("new@example.com")],
    ["updateHabit", () => updateHabit("h-own", VALID_UPDATE)],
    ["softDeleteHabit", () => softDeleteHabit("h-own")],
    ["deleteHabitRecurrenceFromDate", () => deleteHabitRecurrenceFromDate("h-own", "2026-06-20")],
    ["getHabit", () => getHabit("h-own")],
    ["mintHabitPhotoUploadUrl", () => mintHabitPhotoUploadUrl({ habitId: "h-own", contentLength: 10, contentType: "image/png" })],
    ["skipHabitOccurrence", () => skipHabitOccurrence({ habitId: "h-own", civilDate: "2026-06-20" })],
    ["listHabitsForTrainer", () => listHabitsForTrainer()],
    ["listHabitTemplates", () => listHabitTemplates()],
    ["listHiddenGlobalTemplateIds", () => listHiddenGlobalTemplateIds()],
    ["hideGlobalHabitTemplate", () => hideGlobalHabitTemplate("tpl-global")],
    ["unhideGlobalHabitTemplate", () => unhideGlobalHabitTemplate("tpl-global")],
    ["listHabitTemplateAssignments", () => listHabitTemplateAssignments("tpl-own")],
    ["createHabitTemplate", () => createHabitTemplate({ type: "binary", name: NAME, reminderEnabled: false })],
    ["softDeleteHabitTemplate", () => softDeleteHabitTemplate("tpl-own")],
    ["updateHabitTemplate", () => updateHabitTemplate("tpl-own", { name: NAME, reminderEnabled: false })],
    ["propagateHabitTemplateContent", () => propagateHabitTemplateContent("tpl-own")],
    ["assignHabitTemplate", () => assignHabitTemplate({ templateId: "tpl-own", clientIds: ["c1"] })],
    ["assignHabitTemplateToPending", () => assignHabitTemplateToPending({ templateId: "tpl-own", pendingEmail: "new@example.com" })],
    ["listHabitsForClient", () => listHabitsForClient("c1")],
  ];

  it.each(calls)("%s: signed-out → Forbidden, nothing read or written", async (_n, run) => {
    mockedGetTokens.mockResolvedValue(null as never);
    await expect(run()).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
  });

  it.each(calls)("%s: admin-only / client token → Forbidden", async (_n, run) => {
    signInAs("admin-1", ["admin"]);
    await expect(run()).rejects.toThrow("Forbidden");
    signInAs("c1", ["client"]);
    await expect(run()).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });
});

describe("createHabit", () => {
  it("writes trainerId from the session (input trainerId ignored) plus a reusable template", async () => {
    const { id } = await createHabit({ ...VALID_HABIT, trainerId: "coach-b", deleted: true });
    expect(id).toMatch(/^hab-coach-a-/);
    const habit = db.doc(`habits/${id}`);
    expect(habit).toMatchObject({
      clientId: "c1",
      trainerId: "coach-a",
      deleted: false,
      weekdayFormat: "iso",
      startsOn: "2026-06-15",
    });
    const tplId = habit?.sourceTemplateId as string;
    expect(tplId).toMatch(/^habit-template-coach-a-/);
    const tpl = db.doc(`habit_templates/${tplId}`);
    expect(tpl).toMatchObject({ scope: "trainer", trainerId: "coach-a" });
    expect(tpl).not.toHaveProperty("clientId");
    expect(db.doc(`coach_activity/hab:${id}`)).toMatchObject({ trainerId: "coach-a", clientId: "c1" });
  });

  it("rejects invalid input before any write", async () => {
    await expect(createHabit({ ...VALID_HABIT, name: "plain string" })).rejects.toThrow();
    await expect(createHabit({ ...VALID_HABIT, reminderEnabled: true })).rejects.toThrow();
    await expect(createHabit({ ...VALID_HABIT, clientId: "" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  // createHabit runs assertTrainerOwnsClient (like assignHabitTemplate) — the
  // Admin SDK bypasses rules, so this is the only barrier against planting a
  // habit (with reminders) on another coach's client.
  it("rejects a habit for a client outside the caller's roster, writing nothing", async () => {
    await expect(createHabit({ ...VALID_HABIT, clientId: "x1" })).rejects.toThrow("Client is not in your roster.");
    await expect(createHabit({ ...VALID_HABIT, clientId: "ghost" })).rejects.toThrow("Client is not in your roster.");
    expect(db.writes).toEqual([]);
  });

  it("re-homes a draft photo to the final habit id", async () => {
    const { id } = await createHabit({
      ...VALID_HABIT,
      photoUrl: "gs://bucket/habits/habit-draft-coach-a-123/photo.PNG",
    });
    expect(mockStorage.copy).toHaveBeenCalledTimes(1);
    expect(db.doc(`habits/${id}`)?.photoUrl).toBe(`gs://bucket/habits/${id}/photo.png`);
    const tplId = db.doc(`habits/${id}`)?.sourceTemplateId as string;
    expect(db.doc(`habit_templates/${tplId}`)?.photoUrl).toBe(`gs://bucket/habits/${id}/photo.png`);
  });

  it("does NOT re-home another coach's draft photo path", async () => {
    await createHabit({
      ...VALID_HABIT,
      photoUrl: "gs://bucket/habits/habit-draft-coach-b-123/photo.png",
    });
    expect(mockStorage.copy).not.toHaveBeenCalled();
  });
});

describe("createPendingHabit", () => {
  it("rejects a foreign / missing / not-pre_created mirror and writes nothing", async () => {
    await expect(createPendingHabit("theirs@example.com", VALID_HABIT)).rejects.toThrow("Not your pending client.");
    await expect(createPendingHabit("ghost@example.com", VALID_HABIT)).rejects.toThrow("Pending client not found.");
    await expect(createPendingHabit("notpre@example.com", VALID_HABIT)).rejects.toThrow("Mirror not marked pre_created.");
    expect(db.writes).toEqual([]);
  });

  it("writes clientId:null + the NORMALIZED pendingEmail; the input clientId is discarded", async () => {
    const { id } = await createPendingHabit("  NEW@example.com ", { ...VALID_HABIT, clientId: "x1" });
    expect(id).toMatch(/^hab-pending-new@example\.com-/);
    expect(db.doc(`habits/${id}`)).toMatchObject({
      clientId: null,
      pendingEmail: "new@example.com",
      trainerId: "coach-a",
      deleted: false,
    });
  });

  it("rejects a plain-string name (the preload form's free-text path sends one)", async () => {
    await expect(
      createPendingHabit("new@example.com", { ...VALID_HABIT, name: "Drink water" }),
    ).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});

describe("listPendingHabits", () => {
  it("lists only the caller's live habits for that pending email", async () => {
    db.seed("habits/p1", { trainerId: "coach-a", pendingEmail: "new@example.com", name: NAME, scheduleCadence: "monthly", scheduleDayOfMonth: 5 });
    db.seed("habits/p2", { trainerId: "coach-a", pendingEmail: "new@example.com", name: "Legacy", deleted: true });
    db.seed("habits/p3", { trainerId: "coach-b", pendingEmail: "new@example.com", name: NAME });
    await expect(listPendingHabits("NEW@example.com")).resolves.toEqual([
      {
        id: "p1",
        name: "Tomar agua",
        type: "binary",
        scheduleType: "recurring",
        scheduleCadence: "monthly",
        scheduleWeekdays: [],
        scheduleMonthDays: [5],
      },
    ]);
  });
});

describe("currentTrainerCanManageHabit — mutating habit actions", () => {
  const mutate: Array<[string, (id: string) => Promise<unknown>]> = [
    ["updateHabit", (id) => updateHabit(id, VALID_UPDATE)],
    ["softDeleteHabit", (id) => softDeleteHabit(id)],
    ["deleteHabitRecurrenceFromDate", (id) => deleteHabitRecurrenceFromDate(id, "2026-06-20")],
    ["skipHabitOccurrence", (id) => skipHabitOccurrence({ habitId: id, civilDate: "2026-06-20" })],
  ];

  describe.each(mutate)("%s", (_name, run) => {
    it.each(["h-own", "h-self", "h-pending"])("admits %s (own / client-of-mine / my pending mirror)", async (id) => {
      await run(id);
      expect(dataWrites().map((w) => w.path)).toEqual([`habits/${id}`]);
    });

    it.each(["h-foreign", "h-foreign-pending", "h-orphan"])(
      "rejects %s with 'Not your habit.' and writes nothing",
      async (id) => {
        const before = db.doc(`habits/${id}`);
        await expect(run(id)).rejects.toThrow("Not your habit.");
        expect(db.writes).toEqual([]);
        expect(db.doc(`habits/${id}`)).toEqual(before);
      },
    );

    it("throws Not found for a missing habit", async () => {
      await expect(run("missing")).rejects.toThrow("Not found");
      expect(db.writes).toEqual([]);
    });
  });

  // Transferred client: authorship (habit.trainerId === caller) no longer
  // admits the habit — the habit's CLIENT must currently be the caller's. The
  // previous coach can't edit / delete / skip (or read, see getHabit) habits
  // living on the new coach's client; the new coach can.
  describe.each(mutate)("%s on a habit whose client moved to another coach", (_name, run) => {
    it("rejects the PREVIOUS coach (the habit's author) and writes nothing", async () => {
      const before = db.doc("habits/h-stale");
      await expect(run("h-stale")).rejects.toThrow("Not your habit.");
      expect(db.writes).toEqual([]);
      expect(db.doc("habits/h-stale")).toEqual(before);
    });

    it("admits the NEW coach", async () => {
      signInAs("coach-b", ["trainer"]);
      await run("h-stale");
      expect(dataWrites().map((w) => w.path)).toEqual(["habits/h-stale"]);
    });
  });

  it("an author's pending habit whose mirror now belongs to another coach is no longer theirs", async () => {
    db.seed("habits/h-pending-moved", { type: "binary", name: NAME, reminderEnabled: false, deleted: false, trainerId: "coach-a", clientId: null, pendingEmail: "theirs@example.com" });
    await expect(updateHabit("h-pending-moved", VALID_UPDATE)).rejects.toThrow("Not your habit.");
    expect(db.writes).toEqual([]);
  });

  it("a habit with neither client nor pending mirror stays manageable by its author only", async () => {
    db.seed("habits/h-loose", { type: "binary", name: NAME, reminderEnabled: false, deleted: false, trainerId: "coach-a" });
    await softDeleteHabit("h-loose");
    expect(dataWrites().map((w) => w.path)).toEqual(["habits/h-loose"]);
  });

  it("updateHabit writes only whitelisted fields (no clientId / trainerId / type)", async () => {
    await updateHabit("h-self", { ...VALID_UPDATE, clientId: "x1", trainerId: "coach-a", type: "numeric" });
    const patch = dataWrites()[0].data ?? {};
    expect(patch).not.toHaveProperty("clientId");
    expect(patch).not.toHaveProperty("trainerId");
    expect(patch).not.toHaveProperty("type");
    expect(db.doc("habits/h-self")).toMatchObject({ trainerId: "c1", clientId: "c1", name: { en: "New", es: "Nuevo" } });
  });

  it("updateHabit rejects an invalid body after the ownership read, before any write", async () => {
    await expect(updateHabit("h-own", { ...VALID_UPDATE, name: { en: "" } })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("softDeleteHabit flips deleted + turns the reminder off and marks the activity event", async () => {
    await softDeleteHabit("h-own");
    expect(db.writes[0]).toEqual({
      op: "update",
      path: "habits/h-own",
      via: "direct",
      data: { deleted: true, reminderEnabled: false, updatedAt: { __fv: "serverTimestamp" } },
    });
    expect(db.writes[1]).toMatchObject({ path: "coach_activity/hab:h-own", merge: true });
  });

  it("deleteHabitRecurrenceFromDate caps endsOn the day before, or soft-deletes before start", async () => {
    await deleteHabitRecurrenceFromDate("h-own", "2026-06-20");
    expect(db.writes[0].data).toEqual({ endsOn: "2026-06-19", reminderEnabled: false, updatedAt: { __fv: "serverTimestamp" } });
    await deleteHabitRecurrenceFromDate("h-self", "2026-06-01");
    expect(db.writes[1].data).toEqual({ deleted: true, reminderEnabled: false, updatedAt: { __fv: "serverTimestamp" } });
  });

  it("skipHabitOccurrence validates the civil date before any read and arrayUnions it", async () => {
    await expect(skipHabitOccurrence({ habitId: "h-own", civilDate: "20/06/2026" })).rejects.toThrow("Invalid civil date.");
    expect(db.reads).toEqual([]);
    await skipHabitOccurrence({ habitId: "h-own", civilDate: "2026-06-20" });
    expect(db.writes[0].data).toEqual({
      skippedDates: { __fv: "arrayUnion", values: ["2026-06-20"] },
      updatedAt: { __fv: "serverTimestamp" },
    });
  });
});

describe("getHabit", () => {
  it("returns own / client-of-mine / pending-of-mine habits and rejects foreign ones", async () => {
    await expect(getHabit("h-own")).resolves.toMatchObject({ id: "h-own", clientId: "c1" });
    await expect(getHabit("h-self")).resolves.toMatchObject({ id: "h-self" });
    await expect(getHabit("h-pending")).resolves.toMatchObject({ id: "h-pending" });
    await expect(getHabit("h-foreign")).rejects.toThrow("Not your habit.");
    await expect(getHabit("h-foreign-pending")).rejects.toThrow("Not your habit.");
    await expect(getHabit("missing")).rejects.toThrow("Not found");
    // previous coach of a transferred client can no longer read it
    await expect(getHabit("h-stale")).rejects.toThrow("Not your habit.");
  });
});

describe("mintHabitPhotoUploadUrl", () => {
  const ok = { contentLength: 1000, contentType: "image/png" };

  it("rejects a habit/template owned by another coach without minting", async () => {
    await expect(mintHabitPhotoUploadUrl({ habitId: "h-foreign", ...ok })).rejects.toThrow(/Cannot upload to that path/);
    await expect(mintHabitPhotoUploadUrl({ habitId: "tpl-foreign", ...ok })).rejects.toThrow(/Cannot upload/);
    await expect(mintHabitPhotoUploadUrl({ habitId: "../../etc", ...ok })).rejects.toThrow(/Cannot upload/);
    // a client-of-mine habit authored by the client is NOT uploadable (owner = trainerId only)
    await expect(mintHabitPhotoUploadUrl({ habitId: "h-self", ...ok })).rejects.toThrow(/Cannot upload/);
    await expect(mintHabitPhotoUploadUrl({ habitId: "", ...ok })).rejects.toThrow("BadRequest: habitId is required.");
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it("enforces the size and content-type guards", async () => {
    await expect(mintHabitPhotoUploadUrl({ habitId: "h-own", contentLength: 0, contentType: "image/png" })).rejects.toThrow("BadRequest: contentLength");
    await expect(mintHabitPhotoUploadUrl({ habitId: "h-own", contentLength: 10 * 1024 * 1024 + 1, contentType: "image/png" })).rejects.toThrow("File too large");
    await expect(mintHabitPhotoUploadUrl({ habitId: "h-own", contentLength: 10, contentType: "image/gif" })).rejects.toThrow("BadRequest: contentType");
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it("mints for an owned habit, an owned template, and an own draft-template id", async () => {
    await expect(mintHabitPhotoUploadUrl({ habitId: "h-own", ...ok })).resolves.toEqual({
      url: "https://signed.example/upload",
      gsPath: "gs://gcfitness-3476b.firebasestorage.app/habits/h-own/photo.png",
    });
    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v4", action: "write", contentType: "image/png" }),
    );
    await mintHabitPhotoUploadUrl({ habitId: "tpl-own", ...ok });
    await mintHabitPhotoUploadUrl({ habitId: "habit-template-coach-a-new", contentLength: 5, contentType: "image/jpeg" });
    expect(mockStorage.files.at(-1)).toBe("gcfitness-3476b.firebasestorage.app/habits/habit-template-coach-a-new/photo.jpg");
  });
});

describe("habit lists", () => {
  it("listHabitsForTrainer queries by the session uid only", async () => {
    for (const id of ["h-own", "h-foreign", "h-stale"]) {
      db.seed(`habits/${id}`, { ...db.doc(`habits/${id}`), updatedAt: new Date("2026-06-10T00:00:00Z") });
    }
    const rows = await listHabitsForTrainer();
    expect(db.queries[0].filters).toEqual([
      { field: "trainerId", op: "==", value: "coach-a" },
      { field: "deleted", op: "==", value: false },
    ]);
    expect(db.queries[0].limit).toBe(200);
    expect(rows.map((r) => r.id).sort()).toEqual(["h-own", "h-stale"]);
  });

  it("listHabitsForClient: foreign client → only own-authored rows; my client → all live rows", async () => {
    const foreign = await listHabitsForClient("x1");
    expect(foreign.map((r) => r.id)).toEqual(["h-stale"]);
    const mine = await listHabitsForClient("c1");
    expect(mine.map((r) => r.id).sort()).toEqual(["h-own", "h-self"]);
  });
});

describe("habit templates", () => {
  it("listHabitTemplates seeds missing globals, returns globals + own, never another coach's or hidden", async () => {
    db.seed("habit_template_hidden/coach-a", { hiddenIds: ["global-no-snacks"] });
    const rows = await listHabitTemplates();
    // Globals are seeded on first read (a write from a list action).
    expect(db.writes.filter((w) => w.via === "batch")).toHaveLength(5);
    expect(db.writes.every((w) => w.path.startsWith("habit_templates/global-"))).toBe(true);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("global-healthy-dinner");
    expect(ids).not.toContain("global-no-snacks");
    expect(ids).not.toContain("tpl-foreign");
    expect(ids).not.toContain("tpl-deleted");
  });

  it("hide/unhide write ONLY the caller's hidden-set doc; hide refuses non-global templates", async () => {
    await expect(hideGlobalHabitTemplate("tpl-own")).rejects.toThrow("Only global templates can be hidden.");
    await expect(hideGlobalHabitTemplate("missing")).rejects.toThrow("Template not found.");
    await expect(hideGlobalHabitTemplate("  ")).rejects.toThrow("BadRequest");
    await expect(unhideGlobalHabitTemplate("")).rejects.toThrow("BadRequest");
    expect(db.writes).toEqual([]);

    await hideGlobalHabitTemplate("tpl-global");
    await unhideGlobalHabitTemplate("tpl-global");
    expect(db.writes).toEqual([
      { op: "set", path: "habit_template_hidden/coach-a", merge: true, via: "direct", data: { hiddenIds: { __fv: "arrayUnion", values: ["tpl-global"] }, updatedAt: { __fv: "serverTimestamp" } } },
      { op: "set", path: "habit_template_hidden/coach-a", merge: true, via: "direct", data: { hiddenIds: { __fv: "arrayRemove", values: ["tpl-global"] }, updatedAt: { __fv: "serverTimestamp" } } },
    ]);
    // the shared global doc itself is never mutated
    expect(db.doc("habit_templates/tpl-global")?.deleted).toBe(false);
  });

  it("listHiddenGlobalTemplateIds reads the caller's own doc only", async () => {
    db.seed("habit_template_hidden/coach-b", { hiddenIds: ["b-hidden"] });
    db.seed("habit_template_hidden/coach-a", { hiddenIds: ["a-hidden", 3] });
    await expect(listHiddenGlobalTemplateIds()).resolves.toEqual(["a-hidden"]);
  });

  it("createHabitTemplate forces scope/trainerId from the session; a foreign-prefixed id is replaced", async () => {
    const { id } = await createHabitTemplate({
      id: "habit-template-coach-b-steal",
      type: "binary",
      name: NAME,
      reminderEnabled: false,
      scope: "global",
      trainerId: "coach-b",
    });
    expect(id).toMatch(/^habit-template-coach-a-/);
    expect(db.doc(`habit_templates/${id}`)).toMatchObject({ scope: "trainer", trainerId: "coach-a", deleted: false });
    expect(db.doc("habit_templates/habit-template-coach-b-steal")).toBeUndefined();

    const own = await createHabitTemplate({ id: "habit-template-coach-a-draft", type: "binary", name: NAME, reminderEnabled: false });
    expect(own.id).toBe("habit-template-coach-a-draft");
    await expect(createHabitTemplate({ type: "binary", name: "x", reminderEnabled: false })).rejects.toThrow();
  });

  it.each([
    ["softDeleteHabitTemplate", (id: string) => softDeleteHabitTemplate(id)],
    ["updateHabitTemplate", (id: string) => updateHabitTemplate(id, { name: NAME, reminderEnabled: false })],
    ["propagateHabitTemplateContent", (id: string) => propagateHabitTemplateContent(id)],
  ] as Array<[string, (id: string) => Promise<unknown>]>)(
    "%s rejects foreign / global / missing templates and writes nothing",
    async (_n, run) => {
      await expect(run("tpl-foreign")).rejects.toThrow("Not your template.");
      await expect(run("tpl-global")).rejects.toThrow(/Global templates can't be/);
      await expect(run("missing")).rejects.toThrow("Not found");
      expect(db.writes).toEqual([]);
      expect(db.doc("habit_templates/tpl-foreign")?.deleted).toBe(false);
    },
  );

  it("softDelete / update write the expected patch on an own template", async () => {
    await updateHabitTemplate("tpl-own", { name: { en: "N", es: "N" }, reminderEnabled: true, reminderTime: "08:00" });
    expect(db.writes[0].data).toEqual({
      name: { en: "N", es: "N" },
      reminderEnabled: true,
      reminderTime: "08:00",
      updatedAt: { __fv: "serverTimestamp" },
    });
    await softDeleteHabitTemplate("tpl-own");
    expect(db.writes[1].data).toEqual({ deleted: true, updatedAt: { __fv: "serverTimestamp" } });
  });

  it("propagateHabitTemplateContent pushes content only to the caller's live linked habits", async () => {
    db.seed("habits/link-own", { trainerId: "coach-a", clientId: "c1", sourceTemplateId: "tpl-own" });
    db.seed("habits/link-own-deleted", { trainerId: "coach-a", clientId: "c1", sourceTemplateId: "tpl-own", deleted: true });
    db.seed("habits/link-foreign", { trainerId: "coach-b", clientId: "x1", sourceTemplateId: "tpl-own" });
    await expect(propagateHabitTemplateContent("tpl-own")).resolves.toEqual({ updated: 1 });
    expect(db.writes).toEqual([
      {
        op: "update",
        path: "habits/link-own",
        via: "batch",
        data: { description: { en: "d", es: "d" }, photoUrl: "https://x/p.png", updatedAt: { __fv: "serverTimestamp" } },
      },
    ]);
    await expect(propagateHabitTemplateContent(" ")).resolves.toEqual({ updated: 0 });
  });

  it("listHabitTemplateAssignments lists only the caller's live linked habits", async () => {
    db.seed("habits/link-own", { trainerId: "coach-a", clientId: "c1", sourceTemplateId: "tpl-own", scheduleType: "recurring" });
    db.seed("habits/link-pending", { trainerId: "coach-a", clientId: null, pendingEmail: "new@example.com", sourceTemplateId: "tpl-own" });
    db.seed("habits/link-foreign", { trainerId: "coach-b", clientId: "x1", sourceTemplateId: "tpl-own" });
    const rows = await listHabitTemplateAssignments("tpl-own");
    expect(rows.map((r) => [r.habitId, r.clientId, r.pendingEmail])).toEqual([
      ["link-own", "c1", null],
      ["link-pending", null, "new@example.com"],
    ]);
    await expect(listHabitTemplateAssignments("")).resolves.toEqual([]);
  });
});

describe("assignHabitTemplate", () => {
  it("rejects when ANY clientId is outside the roster — before the batch, nothing written", async () => {
    await expect(
      assignHabitTemplate({ templateId: "tpl-own", clientIds: ["c1", "x1"] }),
    ).rejects.toThrow("Client is not in your roster.");
    await expect(
      assignHabitTemplate({ templateId: "tpl-own", clientIds: ["ghost"] }),
    ).rejects.toThrow("Client is not in your roster.");
    expect(db.writes).toEqual([]);
  });

  it("rejects a foreign / deleted / missing template and invalid input", async () => {
    await expect(assignHabitTemplate({ templateId: "tpl-foreign", clientIds: ["c1"] })).rejects.toThrow("Template not available.");
    await expect(assignHabitTemplate({ templateId: "tpl-deleted", clientIds: ["c1"] })).rejects.toThrow("Template not available.");
    await expect(assignHabitTemplate({ templateId: "missing", clientIds: ["c1"] })).rejects.toThrow("Template not found.");
    await expect(assignHabitTemplate({ templateId: "tpl-own", clientIds: [] })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("assigns a GLOBAL template to an own client with trainerId from the session", async () => {
    await expect(assignHabitTemplate({ templateId: "tpl-global", clientIds: ["c1"], startsOn: "2026-06-20" })).resolves.toEqual({ created: 1 });
    const w = dataWrites();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ op: "set", via: "batch" });
    expect(w[0].data).toMatchObject({ clientId: "c1", trainerId: "coach-a", sourceTemplateId: "tpl-global", startsOn: "2026-06-20", deleted: false });
  });
});

describe("assignHabitTemplateToPending", () => {
  it("rejects foreign / missing / not-pre_created mirrors and foreign templates, writing nothing", async () => {
    await expect(assignHabitTemplateToPending({ templateId: "tpl-own", pendingEmail: "theirs@example.com" })).rejects.toThrow("Not your pending client.");
    await expect(assignHabitTemplateToPending({ templateId: "tpl-own", pendingEmail: "ghost@example.com" })).rejects.toThrow("Pending client not found.");
    await expect(assignHabitTemplateToPending({ templateId: "tpl-own", pendingEmail: "notpre@example.com" })).rejects.toThrow("Mirror not marked pre_created.");
    await expect(assignHabitTemplateToPending({ templateId: "tpl-foreign", pendingEmail: "new@example.com" })).rejects.toThrow("Template not available.");
    await expect(assignHabitTemplateToPending({ templateId: "missing", pendingEmail: "new@example.com" })).rejects.toThrow("Template not found.");
    await expect(assignHabitTemplateToPending({ templateId: "", pendingEmail: "new@example.com" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("writes the pending habit with the normalized email and session trainerId", async () => {
    await expect(assignHabitTemplateToPending({ templateId: "tpl-own", pendingEmail: "NEW@example.com" })).resolves.toEqual({ created: 1 });
    const w = dataWrites();
    expect(w).toHaveLength(1);
    expect(w[0].path).toMatch(/^habits\/hab-pending-new@example\.com-/);
    expect(w[0].data).toMatchObject({
      clientId: null,
      pendingEmail: "new@example.com",
      trainerId: "coach-a",
      sourceTemplateId: "tpl-own",
      description: { en: "d", es: "d" },
      scheduleCadence: "daily",
    });
  });
});

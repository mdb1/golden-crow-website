// __tests__/client-roster.test.ts
//
// `listClients` (the cached roster every gc-fitness page reads) and
// `listClientsForRoster` (the /gc-fitness/clients aggregator: activity,
// compliance, unread, workouts, habits, goals, nutrition, attention).
//
// The Firestore surface is the in-memory fake (group c); `getCurrentTrainer`,
// `getTrainerTimezone` and Firebase Auth `getUsers` are mocked; React `cache`
// and Next `unstable_cache` are pass-throughs that RECORD how they were wired
// (the per-trainer cache key is the cross-trainer-leak mitigation T-0z9-01).
//
// Clock: frozen at Wednesday 2026-06-17 15:00Z. Clients default to UTC.

import { FakeFirestore, FakeTimestamp } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockGetUsers = jest.fn();
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessAuth: () => ({ getUsers: (ids: Array<{ uid: string }>) => mockGetUsers(ids) }),
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
const mockTrainerTz = jest.fn(async () => "UTC");
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: () => mockTrainerTz(),
}));

// `unstable_cache` runs at module load (before this file's consts initialise),
// so its wiring is recorded on globalThis, and every call through the cached
// function records the argument it was keyed by.
type CacheWiring = { keyParts: string[]; opts: unknown; args: unknown[][] };
const cacheWiring = (): CacheWiring[] =>
  ((globalThis as { __rosterCache?: CacheWiring[] }).__rosterCache ??= []);
jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown, keyParts: string[], opts: unknown) => {
    const g = globalThis as { __rosterCache?: Array<{ keyParts: string[]; opts: unknown; args: unknown[][] }> };
    const entry = { keyParts, opts, args: [] as unknown[][] };
    (g.__rosterCache ??= []).push(entry);
    return (...args: unknown[]) => {
      entry.args.push(args);
      return fn(...args);
    };
  },
}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: (fn: unknown) => fn,
}));

import { listClients, listClientsForRoster, type ClientRosterRow } from "../client-roster";

const TRAINER = { uid: "coach-a", email: "a@example.com", role: "trainer", roles: ["trainer"] };
const NOW = new Date("2026-06-17T15:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (iso: string) => FakeTimestamp.fromDate(new Date(iso));
const ago = (ms: number) => FakeTimestamp.fromDate(new Date(NOW.getTime() - ms));

let db: FakeFirestore;
/** uids Firebase Auth knows about; `null` = every uid exists. */
let authUids: Set<string> | null;

function seedClient(uid: string, data: Record<string, unknown> = {}) {
  db.seed(`users/${uid}`, { coachId: TRAINER.uid, role: "client", email: `${uid}@example.com`, displayName: uid, ...data });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  db = new FakeFirestore();
  mockDb.current = db;
  authUids = null;
  mockGetUsers.mockReset().mockImplementation(async (ids: Array<{ uid: string }>) => ({
    users: ids.filter(({ uid }) => authUids === null || authUids.has(uid)).map(({ uid }) => ({ uid })),
    notFound: [],
  }));
  mockGetCurrentTrainer.mockReset().mockResolvedValue(TRAINER);
  mockTrainerTz.mockReset().mockResolvedValue("UTC");
});
afterEach(() => jest.useRealTimers());

// ───────────────────────────── listClients ─────────────────────────────

describe("listClients", () => {
  it("is ONE 60s data cache whose entry is keyed by the session trainer's uid (T-0z9-01)", async () => {
    expect(cacheWiring().map((w) => [w.keyParts, w.opts])).toEqual([
      [["gc-fitness-roster"], { revalidate: 60, tags: ["gc-fitness-roster"] }],
    ]);
    const before = cacheWiring()[0].args.length;
    mockGetCurrentTrainer.mockResolvedValueOnce({ ...TRAINER, uid: "coach-z" });
    await listClients();
    expect(cacheWiring()[0].args.slice(before)).toEqual([["coach-z"]]);
  });

  it("propagates Forbidden and reads nothing without a trainer session", async () => {
    mockGetCurrentTrainer.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(listClients()).rejects.toThrow("Forbidden");
    expect(db.queries).toEqual([]);
  });

  it("queries ONLY the calling trainer's clients and mirrors", async () => {
    await listClients();
    expect(db.queries).toEqual([
      {
        collection: "users",
        filters: [
          { field: "coachId", op: "==", value: "coach-a" },
          { field: "role", op: "==", value: "client" },
        ],
        orderBy: [],
        limit: null,
      },
      { collection: "user_mirror", filters: [{ field: "coachId", op: "==", value: "coach-a" }], orderBy: [], limit: null },
    ]);
  });

  it("never returns another trainer's client or a non-client user", async () => {
    seedClient("mine");
    db.seed("users/theirs", { coachId: "coach-b", role: "client", email: "t@x.com" });
    db.seed("users/coach-like", { coachId: "coach-a", role: "trainer", email: "c@x.com" });
    db.seed("user_mirror/their@x.com", { coachId: "coach-b", email: "their@x.com" });
    expect((await listClients()).map((r) => r.uid)).toEqual(["mine"]);
  });

  it("maps an active /users doc into the wire row", async () => {
    seedClient("c1", {
      email: "ana@example.com",
      displayName: "Ana",
      createdAt: at("2026-01-02T03:04:05Z"),
      timezone: "America/Argentina/Buenos_Aires",
      photoURL: "https://img/ana.jpg",
      birthDate: "1990-06-15",
      coachNickname: "Anita",
      autoAssignedCoach: true,
    });
    expect(await listClients()).toEqual([
      {
        uid: "c1",
        email: "ana@example.com",
        displayName: "Anita",
        createdAt: "2026-01-02T03:04:05.000Z",
        timezone: "America/Argentina/Buenos_Aires",
        photoURL: "https://img/ana.jpg",
        birthDate: "1990-06-15",
        coachNickname: "Anita",
        pendingProvisioning: false,
        autoAssignedCoach: true,
      },
    ]);
  });

  it("tolerates missing / mistyped optional fields", async () => {
    db.seed("users/bare", { coachId: "coach-a", role: "client", timezone: 3, photoURL: {}, autoAssignedCoach: "yes", createdAt: "2026-02-01" });
    const [row] = await listClients();
    expect(row).toEqual({
      uid: "bare",
      email: "",
      displayName: "bare",
      createdAt: "2026-02-01",
      timezone: null,
      photoURL: null,
      birthDate: null,
      coachNickname: null,
      pendingProvisioning: false,
      autoAssignedCoach: false,
    });
  });

  it("adds pending mirror rows (lower-cased email, trimmed name / email fallback), deduped against active emails", async () => {
    seedClient("c1", { email: "Active@Example.com" });
    db.seed("user_mirror/active@example.com", { coachId: "coach-a", email: "  ACTIVE@example.com " });
    db.seed("user_mirror/new@example.com", { coachId: "coach-a", email: "New@Example.com", displayName: "  Nuevo  " });
    db.seed("user_mirror/noemail@example.com", { coachId: "coach-a", displayName: "   " });
    const rows = await listClients();
    expect(rows.filter((r) => r.pendingProvisioning)).toEqual([
      {
        uid: "mirror:noemail@example.com",
        email: "noemail@example.com",
        displayName: "noemail@example.com",
        createdAt: null,
        timezone: null,
        photoURL: null,
        birthDate: null,
        coachNickname: null,
        pendingProvisioning: true,
        autoAssignedCoach: false,
      },
      expect.objectContaining({ uid: "mirror:new@example.com", email: "new@example.com", displayName: "Nuevo" }),
    ]);
    expect(rows).toHaveLength(3);
  });

  it("sorts by the coach-visible name, case-insensitively", async () => {
    seedClient("u1", { displayName: "bruno" });
    seedClient("u2", { displayName: "Ana" });
    seedClient("u3", { displayName: "zoe", coachNickname: "Carla" });
    db.seed("user_mirror/b@x.com", { coachId: "coach-a", email: "b@x.com", displayName: "Beto" });
    expect((await listClients()).map((r) => r.displayName)).toEqual(["Ana", "Beto", "bruno", "Carla"]);
  });

  describe("#270 orphaned /users docs", () => {
    it("drops a client whose Auth account no longer exists", async () => {
      seedClient("live");
      seedClient("orphan");
      authUids = new Set(["live"]);
      expect((await listClients()).map((r) => r.uid)).toEqual(["live"]);
    });

    it("an orphan's email no longer suppresses that person's pending mirror row", async () => {
      seedClient("orphan", { email: "same@example.com" });
      db.seed("user_mirror/same@example.com", { coachId: "coach-a", email: "same@example.com" });
      authUids = new Set();
      expect((await listClients()).map((r) => r.uid)).toEqual(["mirror:same@example.com"]);
    });

    it("fails OPEN when the Auth lookup throws (keeps everyone)", async () => {
      seedClient("a");
      seedClient("b");
      mockGetUsers.mockRejectedValueOnce(new Error("auth/internal-error"));
      expect((await listClients()).map((r) => r.uid)).toEqual(["a", "b"]);
    });

    it("looks up uids in batches of 100 and skips the lookup with no active clients", async () => {
      await listClients();
      expect(mockGetUsers).not.toHaveBeenCalled();
      for (let i = 0; i < 205; i += 1) seedClient(`u${String(i).padStart(3, "0")}`);
      await listClients();
      expect(mockGetUsers.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 5]);
    });
  });
});

// ───────────────────────── listClientsForRoster ─────────────────────────

async function rosterRow(uid: string): Promise<ClientRosterRow> {
  const rows = await listClientsForRoster();
  const row = rows.find((r) => r.uid === uid);
  if (!row) throw new Error(`no roster row for ${uid}`);
  return row;
}

function seedHabit(id: string, clientId: string, data: Record<string, unknown> = {}) {
  db.seed(`habits/${id}`, { clientId, type: "binary", ...data });
}
function seedHabitLog(id: string, clientId: string, habitId: string, civilDate: string, data: Record<string, unknown> = {}) {
  db.seed(`habit_logs/${id}`, { clientId, habitId, civilDate, value: true, ...data });
}

describe("listClientsForRoster", () => {
  it("propagates Forbidden", async () => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(listClientsForRoster()).rejects.toThrow("Forbidden");
  });

  it("a brand-new active client: zeros, no activity → needs attention, no nutrition plan", async () => {
    seedClient("c1", { displayName: "Ana" });
    expect(await rosterRow("c1")).toEqual({
      uid: "c1",
      email: "c1@example.com",
      displayName: "Ana",
      createdAt: null,
      photoURL: null,
      timezone: null,
      source: "active",
      pendingProvisioning: false,
      autoAssignedCoach: false,
      lastActivityAt: null,
      thisWeekComplianceRatio: 0,
      unreadChatCount: 0,
      missedWorkoutsLast7Days: 0,
      needsAttention: true,
      needsAttentionReasons: ["inactive-3-days"],
      habitsCompletedThisWeek: 0,
      habitsScheduledThisWeek: 0,
      nutritionRatio7Days: null,
      nutritionHasActivePlan: false,
      nutritionNeverHadPlan: true,
      workoutsCompletedThisMonth: 0,
      workoutsScheduledThisMonth: 0,
      goalsCount: { short: 0, medium: 0, long: 0 },
    });
  });

  it("a pending (mirror) client is never flagged and reads no per-client data under a real uid", async () => {
    db.seed("user_mirror/p@x.com", { coachId: "coach-a", email: "p@x.com" });
    const rows = await listClientsForRoster();
    expect(rows).toEqual([
      expect.objectContaining({
        uid: "mirror:p@x.com",
        source: "pending",
        pendingProvisioning: true,
        autoAssignedCoach: false,
        needsAttention: false,
        needsAttentionReasons: [],
        lastActivityAt: null,
      }),
    ]);
    // No duplicate pending row even though BOTH listClients and the roster's own
    // mirror query return this doc.
    expect(rows).toHaveLength(1);
  });

  describe("lastActivityAt", () => {
    it("is the max across workout startedAt, habit-log timestamps and progress photos", async () => {
      seedClient("c1");
      db.seed("workout_logs/w1", { clientId: "c1", startedAt: ago(2 * DAY) });
      db.seed("habit_logs/h1", { clientId: "c1", habitId: "x", civilDate: "2026-06-16", loggedAt: ago(30 * HOUR) });
      db.seed("progress_photos/p1", { clientId: "c1", createdAt: ago(5 * HOUR) });
      const row = await rosterRow("c1");
      expect(row.lastActivityAt).toBe(new Date(NOW.getTime() - 5 * HOUR).toISOString());
      expect(row.needsAttention).toBe(false);
    });

    it("reads a habit log's updatedAt/createdAt when loggedAt is missing (260528), and ISO strings", async () => {
      seedClient("c1");
      db.seed("habit_logs/h1", { clientId: "c1", habitId: "x", updatedAt: "2026-06-17T09:00:00.000Z" });
      db.seed("habit_logs/h2", { clientId: "c1", habitId: "x", createdAt: at("2026-06-17T08:00:00Z") });
      expect((await rosterRow("c1")).lastActivityAt).toBe("2026-06-17T09:00:00.000Z");
    });

    it("ignores soft-deleted habit logs and chat messages (a trainer's message is not client activity)", async () => {
      seedClient("c1");
      db.seed("habit_logs/h1", { clientId: "c1", habitId: "x", loggedAt: ago(HOUR), deleted: true });
      db.seed("chats/c1", { lastMessageAt: ago(HOUR) });
      db.seed("chats/c1/messages/m1", { createdAt: ago(HOUR), senderId: "c1" });
      expect((await rosterRow("c1")).lastActivityAt).toBeNull();
    });

    it("needs attention once the latest activity is older than 72h", async () => {
      seedClient("old");
      seedClient("edge");
      db.seed("workout_logs/w1", { clientId: "old", startedAt: ago(72 * HOUR + 1) });
      db.seed("workout_logs/w2", { clientId: "edge", startedAt: ago(72 * HOUR) });
      const rows = await listClientsForRoster();
      expect(rows.find((r) => r.uid === "old")?.needsAttentionReasons).toEqual(["inactive-3-days"]);
      expect(rows.find((r) => r.uid === "edge")?.needsAttention).toBe(false);
    });

    it("a failing progress-photo query is tolerated", async () => {
      seedClient("c1");
      db.seed("workout_logs/w1", { clientId: "c1", startedAt: ago(HOUR) });
      db.failQueryWhen((q) => q.collection === "progress_photos");
      expect((await rosterRow("c1")).lastActivityAt).toBe(new Date(NOW.getTime() - HOUR).toISOString());
    });
  });

  describe("unreadChatCount (trainer's POV only)", () => {
    it.each([
      ["nested map", { unreadCount: { "coach-a": 4, "c1": 9 } }, 4],
      ["legacy flat field", { "unreadCount.coach-a": 3 }, 3],
      ["nested wins over legacy", { unreadCount: { "coach-a": 2 }, "unreadCount.coach-a": 7 }, 2],
      ["another trainer's counter is never shown", { unreadCount: { "coach-b": 5 } }, 0],
      ["negative clamps to 0", { unreadCount: { "coach-a": -2 } }, 0],
      ["non-number ignored", { unreadCount: { "coach-a": "3" } }, 0],
    ])("%s", async (_label, chat, expected) => {
      seedClient("c1");
      db.seed("chats/c1", chat);
      expect((await rosterRow("c1")).unreadChatCount).toBe(expected);
    });

    it("no chat doc → 0", async () => {
      seedClient("c1");
      expect((await rosterRow("c1")).unreadChatCount).toBe(0);
    });
  });

  describe("workouts", () => {
    it("missed = assignments scheduled in [today−7, today] minus logs started in the last 7×24h", async () => {
      seedClient("c1");
      for (const [id, date] of [
        ["a1", "2026-06-10"], // today − 7: inside the window (8 civil days)
        ["a2", "2026-06-12"],
        ["a3", "2026-06-17"],
        ["a-old", "2026-06-09"],
        ["a-future", "2026-06-18"],
      ]) {
        db.seed(`workout_assignments/${id}`, { clientId: "c1", scheduledFor: date });
      }
      db.seed("workout_logs/w-in", { clientId: "c1", startedAt: ago(DAY) });
      db.seed("workout_logs/w-out", { clientId: "c1", startedAt: ago(8 * DAY) });
      expect((await rosterRow("c1")).missedWorkoutsLast7Days).toBe(2);
    });

    it("missed never goes negative (more logs than assignments)", async () => {
      seedClient("c1");
      db.seed("workout_logs/w1", { clientId: "c1", startedAt: ago(HOUR) });
      db.seed("workout_logs/w2", { clientId: "c1", startedAt: ago(2 * HOUR) });
      expect((await rosterRow("c1")).missedWorkoutsLast7Days).toBe(0);
    });

    it("month counts BOTH come from this month's assignments; completed = status completed", async () => {
      seedClient("c1");
      db.seed("workout_assignments/m1", { clientId: "c1", scheduledFor: "2026-06-01", status: "completed" });
      db.seed("workout_assignments/m2", { clientId: "c1", scheduledFor: "2026-06-30", status: "pending" });
      db.seed("workout_assignments/m3", { clientId: "c1", scheduledFor: "2026-06-17", status: "completed" });
      db.seed("workout_assignments/prev", { clientId: "c1", scheduledFor: "2026-05-31", status: "completed" });
      db.seed("workout_assignments/next", { clientId: "c1", scheduledFor: "2026-07-01", status: "completed" });
      // A log finished this month for a previous month's assignment must NOT count.
      db.seed("workout_logs/w1", { clientId: "c1", startedAt: ago(HOUR), status: "completed" });
      const row = await rosterRow("c1");
      expect([row.workoutsCompletedThisMonth, row.workoutsScheduledThisMonth]).toEqual([2, 3]);
    });

    it("the month is the CLIENT'S month: 1 July 01:00 in Kiritimati is still June in UTC", async () => {
      jest.setSystemTime(new Date("2026-06-30T12:00:00Z")); // 2026-07-01 02:00 on Kiritimati
      seedClient("kiri", { timezone: "Pacific/Kiritimati" });
      seedClient("utc", { timezone: "UTC" });
      for (const uid of ["kiri", "utc"]) {
        db.seed(`workout_assignments/${uid}-jun`, { clientId: uid, scheduledFor: "2026-06-30" });
        db.seed(`workout_assignments/${uid}-jul`, { clientId: uid, scheduledFor: "2026-07-01" });
        db.seed(`workout_assignments/${uid}-jul2`, { clientId: uid, scheduledFor: "2026-07-02" });
      }
      const rows = await listClientsForRoster();
      expect(rows.find((r) => r.uid === "kiri")?.workoutsScheduledThisMonth).toBe(2);
      expect(rows.find((r) => r.uid === "utc")?.workoutsScheduledThisMonth).toBe(1);
    });

    it("a client without a timezone uses the TRAINER's zone, not UTC", async () => {
      jest.setSystemTime(new Date("2026-06-30T12:00:00Z"));
      mockTrainerTz.mockResolvedValue("Pacific/Kiritimati");
      seedClient("c1");
      db.seed("workout_assignments/jul", { clientId: "c1", scheduledFor: "2026-07-01" });
      expect((await rosterRow("c1")).workoutsScheduledThisMonth).toBe(1);
    });
  });

  describe("habits", () => {
    it("compliance = mean over live habits of (completed days / 7); deleted habits excluded", async () => {
      seedClient("c1");
      seedHabit("h-full", "c1");
      seedHabit("h-half", "c1");
      seedHabit("h-gone", "c1", { deleted: true });
      for (const d of ["11", "12", "13", "14", "15", "16", "17"]) seedHabitLog(`f${d}`, "c1", "h-full", `2026-06-${d}`);
      seedHabitLog("x1", "c1", "h-half", "2026-06-17");
      seedHabitLog("x2", "c1", "h-gone", "2026-06-17");
      const row = await rosterRow("c1");
      expect(row.thisWeekComplianceRatio).toBeCloseTo((7 / 7 + 1 / 7) / 2, 10);
      expect(row.habitsScheduledThisWeek).toBe(14);
      expect(row.habitsCompletedThisWeek).toBe(8);
    });

    it("a client-created habit without a `deleted` field counts (#437)", async () => {
      seedClient("c1");
      db.seed("habits/own", { clientId: "c1", clientOwned: true });
      seedHabitLog("l", "c1", "own", "2026-06-17");
      const row = await rosterRow("c1");
      expect([row.habitsScheduledThisWeek, row.habitsCompletedThisWeek]).toEqual([7, 1]);
    });

    it("only TRUE / legacy-truthy, non-deleted logs inside the 7 civil days complete", async () => {
      seedClient("c1");
      seedHabit("h", "c1");
      seedHabitLog("ok", "c1", "h", "2026-06-17");
      seedHabitLog("legacy-num", "c1", "h", "2026-06-16", { value: 1 });
      seedHabitLog("false", "c1", "h", "2026-06-15", { value: false });
      seedHabitLog("zero", "c1", "h", "2026-06-14", { value: 0 });
      seedHabitLog("deleted", "c1", "h", "2026-06-13", { deleted: true });
      seedHabitLog("old", "c1", "h", "2026-06-10"); // today − 7: outside the 7-day window
      seedHabitLog("no-habit", "c1", "", "2026-06-12");
      const row = await rosterRow("c1");
      expect(row.habitsCompletedThisWeek).toBe(2);
      expect(row.thisWeekComplianceRatio).toBeCloseTo(2 / 7, 10);
    });

    it("scheduled per cadence: daily 7, weekly by ISO weekday, monthly by day, one-time skipped", async () => {
      // Window 2026-06-11 (Thu) … 2026-06-17 (Wed).
      seedClient("c1");
      seedHabit("daily", "c1", { scheduleCadence: "daily" });
      seedHabit("weekly", "c1", { scheduleCadence: "weekly", scheduleWeekdays: [1, 7], weekdayFormat: "iso" }); // Mon 15 + Sun 14
      seedHabit("monthly", "c1", { scheduleCadence: "monthly", scheduleMonthDays: [11, 17, 25] });
      seedHabit("monthly-single", "c1", { scheduleCadence: "monthly", scheduleDayOfMonth: 12 });
      seedHabit("once", "c1", { scheduleType: "one-time", startsOn: "2026-06-17" });
      expect((await rosterRow("c1")).habitsScheduledThisWeek).toBe(7 + 2 + 2 + 1);
    });

    it("habit-log query falls back to an unwindowed read when the windowed one fails (index building)", async () => {
      seedClient("c1");
      seedHabit("h", "c1");
      seedHabitLog("l", "c1", "h", "2026-06-17");
      db.failQueryWhen((q) => q.collection === "habit_logs" && q.filters.some((f) => f.field === "civilDate"));
      expect((await rosterRow("c1")).habitsCompletedThisWeek).toBe(1);
      expect(db.queries.filter((q) => q.collection === "habit_logs").map((q) => q.limit)).toEqual(
        expect.arrayContaining([200]),
      );
    });

    it("warns when the raw habit fetch hits the 150 cap", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      seedClient("c1");
      for (let i = 0; i < 150; i += 1) seedHabit(`h${i}`, "c1", { deleted: true });
      await rosterRow("c1");
      expect(warn).toHaveBeenCalledWith(
        "[gc-fitness/roster] habit fetch hit its cap — live habits may be truncated",
        { clientId: "c1", cap: 150 },
      );
      warn.mockRestore();
    });

    // FINDING: thisWeekComplianceRatio divides completed days by 7 for EVERY
    // habit, so a weekly habit scheduled Mon+Thu that the client did on both days
    // shows 2/7 ≈ 29% "compliance" in the roster. `computeAdherence` (scheduled
    // days as denominator) exists in habit-compliance.ts for exactly this.
    it.failing("a weekly habit done on every scheduled day reads as 100% compliance", async () => {
      seedClient("c1");
      seedHabit("weekly", "c1", { scheduleCadence: "weekly", scheduleWeekdays: [1, 4], weekdayFormat: "iso" });
      seedHabitLog("mon", "c1", "weekly", "2026-06-15");
      seedHabitLog("thu", "c1", "weekly", "2026-06-11");
      expect((await rosterRow("c1")).thisWeekComplianceRatio).toBe(1);
    });
  });

  describe("goals", () => {
    it("buckets the trainer's goals per client by horizon in ONE query", async () => {
      seedClient("c1");
      seedClient("c2");
      db.seed("client_goals/g1", { coachId: "coach-a", clientId: "c1", horizon: "short" });
      db.seed("client_goals/g2", { coachId: "coach-a", clientId: "c1", horizon: "short" });
      db.seed("client_goals/g3", { coachId: "coach-a", clientId: "c1", horizon: "long" });
      db.seed("client_goals/g4", { coachId: "coach-a", clientId: "c1", horizon: "someday" });
      db.seed("client_goals/g5", { coachId: "coach-a", clientId: "c2", horizon: "medium" });
      db.seed("client_goals/g6", { coachId: "coach-b", clientId: "c2", horizon: "long" });
      db.seed("client_goals/g7", { coachId: "coach-a", horizon: "long" });
      const rows = await listClientsForRoster();
      expect(rows.find((r) => r.uid === "c1")?.goalsCount).toEqual({ short: 2, medium: 0, long: 1 });
      expect(rows.find((r) => r.uid === "c2")?.goalsCount).toEqual({ short: 0, medium: 1, long: 0 });
      expect(db.queries.filter((q) => q.collection === "client_goals")).toHaveLength(1);
    });

    it("a failing goals query renders 0/0/0 instead of failing the roster", async () => {
      seedClient("c1");
      db.failQueryWhen((q) => q.collection === "client_goals");
      expect((await rosterRow("c1")).goalsCount).toEqual({ short: 0, medium: 0, long: 0 });
    });
  });

  it("carries the nutrition summary through (active plan, 7-day ratio)", async () => {
    seedClient("c1");
    db.seed("nutrition_plans/p1", {
      clientId: "c1",
      startsOn: "2026-06-01",
      endsOn: null,
      name: { en: "Cut", es: "Definición" },
      meals: [{ mealId: "m1", name: { en: "B", es: "D" }, moment: "breakfast", options: [], order: 0 }],
      targets: {},
    });
    db.seed("nutrition_logs/c1_2026-06-17", {
      clientId: "c1",
      civilDate: "2026-06-17",
      planId: "p1",
      meals: { m1: { status: "done" } },
      targetsSnapshot: { daily: {}, meals: [{ mealId: "m1", name: { en: "B", es: "D" }, order: 0, targets: null }] },
    });
    const row = await rosterRow("c1");
    expect(row).toMatchObject({ nutritionHasActivePlan: true, nutritionNeverHadPlan: false });
    expect(row.nutritionRatio7Days).toBeCloseTo(1 / 7, 10);
  });

  it("sorts: active before pending, most recent activity first, no-activity by name", async () => {
    seedClient("quiet-b", { displayName: "bea" });
    seedClient("quiet-a", { displayName: "Alex" });
    seedClient("recent", { displayName: "Zed" });
    seedClient("older", { displayName: "Abe" });
    db.seed("workout_logs/w1", { clientId: "recent", startedAt: ago(HOUR) });
    db.seed("workout_logs/w2", { clientId: "older", startedAt: ago(DAY) });
    db.seed("user_mirror/aaa@x.com", { coachId: "coach-a", email: "aaa@x.com" });
    expect((await listClientsForRoster()).map((r) => r.uid)).toEqual([
      "recent",
      "older",
      "quiet-a",
      "quiet-b",
      "mirror:aaa@x.com",
    ]);
  });

  it("CURRENT: only the first 50 roster entries (alphabetical) get a row — the rest are not shown", async () => {
    // Documented read-budget cap ("50-client cap per call"). Pinned so the
    // limit is a visible decision: a coach with 51 clients does not see the
    // 51st on /gc-fitness/clients, and a pending client past position 50 is
    // dropped too (its email is in the deduplication set).
    for (let i = 0; i < 51; i += 1) seedClient(`u${String(i).padStart(2, "0")}`);
    db.seed("user_mirror/zzz@x.com", { coachId: "coach-a", email: "zzz@x.com" });
    const rows = await listClientsForRoster();
    expect(rows).toHaveLength(50);
    expect(rows.map((r) => r.uid)).not.toContain("u50");
    expect(rows.map((r) => r.uid)).not.toContain("mirror:zzz@x.com");
  });
});

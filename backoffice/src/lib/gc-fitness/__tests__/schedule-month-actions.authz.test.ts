// __tests__/schedule-month-actions.authz.test.ts
//
// Authorization tests for the month calendar actions (schedule-month-actions.ts)
// against an in-memory Firestore. Complements schedule-month-actions.test.ts
// (transferred-client / self-assigned visibility on the trainer's OWN client).
//
// Key finding pinned here: `listMonthForClients` trusts the caller-supplied
// `clientIds`. The in-code comment says they are "derived from the trainer's
// own roster on the caller" and that "Firestore Rules enforce trainerId ==
// auth.uid on reads" — but this is a Server Action (callable with any
// arguments) reading through the Admin SDK (rules bypassed). Assignments are
// filtered by trainer in memory; habits and habit logs are NOT.

import {
  FakeFirestore,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import {
  getAssignmentDetail,
  listMonthForClientAsAdmin,
  listMonthForClients,
  moveAssignment,
} from "../schedule-month-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

let db: FakeFirestore;

const RANGE = { startCivil: "2026-06-14", endCivil: "2026-06-16", todayCivil: "2026-06-15" };

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

function seedWorld() {
  db.seed("users/coach-a", { displayName: "Coach A" });
  db.seed("users/c1", { coachId: "coach-a", displayName: "Ana", coachNickname: "Anita", role: "client" });
  db.seed("users/x1", { coachId: "coach-b", displayName: "Xenia", role: "client" });

  const snap = (name: string) => ({ name: { en: name }, exercises: [{ exerciseId: "ex-squat", sets: 3, reps: 5 }] });
  // c1 (mine)
  db.seed("workout_assignments/a-own", { trainerId: "coach-a", clientId: "c1", scheduledFor: "2026-06-15", status: "scheduled", seriesId: "S", templateSnapshot: snap("Legs") });
  db.seed("workout_assignments/a-self", { trainerId: "c1", clientId: "c1", scheduledFor: "2026-06-15", status: "scheduled", templateSnapshot: snap("Self run") });
  db.seed("workout_assignments/a-prev-coach", { trainerId: "old-coach", clientId: "c1", scheduledFor: "2026-06-15", status: "scheduled", templateSnapshot: snap("Old plan") });
  db.seed("habits/h-c1", { trainerId: "coach-a", clientId: "c1", name: { en: "Water" }, scheduleType: "recurring", scheduleCadence: "daily", startsOn: "2026-06-01" });
  // x1 (coach-b's client)
  db.seed("workout_assignments/b-own", { trainerId: "coach-b", clientId: "x1", scheduledFor: "2026-06-15", status: "scheduled", templateSnapshot: snap("B's secret plan") });
  db.seed("workout_assignments/x-self", { trainerId: "x1", clientId: "x1", scheduledFor: "2026-06-15", status: "scheduled", templateSnapshot: snap("Xenia self run") });
  db.seed("habits/h-x1", { trainerId: "coach-b", clientId: "x1", name: { en: "B's private habit" }, scheduleType: "recurring", scheduleCadence: "daily", startsOn: "2026-06-01" });
  db.seed("habit_logs/hl-x1", { habitId: "h-x1", clientId: "x1", civilDate: "2026-06-14", value: true });
}

beforeEach(() => {
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);
  seedWorld();
});

describe("auth gate", () => {
  it("trainer actions reject signed-out and admin-only callers with nothing read or written", async () => {
    for (const roles of [null, ["admin"]]) {
      if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
      else signInAs("admin-1", roles);
      await expect(listMonthForClients({ ...RANGE, clientIds: ["c1"] })).rejects.toThrow("Forbidden");
      await expect(getAssignmentDetail("a-own")).rejects.toThrow("Forbidden");
      await expect(moveAssignment({ id: "a-own", newScheduledFor: "2026-06-20", scope: "one" })).rejects.toThrow("Forbidden");
    }
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
  });

  it("listMonthForClientAsAdmin rejects a trainer-only token", async () => {
    await expect(
      listMonthForClientAsAdmin({ coachUid: "coach-a", clientId: "c1", todayCivil: "2026-06-15" }),
    ).rejects.toThrow("Forbidden");
    expect(db.queries).toEqual([]);
  });
});

describe("listMonthForClients", () => {
  it("an empty clientIds list short-circuits with no queries", async () => {
    await expect(listMonthForClients({ monthFirstCivil: "2026-06-01", todayCivil: "2026-06-15", clientIds: [] })).resolves.toEqual({
      monthStart: "2026-06-01",
      monthEnd: "2026-06-30",
      workoutsByDay: {},
      habitsByDay: {},
    });
    expect(db.queries).toEqual([]);
  });

  it("own client: own + self-assigned workouts, never a previous coach's", async () => {
    const out = await listMonthForClients({ ...RANGE, clientIds: ["c1"] });
    const day = out.workoutsByDay["2026-06-15"];
    expect(day.map((c) => [c.id, c.selfAssigned])).toEqual([
      ["a-own", false],
      ["a-self", true],
    ]);
    expect(out.habitsByDay["2026-06-14"]).toEqual([
      { id: "h-c1:2026-06-14", clientId: "c1", civilDate: "2026-06-14", habitName: "Water", status: "missed", clientOwned: false },
    ]);
  });

  it("filters ANOTHER coach's assignments out even when their client id is passed", async () => {
    const out = await listMonthForClients({ ...RANGE, clientIds: ["c1", "x1"] });
    const ids = Object.values(out.workoutsByDay).flat().map((c) => c.id);
    expect(ids).not.toContain("b-own");
  });

  // SECURITY GAP: listMonthForClients never verifies that `input.clientIds`
  // belong to the caller (schedule-month-actions.ts:704-710 → loadMonthForClients
  // ~L795-818 / L972). For a FOREIGN client id it returns that client's
  // self-assigned workouts (admitted by the `trainerId === clientId` branch),
  // EVERY habit on the client regardless of trainer (the habits query and loop
  // have no trainer filter), and each habit's done/missed status from
  // habit_logs. Its siblings gate the client first (getClientCalendarPeek
  // checks `client.coachId === trainer.uid`; listMonthForClientAsAdmin runs
  // adminCanViewClientUnderCoach).
  it.failing("SECURITY GAP: returns nothing about a client outside the caller's roster", async () => {
    const out = await listMonthForClients({ ...RANGE, clientIds: ["x1"] });
    expect(out.workoutsByDay).toEqual({});
    expect(out.habitsByDay).toEqual({});
  });

  // Current (insecure) behavior behind the gap — remove together with the
  // `it.failing` above when the roster check is added.
  it("pins the current leak: another coach's client's habit names, statuses and self-run are returned", async () => {
    const out = await listMonthForClients({ ...RANGE, clientIds: ["x1"] });
    expect(out.workoutsByDay["2026-06-15"].map((c) => c.templateName)).toEqual(["Xenia self run"]);
    expect(out.habitsByDay["2026-06-14"]).toEqual([
      expect.objectContaining({ clientId: "x1", habitName: "B's private habit", status: "done" }),
    ]);
  });

  it("no query is trainer-scoped (pinned so the in-memory filter stays the only gate)", async () => {
    await listMonthForClients({ ...RANGE, clientIds: ["c1"] });
    for (const q of db.queries) {
      expect(q.filters.some((f) => f.field === "trainerId")).toBe(false);
      expect(q.filters[0]).toEqual({ field: "clientId", op: "in", value: ["c1"] });
    }
  });

  it("caps the IN list at 30 client ids", async () => {
    const ids = Array.from({ length: 35 }, (_, i) => `c${i}`);
    await listMonthForClients({ ...RANGE, clientIds: ids });
    expect((db.queries[0].filters[0].value as string[]).length).toBe(30);
  });

  it("flips an assignment's status from its log and attaches the logged summary", async () => {
    db.seed("workout_logs/l1", {
      clientId: "c1", trainerId: "coach-a", assignmentId: "a-own", status: "completed",
      startedAt: new Date("2026-06-15T10:00:00Z"), duration_seconds: 1800, total_volume_kg: 1234.4,
      sets: [{ exerciseId: "ex-squat" }, { exerciseId: "ex-squat" }],
    });
    const out = await listMonthForClients({ ...RANGE, clientIds: ["c1"] });
    const chip = out.workoutsByDay["2026-06-15"].find((c) => c.id === "a-own");
    expect(chip).toMatchObject({
      status: "completed",
      logged: { exercises: 1, sets: 2, durationMinutes: 30, volumeKg: 1234 },
    });
  });

  it("degrades to 'all scheduled' when the habit_logs query fails", async () => {
    db.failQueryWhen((q) => q.collection === "habit_logs");
    const out = await listMonthForClients({ ...RANGE, clientIds: ["c1"] });
    expect(out.habitsByDay["2026-06-16"][0].status).toBe("scheduled");
  });
});

describe("listMonthForClientAsAdmin", () => {
  beforeEach(() => signInAs("admin-1", ["admin"]));

  it("rejects a client that is not under the coach in the URL (no calendar queries)", async () => {
    await expect(
      listMonthForClientAsAdmin({ coachUid: "coach-a", clientId: "x1", todayCivil: "2026-06-15" }),
    ).rejects.toThrow("Not found");
    await expect(
      listMonthForClientAsAdmin({ coachUid: "coach-a", clientId: "ghost", todayCivil: "2026-06-15" }),
    ).rejects.toThrow("Not found");
    expect(db.queries).toEqual([]);
  });

  it("returns the coach-of-record view, filtered against the URL coach", async () => {
    const out = await listMonthForClientAsAdmin({
      coachUid: "coach-b",
      clientId: "x1",
      monthFirstCivil: "2026-06-01",
      todayCivil: "2026-06-15",
    });
    expect(out.monthStart).toBe("2026-06-01");
    expect(out.workoutsByDay["2026-06-15"].map((c) => c.id)).toEqual(["b-own", "x-self"]);
  });
});

describe("getAssignmentDetail", () => {
  it("rejects another coach's, a previous coach's, and a foreign self-assigned assignment", async () => {
    await expect(getAssignmentDetail("b-own")).rejects.toThrow("Not your assignment.");
    await expect(getAssignmentDetail("a-prev-coach")).rejects.toThrow("Not your assignment.");
    await expect(getAssignmentDetail("x-self")).rejects.toThrow("Not your assignment.");
    await expect(getAssignmentDetail("missing")).rejects.toThrow("Not found");
    expect(db.writes).toEqual([]);
  });

  it("returns the detail of an own assignment with series end from OWN docs and own-log hints only", async () => {
    db.seed("workout_assignments/s-later", { trainerId: "coach-a", clientId: "c1", seriesId: "S", scheduledFor: "2026-07-01" });
    db.seed("workout_assignments/s-foreign", { trainerId: "coach-b", clientId: "c1", seriesId: "S", scheduledFor: "2026-12-31" });
    db.seed("exercises/ex-squat", { name: { en: "Back squat" } });
    db.seed("workout_logs/own", {
      clientId: "c1", trainerId: "coach-a", status: "completed", startedAt: new Date("2026-06-10T10:00:00Z"),
      sets: [
        { exerciseId: "ex-squat", set_index: 1, weight_kg: 100, reps: 5 },
        { exerciseId: "ex-squat", set_index: 0, weight_kg: 90, reps: 5 },
        { exerciseId: "ex-squat", set_index: 2, weight_kg: 50, reps: 5, set_type: "warmup" },
      ],
    });
    db.seed("workout_logs/foreign", {
      clientId: "c1", trainerId: "coach-b", status: "completed", startedAt: new Date("2026-06-12T10:00:00Z"),
      sets: [{ exerciseId: "ex-squat", set_index: 0, weight_kg: 999, reps: 1 }],
    });

    const detail = await getAssignmentDetail("a-own");
    expect(detail).toMatchObject({
      id: "a-own",
      clientId: "c1",
      clientName: "Anita",
      coachName: "Coach A",
      scheduledFor: "2026-06-15",
      templateName: "Legs",
      selfAssigned: false,
    });
    expect((detail as unknown as { seriesEndDate: string }).seriesEndDate).toBe("2026-07-01");
    expect(detail.lastLoggedSetsByExerciseId).toEqual({
      "ex-squat": [
        { weightKg: 90, reps: 5 },
        { weightKg: 100, reps: 5 },
      ],
    });
  });

  it("admits a self-assigned workout of the caller's OWN client", async () => {
    await expect(getAssignmentDetail("a-self")).resolves.toMatchObject({ id: "a-self", selfAssigned: true });
  });
});

describe("moveAssignment", () => {
  beforeEach(() => {
    const base = { trainerId: "coach-a", clientId: "c1", seriesId: "S", status: "scheduled" };
    db.seed("workout_assignments/s-past", { ...base, scheduledFor: "2026-06-08" });
    db.seed("workout_assignments/s-next", { ...base, scheduledFor: "2026-06-22" });
    db.seed("workout_assignments/s-done", { ...base, status: "completed", scheduledFor: "2026-06-29" });
    db.seed("workout_assignments/s-foreign", { ...base, trainerId: "coach-b", scheduledFor: "2026-06-22" });
  });

  it("rejects a bad date before any read", async () => {
    await expect(moveAssignment({ id: "a-own", newScheduledFor: "June 20", scope: "one" })).rejects.toThrow("Invalid civil date.");
    expect(db.reads).toEqual([]);
  });

  it("rejects another coach's / missing / dateless assignment and writes nothing", async () => {
    await expect(moveAssignment({ id: "b-own", newScheduledFor: "2026-06-20", scope: "one" })).rejects.toThrow("Not your assignment.");
    await expect(moveAssignment({ id: "s-foreign", newScheduledFor: "2026-06-20", scope: "all" })).rejects.toThrow("Not your assignment.");
    await expect(moveAssignment({ id: "missing", newScheduledFor: "2026-06-20", scope: "one" })).rejects.toThrow("Not found");
    db.seed("workout_assignments/no-date", { trainerId: "coach-a", clientId: "c1" });
    await expect(moveAssignment({ id: "no-date", newScheduledFor: "2026-06-20", scope: "one" })).rejects.toThrow("Origin date missing.");
    expect(db.writes).toEqual([]);
    expect(db.doc("workout_assignments/b-own")?.scheduledFor).toBe("2026-06-15");
  });

  it("scope=one moves just this doc", async () => {
    await expect(moveAssignment({ id: "a-own", newScheduledFor: "2026-06-17", scope: "one" })).resolves.toEqual({ ok: true, movedCount: 1 });
    expect(db.writes).toEqual([
      { op: "update", path: "workout_assignments/a-own", via: "direct", data: { scheduledFor: "2026-06-17", updatedAt: { __fv: "serverTimestamp" } } },
    ]);
  });

  it("scope=future shifts own scheduled docs on/after the origin by the same delta — never another coach's", async () => {
    await expect(moveAssignment({ id: "a-own", newScheduledFor: "2026-06-17", scope: "future" })).resolves.toEqual({ ok: true, movedCount: 2 });
    expect(db.writes.map((w) => [w.path, w.data?.scheduledFor])).toEqual([
      ["workout_assignments/a-own", "2026-06-17"],
      ["workout_assignments/s-next", "2026-06-24"],
    ]);
    expect(db.writes.every((w) => w.via === "batch")).toBe(true);
    expect(db.doc("workout_assignments/s-foreign")?.scheduledFor).toBe("2026-06-22");
    expect(db.doc("workout_assignments/s-done")?.scheduledFor).toBe("2026-06-29");
  });

  it("scope=all also shifts earlier scheduled docs, still only own + scheduled", async () => {
    await moveAssignment({ id: "a-own", newScheduledFor: "2026-06-14", scope: "all" });
    expect(db.writes.map((w) => w.path).sort()).toEqual([
      "workout_assignments/a-own",
      "workout_assignments/s-next",
      "workout_assignments/s-past",
    ]);
    expect(db.doc("workout_assignments/s-past")?.scheduledFor).toBe("2026-06-07");
  });

  it("a non-series assignment always moves alone, whatever the scope", async () => {
    db.seed("workout_assignments/single", { trainerId: "coach-a", clientId: "c1", scheduledFor: "2026-06-15", status: "completed" });
    // NOTE: scope "one" does not check status — a completed doc is moved too
    // (the series scopes skip non-scheduled docs). Pinned as current behavior.
    await expect(moveAssignment({ id: "single", newScheduledFor: "2026-06-18", scope: "future" })).resolves.toEqual({ ok: true, movedCount: 1 });
    expect(db.doc("workout_assignments/single")?.scheduledFor).toBe("2026-06-18");
  });
});

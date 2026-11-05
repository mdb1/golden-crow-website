// __tests__/coach-swap-1504.fake-db.test.ts
//
// gc-fitness#1504 — the UX half of a coach swap (users/C.coachId OLD → NEW). OLD's
// docs stay on the plan with `trainerId == OLD`. The new coach sees them on the
// calendar, marked and read-only, and can end them from the ficha; nothing else
// about the client (or anyone else's plan) moves.

import { FakeFirestore, setGcFitnessAuthEnv, tokensFor } from "@/lib/test-utils/fake-firestore-c";

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

import { deleteAssignment, editAssignmentScheduledFor } from "../workout-assignment-actions";
import { getAssignmentDetail, listMonthForClients, moveAssignment } from "../schedule-month-actions";
import {
  deleteHabitRecurrenceFromDate,
  getHabit,
  skipHabitOccurrence,
  softDeleteHabit,
  updateHabit,
} from "../habit-actions";
import { endInheritedPlan } from "../inherited-plan-actions";
import { NOT_YOUR_CLIENT } from "../coach-ownership";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

const OLD = "coach-old";
const NEW = "coach-new";
const STRANGER = "coach-stranger";
const C = "client-swapped";
const C2 = "client-of-new";
const TODAY = "2026-06-15";
const FUTURE = "2026-06-20";
const PAST = "2026-06-10";

const snapshot = {
  name: { en: "Legs", es: "Piernas" },
  exercises: [{ exerciseId: "ex-squat", sets: 3, reps: 5, weightBySetKg: [60, 60, 60] }],
};

function assignment(trainerId: string, scheduledFor: string, extra: Record<string, unknown> = {}) {
  return {
    trainerId,
    clientId: C,
    templateId: "t",
    templateSnapshot: snapshot,
    scheduledFor,
    timezone: "UTC",
    status: "scheduled",
    seriesId: null,
    ...extra,
  };
}

function habit(trainerId: string, extra: Record<string, unknown> = {}) {
  return {
    clientId: C,
    trainerId,
    type: "binary",
    name: { en: "Water", es: "Agua" },
    reminderEnabled: true,
    reminderTime: "09:00",
    scheduleType: "recurring",
    scheduleCadence: "daily",
    startsOn: "2026-01-01",
    ...extra,
  };
}

const signInAs = (uid: string) => mockedGetTokens.mockResolvedValue(tokensFor(uid, ["trainer"]) as never);
const mutationPaths = () => db.writes.map((w) => w.path).sort();

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(`${TODAY}T12:00:00Z`), doNotFake: ["nextTick", "setImmediate"] });
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs(NEW);

  db.seed(`users/${OLD}`, { role: "trainer", displayName: "Old Coach" });
  db.seed(`users/${NEW}`, { role: "trainer", displayName: "New Coach" });
  db.seed(`users/${STRANGER}`, { role: "trainer" });
  db.seed(`users/${C}`, { role: "client", coachId: NEW, displayName: "Swapped", timezone: "UTC" });
  db.seed(`users/${C2}`, { role: "client", coachId: NEW, displayName: "Other", timezone: "UTC" });

  db.seed("workout_assignments/old-future", assignment(OLD, FUTURE));
  db.seed("workout_assignments/old-today", assignment(OLD, TODAY));
  db.seed("workout_assignments/old-past", assignment(OLD, PAST));
  db.seed("workout_assignments/old-logged", assignment(OLD, FUTURE));
  db.seed("workout_assignments/old-started", assignment(OLD, FUTURE, { status: "started" }));
  db.seed("workout_assignments/new-future", assignment(NEW, FUTURE));
  db.seed("workout_assignments/self-future", assignment(C, FUTURE, { selfAssigned: true }));
  db.seed("workout_assignments/other-client", assignment(OLD, FUTURE, { clientId: C2 }));
  db.seed("workout_logs/log-1", { clientId: C, trainerId: OLD, assignment_id: "old-logged", status: "started" });

  db.seed("habits/old-running", habit(OLD));
  db.seed("habits/old-not-started", habit(OLD, { startsOn: "2026-07-01" }));
  db.seed("habits/old-over", habit(OLD, { endsOn: "2026-02-01", reminderEnabled: false }));
  db.seed("habits/new-habit", habit(NEW));
  db.seed("habits/own-habit", habit(C, { clientOwned: true }));
});

afterEach(() => jest.useRealTimers());

describe("the calendar, as the new coach", () => {
  const RANGE = { startCivil: PAST, endCivil: FUTURE, todayCivil: TODAY };

  it("shows a former coach's workouts marked as inherited, and the rest unmarked", async () => {
    const out = await listMonthForClients({ ...RANGE, clientIds: [C] });
    const chips = out.workoutsByDay[FUTURE];
    const byId = Object.fromEntries(chips.map((c) => [c.id, c.inherited]));
    expect(byId).toMatchObject({ "old-future": true, "new-future": false, "self-future": false });
  });

  it("shows a former coach's habits marked too", async () => {
    const out = await listMonthForClients({ ...RANGE, clientIds: [C] });
    const chips = out.habitsByDay[TODAY];
    const byId = Object.fromEntries(chips.map((c) => [c.id.split(":")[0], c.inherited]));
    expect(byId).toMatchObject({ "old-running": true, "new-habit": false, "own-habit": false });
  });

  it("the former coach sees nothing of the client who left", async () => {
    signInAs(OLD);
    const out = await listMonthForClients({ ...RANGE, clientIds: [C] });
    expect(out.workoutsByDay).toEqual({});
    expect(out.habitsByDay).toEqual({});
  });

  it("opens an inherited workout read-only, without crediting the current coach", async () => {
    const detail = await getAssignmentDetail("old-future");
    expect(detail.inherited).toBe(true);
    expect(detail.coachName).toBeNull();
    expect((await getAssignmentDetail("new-future")).inherited).toBe(false);
    expect((await getAssignmentDetail("new-future")).coachName).toBe("New Coach");
  });

  it("the former coach and a stranger still can't open it", async () => {
    signInAs(OLD);
    await expect(getAssignmentDetail("old-future")).rejects.toThrow(NOT_YOUR_CLIENT);
    signInAs(STRANGER);
    await expect(getAssignmentDetail("old-future")).rejects.toThrow("Not your assignment.");
  });
});

describe("inherited work is read-only for the new coach", () => {
  it.each([
    ["moveAssignment", () => moveAssignment({ id: "old-future", newScheduledFor: "2026-06-22", scope: "one" })],
    ["editAssignmentScheduledFor", () => editAssignmentScheduledFor("old-future", { scheduledFor: "2026-06-22" })],
    ["deleteAssignment", () => deleteAssignment("old-future")],
  ])("%s refuses a former coach's workout and writes nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("Not your assignment.");
    expect(db.writes).toEqual([]);
  });

  it.each([
    ["updateHabit", () => updateHabit("old-running", { name: { en: "x", es: "x" } })],
    ["softDeleteHabit", () => softDeleteHabit("old-running")],
    ["deleteHabitRecurrenceFromDate", () => deleteHabitRecurrenceFromDate("old-running", TODAY)],
    ["skipHabitOccurrence", () => skipHabitOccurrence({ habitId: "old-running", civilDate: TODAY })],
  ])("%s refuses a former coach's habit and writes nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("Inherited habit is read-only.");
    expect(db.writes).toEqual([]);
  });

  it("can still read it, flagged, and still manage their own", async () => {
    expect((await getHabit("old-running")).inherited).toBe(true);
    expect((await getHabit("new-habit")).inherited).toBe(false);
    await softDeleteHabit("new-habit");
    expect(mutationPaths()).toContain("habits/new-habit");
  });
});

describe("endInheritedPlan", () => {
  it("deletes the former coach's future work and ends their habits", async () => {
    const out = await endInheritedPlan({ clientId: C });
    expect(out).toEqual({ ok: true, assignmentsDeleted: 2, habitsEnded: 1, habitsDeleted: 1 });

    expect(db.doc("workout_assignments/old-future")).toBeUndefined();
    expect(db.doc("workout_assignments/old-today")).toBeUndefined();

    const ended = db.doc("habits/old-running") as Record<string, unknown>;
    expect(ended.endsOn).toBe("2026-06-14");
    expect(ended.reminderEnabled).toBe(false);
    expect(ended.deleted).toBeUndefined();

    const dropped = db.doc("habits/old-not-started") as Record<string, unknown>;
    expect(dropped.deleted).toBe(true);
    expect(dropped.reminderEnabled).toBe(false);
  });

  it("changes no content of the habits it ends", async () => {
    const before = db.doc("habits/old-running") as Record<string, unknown>;
    await endInheritedPlan({ clientId: C });
    const after = db.doc("habits/old-running") as Record<string, unknown>;
    const { endsOn: _e, reminderEnabled: _r, updatedAt: _u, ...afterContent } = after;
    const { reminderEnabled: _r2, ...beforeContent } = before;
    expect(afterContent).toEqual(beforeContent);
  });

  it("keeps history, logged and started work, and everyone else's", async () => {
    await endInheritedPlan({ clientId: C });
    for (const id of ["old-past", "old-logged", "old-started", "new-future", "self-future", "other-client"]) {
      expect(db.doc(`workout_assignments/${id}`)).toBeDefined();
    }
    const untouched = ["new-habit", "own-habit", "old-over"];
    const before = mutationPaths();
    for (const id of untouched) expect(before).not.toContain(`habits/${id}`);
    expect(before).not.toContain("workout_assignments/new-future");
    expect(before).not.toContain("workout_assignments/self-future");
    expect(before).not.toContain("workout_assignments/other-client");
  });

  it("is idempotent", async () => {
    await endInheritedPlan({ clientId: C });
    expect(await endInheritedPlan({ clientId: C })).toEqual({
      ok: true,
      assignmentsDeleted: 0,
      habitsEnded: 0,
      habitsDeleted: 0,
    });
  });

  it("uses the CLIENT's civil date, not the server's", async () => {
    // 12:00Z on the 15th is already the 16th in Kiritimati (UTC+14).
    db.seed(`users/${C}`, { role: "client", coachId: NEW, timezone: "Pacific/Kiritimati" });
    await endInheritedPlan({ clientId: C });
    expect(db.doc("workout_assignments/old-today")).toBeDefined();
    expect((db.doc("habits/old-running") as Record<string, unknown>).endsOn).toBe("2026-06-15");
  });

  it.each([
    ["the former coach", OLD, C],
    ["a stranger", STRANGER, C],
    ["a missing client", NEW, "nobody"],
    ["the coach on themselves", NEW, NEW],
    ["a blank id", NEW, "  "],
  ])("refuses %s and writes nothing", async (_name, uid, clientId) => {
    signInAs(uid);
    await expect(endInheritedPlan({ clientId })).rejects.toThrow(NOT_YOUR_CLIENT);
    expect(db.writes).toEqual([]);
  });
});

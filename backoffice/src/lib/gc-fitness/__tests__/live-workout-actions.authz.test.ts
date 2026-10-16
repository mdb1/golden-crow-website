// __tests__/live-workout-actions.authz.test.ts
//
// Ownership + status-transition tests for the coach-run live workout
// (live-workout-actions.ts). The file header says it plainly: the Admin SDK
// bypasses firestore.rules, so `ownedAssignment` / `ownedActiveLog` (trainerId
// === session uid) are the real boundary. Every mutating action is driven
// against another coach's doc here and must reject with NOTHING written.
//
// (Issue #169's concurrency/dedupe contract for startWorkoutSession lives in
// live-workout-actions.start-dedupe.test.ts; this suite covers the rest.)

import {
  FakeFirestore,
  FakeTimestamp,
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
  gcFitnessStorage: () => {
    throw new Error("storage must not be touched by these actions");
  },
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { getTokens } from "next-firebase-auth-edge";

import {
  cancelWorkoutSession,
  finalizeWorkoutSession,
  getActiveSessionForAssignment,
  getClientExerciseNote,
  getFutureRecurrenceInfo,
  getPreviousSessionForClient,
  listActiveWorkoutSessionsForTrainer,
  listUpcomingScheduledWorkouts,
  setClientExerciseNote,
  startWorkoutSession,
  syncWorkoutSession,
} from "../live-workout-actions";
import type { SessionSetLog } from "../live-workout-types";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

let db: FakeFirestore;
let warnSpy: jest.SpyInstance;

const NOW = new Date("2026-06-15T12:00:00Z");
const SNAPSHOT = {
  name: { en: "Legs", es: "Piernas" },
  exercises: [
    { exerciseId: "ex-squat", name: { en: "Back squat" }, sets: 2, reps: 5, order: 1 },
    { exerciseId: "ex-pushup", name: { en: "Push-up" }, sets: 1, reps: 10, order: 2 },
  ],
};

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

function set(
  id: string,
  exerciseId: string,
  setIndex: number,
  weightKg: number,
  reps: number,
  extra: Partial<SessionSetLog> = {},
): SessionSetLog {
  return {
    id,
    exerciseId,
    setIndex,
    weightKg,
    reps,
    completedAt: "2026-06-15T11:30:00.000Z",
    isWarmup: false,
    clientLoggedAt: "2026-06-15T11:30:00.000Z",
    ...extra,
  };
}

function seedWorld() {
  db.seed("users/c1", { coachId: "coach-a", displayName: "Ana" });
  db.seed("users/x1", { coachId: "coach-b", displayName: "Xenia" });
  db.seed("exercises/ex-squat", { name: { en: "Back squat" }, equipment: ["barbell"] });
  db.seed("exercises/ex-pushup", {
    name: { en: "Push-up" },
    equipment: ["bodyweight"],
    bodyweightLoadFactor: 0.6,
  });
  db.seed("workout_assignments/asg-a", {
    trainerId: "coach-a",
    clientId: "c1",
    status: "scheduled",
    scheduledFor: "2026-06-15",
    scheduledTime: "14:00",
    seriesId: "S",
    timezone: "UTC",
    templateSnapshot: SNAPSHOT,
  });
  db.seed("workout_assignments/asg-b", {
    trainerId: "coach-b",
    clientId: "x1",
    status: "scheduled",
    scheduledFor: "2026-06-15",
    scheduledTime: "13:00",
    templateSnapshot: { name: { en: "B's workout" }, exercises: [] },
  });
  db.seed("workout_logs/log-a", {
    trainerId: "coach-a",
    clientId: "c1",
    assignment_id: "asg-a",
    status: "active",
    startedAt: FakeTimestamp.fromDate(new Date("2026-06-15T11:00:00Z")),
    templateSnapshot: SNAPSHOT,
    sets: [],
  });
  db.seed("workout_logs/log-b", {
    trainerId: "coach-b",
    clientId: "x1",
    assignment_id: "asg-b",
    status: "active",
    startedAt: FakeTimestamp.fromDate(new Date("2026-06-15T11:10:00Z")),
    templateSnapshot: { name: { en: "B's workout" }, exercises: [] },
    sets: [],
  });
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.setSystemTime(NOW);
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  db.now = NOW.getTime();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  seedWorld();
});

afterEach(() => {
  jest.useRealTimers();
  warnSpy.mockRestore();
});

describe("auth gate (every action is trainer-only)", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["listActive", () => listActiveWorkoutSessionsForTrainer()],
    ["start", () => startWorkoutSession({ assignmentId: "asg-a" })],
    ["getActive", () => getActiveSessionForAssignment("asg-a")],
    ["sync", () => syncWorkoutSession({ logId: "log-a", sets: [] })],
    ["finalize", () => finalizeWorkoutSession({ logId: "log-a", sets: [], mode: "session" })],
    ["cancel", () => cancelWorkoutSession({ logId: "log-a" })],
    ["futureInfo", () => getFutureRecurrenceInfo("asg-a")],
    ["previous", () => getPreviousSessionForClient("c1")],
    ["upcoming", () => listUpcomingScheduledWorkouts()],
    ["getNote", () => getClientExerciseNote({ clientId: "c1", exerciseId: "ex-squat" })],
    ["setNote", () => setClientExerciseNote({ clientId: "c1", exerciseId: "ex-squat", note: "x" })],
  ];

  it.each(calls)("%s rejects a signed-out caller with no reads or writes", async (_n, run) => {
    mockedGetTokens.mockResolvedValue(null as never);
    await expect(run()).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
  });

  it.each(calls)("%s rejects an admin-only (non-trainer) token", async (_n, run) => {
    signInAs("admin-1", ["admin"]);
    await expect(run()).rejects.toThrow("Forbidden");
    expect(db.writes).toEqual([]);
  });
});

describe("startWorkoutSession", () => {
  it("rejects invalid input before any read", async () => {
    await expect(startWorkoutSession({ assignmentId: "" })).rejects.toThrow();
    expect(db.reads).toEqual([]);
  });

  it("rejects another coach's assignment and writes nothing", async () => {
    await expect(startWorkoutSession({ assignmentId: "asg-b" })).rejects.toThrow(
      "Not your assignment.",
    );
    await expect(startWorkoutSession({ assignmentId: "missing" })).rejects.toThrow(
      "Assignment not found.",
    );
    expect(db.writes).toEqual([]);
    expect(db.doc("workout_assignments/asg-b")?.status).toBe("scheduled");
  });

  it("creates the active log with trainerId/clientId from the SERVER docs and marks the assignment started", async () => {
    db.store.delete("workout_logs/log-a");
    const session = await startWorkoutSession({ assignmentId: "asg-a" });

    const logWrite = db.writes.find((w) => w.path.startsWith("workout_logs/"));
    expect(logWrite).toMatchObject({ op: "set", via: "transaction" });
    expect(logWrite?.data).toEqual({
      clientId: "c1",
      trainerId: "coach-a",
      source: "coach",
      assignment_id: "asg-a",
      templateSnapshot: SNAPSHOT,
      status: "active",
      sets: [],
      prs: [],
      startedAt: { __fv: "serverTimestamp" },
      createdAt: { __fv: "serverTimestamp" },
      updatedAt: { __fv: "serverTimestamp" },
    });
    expect(db.writes.find((w) => w.path === "workout_assignments/asg-a")).toEqual({
      op: "update",
      path: "workout_assignments/asg-a",
      via: "transaction",
      data: { status: "started", updatedAt: { __fv: "serverTimestamp" } },
    });
    expect(session).toMatchObject({
      assignmentId: "asg-a",
      clientId: "c1",
      trainerId: "coach-a",
      status: "active",
      scheduledTime: "14:00",
      seriesId: "S",
      startedAt: NOW.toISOString(),
    });
    expect(session.exercises.map((e) => e.exerciseId)).toEqual(["ex-squat", "ex-pushup"]);
  });

  it("an already-started assignment is not re-marked; an existing active log is reused", async () => {
    db.seed("workout_assignments/asg-a", {
      ...db.doc("workout_assignments/asg-a"),
      status: "started",
    });
    const session = await startWorkoutSession({ assignmentId: "asg-a" });
    expect(session.logId).toBe("log-a");
    expect(db.writes).toEqual([]);
  });
});

describe("getActiveSessionForAssignment", () => {
  it("rejects another coach's assignment", async () => {
    await expect(getActiveSessionForAssignment("asg-b")).rejects.toThrow("Not your assignment.");
    expect(db.queries).toEqual([]);
  });

  it("returns the active log, or null when none", async () => {
    await expect(getActiveSessionForAssignment("asg-a")).resolves.toMatchObject({
      logId: "log-a",
      workoutName: { en: "Legs", es: "Piernas" },
    });
    db.store.delete("workout_logs/log-a");
    await expect(getActiveSessionForAssignment("asg-a")).resolves.toBeNull();
  });
});

describe("syncWorkoutSession", () => {
  it("rejects another coach's log and writes nothing", async () => {
    await expect(
      syncWorkoutSession({ logId: "log-b", sets: [set("s1", "ex", 0, 1, 1)] }),
    ).rejects.toThrow("Not your session.");
    await expect(syncWorkoutSession({ logId: "nope", sets: [] })).rejects.toThrow(
      "Session not found.",
    );
    expect(db.writes).toEqual([]);
    expect(db.doc("workout_logs/log-b")?.sets).toEqual([]);
  });

  it("rejects a non-active (finalized) log", async () => {
    db.seed("workout_logs/log-a", { ...db.doc("workout_logs/log-a"), status: "completed" });
    await expect(syncWorkoutSession({ logId: "log-a", sets: [] })).rejects.toThrow(
      "Session already finalized.",
    );
    expect(db.writes).toEqual([]);
  });

  it("rejects malformed sets before any read", async () => {
    await expect(
      syncWorkoutSession({ logId: "log-a", sets: [set("s1", "ex", 0, -5, 1)] }),
    ).rejects.toThrow();
    await expect(
      syncWorkoutSession({ logId: "log-a", sets: [{ ...set("s1", "ex", 0, 1, 1), completedAt: "nope" }] }),
    ).rejects.toThrow();
    expect(db.reads).toEqual([]);
  });

  it("writes the snake_case wire sets with the warmup invariant", async () => {
    await syncWorkoutSession({
      logId: "log-a",
      sets: [
        set("s1", "ex-squat", 0, 60, 5, { setType: "warmup", isWarmup: false }),
        set("s2", "ex-squat", 1, 100, 5, { setType: "normal", isWarmup: true }),
      ],
    });
    expect(db.writes).toEqual([
      {
        op: "update",
        path: "workout_logs/log-a",
        via: "direct",
        data: {
          sets: [
            {
              id: "s1", exerciseId: "ex-squat", set_index: 0, weight_kg: 60, reps: 5,
              completed_at: new Date("2026-06-15T11:30:00.000Z"),
              is_warmup: true, set_type: "warmup",
              client_logged_at: new Date("2026-06-15T11:30:00.000Z"),
            },
            {
              id: "s2", exerciseId: "ex-squat", set_index: 1, weight_kg: 100, reps: 5,
              completed_at: new Date("2026-06-15T11:30:00.000Z"),
              is_warmup: true,
              client_logged_at: new Date("2026-06-15T11:30:00.000Z"),
            },
          ],
          updatedAt: { __fv: "serverTimestamp" },
        },
      },
    ]);
  });
});

describe("finalizeWorkoutSession", () => {
  it("rejects another coach's log and writes nothing", async () => {
    await expect(
      finalizeWorkoutSession({ logId: "log-b", sets: [], mode: "session" }),
    ).rejects.toThrow("Not your session.");
    expect(db.writes).toEqual([]);
    expect(db.doc("workout_assignments/asg-b")?.status).toBe("scheduled");
  });

  it("is a no-op on an already-completed log", async () => {
    db.seed("workout_logs/log-a", { ...db.doc("workout_logs/log-a"), status: "completed" });
    await expect(
      finalizeWorkoutSession({ logId: "log-a", sets: [set("s", "ex-squat", 0, 1, 1)], mode: "session" }),
    ).resolves.toEqual({ logId: "log-a", futureUpdated: 0 });
    expect(db.writes).toEqual([]);
  });

  it("rejects an invalid rpe before any read", async () => {
    await expect(
      finalizeWorkoutSession({ logId: "log-a", sets: [], rpe: 11, mode: "session" }),
    ).rejects.toThrow();
    expect(db.reads).toEqual([]);
  });

  it("completes the log (body-weight stamped volume, duration, rpe, notes) and the assignment", async () => {
    db.seed("users/c1/body_weight_logs/w1", { valueKg: 80, recordedAt: new Date("2026-06-01") });
    const out = await finalizeWorkoutSession({
      logId: "log-a",
      sets: [set("s1", "ex-squat", 0, 100, 5), set("s2", "ex-pushup", 0, 0, 10)],
      rpe: 8,
      notes: "  strong day  ",
      mode: "session",
    });
    expect(out).toEqual({ logId: "log-a", futureUpdated: 0 });

    const logWrite = db.writes.find((w) => w.path === "workout_logs/log-a");
    expect(logWrite?.data).toMatchObject({
      status: "completed",
      total_volume_kg: 500 + 80 * 0.6 * 10,
      duration_seconds: 3600,
      rpe: 8,
      notes: "strong day",
      completedAt: { __fv: "serverTimestamp" },
    });
    const wireSets = logWrite?.data?.sets as Array<Record<string, unknown>>;
    expect(wireSets[1]).toMatchObject({ bodyweight_kg: 80, bodyweight_factor: 0.6 });
    expect(wireSets[0]).not.toHaveProperty("bodyweight_kg");

    expect(db.writes.find((w) => w.path === "workout_assignments/asg-a")?.data).toEqual({
      status: "completed",
      updatedAt: { __fv: "serverTimestamp" },
    });
  });

  it("session_and_future rewrites ONLY this coach's future scheduled occurrences for the same client", async () => {
    const base = { seriesId: "S", templateSnapshot: { name: { en: "Legs" }, exercises: [] } };
    db.seed("workout_assignments/f-own", { ...base, trainerId: "coach-a", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-22" });
    db.seed("workout_assignments/f-past", { ...base, trainerId: "coach-a", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-14" });
    db.seed("workout_assignments/f-done", { ...base, trainerId: "coach-a", clientId: "c1", status: "completed", scheduledFor: "2026-06-29" });
    db.seed("workout_assignments/f-other-client", { ...base, trainerId: "coach-a", clientId: "c2", status: "scheduled", scheduledFor: "2026-06-22" });
    db.seed("workout_assignments/f-foreign", { ...base, trainerId: "coach-b", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-22" });

    const out = await finalizeWorkoutSession({
      logId: "log-a",
      sets: [set("s1", "ex-squat", 0, 100, 5)],
      mode: "session_and_future",
      editedExercises: [
        { exerciseId: "ex-squat", sets: 4, reps: 6, restSeconds: 90, order: 1, setTypesBySet: ["normal", "normal", "normal", "normal"] },
      ],
    });
    expect(out.futureUpdated).toBe(1);
    const batchWrites = db.writes.filter((w) => w.via === "batch");
    expect(batchWrites.map((w) => w.path)).toEqual(["workout_assignments/f-own"]);
    expect(batchWrites[0].data).toEqual({
      templateSnapshot: {
        name: { en: "Legs" },
        exercises: [
          {
            exerciseId: "ex-squat", sets: 4, reps: 6, restSeconds: 90, notes: null, order: 1,
            name: { en: "Back squat", es: undefined }, license: null,
          },
        ],
      },
      updatedAt: { __fv: "serverTimestamp" },
      prescriptionUpdatedAt: { __fv: "serverTimestamp" },
    });
    expect(db.doc("workout_assignments/f-foreign")?.templateSnapshot).toEqual(base.templateSnapshot);
  });

  // finalize re-checks the assignment named by the log's `assignment_id`
  // (like cancelWorkoutSession) BEFORE any write: a log owned by coach-a whose
  // assignment_id names coach-b's assignment must not flip it to completed.
  it("does not complete an assignment owned by another coach, writing nothing", async () => {
    db.seed("workout_logs/log-a", { ...db.doc("workout_logs/log-a"), assignment_id: "asg-b" });
    const logBefore = db.doc("workout_logs/log-a");
    await expect(
      finalizeWorkoutSession({ logId: "log-a", sets: [set("s1", "ex-squat", 0, 100, 5)], mode: "session" }),
    ).rejects.toThrow("Not your assignment.");
    expect(db.writes).toEqual([]);
    expect(db.doc("workout_assignments/asg-b")?.status).toBe("scheduled");
    expect(db.doc("workout_logs/log-a")).toEqual(logBefore);
  });

  it("still finalizes when the log's assignment was deleted mid-session", async () => {
    db.seed("workout_logs/log-a", { ...db.doc("workout_logs/log-a"), assignment_id: "asg-gone" });
    await expect(
      finalizeWorkoutSession({ logId: "log-a", sets: [set("s1", "ex-squat", 0, 100, 5)], mode: "session" }),
    ).resolves.toEqual({ logId: "log-a", futureUpdated: 0 });
    expect(db.doc("workout_logs/log-a")?.status).toBe("completed");
  });
});

describe("cancelWorkoutSession", () => {
  it("rejects another coach's log, a finalized log, a missing / foreign assignment — writing nothing", async () => {
    await expect(cancelWorkoutSession({ logId: "log-b" })).rejects.toThrow("Not your session.");

    db.seed("workout_logs/done", { trainerId: "coach-a", assignment_id: "asg-a", status: "completed" });
    await expect(cancelWorkoutSession({ logId: "done" })).rejects.toThrow("Session already finalized.");

    db.seed("workout_logs/no-asg", { trainerId: "coach-a", status: "active" });
    await expect(cancelWorkoutSession({ logId: "no-asg" })).rejects.toThrow("Assignment not found.");

    db.seed("workout_logs/gone", { trainerId: "coach-a", assignment_id: "deleted", status: "active" });
    await expect(cancelWorkoutSession({ logId: "gone" })).rejects.toThrow("Assignment not found.");

    db.seed("workout_logs/cross", { trainerId: "coach-a", assignment_id: "asg-b", status: "active" });
    await expect(cancelWorkoutSession({ logId: "cross" })).rejects.toThrow("Not your assignment.");

    await expect(cancelWorkoutSession({ logId: "" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("abandons the log and returns the assignment to scheduled, atomically", async () => {
    await expect(cancelWorkoutSession({ logId: "log-a" })).resolves.toEqual({ logId: "log-a" });
    expect(db.writes).toEqual([
      { op: "update", path: "workout_logs/log-a", via: "transaction", data: { status: "abandoned", updatedAt: { __fv: "serverTimestamp" } } },
      { op: "update", path: "workout_assignments/asg-a", via: "transaction", data: { status: "scheduled", updatedAt: { __fv: "serverTimestamp" } } },
    ]);
  });
});

describe("getFutureRecurrenceInfo", () => {
  it("returns zero for another coach's / missing / non-series assignment", async () => {
    await expect(getFutureRecurrenceInfo("asg-b")).resolves.toEqual({ count: 0, nextDates: [] });
    await expect(getFutureRecurrenceInfo("missing")).resolves.toEqual({ count: 0, nextDates: [] });
    db.seed("workout_assignments/one-off", { trainerId: "coach-a", clientId: "c1" });
    await expect(getFutureRecurrenceInfo("one-off")).resolves.toEqual({ count: 0, nextDates: [] });
    expect(db.queries).toEqual([]);
  });

  it("counts only own, same-client, scheduled, strictly-future occurrences", async () => {
    const base = { seriesId: "S", trainerId: "coach-a", clientId: "c1", status: "scheduled" };
    for (const d of ["2026-06-30", "2026-06-16", "2026-06-23", "2026-07-07"]) {
      db.seed(`workout_assignments/f-${d}`, { ...base, scheduledFor: d });
    }
    db.seed("workout_assignments/past", { ...base, scheduledFor: "2026-06-01" });
    db.seed("workout_assignments/foreign", { ...base, trainerId: "coach-b", scheduledFor: "2026-06-17" });
    db.seed("workout_assignments/other-client", { ...base, clientId: "c2", scheduledFor: "2026-06-17" });
    db.seed("workout_assignments/missed", { ...base, status: "missed", scheduledFor: "2026-06-17" });
    await expect(getFutureRecurrenceInfo("asg-a")).resolves.toEqual({
      count: 4,
      nextDates: ["2026-06-16", "2026-06-23", "2026-06-30"],
    });
  });
});

describe("getPreviousSessionForClient", () => {
  it("only uses the caller's own logs (another coach's log for the same client is ignored)", async () => {
    const snap = { exercises: [{ exerciseId: "ex-squat", name: { en: "Back Squat" } }] };
    db.seed("workout_logs/old-own", {
      clientId: "c1", trainerId: "coach-a", status: "completed",
      startedAt: new Date("2026-06-01T10:00:00Z"), templateSnapshot: snap,
      sets: [
        { exerciseId: "ex-squat", weight_kg: 50, reps: 5, is_warmup: true },
        { exerciseId: "ex-squat", weight_kg: 90, reps: 5 },
        { exerciseId: "ex-squat", weight_kg: 95, reps: 3 },
      ],
    });
    db.seed("workout_logs/newer-foreign", {
      clientId: "c1", trainerId: "coach-b", status: "completed",
      startedAt: new Date("2026-06-10T10:00:00Z"), templateSnapshot: snap,
      sets: [{ exerciseId: "ex-squat", weight_kg: 200, reps: 1 }],
    });
    const map = await getPreviousSessionForClient("c1");
    expect(map["ex-squat"]).toEqual({
      weightKg: 95,
      reps: 3,
      durationSeconds: null,
      lastLoggedAt: new Date("2026-06-01T10:00:00Z").toISOString(),
    });
    expect(Object.keys(map)).toHaveLength(2); // id + identity key
    expect(JSON.stringify(map)).not.toContain("200");
  });

  it("returns an empty map for another coach's client", async () => {
    db.seed("workout_logs/x", {
      clientId: "x1", trainerId: "coach-b", status: "completed",
      startedAt: new Date(), sets: [{ exerciseId: "e", weight_kg: 1, reps: 1 }],
    });
    await expect(getPreviousSessionForClient("x1")).resolves.toEqual({});
  });
});

describe("listUpcomingScheduledWorkouts", () => {
  it("returns only the caller's timed, scheduled/started workouts in the window", async () => {
    // asg-a: coach-a 14:00 today → in. asg-b: coach-b 13:00 → out (in-memory filter).
    db.seed("workout_assignments/untimed", { trainerId: "coach-a", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-15" });
    db.seed("workout_assignments/completed", { trainerId: "coach-a", clientId: "c1", status: "completed", scheduledFor: "2026-06-15", scheduledTime: "15:00" });
    db.seed("workout_assignments/tomorrow-late", { trainerId: "coach-a", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-16", scheduledTime: "20:00" });
    db.seed("workout_assignments/tomorrow-early", { trainerId: "coach-a", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-16", scheduledTime: "06:00" });
    db.seed("workout_assignments/yesterday", { trainerId: "coach-a", clientId: "c1", status: "scheduled", scheduledFor: "2026-06-14", scheduledTime: "23:00" });
    db.seed("workout_assignments/started-today", { trainerId: "coach-a", clientId: "c1", status: "started", scheduledFor: "2026-06-15", scheduledTime: "09:00", meetingNotes: "gym 2" });

    const rows = await listUpcomingScheduledWorkouts();
    // tomorrow 06:00 is past the 12 h window; yesterday is in the past; today's
    // rows stay regardless of the window.
    expect(rows.map((r) => r.assignmentId)).toEqual(["started-today", "asg-a"]);
    expect(rows[0].meetingNotes).toBe("gym 2");
    expect(rows[1]).toEqual({
      assignmentId: "asg-a",
      clientId: "c1",
      clientName: "Ana",
      workoutName: "Legs",
      scheduledFor: "2026-06-15",
      isToday: true,
      scheduledTime: "14:00",
      scheduledEpochMs: Date.parse("2026-06-15T14:00:00Z"),
      meetingNotes: null,
    });
    const blob = JSON.stringify(rows);
    expect(blob).not.toContain("Xenia");
    expect(blob).not.toContain("x1");
    // The read itself is NOT trainer-scoped (index-free range on scheduledFor) — the
    // RESULT is. Pinned so a future "optimization" that drops the in-memory filter fails.
    expect(db.queries[0].filters.map((f) => f.field)).toEqual(["scheduledFor", "scheduledFor"]);
    // Only the caller's clients' user docs are resolved for names.
    expect(db.reads.filter((p) => p.startsWith("users/"))).toEqual(["users/c1"]);
  });

  it("returns [] when the caller has nothing upcoming even though others do", async () => {
    db.store.delete("workout_assignments/asg-a");
    await expect(listUpcomingScheduledWorkouts()).resolves.toEqual([]);
  });
});

describe("listActiveWorkoutSessionsForTrainer", () => {
  it("summarizes only the caller's active sessions", async () => {
    const rows = await listActiveWorkoutSessionsForTrainer();
    expect(rows).toEqual([
      expect.objectContaining({
        logId: "log-a",
        assignmentId: "asg-a",
        clientId: "c1",
        clientName: "Ana",
        workoutName: "Legs",
        // the summary walks exercises until the first incomplete one
        totalSets: 2,
        completedSets: 0,
        currentExerciseName: "Back squat",
        elapsedSeconds: 3600,
      }),
    ]);
    expect(db.queries[0].filters).toEqual([
      { field: "trainerId", op: "==", value: "coach-a" },
      { field: "status", op: "==", value: "active" },
    ]);
  });

  it("index-failure FALLBACK reads every coach's active logs but still returns only the caller's", async () => {
    db.failQueryWhen(
      (q) => q.collection === "workout_logs" && q.filters.some((f) => f.field === "trainerId"),
    );
    // Another coach's active log that points at the CALLER's assignment (e.g. a
    // transferred client): only the log's own trainerId keeps it out.
    db.seed("workout_logs/log-b-on-a", {
      trainerId: "coach-b", clientId: "c1", assignment_id: "asg-a", status: "active",
      startedAt: FakeTimestamp.fromDate(new Date("2026-06-15T11:55:00Z")), sets: [],
    });
    const rows = await listActiveWorkoutSessionsForTrainer();
    expect(db.queries[1].filters).toEqual([{ field: "status", op: "==", value: "active" }]);
    expect(rows.map((r) => r.logId)).toEqual(["log-a"]);
    expect(JSON.stringify(rows)).not.toContain("Xenia");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("skips an own-tagged log whose assignment is another coach's or gone; dedupes per assignment (freshest wins)", async () => {
    db.seed("workout_logs/cross", { trainerId: "coach-a", clientId: "x1", assignment_id: "asg-b", status: "active", sets: [] });
    db.seed("workout_logs/orphan", { trainerId: "coach-a", clientId: "c1", assignment_id: "gone", status: "active", sets: [] });
    db.seed("workout_logs/no-asg", { trainerId: "coach-a", clientId: "c1", status: "active", sets: [] });
    db.seed("workout_logs/log-a2", {
      ...db.doc("workout_logs/log-a"),
      startedAt: FakeTimestamp.fromDate(new Date("2026-06-15T11:50:00Z")),
      sets: [{ id: "s", exerciseId: "ex-squat", set_index: 0, weight_kg: 1, reps: 1 }],
    });
    const rows = await listActiveWorkoutSessionsForTrainer();
    expect(rows.map((r) => r.logId)).toEqual(["log-a2"]);
    expect(rows[0]).toMatchObject({ completedSets: 1, currentSet: 2 });
  });
});

describe("client exercise notes", () => {
  it("reads only the caller-prefixed note doc", async () => {
    db.seed("client_exercise_notes/coach-b_c1_ex-squat", { note: "B's private note" });
    await expect(getClientExerciseNote({ clientId: "c1", exerciseId: "ex-squat" })).resolves.toEqual({ note: "" });
    db.seed("client_exercise_notes/coach-a_c1_ex-squat", { note: "keep knees out" });
    await expect(getClientExerciseNote({ clientId: "c1", exerciseId: "ex-squat" })).resolves.toEqual({ note: "keep knees out" });
    expect(db.reads.every((p) => p === "client_exercise_notes/coach-a_c1_ex-squat")).toBe(true);
  });

  it("rejects invalid input before any write", async () => {
    await expect(
      setClientExerciseNote({ clientId: "c1", exerciseId: "ex", note: "x".repeat(1001) }),
    ).rejects.toThrow();
    await expect(getClientExerciseNote({ clientId: "", exerciseId: "ex" })).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("writes under the caller's own doc id with trainerId from the session; empty clears", async () => {
    await expect(
      setClientExerciseNote({ clientId: "c1", exerciseId: "ex-squat", note: "  brace  " }),
    ).resolves.toEqual({ note: "brace" });
    expect(db.writes).toEqual([
      {
        op: "set",
        path: "client_exercise_notes/coach-a_c1_ex-squat",
        merge: true,
        via: "direct",
        data: {
          trainerId: "coach-a",
          clientId: "c1",
          exerciseId: "ex-squat",
          note: "brace",
          updatedAt: { __fv: "serverTimestamp" },
          createdAt: { __fv: "serverTimestamp" },
        },
      },
    ]);
    await expect(
      setClientExerciseNote({ clientId: "c1", exerciseId: "ex-squat", note: "   " }),
    ).resolves.toEqual({ note: "" });
    expect(db.writes[1]).toEqual({ op: "delete", path: "client_exercise_notes/coach-a_c1_ex-squat", via: "direct" });
  });

  // setClientExerciseNote requires the client be on the caller's roster:
  // firestore.rules (/client_exercise_notes) let the CLIENT named in
  // `clientId` read the note, so a coach must not plant one on another coach's
  // client (nor clear one — the empty-note delete path is gated too).
  it("rejects a note about a client outside the caller's roster, writing nothing", async () => {
    await expect(
      setClientExerciseNote({ clientId: "x1", exerciseId: "ex-squat", note: "hi from coach A" }),
    ).rejects.toThrow("Client is not in your roster.");
    await expect(
      setClientExerciseNote({ clientId: "x1", exerciseId: "ex-squat", note: "  " }),
    ).rejects.toThrow("Client is not in your roster.");
    await expect(
      setClientExerciseNote({ clientId: "ghost", exerciseId: "ex-squat", note: "hi" }),
    ).rejects.toThrow("Client is not in your roster.");
    expect(db.writes).toEqual([]);
  });
});

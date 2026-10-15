// __tests__/exercise-progress-actions.test.ts
//
// Per-client exercise progress (backlog C4 / #480 / #568 / #574 / #581).
// Read-only, but it returns a client's full logged history — the ownership
// gate is the only thing standing between a coach and another coach's client:
//   - getClientExerciseProgress: trainer gate + `users/{clientId}.coachId ===
//     session uid`; a foreign/missing client gets the EMPTY payload and the
//     workout_logs collection is never queried.
//   - getClientExerciseProgressAsAdmin: ADMIN gate (a trainer token is
//     rejected) + adminCanViewClientUnderCoach.

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

import { getTokens } from "next-firebase-auth-edge";

import {
  getClientExerciseProgress,
  getClientExerciseProgressAsAdmin,
} from "../exercise-progress-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

let db: FakeFirestore;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

function benchLog(id: string, clientId: string, trainerId: string, startedAt: string, sets: unknown[], prs: unknown[] = []) {
  db.seed(`workout_logs/${id}`, {
    clientId,
    trainerId,
    status: "completed",
    startedAt: new Date(startedAt),
    templateSnapshot: {
      exercises: [
        { exerciseId: "ex-bench", name: { en: "Bench press", es: "Press de banca" } },
        { exerciseId: "ex-plank", name: { en: "Plank", es: "Plancha" } },
      ],
    },
    sets,
    prs,
  });
}

const EMPTY = {
  exercises: [],
  points: [],
  muscleGroupWeeks: [],
  availableMuscleGroups: [],
  exerciseSetSessions: [],
  truncatedSetHistoryExerciseIds: [],
  currentWeekStart: "2026-06-15",
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.setSystemTime(new Date("2026-06-15T12:00:00Z")); // a Monday
  setGcFitnessAuthEnv();
  db = new FakeFirestore();
  mockDb.current = db;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);

  db.seed("users/c1", { coachId: "coach-a", role: "client" });
  db.seed("users/x1", { coachId: "coach-b", role: "client" });
  db.seed("exercises/ex-bench", {
    name: { en: "Bench press", es: "Press de banca" },
    muscleGroups: ["chest"],
    primaryMuscleGroup: "chest",
    secondaryMuscles: ["triceps"],
  });

  benchLog(
    "L1",
    "c1",
    "coach-a",
    "2026-06-10T15:00:00Z",
    [
      { id: "w0", exerciseId: "ex-bench", set_index: 0, weight_kg: 40, reps: 5, set_type: "warmup", is_warmup: true, completed_at: new Date() },
      { id: "s2", exerciseId: "ex-bench", set_index: 2, weight_kg: 70, reps: 8, completed_at: new Date() },
      { id: "s1", exerciseId: "ex-bench", set_index: 1, weight_kg: 60, reps: 10, completed_at: new Date() },
      { id: "nd", exerciseId: "ex-bench", set_index: 3, weight_kg: 999, reps: 1 }, // never completed
      { id: "p1", exerciseId: "ex-plank", set_index: 0, weight_kg: 0, reps: 0, duration_seconds: 60, completed_at: new Date() },
    ],
    [{ setLogId: "s2" }],
  );
  benchLog("L2", "c1", "coach-a", "2026-06-03T15:00:00Z", [
    { id: "a", exerciseId: "ex-bench", set_index: 0, weight_kg: 65, reps: 5, completed_at: new Date() },
  ]);
  // Another coach's client, same exercise: must never surface.
  benchLog("X1", "x1", "coach-b", "2026-06-11T15:00:00Z", [
    { id: "x", exerciseId: "ex-bench", set_index: 0, weight_kg: 500, reps: 1, completed_at: new Date() },
  ]);
  db.seed("workout_assignments/future", {
    clientId: "c1",
    trainerId: "coach-a",
    scheduledFor: "2026-06-17",
    status: "scheduled",
    templateSnapshot: { exercises: [{ exerciseId: "ex-bench", sets: 3, reps: 8 }] },
  });
});

afterEach(() => jest.useRealTimers());

describe("getClientExerciseProgress (trainer)", () => {
  it("rejects signed-out and admin-only callers", async () => {
    mockedGetTokens.mockResolvedValue(null as never);
    await expect(getClientExerciseProgress("c1", "UTC")).rejects.toThrow("Forbidden");
    signInAs("admin-1", ["admin"]);
    await expect(getClientExerciseProgress("c1", "UTC")).rejects.toThrow("Forbidden");
    expect(db.queries).toEqual([]);
  });

  it("returns the EMPTY payload for another coach's client and never queries their logs", async () => {
    const out = await getClientExerciseProgress("x1", "UTC");
    expect(out).toEqual({ clientId: "x1", ...EMPTY });
    expect(db.queries).toEqual([]);
    expect(db.reads).toEqual(["users/x1"]);
  });

  it("returns the EMPTY payload for a client doc that does not exist", async () => {
    await expect(getClientExerciseProgress("ghost", "UTC")).resolves.toEqual({
      clientId: "ghost",
      ...EMPTY,
    });
    expect(db.queries).toEqual([]);
  });

  it("aggregates only the owned client's logs into picker / points / set breakdown", async () => {
    const out = await getClientExerciseProgress("c1", "UTC");

    expect(db.queries[0]).toMatchObject({
      collection: "workout_logs",
      filters: [
        { field: "clientId", op: "==", value: "c1" },
        { field: "startedAt", op: ">=", value: expect.any(Date) },
      ],
      limit: 300,
    });

    // Plank is bodyweight-only → not chartable → not in the picker.
    expect(out.exercises).toEqual([
      {
        exerciseId: "ex-bench",
        name: "Press de banca",
        searchAliases: ["Bench press"],
        sessionCount: 2,
        muscleGroups: ["chest"],
      },
    ]);
    expect(out.points).toEqual([
      // newest first; every set type counts (#565) — the uncompleted 999 kg set never does
      { exerciseId: "ex-bench", date: "2026-06-10", topSetWeightKg: 70, estimatedOneRmKg: 88.7, volumeKg: 1360 },
      { exerciseId: "ex-bench", date: "2026-06-03", topSetWeightKg: 65, estimatedOneRmKg: 75.8, volumeKg: 325 },
    ]);
    expect(out.exerciseSetSessions[0]).toEqual({
      exerciseId: "ex-bench",
      date: "2026-06-10",
      logId: "L1",
      sets: [
        { setIndex: 0, weightKg: 40, reps: 5, setType: "warmup" },
        { setIndex: 1, weightKg: 60, reps: 10 },
        { setIndex: 2, weightKg: 70, reps: 8, isPR: true },
      ],
    });
    expect(out.truncatedSetHistoryExerciseIds).toEqual([]);
    expect(out.currentWeekStart).toBe("2026-06-15");
    expect(out.availableMuscleGroups.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toContain("500");
  });

  it("caps the per-exercise set breakdown at 30 sessions and flags it truncated", async () => {
    for (let i = 0; i < 31; i += 1) {
      const day = new Date(Date.UTC(2026, 4, 1 + i, 10));
      benchLog(`T${i}`, "c1", "coach-a", day.toISOString(), [
        { id: `t${i}`, exerciseId: "ex-bench", set_index: 0, weight_kg: 50, reps: 5, completed_at: day },
      ]);
    }
    const out = await getClientExerciseProgress("c1", "UTC");
    expect(out.exerciseSetSessions).toHaveLength(30);
    expect(out.truncatedSetHistoryExerciseIds).toEqual(["ex-bench"]);
  });
});

describe("getClientExerciseProgressAsAdmin", () => {
  it("rejects a trainer (non-admin) token", async () => {
    await expect(getClientExerciseProgressAsAdmin("coach-a", "c1", "UTC")).rejects.toThrow("Forbidden");
    expect(db.queries).toEqual([]);
  });

  it("returns EMPTY when the client is not under the coach in the URL", async () => {
    signInAs("admin-1", ["admin"]);
    const out = await getClientExerciseProgressAsAdmin("coach-b", "c1", "UTC");
    expect(out).toEqual({ clientId: "c1", ...EMPTY });
    expect(db.queries).toEqual([]);
  });

  it("returns EMPTY for a missing client doc", async () => {
    signInAs("admin-1", ["admin"]);
    await expect(getClientExerciseProgressAsAdmin("coach-a", "ghost", "UTC")).resolves.toEqual({
      clientId: "ghost",
      ...EMPTY,
    });
  });

  it("returns the same aggregation for the coach of record", async () => {
    signInAs("admin-1", ["admin"]);
    const out = await getClientExerciseProgressAsAdmin("coach-a", "c1", "UTC");
    expect(out.exercises.map((e) => e.exerciseId)).toEqual(["ex-bench"]);
    expect(out.points).toHaveLength(2);
  });
});

// client-week-muscle-actions.test.ts — the coach agenda's weekly muscle
// heatmap. Read-only, but it reads a client's scheduled assignments through
// the Admin SDK, so the `users/{id}.coachId === uid` check is the only thing
// keeping a coach out of another coach's client's plan.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
const mockCivilDateToday = jest.fn((_tz: string) => "2026-10-15");
jest.mock("@/lib/gc-fitness/civil-date", () => ({
  ...jest.requireActual("@/lib/gc-fitness/civil-date"),
  civilDateToday: (tz: string) => mockCivilDateToday(tz),
}));

import { fake } from "@/lib/test-utils/fake-firestore-cov-a";

import { getClientWeekMuscleMap } from "../client-week-muscle-actions";

const COACH = "coach-A";
const OTHER = "coach-B";

beforeEach(() => {
  fake.reset();
  mockCivilDateToday.mockClear();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH, timezone: "America/Argentina/Buenos_Aires" },
    "users/client-2": { role: "client", coachId: OTHER },
    "users/client-utc": { role: "client", coachId: COACH, timezone: "" },
    "exercises/bench": { muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest", secondaryMuscles: ["triceps"] },
    "exercises/curl": { muscleGroups: "bad", primaryMuscleGroup: 5, secondaryMuscles: null },
    "workout_assignments/a1": {
      clientId: "client-1",
      scheduledFor: "2026-10-13",
      templateSnapshot: {
        exercises: [
          { exerciseId: "bench", sets: 3, setTypesBySet: ["warmup", "normal", "normal"] },
          { exerciseId: "curl", sets: 1, repsBySet: [10, 10] },
          { exerciseId: "__standard__", sets: 2 },
          { exerciseId: "", sets: 9 },
          { sets: 4 },
          { exerciseId: "missing", sets: 1 },
        ],
      },
    },
    "workout_assignments/a2": {
      clientId: "client-1",
      scheduledFor: "2026-10-18",
      templateSnapshot: { exercises: [{ exerciseId: "bench", sets: 2 }] },
    },
    "workout_assignments/a-no-snapshot": { clientId: "client-1", scheduledFor: "2026-10-14" },
    "workout_assignments/a-next-week": {
      clientId: "client-1",
      scheduledFor: "2026-10-19",
      templateSnapshot: { exercises: [{ exerciseId: "bench", sets: 50 }] },
    },
    "workout_assignments/a-foreign": {
      clientId: "client-2",
      scheduledFor: "2026-10-13",
      templateSnapshot: { exercises: [{ exerciseId: "bench", sets: 50 }] },
    },
  });
});

it("rejects a non-trainer before any read", async () => {
  mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
  await expect(getClientWeekMuscleMap({ clientId: "client-1" })).rejects.toThrow("Forbidden");
  expect(fake.db.reads).toEqual([]);
});

it("rejects another coach's client without reading assignments", async () => {
  await expect(getClientWeekMuscleMap({ clientId: "client-2" })).rejects.toThrow("Forbidden");
  expect(fake.db.queries).toEqual([]);
  expect(fake.db.reads).toEqual(["users/client-2"]);
});

it("a missing client is 'Not found'", async () => {
  await expect(getClientWeekMuscleMap({ clientId: "ghost" })).rejects.toThrow("Not found");
  expect(fake.db.queries).toEqual([]);
});

it("queries the client's Monday→Sunday calendar week and counts planned non-warmup slots", async () => {
  const res = await getClientWeekMuscleMap({ clientId: "client-1", anchorCivil: "2026-10-15" });
  expect(res.weekStartCivil).toBe("2026-10-12");
  expect(res.weekEndCivil).toBe("2026-10-18");
  expect(fake.db.queries).toEqual([
    {
      path: "workout_assignments",
      filters: [
        ["clientId", "==", "client-1"],
        ["scheduledFor", ">=", "2026-10-12"],
        ["scheduledFor", "<=", "2026-10-18"],
      ],
      orders: [],
      limit: null,
    },
  ]);
  // bench 3 (1 warmup) + curl 2 slots (repsBySet wins over sets) + standard 2
  // + missing 1 + bench 2 = 10 slots, 1 warmup → 9.
  expect(res.totalSets).toBe(9);
  // Reserved `__standard__` ids are never passed to .doc().
  expect(fake.db.reads.filter((p) => p.startsWith("exercises/")).sort()).toEqual([
    "exercises/bench",
    "exercises/curl",
    "exercises/missing",
  ]);
  expect(res.heatmap.maxSets).toBeGreaterThan(0);
  expect(res.insight).toBeDefined();
  expect(mockCivilDateToday).not.toHaveBeenCalled();
});

it("a Sunday anchor belongs to the week that started the previous Monday", async () => {
  const res = await getClientWeekMuscleMap({ clientId: "client-1", anchorCivil: "2026-10-18" });
  expect(res.weekStartCivil).toBe("2026-10-12");
});

it("an invalid / missing anchor falls back to today in the CLIENT's timezone (UTC when unset)", async () => {
  await getClientWeekMuscleMap({ clientId: "client-1", anchorCivil: "15/10/2026" });
  expect(mockCivilDateToday).toHaveBeenLastCalledWith("America/Argentina/Buenos_Aires");
  await getClientWeekMuscleMap({ clientId: "client-utc" });
  expect(mockCivilDateToday).toHaveBeenLastCalledWith("UTC");
});

it("empty week → zero sets", async () => {
  const res = await getClientWeekMuscleMap({ clientId: "client-utc", anchorCivil: "2026-01-07" });
  expect(res.totalSets).toBe(0);
  expect(res.heatmap.maxSets).toBe(0);
});

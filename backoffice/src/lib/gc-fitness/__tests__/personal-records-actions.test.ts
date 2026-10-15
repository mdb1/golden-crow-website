// personal-records-actions.test.ts — read-only PR list for a client. The
// trainer path returns an EMPTY list (not a throw) for a client that isn't the
// caller's; either way, no workout_logs may be read for a foreign client.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
const mockGetCurrentAdmin = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
  getCurrentAdmin: () => mockGetCurrentAdmin(),
}));

import { fake, ts } from "@/lib/test-utils/fake-firestore-cov-a";

import {
  listClientPersonalRecords,
  listClientPersonalRecordsAsAdmin,
} from "../personal-records-actions";

const COACH = "coach-A";
const OTHER = "coach-B";

function noLogAccess() {
  expect(fake.db.queries).toEqual([]);
  expect(fake.db.reads.filter((p) => p.startsWith("exercises/"))).toEqual([]);
}

beforeEach(() => {
  fake.reset();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentAdmin.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  mockGetCurrentAdmin.mockResolvedValue({ uid: "admin", email: "admin@example.com" });
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH },
    "users/client-2": { role: "client", coachId: OTHER },
    "users/solo": { role: "client" },
    "exercises/bench": { name: { es: "Press banca", en: "Bench" }, muscleGroups: ["chest", 3, "triceps"] },
    "exercises/squat": { name: "  ", muscleGroups: "legs" },
    "workout_logs/l1": {
      clientId: "client-1",
      startedAt: ts("2026-10-01T10:00:00Z"),
      templateSnapshot: {
        exercises: [
          { exerciseId: "bench", name: "Snapshot bench" },
          { exerciseId: "squat", name: { en: "Back squat" } },
          { exerciseId: "row", name: { es: " " } },
        ],
      },
      sets: [
        { exerciseId: "bench", completed_at: "2026-10-01T10:10:00Z" },
        { exerciseId: "bench", completedAt: "2026-10-01T10:12:00Z" },
        { exerciseId: "squat" },
        { exerciseId: "" },
      ],
      prs: [
        { exerciseId: "bench", set_log_id: "s1", weight_kg: 80, reps: 5, estimated_one_rm: 93 },
        { exerciseId: "squat", setLogId: "s2", weightKg: 100, reps: 3, estimatedOneRM: 109 },
      ],
    },
    "workout_logs/l0": {
      clientId: "client-1",
      startedAt: ts("2026-09-01T10:00:00Z"),
      sets: [{ exerciseId: "bench", completed_at: "x" }],
      prs: [{ exerciseId: "bench", set_log_id: "s0", weight_kg: 70, reps: 5, estimated_one_rm: 81 }],
    },
    "workout_logs/foreign": {
      clientId: "client-2",
      startedAt: ts("2026-10-01T10:00:00Z"),
      prs: [{ exerciseId: "bench", set_log_id: "z", weight_kg: 200, reps: 1, estimated_one_rm: 200 }],
    },
  });
});

describe("listClientPersonalRecords (trainer)", () => {
  it("rejects a non-trainer before any read", async () => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(listClientPersonalRecords("client-1")).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    noLogAccess();
  });

  it.each([
    ["another coach's client", "client-2"],
    ["a missing client", "ghost"],
    ["a coach-less user", "solo"],
  ])("returns an empty list for %s without reading any log", async (_n, clientId) => {
    await expect(listClientPersonalRecords(clientId)).resolves.toEqual({ clientId, records: [] });
    noLogAccess();
  });

  it("reads only this client's last 300 logs and builds records with names / muscles / session counts", async () => {
    const res = await listClientPersonalRecords("client-1");
    expect(fake.db.queries).toEqual([
      {
        path: "workout_logs",
        filters: [["clientId", "==", "client-1"]],
        orders: [["startedAt", "desc"]],
        limit: 300,
      },
    ]);
    const bench = res.records.find((r) => r.exerciseId === "bench");
    const squat = res.records.find((r) => r.exerciseId === "squat");
    expect(res.records).toHaveLength(2);
    expect(bench).toMatchObject({
      exerciseName: "Press banca",
      muscleGroups: ["chest", "triceps"],
      sessionCount: 2,
      current: { weightKg: 80, reps: 5, estimatedOneRM: 93 },
      previous: { weightKg: 70, reps: 5, estimatedOneRM: 81 },
    });
    expect(squat).toMatchObject({
      exerciseName: "Back squat",
      muscleGroups: [],
      sessionCount: 0,
      previous: null,
    });
    // Nothing from client-2's log leaked in.
    expect(res.records.every((r) => r.current.weightKg !== 200)).toBe(true);
  });

  it("no PRs → no exercise lookups", async () => {
    fake.seed({ "users/client-3": { coachId: COACH } });
    await expect(listClientPersonalRecords("client-3")).resolves.toEqual({
      clientId: "client-3",
      records: [],
    });
    expect(fake.db.reads.filter((p) => p.startsWith("exercises/"))).toEqual([]);
  });
});

describe("listClientPersonalRecordsAsAdmin", () => {
  it("rejects a non-admin before any read", async () => {
    mockGetCurrentAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(listClientPersonalRecordsAsAdmin(COACH, "client-1")).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
  });

  it.each([
    ["the path coach is not the client's coach", OTHER, "client-1"],
    ["the client is missing", COACH, "ghost"],
    ["a coach-less user under someone else", COACH, "solo"],
  ])("returns empty when %s", async (_n, coach, client) => {
    await expect(listClientPersonalRecordsAsAdmin(coach, client)).resolves.toEqual({
      clientId: client,
      records: [],
    });
    noLogAccess();
  });

  it("admits the coach of record and coach-less self-as-coach", async () => {
    const res = await listClientPersonalRecordsAsAdmin(COACH, "client-1");
    expect(res.records).toHaveLength(2);
    fake.seed({
      "workout_logs/solo1": {
        clientId: "solo",
        startedAt: ts("2026-10-01T00:00:00Z"),
        prs: [{ exerciseId: "nope", set_log_id: "q", weight_kg: 10, reps: 1, estimated_one_rm: 10 }],
      },
    });
    const solo = await listClientPersonalRecordsAsAdmin("solo", "solo");
    expect(solo.records).toEqual([
      expect.objectContaining({ exerciseId: "nope", exerciseName: "nope", muscleGroups: [] }),
    ]);
  });
});

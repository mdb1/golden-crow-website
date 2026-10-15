// habit-compliance-actions.test.ts — per-habit compliance for the trainer.
// The habit's `trainerId === session.uid` pre-flight is the only thing
// stopping a coach from reading another coach's client's habit_logs.

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
const mockCivilDateFormat = jest.fn((_d: Date, _tz: string) => "2026-09-16");
jest.mock("@/lib/gc-fitness/civil-date", () => ({
  ...jest.requireActual("@/lib/gc-fitness/civil-date"),
  civilDateToday: (tz: string) => mockCivilDateToday(tz),
  civilDateFormat: (d: Date, tz: string) => mockCivilDateFormat(d, tz),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: async () => "Europe/Madrid",
}));

import { fake } from "@/lib/test-utils/fake-firestore-cov-a";

import { fetchHabitCompliance } from "../habit-compliance-actions";

const COACH = "coach-A";
const OTHER = "coach-B";

function day(n: number) {
  return `2026-10-${String(n).padStart(2, "0")}`;
}

beforeEach(() => {
  fake.reset();
  mockCivilDateToday.mockClear();
  mockCivilDateFormat.mockClear();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  const logs: Record<string, Record<string, unknown>> = {};
  for (let d = 9; d <= 15; d += 1) {
    logs[`habit_logs/l${d}`] = { habitId: "h-mine", clientId: "client-1", civilDate: day(d), value: true };
  }
  logs["habit_logs/l8-deleted"] = {
    habitId: "h-mine",
    civilDate: day(8),
    value: true,
    deleted: true,
  };
  logs["habit_logs/old"] = { habitId: "h-mine", civilDate: "2026-08-01", value: true };
  logs["habit_logs/other-habit"] = { habitId: "h-theirs", civilDate: day(7), value: true };
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH, timezone: "America/Argentina/Buenos_Aires" },
    "users/client-2": { role: "client", coachId: OTHER },
    "habits/h-mine": {
      trainerId: COACH,
      clientId: "client-1",
      type: "binary",
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-09-16",
    },
    "habits/h-theirs": { trainerId: OTHER, clientId: "client-2" },
    "habits/h-no-client": { trainerId: COACH, scheduleType: "recurring", scheduleCadence: "daily" },
    ...logs,
  });
});

it("rejects a non-trainer before any read", async () => {
  mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
  await expect(fetchHabitCompliance("h-mine")).rejects.toThrow("Forbidden");
  expect(fake.db.reads).toEqual([]);
});

it("rejects another coach's habit without reading the client or any habit_logs", async () => {
  await expect(fetchHabitCompliance("h-theirs")).rejects.toThrow("Not your habit.");
  expect(fake.db.queries).toEqual([]);
  expect(fake.db.reads).toEqual(["habits/h-theirs"]);
});

it("a missing habit is 'Habit not found.'", async () => {
  await expect(fetchHabitCompliance("ghost")).rejects.toThrow("Habit not found.");
  expect(fake.db.queries).toEqual([]);
});

it("windows the query to 30 civil days in the CLIENT's tz and computes scheduled-day adherence", async () => {
  const res = await fetchHabitCompliance("h-mine");
  expect(mockCivilDateToday).toHaveBeenCalledWith("America/Argentina/Buenos_Aires");
  expect(mockCivilDateFormat).toHaveBeenCalledWith(expect.any(Date), "America/Argentina/Buenos_Aires");
  expect(fake.db.queries).toEqual([
    {
      path: "habit_logs",
      filters: [
        ["habitId", "==", "h-mine"],
        ["civilDate", ">=", "2026-09-16"],
      ],
      orders: [["civilDate", "desc"]],
      limit: null,
    },
  ]);
  expect(res.sevenDayRatio).toBe(1);
  expect(res.thirtyDayRatio).toBeCloseTo(7 / 30);
  expect(res.dailyCounts).toHaveLength(30);
  expect(res.dailyCounts[29]).toEqual({ date: "2026-10-15", completed: true });
  expect(res.dailyCounts[0].date).toBe("2026-09-16");
  // The soft-deleted log on 10-08 does not count.
  expect(res.dailyCounts.find((d) => d.date === day(8))).toEqual({ date: day(8), completed: false });
});

it("habit without clientId falls back to the trainer's timezone", async () => {
  await fetchHabitCompliance("h-no-client");
  expect(mockCivilDateToday).toHaveBeenCalledWith("Europe/Madrid");
  expect(fake.db.reads.filter((p) => p.startsWith("users/"))).toEqual([]);
});

it("a habit_logs query failure degrades to empty compliance instead of throwing", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  fake.db.failures.push({ kind: "query", path: /^habit_logs$/ });
  const res = await fetchHabitCompliance("h-mine");
  expect(res.sevenDayRatio).toBe(0);
  expect(res.dailyCounts.every((d) => !d.completed)).toBe(true);
  err.mockRestore();
});

it("a failure in the OWNERSHIP read is not swallowed", async () => {
  fake.db.failures.push({ kind: "get", path: /^habits\// });
  await expect(fetchHabitCompliance("h-mine")).rejects.toThrow("fake get failure");
});

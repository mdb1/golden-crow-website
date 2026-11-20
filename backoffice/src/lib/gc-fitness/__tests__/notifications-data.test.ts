// __tests__/notifications-data.test.ts
//
// #507 — the reads that used to sit inside notifications/page.tsx. Pins the
// call shapes (page sizes, filters), the roster scoping of the PR feed (#446)
// and the roster display-name resolution.

const mockDb = { tag: "db" };
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb,
}));

const mockListClients = jest.fn();
jest.mock("../client-roster", () => ({ listClients: (...a: unknown[]) => mockListClients(...a) }));
const mockActivity = jest.fn();
jest.mock("../coach-activity-actions", () => ({
  listMyCoachActivityPage: (...a: unknown[]) => mockActivity(...a),
}));
const mockHabits = jest.fn();
jest.mock("../habit-actions", () => ({ listHabitsForTrainer: (...a: unknown[]) => mockHabits(...a) }));
const mockLive = jest.fn();
jest.mock("../live-workout-actions", () => ({
  listActiveWorkoutSessionsForTrainer: (...a: unknown[]) => mockLive(...a),
}));
const mockRecent = jest.fn();
jest.mock("../recent-logs-actions", () => ({
  listRecentLogsForTrainerPage: (...a: unknown[]) => mockRecent(...a),
}));
const mockPrs = jest.fn();
jest.mock("../pr-notifications", () => ({
  listRecentPrWorkoutNotifications: (...a: unknown[]) => mockPrs(...a),
}));
const mockBirthdays = jest.fn();
jest.mock("../birthday-notifications", () => ({
  listBirthdayNotificationsForTrainer: (...a: unknown[]) => mockBirthdays(...a),
}));

import { loadNotificationSources } from "../notifications-data";

beforeEach(() => {
  jest.clearAllMocks();
  mockListClients.mockResolvedValue([
    { uid: "c1", displayName: "Ana Roster" },
    { uid: "c2", displayName: "Bo Roster" },
  ]);
  mockLive.mockResolvedValue([
    { logId: "l1", clientId: "c1", assignmentId: "a1" },
    { logId: "l2", clientId: "gone", assignmentId: "a2" },
  ]);
  mockActivity.mockResolvedValue({ rows: [{ id: "act1" }], nextCursor: null, hasMore: false });
  mockHabits.mockResolvedValue([{ id: "h1" }]);
  mockRecent.mockResolvedValue({ logs: [{ id: "s1" }], clients: [], nextCursor: null, hasMore: false });
  mockPrs.mockResolvedValue([
    { id: "pr1", clientId: "c2", clientName: "Bo (log)" },
    { id: "pr2", clientId: "zz", clientName: "Zed (log)" },
  ]);
  mockBirthdays.mockResolvedValue([{ id: "b1" }]);
});

it("reads every source with the page's shapes and resolves roster names", async () => {
  const formatPreviousPr = (v: string) => `antes ${v}`;
  const out = await loadNotificationSources({
    trainerUid: "t1",
    todayCivil: "2026-11-15",
    formatPreviousPr,
  });

  expect(mockActivity).toHaveBeenCalledWith(null, 100, null, "workout_assignment");
  expect(mockRecent).toHaveBeenCalledWith(null, 20, null, "signup");
  expect(mockBirthdays).toHaveBeenCalledWith("t1", "2026-11-15");
  const [db, uid, roster, fmt] = mockPrs.mock.calls[0];
  expect(db).toBe(mockDb);
  expect(uid).toBe("t1");
  expect([...roster]).toEqual(["c1", "c2"]);
  expect(fmt).toBe(formatPreviousPr);

  expect(out.clientNameById.get("c1")).toBe("Ana Roster");
  expect(out.activeWorkouts.map((w) => w.clientName)).toEqual(["Ana Roster", "gone"]);
  expect(out.prNotifications.map((p) => p.clientName)).toEqual(["Bo Roster", "Zed (log)"]);
  expect(out.workoutActivityRows).toEqual([{ id: "act1" }]);
  expect(out.habits).toEqual([{ id: "h1" }]);
  expect(out.activationLogs).toEqual([{ id: "s1" }]);
  expect(out.birthdayNotifications).toEqual([{ id: "b1" }]);
});

it("reads the roster before the PR feed so it is scoped to the current roster (#446)", async () => {
  let rosterResolved = false;
  mockListClients.mockImplementation(async () => {
    rosterResolved = true;
    return [];
  });
  mockPrs.mockImplementation(async () => {
    expect(rosterResolved).toBe(true);
    return [];
  });
  await loadNotificationSources({ trainerUid: "t1", todayCivil: "2026-11-15", formatPreviousPr: (v) => v });
  expect(mockPrs).toHaveBeenCalledTimes(1);
});

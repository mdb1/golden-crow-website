// page-parallel-loads.test.tsx — #490.
//
// The dashboard used to await roster → pulse → checklist → unassigned one
// after another, so it paid the SUM of four Firestore round-trips. Pin that
// all four loaders are in flight before any of them resolves, and that a
// failing loader still degrades only its card.

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const loads = {
  roster: deferred<unknown[]>(),
  pulse: deferred<unknown>(),
  checklist: deferred<unknown[]>(),
  unassigned: deferred<unknown[]>(),
};
const mockRoster = jest.fn(() => loads.roster.promise);
const mockPulse = jest.fn(() => loads.pulse.promise);
const mockChecklist = jest.fn(() => loads.checklist.promise);
const mockUnassigned = jest.fn(() => loads.unassigned.promise);
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClientsForRoster: () => mockRoster(),
}));
jest.mock("@/lib/gc-fitness/coach-pulse-actions", () => ({
  getCoachPulse: () => mockPulse(),
}));
jest.mock("@/lib/gc-fitness/coach-checklist-actions", () => ({
  listPendingChecklistItems: () => mockChecklist(),
}));
jest.mock("@/lib/gc-fitness/coach-attention-actions", () => ({
  listClientsWithNothingAssignedSoon: () => mockUnassigned(),
}));

import GCFitnessDashboardPage from "../page";

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentTrainer.mockResolvedValue({ uid: "coach1", email: "c@x.com", role: "trainer", isAdmin: false, roles: ["trainer"] });
  loads.roster = deferred();
  loads.pulse = deferred();
  loads.checklist = deferred();
  loads.unassigned = deferred();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it("starts all four card loaders before any of them resolves", async () => {
  const page = GCFitnessDashboardPage({ searchParams: Promise.resolve({}) });
  await flush();
  expect(mockRoster).toHaveBeenCalledTimes(1);
  expect(mockPulse).toHaveBeenCalledTimes(1);
  expect(mockChecklist).toHaveBeenCalledTimes(1);
  expect(mockUnassigned).toHaveBeenCalledTimes(1);

  loads.roster.resolve([]);
  loads.pulse.resolve({
    habitDaily: [],
    workoutDaily: [],
    weekHabitPct: 0,
    weekWorkoutPct: 0,
    topPerformersWeek: [],
    topPerformersToday: [],
    customExerciseCount: 0,
  });
  loads.checklist.resolve([]);
  loads.unassigned.resolve([]);
  await expect(page).resolves.toBeTruthy();
});

it("a failing loader degrades only its card (the page still renders)", async () => {
  const page = GCFitnessDashboardPage({ searchParams: Promise.resolve({}) });
  loads.roster.resolve([]);
  loads.pulse.reject(new Error("index building"));
  loads.checklist.resolve([]);
  loads.unassigned.reject(new Error("boom"));
  await expect(page).resolves.toBeTruthy();
});

it("no trainer session → redirect to login, no loader runs", async () => {
  mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
  await expect(
    GCFitnessDashboardPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("NEXT_REDIRECT");
  expect(mockRoster).not.toHaveBeenCalled();
});

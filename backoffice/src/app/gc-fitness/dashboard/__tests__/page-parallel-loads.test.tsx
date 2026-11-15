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
  unassigned: deferred<unknown>(),
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
  loads.unassigned.resolve({ rows: [], truncated: false, scanned: 0 });
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

// #513 — the "needs attention" tile links to /clients?filter=attention, so it
// must count what that filter shows: rows whose `needsAttention` fired for ANY
// reason (#499), not only the inactive ones.
type El = { type?: unknown; props?: Record<string, unknown> };
function findByProp(node: unknown, key: string, value: unknown): El | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByProp(child, key, value);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as El;
  if (el.props?.[key] === value) return el;
  return findByProp(el.props?.children, key, value);
}

it("the attention tile counts every flagged client, not only the inactive ones", async () => {
  const now = new Date().toISOString();
  const row = (uid: string, needsAttention: boolean, reasons: string[]) => ({
    uid,
    displayName: uid,
    photoURL: null,
    source: "active",
    lastActivityAt: now, // active TODAY — the old tile counted none of these
    lastActivityKind: "workout",
    thisWeekComplianceRatio: 1,
    needsAttention,
    needsAttentionReasons: reasons,
  });
  const page = GCFitnessDashboardPage({ searchParams: Promise.resolve({}) });
  loads.roster.resolve([
    row("a", true, ["overduePayment"]),
    row("b", true, ["unreadChat", "nothingAssigned"]),
    row("c", false, []),
  ]);
  loads.pulse.reject(new Error("skip"));
  loads.checklist.resolve([]);
  loads.unassigned.resolve({ rows: [], truncated: false, scanned: 0 });

  const tile = findByProp(await page, "href", "/gc-fitness/clients?filter=attention");
  expect(tile?.props?.value).toBe(2);
  expect(tile?.props?.label).toBe("kpiNeedsAttention");
});

it("passes the truncation of the 'nothing assigned' scan to its card", async () => {
  const page = GCFitnessDashboardPage({ searchParams: Promise.resolve({}) });
  loads.roster.resolve([]);
  loads.pulse.reject(new Error("skip"));
  loads.checklist.resolve([]);
  loads.unassigned.resolve({ rows: [], truncated: true, scanned: 150 });

  const card = findByProp(await page, "truncated", true);
  expect(card?.props?.scanned).toBe(150);
});

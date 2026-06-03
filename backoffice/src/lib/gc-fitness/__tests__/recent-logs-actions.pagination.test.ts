// __tests__/recent-logs-actions.pagination.test.ts
//
// 260531-fwc — single-client time-cursor pagination.
//
// `listRecentLogsForClient(clientId, cursor, pageSize)` no longer loads the
// whole trainer's data and slices in memory; it queries the ONE client's
// sources newest-first, bounded to `pageSize`, filtered to `field <= cursor`
// after page 1. These tests lock the contract that matters for cost + UX:
//   1. page 1 returns exactly `pageSize` rows + a `nextCursor` + `hasMore=true`
//      when a source is full (there are older rows);
//   2. page 2 (passing `nextCursor`) returns the OLDER remainder and reports
//      `hasMore=false` once the source is drained;
//   3. the two pages don't overlap (the inclusive `<=` boundary is deduped by
//      the caller, but the server must not double-count within a page).
//
// Firestore is mocked with a chainable builder that actually honors
// where("startedAt","<=")/orderBy/limit for workout_logs, so cursor advancement
// is exercised for real. All other sources are empty to keep the feed a pure
// workout stream. Trainer tz forced to "UTC" for deterministic civil-date math.

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "t1", email: "t@x.com" })),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClients: jest.fn(async () => [
    { uid: "c1", email: "c1@x.com", displayName: "Client One", timezone: null, photoURL: null, pendingProvisioning: false },
    { uid: "c2", email: "c2@x.com", displayName: "Client Two", timezone: null, photoURL: null, pendingProvisioning: false },
  ]),
}));

import {
  listRecentLogsForClient,
  listRecentLogsForTrainerPage,
} from "../recent-logs-actions";
import { FirestoreCollections } from "../collections";

function snap(docs: unknown[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (d: unknown) => void) => docs.forEach(cb),
  };
}

// A client /users doc with NO createdAt — so loadClientRosterEntry authorizes
// (coachId === trainer.uid) but no "signup" row is emitted, keeping the feed a
// pure workout stream.
function userDoc() {
  const data = {
    email: "c1@x.com",
    displayName: "Client One",
    role: "client",
    coachId: "t1",
    timezone: null,
  };
  return {
    id: "c1",
    exists: true,
    data: () => data,
    get: (f: string) => (data as Record<string, unknown>)[f],
  };
}

// Workout log `i`, started at `startedIso`; `completedIso` defaults to the
// same instant so the row counts as a finished workout. When `completedIso`
// is null, the log is still in progress and should not surface in Recent Logs.
function workoutDoc(i: number, startedIso: string, completedIso: string | null = startedIso) {
  const data: Record<string, unknown> = {
    clientId: "c1",
    startedAt: startedIso,
    completedAt: completedIso,
    templateSnapshot: { name: `Workout ${i}` },
    sets: [],
  };
  return {
    id: `w${i}`,
    exists: true,
    data: () => data,
    get: (f: string) => data[f],
  };
}

// 25 workouts, newest first by index: w0 = newest, w24 = oldest.
const ALL_WORKOUTS = Array.from({ length: 25 }, (_, i) =>
  workoutDoc(i, `2026-05-${String(31 - i).padStart(2, "0")}T12:00:00Z`),
);

function makeDb() {
  // Chainable query that records the collection + an optional startedAt upper
  // bound + limit, and (for workout_logs) returns the matching slice.
  function makeQuery(collName: string): Record<string, unknown> {
    let upperBoundMs: number | null = null;
    let lim = Infinity;
    const q: Record<string, unknown> = {
      where(field: unknown, op: unknown, value: unknown) {
        if (field === "startedAt" && op === "<=" && value instanceof Date) {
          upperBoundMs = value.getTime();
        }
        return q;
      },
      orderBy: () => q,
      limit(n: number) {
        lim = n;
        return q;
      },
      get: () => {
        if (collName === FirestoreCollections.workoutLogs) {
          const rows = ALL_WORKOUTS.filter((d) => {
            if (upperBoundMs === null) return true;
            return Date.parse(d.get("startedAt") as string) <= upperBoundMs;
          })
            .slice() // already newest-first; orderBy(startedAt desc) is a no-op here
            .slice(0, lim === Infinity ? undefined : lim);
          return Promise.resolve(snap(rows));
        }
        if (collName === FirestoreCollections.users) {
          // The signup documentId("in") query.
          return Promise.resolve(snap([userDoc()]));
        }
        // habit_logs / progress_photos / workout_assignments / habits / weights
        return Promise.resolve(snap([]));
      },
      doc: (id: string) => makeDocRef(collName, id),
    };
    return q;
  }

  function makeDocRef(collName: string, id: string) {
    return {
      id,
      // loadClientRosterEntry reads /users/{clientId}.
      get: () =>
        Promise.resolve(
          collName === FirestoreCollections.users
            ? userDoc()
            : { exists: false, data: () => ({}), get: () => undefined },
        ),
      collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
    };
  }

  return {
    collection: (name: string) => makeQuery(name),
    getAll: () => Promise.resolve([]),
  };
}

describe("listRecentLogsForClient — time-cursor pagination (260531-fwc)", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockState.db = makeDb();
  });
  afterEach(() => errSpy.mockRestore());

  it("page 1 returns exactly pageSize rows with a cursor and hasMore=true", async () => {
    const page1 = await listRecentLogsForClient("c1", null, 20);

    expect(page1.logs).toHaveLength(20);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe(page1.logs[page1.logs.length - 1].eventAt);
    // Newest-first: first row is the most recent workout.
    expect(page1.logs[0].id).toBe("workout:w0");
  });

  it("page 2 (passing the cursor) returns the older remainder and drains hasMore", async () => {
    const page1 = await listRecentLogsForClient("c1", null, 20);
    const page2 = await listRecentLogsForClient("c1", page1.nextCursor, 20);

    // 25 total − 20 shown, but the inclusive `<=` boundary re-returns the
    // cursor row, so page 2 holds the 5 remaining + the 1 boundary row.
    expect(page2.logs.length).toBeLessThanOrEqual(6);
    expect(page2.logs.length).toBeGreaterThanOrEqual(5);
    expect(page2.hasMore).toBe(false);

    // The oldest workout must appear by page 2.
    expect(page2.logs.some((r) => r.id === "workout:w24")).toBe(true);

    // No row id appears on BOTH pages except possibly the inclusive boundary.
    const p1 = new Set(page1.logs.map((r) => r.id));
    const overlap = page2.logs.filter((r) => p1.has(r.id));
    expect(overlap.length).toBeLessThanOrEqual(1);
  });
});

describe("listRecentLogsForClient — omits unfinished workout logs", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    function makeQuery(collName: string): Record<string, unknown> {
      const q: Record<string, unknown> = {
        where: () => q,
        orderBy: () => q,
        limit: () => q,
        get: () => {
          if (collName === FirestoreCollections.workoutLogs) {
            return Promise.resolve(
              snap([
                workoutDoc(0, "2026-05-31T12:00:00Z", "2026-05-31T12:30:00Z"),
                workoutDoc(1, "2026-05-30T12:00:00Z", null),
              ]),
            );
          }
          return Promise.resolve(snap([]));
        },
        doc: (id: string) => makeDocRef(collName, id),
      };
      return q;
    }

    function makeDocRef(collName: string, id: string) {
      return {
        id,
        get: () =>
          Promise.resolve(
            collName === FirestoreCollections.users
              ? userDoc()
              : { exists: false, data: () => ({}), get: () => undefined },
          ),
        collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
      };
    }

    mockState.db = {
      collection: (name: string) => makeQuery(name),
      getAll: () => Promise.resolve([]),
    };
  });
  afterEach(() => errSpy.mockRestore());

  it("drops workout rows that have not completed yet", async () => {
    const res = await listRecentLogsForClient("c1", null, 20);

    expect(res.logs).toHaveLength(1);
    expect(res.logs[0].title).toContain("Workout completed");
    expect(res.logs[0].title).not.toContain("Workout started");
  });
});

// ---- multi-client (full-roster) page mode + server-side type filter --------

// Workouts tagged per client; the mock honors where("clientId","==") so the
// per-client fan-out returns each client's own logs.
function workoutDocFor(clientId: string, i: number, iso: string) {
  const data: Record<string, unknown> = {
    clientId,
    startedAt: iso,
    completedAt: iso,
    templateSnapshot: { name: `${clientId} W${i}` },
    sets: [],
  };
  return {
    id: `${clientId}_w${i}`,
    exists: true,
    data: () => data,
    get: (f: string) => data[f],
  };
}

// 12 workouts each for c1 + c2, interleaved in time.
const MULTI_WORKOUTS = [
  ...Array.from({ length: 12 }, (_, i) =>
    workoutDocFor("c1", i, `2026-05-${String(30 - i * 2).padStart(2, "0")}T10:00:00Z`),
  ),
  ...Array.from({ length: 12 }, (_, i) =>
    workoutDocFor("c2", i, `2026-05-${String(29 - i * 2).padStart(2, "0")}T10:00:00Z`),
  ),
];

function makeMultiDb() {
  function makeQuery(collName: string): Record<string, unknown> {
    let clientEq: string | null = null;
    let lim = Infinity;
    const q: Record<string, unknown> = {
      where(field: unknown, op: unknown, value: unknown) {
        if (field === "clientId" && op === "==" && typeof value === "string") {
          clientEq = value;
        }
        return q;
      },
      orderBy: () => q,
      limit(n: number) {
        lim = n;
        return q;
      },
      get: () => {
        if (collName === FirestoreCollections.workoutLogs) {
          const rows = MULTI_WORKOUTS.filter(
            (d) => !clientEq || (d.get("clientId") as string) === clientEq,
          ).slice(0, lim === Infinity ? undefined : lim);
          return Promise.resolve(snap(rows));
        }
        if (collName === FirestoreCollections.users) {
          return Promise.resolve(snap([userDoc()])); // no createdAt → no signup rows
        }
        return Promise.resolve(snap([]));
      },
      doc: (id: string) => ({
        id,
        get: () => Promise.resolve({ exists: false, data: () => ({}), get: () => undefined }),
        collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
      }),
    };
    return q;
  }
  return {
    collection: (name: string) => makeQuery(name),
    getAll: () => Promise.resolve([]),
  };
}

describe("listRecentLogsForTrainerPage — multi-client merge + type filter", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockState.db = makeMultiDb();
  });
  afterEach(() => errSpy.mockRestore());

  it("merges BOTH clients' workouts into one newest-first page", async () => {
    const page1 = await listRecentLogsForTrainerPage(null, 20);

    expect(page1.logs).toHaveLength(20); // 24 workouts total → first 20
    expect(page1.hasMore).toBe(true);
    // Both clients are represented and rows are newest-first.
    const clientIds = new Set(page1.logs.map((r) => r.clientId));
    expect(clientIds.has("c1")).toBe(true);
    expect(clientIds.has("c2")).toBe(true);
    for (let i = 1; i < page1.logs.length; i++) {
      expect(Date.parse(page1.logs[i - 1].eventAt)).toBeGreaterThanOrEqual(
        Date.parse(page1.logs[i].eventAt),
      );
    }
  });

  it("type filter 'habit' queries only the habit source (no workout rows)", async () => {
    const res = await listRecentLogsForTrainerPage(null, 20, null, "habit");
    expect(res.logs.every((r) => r.category !== "workout")).toBe(true);
    // No habit data seeded → empty, proving the workout source was NOT read.
    expect(res.logs).toHaveLength(0);
  });

  it("client filter scopes to a single client", async () => {
    const res = await listRecentLogsForTrainerPage(null, 20, "c2");
    expect(res.logs.length).toBeGreaterThan(0);
    expect(res.logs.every((r) => r.clientId === "c2")).toBe(true);
  });
});

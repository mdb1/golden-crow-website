// __tests__/recent-logs-actions.resilience.test.ts
//
// 260529 outage regression test.
//
// ROOT CAUSE: `listRecentLogsForTrainer` fans out a per-client habit_logs
// query that was windowed by `civilDate` (a perf optimization). That query
// needs the `habit_logs (clientId, civilDate)` composite index. The code was
// deployed BEFORE the index finished building, so the query threw
// FAILED_PRECONDITION — and because the fan-out had no guard, the whole action
// threw, 500ing BOTH the dashboard and recent-logs (both call this action).
//
// THE FIX (recent-logs-actions.ts): the windowed query has a `.catch` that
// falls back to the pre-260529 unwindowed query (served by the single-field
// `clientId` index, which always exists). These tests lock that behavior:
//   1. index BUILDING (windowed query rejects) → action degrades to the
//      fallback query and STILL RESOLVES (no throw).
//   2. index READY (windowed query resolves) → fallback is never used.
//
// Firestore is mocked with a tiny chainable builder — no live/emulator reads.
// (The emulator wouldn't even reproduce this: it does not enforce composite
// indexes, so the windowed query would never throw there.)

// ---- module mocks (must precede the SUT import) ---------------------------

// Mutable holder — jest allows factory refs to vars whose name starts with "mock".
const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "t1", email: "t@x.com" })),
}));
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClients: jest.fn(async () => [
    {
      uid: "c1",
      email: "c1@x.com",
      displayName: "Client One",
      createdAt: null,
      timezone: null,
      photoURL: null,
      pendingProvisioning: false,
    },
  ]),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { listRecentLogsForTrainer } from "../recent-logs-actions";
import { FirestoreCollections } from "../collections";

// ---- minimal chainable Firestore mock ------------------------------------

interface Flags {
  indexReady: boolean;
  windowedAttempted: boolean;
  fallbackAttempted: boolean;
}

function snap(docs: unknown[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (d: unknown) => void) => docs.forEach(cb),
  };
}

function fakeUserDoc() {
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

function makeDb(flags: Flags) {
  function resolve(collName: string, wheres: { field: string }[]) {
    if (collName === FirestoreCollections.habitLogs) {
      const windowed = wheres.some((w) => w.field === "civilDate");
      if (windowed) {
        flags.windowedAttempted = true;
        if (flags.indexReady) return Promise.resolve(snap([]));
        const err = new Error(
          "9 FAILED_PRECONDITION: The query requires an index.",
        ) as Error & { code: number };
        err.code = 9;
        return Promise.reject(err);
      }
      // unwindowed fallback (clientId-only) — always serveable
      flags.fallbackAttempted = true;
      return Promise.resolve(snap([]));
    }
    if (collName === FirestoreCollections.users) {
      return Promise.resolve(snap([fakeUserDoc()]));
    }
    // habits / progress_photos / body_weight_logs subcollection / everything else
    return Promise.resolve(snap([]));
  }

  function makeQuery(collName: string): Record<string, unknown> {
    const wheres: { field: string }[] = [];
    const q: Record<string, unknown> = {
      where(field: string) {
        wheres.push({ field });
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      get: () => resolve(collName, wheres),
      doc: (id: string) => makeDocRef(collName, id),
    };
    return q;
  }

  function makeDocRef(collName: string, id: string) {
    return {
      id,
      get: () => Promise.resolve({ exists: false, data: () => ({}), get: () => undefined }),
      collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
    };
  }

  return {
    collection: (name: string) => makeQuery(name),
    getAll: () => Promise.resolve([]),
  };
}

describe("listRecentLogsForTrainer — index resilience (260529)", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("degrades to the fallback query (does NOT throw) when the windowed habit_logs index is still building", async () => {
    const flags: Flags = {
      indexReady: false,
      windowedAttempted: false,
      fallbackAttempted: false,
    };
    mockState.db = makeDb(flags);

    const result = await listRecentLogsForTrainer();

    // The action must resolve to a render-able shape, not throw.
    expect(result).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
    expect(Array.isArray(result.clients)).toBe(true);

    // Proof the fallback engaged: the windowed query was attempted AND rejected,
    // and the unwindowed fallback ran in its place.
    expect(flags.windowedAttempted).toBe(true);
    expect(flags.fallbackAttempted).toBe(true);
  });

  it("uses the optimized windowed query and never touches the fallback once the index is READY", async () => {
    const flags: Flags = {
      indexReady: true,
      windowedAttempted: false,
      fallbackAttempted: false,
    };
    mockState.db = makeDb(flags);

    const result = await listRecentLogsForTrainer();

    expect(result).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
    expect(flags.windowedAttempted).toBe(true);
    expect(flags.fallbackAttempted).toBe(false);
  });
});

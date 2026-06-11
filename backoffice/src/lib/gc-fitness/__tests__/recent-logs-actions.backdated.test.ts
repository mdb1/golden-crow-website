// __tests__/recent-logs-actions.backdated.test.ts
//
// The iOS app lets a client tick a PAST-day habit: a habit whose target
// `civilDate` is May 29 can be marked on May 30. The recent-logs feed renders
// rows by the mark instant (`eventAt`), so without extra signal a May-29 habit
// marked May 30 reads as a May-30 activity and the trainer loses which day it
// belongs to.
//
// `listRecentLogsForTrainer` now stamps `forCivilDate` on a habit row ONLY when
// it was backdated — i.e. the habit's civilDate differs from the civil date on
// which it was actually marked (eventAt in the trainer's tz). On-time
// completions leave `forCivilDate` undefined. These tests lock both paths.
//
// Firestore is mocked with a tiny chainable builder (no live/emulator reads),
// modeled on recent-logs-actions.resilience.test.ts. Trainer tz is forced to
// "UTC" so the civil-date arithmetic is deterministic.

// ---- module mocks (must precede the SUT import) ---------------------------

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

function habitDoc() {
  const data = { clientId: "c1", name: "Training" };
  return {
    id: "h1",
    exists: true,
    data: () => data,
    get: (f: string) => (data as Record<string, unknown>)[f],
  };
}

// One habit_log for habit h1. `civilDate` = the day it belongs to; the mark
// timestamps (`updatedAt`/`createdAt`/`loggedAt`) = when it was ticked.
function habitLogDoc(civilDate: string, markedIso: string) {
  const data: Record<string, unknown> = {
    clientId: "c1",
    habitId: "h1",
    civilDate,
    value: true,
    updatedAt: markedIso,
    createdAt: markedIso,
    loggedAt: markedIso,
    deleted: false,
  };
  return {
    id: `h1_${civilDate}`,
    exists: true,
    data: () => data,
    get: (f: string) => data[f],
  };
}

function makeDb(log: ReturnType<typeof habitLogDoc>) {
  function resolve(collName: string) {
    if (collName === FirestoreCollections.habitLogs) {
      return Promise.resolve(snap([log]));
    }
    if (collName === FirestoreCollections.habits) {
      return Promise.resolve(snap([habitDoc()]));
    }
    if (collName === FirestoreCollections.users) {
      return Promise.resolve(snap([fakeUserDoc()]));
    }
    // workout_logs / workout_assignments / progress_photos / body_weight_logs
    return Promise.resolve(snap([]));
  }

  function makeQuery(collName: string): Record<string, unknown> {
    const q: Record<string, unknown> = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: () => resolve(collName),
      doc: (id: string) => makeDocRef(collName, id),
    };
    return q;
  }

  function makeDocRef(collName: string, id: string) {
    return {
      id,
      get: () =>
        Promise.resolve({ exists: false, data: () => ({}), get: () => undefined }),
      collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
    };
  }

  return {
    collection: (name: string) => makeQuery(name),
    getAll: () => Promise.resolve([]),
  };
}

describe("listRecentLogsForTrainer — backdated habit target day", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("stamps forCivilDate with the habit's target day when it was marked on a LATER civil day", async () => {
    // Habit belongs to May 29; ticked May 30 12:21 UTC → backdated.
    mockState.db = makeDb(habitLogDoc("2026-05-29", "2026-05-30T12:21:00Z"));

    const { logs } = await listRecentLogsForTrainer();
    const habitRow = logs.find((r) => r.category === "habit");

    expect(habitRow).toBeDefined();
    expect(habitRow!.forCivilDate).toBe("2026-05-29");
  });

  it("leaves forCivilDate undefined for an on-time (same civil day) completion", async () => {
    // Habit belongs to May 30; ticked May 30 12:21 UTC → on time.
    mockState.db = makeDb(habitLogDoc("2026-05-30", "2026-05-30T12:21:00Z"));

    const { logs } = await listRecentLogsForTrainer();
    const habitRow = logs.find((r) => r.category === "habit");

    expect(habitRow).toBeDefined();
    expect(habitRow!.forCivilDate).toBeUndefined();
  });
});

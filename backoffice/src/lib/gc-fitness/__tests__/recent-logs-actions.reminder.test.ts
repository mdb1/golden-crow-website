// __tests__/recent-logs-actions.reminder.test.ts
//
// 260611-t1y (issue mdb1/gc-fitness#200 item 4, companion gc-fitness PR #274):
// when a CLIENT edits a workout reminder from iOS, the write stamps
// reminderUpdatedAt (+ reminderEnabled/reminderTime/reminderScope) onto the
// workout_assignments doc. The recent-logs feed derives a "reminder" category
// row in-memory from those already-fetched docs (no new query/index).
//
// These tests lock the derivation + the SERIES dedupe: a series-scope edit is
// batched onto N docs sharing seriesId with the SAME reminderUpdatedAt and must
// yield exactly ONE feed row.
//
// Firestore is mocked with a tiny chainable builder (no live/emulator reads),
// modeled on recent-logs-actions.backdated.test.ts. Trainer tz is forced to
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

// A workout_assignments doc carrying client-edited reminder fields.
function assignmentDoc(
  id: string,
  reminder: Record<string, unknown>,
) {
  const data: Record<string, unknown> = {
    clientId: "c1",
    trainerId: "t1",
    scheduledFor: "2026-06-15",
    templateSnapshot: { name: { en: "Push Day", es: "Empuje" } },
    ...reminder,
  };
  return {
    id,
    exists: true,
    data: () => data,
    get: (f: string) => data[f],
  };
}

function makeDb(assignments: ReturnType<typeof assignmentDoc>[]) {
  function resolve(collName: string) {
    if (collName === FirestoreCollections.workoutAssignments) {
      return Promise.resolve(snap(assignments));
    }
    if (collName === FirestoreCollections.users) {
      return Promise.resolve(snap([fakeUserDoc()]));
    }
    // workout_logs / habits / habit_logs / progress_photos / body_weight_logs
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

describe("listRecentLogsForTrainer — client-edited workout reminder", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("emits ONE reminder row for a disabled-reminder edit", async () => {
    mockState.db = makeDb([
      assignmentDoc("a1", {
        reminderEnabled: false,
        reminderScope: "single",
        reminderUpdatedAt: "2026-06-11T10:00:00Z",
      }),
    ]);

    const { logs } = await listRecentLogsForTrainer();
    const reminderRows = logs.filter((r) => r.category === "reminder");

    expect(reminderRows).toHaveLength(1);
    expect(reminderRows[0].eventAt).toBe("2026-06-11T10:00:00.000Z");
    const text = `${reminderRows[0].title} ${reminderRows[0].detail}`;
    expect(text).toContain("desactiv");
  });

  it("includes the explicit time for a retimed reminder edit", async () => {
    mockState.db = makeDb([
      assignmentDoc("a1", {
        reminderEnabled: true,
        reminderTime: "08:30",
        reminderScope: "single",
        reminderUpdatedAt: "2026-06-11T10:00:00Z",
      }),
    ]);

    const { logs } = await listRecentLogsForTrainer();
    const reminderRows = logs.filter((r) => r.category === "reminder");

    expect(reminderRows).toHaveLength(1);
    const text = `${reminderRows[0].title} ${reminderRows[0].detail}`;
    expect(text).toContain("08:30");
  });

  it("dedupes a series-scope edit batched across docs into ONE row", async () => {
    mockState.db = makeDb([
      assignmentDoc("a1", {
        seriesId: "series-xyz",
        reminderEnabled: true,
        reminderTime: "07:00",
        reminderScope: "series",
        reminderUpdatedAt: "2026-06-11T10:00:00Z",
      }),
      assignmentDoc("a2", {
        seriesId: "series-xyz",
        reminderEnabled: true,
        reminderTime: "07:00",
        reminderScope: "series",
        reminderUpdatedAt: "2026-06-11T10:00:00Z",
      }),
    ]);

    const { logs } = await listRecentLogsForTrainer();
    const reminderRows = logs.filter((r) => r.category === "reminder");

    expect(reminderRows).toHaveLength(1);
    const text = `${reminderRows[0].title} ${reminderRows[0].detail}`;
    expect(text).toContain("toda la serie");
  });

  it("emits NO reminder row for an assignment without reminderUpdatedAt", async () => {
    mockState.db = makeDb([
      assignmentDoc("a1", {
        // no reminderUpdatedAt → the client never edited the reminder
        reminderEnabled: true,
        reminderTime: "08:30",
      }),
    ]);

    const { logs } = await listRecentLogsForTrainer();
    const reminderRows = logs.filter((r) => r.category === "reminder");

    expect(reminderRows).toHaveLength(0);
  });
});

// __tests__/recent-logs-actions.self-assignment.test.ts
//
// #785 — "en recent activity de un coach-less user no se ve todo lo que hace".
//
// The reported profile showed exactly two rows — a body weight and the first
// sign-in — while the admin timeline showed the same person self-assigning
// three workouts that same day. The feed only ever spoke about a workout once
// it was FINISHED, so everything an athlete puts on their own calendar was
// invisible on the one page that is supposed to say what they do.
//
// The row is derived in memory from the assignment docs the reschedule and
// reminder passes already fetch — no new query, no new index — so these tests
// pin the two halves that are easy to get wrong: WHICH assignments qualify (a
// coach's own must not, or the feed becomes the coach re-reading their own
// work), and WHICH timestamp dates the row (`createdAt`, not the `updatedAt`
// every later write bumps).
//
// Firestore is mocked with the same tiny chainable builder as
// recent-logs-actions.reminder.test.ts.

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

function assignmentDoc(id: string, over: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    clientId: "c1",
    // #392's shape: the athlete is their own trainer-of-record on anything they
    // scheduled themselves.
    trainerId: "c1",
    selfAssigned: true,
    scheduledFor: "2026-06-15",
    createdAt: "2026-06-11T10:00:00Z",
    updatedAt: "2026-06-14T22:00:00Z",
    templateSnapshot: {
      name: { en: "Push Day", es: "Empuje" },
      exercises: [{ exerciseId: "e1" }, { exerciseId: "e2" }],
    },
    ...over,
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

describe("listRecentLogsForTrainer — the athlete scheduled it themselves (#785)", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  const assignmentRows = async () => {
    const { logs } = await listRecentLogsForTrainer();
    return logs.filter((r) => r.category === "assignment");
  };

  it("emits a row naming the routine and the day it is for", async () => {
    mockState.db = makeDb([assignmentDoc("a1")]);

    const rows = await assignmentRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain("Client One se asignó");
    // `localizedText` resolves EN first here, exactly like the reschedule row
    // beside it — the prose is Spanish, the routine keeps its own name.
    expect(rows[0].title).toContain("Push Day");
    expect(rows[0].detail).toContain("2 ejercicios");
  });

  it("dates the row when it was SCHEDULED, not when it was last touched", async () => {
    // `updatedAt` is bumped by the move, the finish and the prescription
    // write-back; using it would walk a two-week-old plan back to the top of
    // the feed every time the athlete touched it.
    mockState.db = makeDb([assignmentDoc("a1")]);

    const rows = await assignmentRows();
    expect(rows[0].eventAt).toBe("2026-06-11T10:00:00.000Z");
  });

  it("says a free workout is one, instead of pretending to be a plan", async () => {
    // #541 — started empty and built while training, so the snapshot has no
    // exercises and the name is the placeholder. "Entreno libre" alone is the
    // thing the ticket complains about; the row says what it means.
    mockState.db = makeDb([
      assignmentDoc("a1", {
        templateSnapshot: {
          name: { en: "Free workout", es: "Entreno libre" },
          exercises: [],
        },
      }),
    ]);

    const rows = await assignmentRows();
    // The DETAIL is the fixed phrase the row adds — the title still carries
    // whatever placeholder name the app wrote.
    expect(rows[0].detail).toContain("Entreno libre (lo arma mientras entrena)");
    expect(rows[0].detail).not.toContain("ejercicios");
  });

  it("ignores the COACH's own assignments", async () => {
    // The feed's reader is the coach. Their own assignments are not news, and
    // emitting them would bury the rows that are.
    mockState.db = makeDb([
      assignmentDoc("a1", { trainerId: "t1", selfAssigned: false }),
    ]);

    expect(await assignmentRows()).toHaveLength(0);
  });

  it("qualifies a legacy doc with no `selfAssigned` flag", async () => {
    // The canonical predicate is `trainerId === clientId` (#392/#449), not the
    // boolean — docs written before the flag existed still belong to the
    // athlete.
    mockState.db = makeDb([assignmentDoc("a1", { selfAssigned: undefined })]);

    expect(await assignmentRows()).toHaveLength(1);
  });
});

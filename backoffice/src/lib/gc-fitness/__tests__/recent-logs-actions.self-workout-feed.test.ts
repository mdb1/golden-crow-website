// __tests__/recent-logs-actions.self-workout-feed.test.ts
//
// Issue #434 follow-up: the LEGACY dashboard/recent-logs branch
// (`listRecentLogsForTrainer`, no page arg) queried workout_logs by
// `trainerId == coach`, so CLIENT-CREATED ("self") workouts — whose trainerId
// is the client's own uid — never appeared in that feed. The branch now fans
// out per roster client by `clientId` (like the paginated branch). This test
// locks that a self-log for a roster client shows up, and that its assignment
// (never in the trainer-scoped assignment set) survives the orphan filter via
// the point-read existence check.

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

function doc(id: string, data: Record<string, unknown>) {
  return { id, exists: true, data: () => data, get: (f: string) => data[f] };
}

const SELF_ASSIGNMENT_ID = "asg-c1-20260710-self-xyz";
const SELF_LOG_ID = "log-asg-c1-20260710-self-abc-123";

// A client-created ("self") completed workout: trainerId === clientId === c1.
const selfLog = doc(SELF_LOG_ID, {
  clientId: "c1",
  trainerId: "c1",
  assignment_id: SELF_ASSIGNMENT_ID,
  status: "completed",
  startedAt: "2026-07-10T10:00:00.000Z",
  completedAt: "2026-07-10T10:45:00.000Z",
  sets: [{ id: "s1", exerciseId: "e1", reps: 10, weight_kg: 50 }],
  templateSnapshot: { name: "Resistiré", exercises: [] },
});

const clientUser = doc("c1", {
  email: "c1@x.com",
  displayName: "Client One",
  role: "client",
  coachId: "t1",
  timezone: null,
});

function makeDb() {
  function makeQuery(collName: string): Record<string, unknown> {
    const q: Record<string, unknown> = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        if (collName === FirestoreCollections.workoutLogs) return snap([selfLog]);
        if (collName === FirestoreCollections.users) return snap([clientUser]);
        // workout_assignments (trainer-scoped), habits, habit_logs, photos,
        // body_weight_logs, profile events → empty.
        return snap([]);
      },
      doc: (id: string) => makeDocRef(collName, id),
    };
    return q;
  }

  function makeDocRef(collName: string, id: string) {
    return {
      id,
      // The orphan filter point-reads the self-assignment by id — it exists.
      get: async () =>
        collName === FirestoreCollections.workoutAssignments && id === SELF_ASSIGNMENT_ID
          ? doc(id, { clientId: "c1", trainerId: "c1" })
          : { exists: false, id, data: () => ({}), get: () => undefined },
      collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
    };
  }

  return {
    collection: (name: string) => makeQuery(name),
    getAll: async () => [],
  };
}

describe("listRecentLogsForTrainer — client-created (self) workouts in the feed (#434)", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    mockState.db = makeDb();
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("surfaces a self-log for a roster client (survives the orphan filter)", async () => {
    const result = await listRecentLogsForTrainer();
    const workoutRows = result.logs.filter((r) => r.category === "workout");
    expect(workoutRows).toHaveLength(1);
    expect(workoutRows[0]).toEqual(
      expect.objectContaining({ clientId: "c1", workoutLogId: SELF_LOG_ID }),
    );
  });
});

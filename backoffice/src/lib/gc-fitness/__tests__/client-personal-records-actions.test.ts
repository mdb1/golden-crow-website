const mockState: { db: unknown } = { db: null };
const mockGetCurrentTrainer = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

import { listClientPersonalRecordsPage } from "../client-personal-records-actions";
import { FirestoreCollections } from "../collections";

function doc(id: string, data: Record<string, unknown>, exists = true) {
  return {
    id,
    exists,
    data: () => data,
    get: (field: string) => data[field],
  };
}

function snap(docs: unknown[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
  };
}

function workoutLogDoc({
  id,
  startedAt,
  e1rm,
  weight,
  status = "completed",
  exerciseId = "bench",
  exerciseName = "Press banca",
  achievedAt = startedAt,
}: {
  id: string;
  startedAt: string;
  e1rm: number;
  weight: number;
  status?: string;
  exerciseId?: string;
  exerciseName?: string;
  achievedAt?: unknown;
}) {
  return doc(id, {
    clientId: "client-1",
    trainerId: "trainer-1",
    status,
    startedAt,
    completedAt: startedAt,
    templateSnapshot: {
      name: { es: "Torso" },
      exercises: [{ exerciseId, name: { es: exerciseName } }],
    },
    sets: [
      {
        id: `${id}-set-1`,
        exerciseId,
        weight_kg: weight,
        reps: 5,
      },
    ],
    prs: [
      {
        exerciseId,
        exerciseName: { es: exerciseName },
        set_log_id: `${id}-set-1`,
        weight_kg: weight,
        reps: 5,
        estimated_one_rm: e1rm,
        achieved_at: achievedAt,
      },
    ],
  });
}

function makeDb({
  clientCoachId = "trainer-1",
  workoutDocs,
  exerciseDocs,
}: {
  clientCoachId?: string;
  workoutDocs?: unknown[];
  exerciseDocs?: Record<string, Record<string, unknown>>;
} = {}) {
  const logs = workoutDocs ?? [
    workoutLogDoc({
      id: "log-new",
      startedAt: "2026-07-12T10:00:00.000Z",
      e1rm: 110,
      weight: 95,
    }),
    workoutLogDoc({
      id: "log-old",
      startedAt: "2026-06-12T10:00:00.000Z",
      e1rm: 100,
      weight: 85,
    }),
  ];
  const exercises = exerciseDocs ?? {
    bench: {
      name: { es: "Press banca" },
      muscleGroups: ["chest"],
    },
  };

  function makeQuery(collectionName: string): Record<string, unknown> {
    const q: Record<string, unknown> = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      startAfter: () => q,
      get: async () =>
        collectionName === FirestoreCollections.workoutLogs
          ? snap(logs)
          : snap([]),
      doc: (id: string) => makeDocRef(collectionName, id),
    };
    return q;
  }

  function makeDocRef(collectionName: string, id: string) {
    return {
      id,
      get: async () => {
        if (collectionName === FirestoreCollections.users && id === "client-1") {
          return doc("client-1", {
            coachId: clientCoachId,
            displayName: "Client One",
            email: "client@example.com",
          });
        }
        if (collectionName === FirestoreCollections.exercises && exercises[id]) {
          return doc(id, exercises[id]);
        }
        return doc(id, {}, false);
      },
    };
  }

  return {
    collection: (name: string) => makeQuery(name),
  };
}

describe("listClientPersonalRecordsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentTrainer.mockResolvedValue({
      uid: "trainer-1",
      email: "trainer@example.com",
    });
    mockState.db = makeDb();
  });

  it("lists client PRs with exercise filters and previous PR values", async () => {
    const page = await listClientPersonalRecordsPage({
      clientId: "client-1",
    });

    expect(page.clientName).toBe("Client One");
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]).toEqual(
      expect.objectContaining({
        id: "log-new:log-new-set-1",
        exerciseName: "Press banca",
        estimatedOneRM: 110,
        previousEstimatedOneRM: 100,
        muscleGroups: ["chest"],
      }),
    );
    expect(page.filters.commonExercises[0]).toEqual(
      expect.objectContaining({
        exerciseId: "bench",
        name: "Press banca",
        prCount: 2,
      }),
    );
    expect(page.filters.muscleGroups).toEqual(["chest"]);
  });

  it("applies muscle filters", async () => {
    const page = await listClientPersonalRecordsPage({
      clientId: "client-1",
      filter: { kind: "muscle", muscleGroup: "legs" },
    });

    expect(page.rows).toEqual([]);
  });

  it("includes PR logs that are completed by completedAt without completed status", async () => {
    const db = makeDb();
    const query = db.collection(FirestoreCollections.workoutLogs) as {
      get: () => Promise<{ docs: unknown[] }>;
    };
    const originalGet = query.get;
    query.get = async () => ({
      docs: [
        workoutLogDoc({
          id: "log-started-with-completed-at",
          startedAt: "2026-07-10T10:00:00.000Z",
          e1rm: 105,
          weight: 90,
          status: "started",
        }),
      ],
    });
    mockState.db = {
      collection: (name: string) =>
        name === FirestoreCollections.workoutLogs
          ? query
          : db.collection(name),
    };

    const page = await listClientPersonalRecordsPage({
      clientId: "client-1",
    });

    expect(page.rows.map((row) => row.id)).toEqual([
      "log-started-with-completed-at:log-started-with-completed-at-set-1",
    ]);
    query.get = originalGet;
  });

  it("parses iOS numeric achieved_at timestamps", async () => {
    mockState.db = makeDb({
      workoutDocs: [
        workoutLogDoc({
          id: "log-ios-date",
          startedAt: "2026-07-12T10:00:00.000Z",
          e1rm: 110,
          weight: 95,
          achievedAt: 804_088_900.787986,
        }),
      ],
    });

    const page = await listClientPersonalRecordsPage({
      clientId: "client-1",
    });

    expect(page.rows[0]?.achievedAtISO).toBe("2026-06-25T14:01:40.787Z");
  });

  it("uses resolved exercise ids when finding previous PRs", async () => {
    mockState.db = makeDb({
      workoutDocs: [
        workoutLogDoc({
          id: "log-new",
          startedAt: "2026-07-12T10:00:00.000Z",
          e1rm: 110,
          weight: 95,
          exerciseId: "bench-new",
          exerciseName: "Press banca",
        }),
        workoutLogDoc({
          id: "log-old",
          startedAt: "2026-06-12T10:00:00.000Z",
          e1rm: 100,
          weight: 85,
          exerciseId: "bench-old",
          exerciseName: "Press banca legacy",
        }),
      ],
      exerciseDocs: {
        "bench-new": {
          name: { es: "Press banca" },
          muscleGroups: ["chest"],
        },
        "bench-old": {
          name: { es: "Press banca legacy" },
          muscleGroups: ["chest"],
          mergedInto: "bench-new",
        },
      },
    });

    const page = await listClientPersonalRecordsPage({
      clientId: "client-1",
    });

    expect(page.rows[0]).toEqual(
      expect.objectContaining({
        exerciseId: "bench-new",
        previousEstimatedOneRM: 100,
      }),
    );
    expect(page.filters.commonExercises[0]).toEqual(
      expect.objectContaining({
        exerciseId: "bench-new",
        prCount: 2,
      }),
    );
  });

  it("paginates derived PR rows inside the same log window", async () => {
    const firstPage = await listClientPersonalRecordsPage({
      clientId: "client-1",
      pageSize: 1,
    });

    expect(firstPage.rows.map((row) => row.id)).toEqual(["log-new:log-new-set-1"]);
    expect(firstPage.nextCursor).toEqual({ startedAtISO: null, rowOffset: 1 });

    const secondPage = await listClientPersonalRecordsPage({
      clientId: "client-1",
      cursor: firstPage.nextCursor,
      pageSize: 1,
    });

    expect(secondPage.rows.map((row) => row.id)).toEqual(["log-old:log-old-set-1"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects clients owned by another trainer", async () => {
    mockState.db = makeDb({ clientCoachId: "other-trainer" });

    await expect(
      listClientPersonalRecordsPage({ clientId: "client-1" }),
    ).rejects.toThrow("Forbidden");
  });
});

// __tests__/live-workout-actions.start-dedupe.test.ts
//
// Issue #169 — multiple live sessions of the same workout could be created.
// `startWorkoutSession` used a read-then-write idempotency check: two
// concurrent starts (double click, two tabs, page render + client retry)
// both saw "no active log" and each created one. The fix moves the
// existing-active query AND the create into one `runTransaction`, and
// self-heals pre-existing duplicates (keeps the freshest active log,
// abandons the rest).
//
// The mock Firestore below serializes `runTransaction` bodies through a
// mutex chain — the same guarantee (one committed txn at a time) the real
// server gives. If the create ever moves back OUTSIDE the transaction, the
// concurrency test fails with two created logs.

const mockState: { db: MockDb | null } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
  gcFitnessStorage: () => {
    throw new Error("storage not used in this test");
  },
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "t1", email: "t@x.com" })),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { startWorkoutSession } from "../live-workout-actions";

// ── In-memory Firestore mock ──────────────────────────────────────────────

type DocData = Record<string, unknown>;

class MockDocRef {
  constructor(
    private store: Map<string, DocData>,
    public readonly id: string,
  ) {}
  async get() {
    const data = this.store.get(this.id);
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => data,
      ref: this,
    };
  }
  async set(data: DocData) {
    this.store.set(this.id, { ...data });
  }
  async update(patch: DocData) {
    const current = this.store.get(this.id);
    if (!current) throw new Error(`update on missing doc ${this.id}`);
    this.store.set(this.id, { ...current, ...patch });
  }
}

class MockQuery {
  constructor(
    private store: Map<string, DocData>,
    private filters: Array<{ field: string; value: unknown }> = [],
    private max: number | null = null,
  ) {}
  where(field: string, _op: string, value: unknown) {
    return new MockQuery(this.store, [...this.filters, { field, value }], this.max);
  }
  limit(n: number) {
    return new MockQuery(this.store, this.filters, n);
  }
  async get() {
    let rows = [...this.store.entries()].filter(([, data]) =>
      this.filters.every((f) => data[f.field] === f.value),
    );
    if (this.max !== null) rows = rows.slice(0, this.max);
    const docs = rows.map(([id, data]) => ({
      id,
      data: () => data,
      ref: new MockDocRef(this.store, id),
      exists: true,
    }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class MockCollection extends MockQuery {
  constructor(private colStore: Map<string, DocData>) {
    super(colStore);
  }
  doc(id: string) {
    return new MockDocRef(this.colStore, id);
  }
}

class MockDb {
  collections = new Map<string, Map<string, DocData>>();
  private txnChain: Promise<unknown> = Promise.resolve();

  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return new MockCollection(this.collections.get(name)!);
  }

  // Serialized transactions: bodies run one-at-a-time (mutex chain), writes
  // buffered and applied at commit — mirroring the server-side guarantee the
  // fix relies on. A create issued OUTSIDE runTransaction bypasses the mutex
  // and the concurrency test below catches the duplicate.
  runTransaction<T>(fn: (tx: MockTxn) => Promise<T>): Promise<T> {
    const run = this.txnChain.then(async () => {
      const tx = new MockTxn();
      const result = await fn(tx);
      tx.commit();
      return result;
    });
    this.txnChain = run.catch(() => undefined);
    return run;
  }
}

class MockTxn {
  private writes: Array<() => void> = [];
  async get(target: MockQuery | MockDocRef) {
    return target.get();
  }
  set(ref: MockDocRef, data: DocData) {
    this.writes.push(() => void ref.set(data));
  }
  update(ref: MockDocRef, patch: DocData) {
    this.writes.push(() => void ref.update(patch));
  }
  commit() {
    for (const w of this.writes) w();
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const ASSIGNMENT_ID = "asg-1";

function seedAssignment(db: MockDb, status = "scheduled") {
  db.collection("workout_assignments");
  db.collections.get("workout_assignments")!.set(ASSIGNMENT_ID, {
    trainerId: "t1",
    clientId: "c1",
    status,
    scheduledFor: "2026-06-11",
    templateSnapshot: { name: { en: "Push Day", es: "Día de empuje" }, exercises: [] },
  });
}

function activeLogs(db: MockDb) {
  return [...(db.collections.get("workout_logs") ?? new Map()).entries()].filter(
    ([, d]) => d.status === "active" && d.assignment_id === ASSIGNMENT_ID,
  );
}

beforeEach(() => {
  mockState.db = new MockDb();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("startWorkoutSession dedupe (issue #169)", () => {
  test("first start creates exactly one active log and marks assignment started", async () => {
    const db = mockState.db!;
    seedAssignment(db);
    const session = await startWorkoutSession({ assignmentId: ASSIGNMENT_ID });
    expect(session.status).toBe("active");
    expect(activeLogs(db)).toHaveLength(1);
    expect(db.collections.get("workout_assignments")!.get(ASSIGNMENT_ID)!.status).toBe(
      "started",
    );
  });

  test("second start reuses the existing active log instead of creating another", async () => {
    const db = mockState.db!;
    seedAssignment(db);
    const first = await startWorkoutSession({ assignmentId: ASSIGNMENT_ID });
    const second = await startWorkoutSession({ assignmentId: ASSIGNMENT_ID });
    expect(second.logId).toBe(first.logId);
    expect(activeLogs(db)).toHaveLength(1);
  });

  test("CONCURRENT starts produce exactly one active log (the #169 race)", async () => {
    const db = mockState.db!;
    seedAssignment(db);
    const [a, b] = await Promise.all([
      startWorkoutSession({ assignmentId: ASSIGNMENT_ID }),
      startWorkoutSession({ assignmentId: ASSIGNMENT_ID }),
    ]);
    expect(activeLogs(db)).toHaveLength(1);
    expect(a.logId).toBe(b.logId);
  });

  test("self-heals pre-existing duplicates: keeps freshest, abandons the rest", async () => {
    const db = mockState.db!;
    seedAssignment(db, "started");
    const logs = db.collection("workout_logs");
    void logs; // ensure collection exists
    const logStore = db.collections.get("workout_logs")!;
    const base = {
      trainerId: "t1",
      clientId: "c1",
      source: "coach",
      assignment_id: ASSIGNMENT_ID,
      templateSnapshot: {},
      status: "active",
      sets: [],
      prs: [],
    };
    logStore.set("stale-log", { ...base, updatedAt: { toMillis: () => 1000 } });
    logStore.set("fresh-log", { ...base, updatedAt: { toMillis: () => 2000 } });

    const session = await startWorkoutSession({ assignmentId: ASSIGNMENT_ID });

    expect(session.logId).toBe("fresh-log");
    expect(activeLogs(db)).toHaveLength(1);
    expect(logStore.get("stale-log")!.status).toBe("abandoned");
    expect(logStore.get("fresh-log")!.status).toBe("active");
  });
});

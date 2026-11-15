// __tests__/coach-attention-actions.test.ts
//
// 260612-e9t (#245): listClientsWithNothingAssignedSoon — the dashboard
// urgency-card data source. A client is INCLUDED only when they have NO workout
// assignment AND NO active habit in the next 4 days. Bounded reads: ONE windowed
// trainerId assignment query (with the index-error fallback) + capped per-client
// habit reads. These tests lock the coverage logic + the fallback path.

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

// Roster mock is reassigned per-test via mockListClients.
const mockListClients = jest.fn();
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClients: (...args: unknown[]) => mockListClients(...args),
}));

import { listClientsWithNothingAssignedSoon } from "../coach-attention-actions";
import { FirestoreCollections } from "../collections";
import { civilDateToday, civilDateFormat } from "../civil-date";

function snap(docs: unknown[]) {
  return { docs, size: docs.length, empty: docs.length === 0 };
}
function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

const TODAY = civilDateToday("UTC");
function plusDays(civil: string, n: number): string {
  const base = new Date(`${civil}T12:00:00Z`);
  return civilDateFormat(
    new Date(base.getTime() + n * 24 * 60 * 60 * 1000),
    "UTC",
  );
}
const IN_WINDOW = plusDays(TODAY, 2); // within [today, today+3]
const PAST = plusDays(TODAY, -5);
const FAR_FUTURE = plusDays(TODAY, 30);

function client(uid: string) {
  return {
    uid,
    email: `${uid}@x.com`,
    displayName: `Client ${uid}`,
    timezone: "UTC",
    photoURL: null,
    pendingProvisioning: false,
  };
}

interface DbOpts {
  /** Assignment docs the windowed trainerId query returns. */
  assignments: Array<{ clientId: string; scheduledFor: string }>;
  /** Per-clientId habit docs. */
  habitsByClient: Record<string, Array<Record<string, unknown>>>;
  /** When true, the windowed (scheduledFor) assignment query throws → fallback. */
  failWindowedAssignments?: boolean;
  flags?: { windowedAttempted: boolean; fallbackUsed: boolean };
}

/** clientIds whose habits were read, in order (reset per test). */
let habitReads: string[] = [];

function makeDb(opts: DbOpts) {
  function makeQuery(coll: string): Record<string, unknown> {
    const wheres: Array<{ field: string; value: unknown }> = [];
    const q: Record<string, unknown> = {
      where(field: string, _op: string, value: unknown) {
        wheres.push({ field, value });
        return q;
      },
      limit: () => q,
      get() {
        if (coll === FirestoreCollections.workoutAssignments) {
          const windowed = wheres.some((w) => w.field === "scheduledFor");
          if (windowed) {
            if (opts.flags) opts.flags.windowedAttempted = true;
            if (opts.failWindowedAssignments) {
              const err = new Error(
                "9 FAILED_PRECONDITION: requires an index",
              ) as Error & { code: number };
              err.code = 9;
              return Promise.reject(err);
            }
            // Indexed query: pre-trim to the window (server-side range).
            const inWin = opts.assignments.filter(
              (a) => a.scheduledFor >= TODAY && a.scheduledFor <= plusDays(TODAY, 3),
            );
            return Promise.resolve(
              snap(inWin.map((a, i) => doc(`asg-${i}`, a))),
            );
          }
          // trainerId-only fallback: return EVERYTHING (the action trims in memory).
          if (opts.flags) opts.flags.fallbackUsed = true;
          return Promise.resolve(
            snap(opts.assignments.map((a, i) => doc(`asg-${i}`, a))),
          );
        }
        if (coll === FirestoreCollections.habits) {
          habitReads.push(String(wheres.find((w) => w.field === "clientId")?.value));
          const clientId = wheres.find((w) => w.field === "clientId")
            ?.value as string;
          const habits = opts.habitsByClient[clientId] ?? [];
          return Promise.resolve(
            snap(habits.map((h, i) => doc(`hab-${clientId}-${i}`, h))),
          );
        }
        return Promise.resolve(snap([]));
      },
    };
    return q;
  }
  return { collection: (name: string) => makeQuery(name) };
}

describe("listClientsWithNothingAssignedSoon (#245)", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    habitReads = [];
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("excludes a client with an in-window workout assignment", async () => {
    mockListClients.mockResolvedValue([client("c1"), client("c2")]);
    mockState.db = makeDb({
      assignments: [{ clientId: "c1", scheduledFor: IN_WINDOW }],
      habitsByClient: {},
    });

    const { rows } = await listClientsWithNothingAssignedSoon();
    const uids = rows.map((r) => r.uid);
    expect(uids).not.toContain("c1"); // covered by workout
    expect(uids).toContain("c2"); // nothing assigned
  });

  it("excludes a client with an in-window active (daily) habit", async () => {
    mockListClients.mockResolvedValue([client("c1"), client("c2")]);
    mockState.db = makeDb({
      assignments: [],
      habitsByClient: {
        c1: [
          {
            clientId: "c1",
            deleted: false,
            scheduleType: "recurring",
            scheduleCadence: "daily",
          },
        ],
      },
    });

    const { rows } = await listClientsWithNothingAssignedSoon();
    const uids = rows.map((r) => r.uid);
    expect(uids).not.toContain("c1"); // covered by habit
    expect(uids).toContain("c2");
  });

  it("includes a client with neither a workout nor an active habit", async () => {
    mockListClients.mockResolvedValue([client("c1")]);
    mockState.db = makeDb({ assignments: [], habitsByClient: {} });

    const { rows } = await listClientsWithNothingAssignedSoon();
    expect(rows.map((r) => r.uid)).toEqual(["c1"]);
  });

  it("includes a client whose only habit ended before the window (endsOn)", async () => {
    mockListClients.mockResolvedValue([client("c1")]);
    mockState.db = makeDb({
      assignments: [],
      habitsByClient: {
        c1: [
          {
            clientId: "c1",
            deleted: false,
            scheduleType: "recurring",
            scheduleCadence: "daily",
            endsOn: PAST, // expired before today
          },
        ],
      },
    });

    const { rows } = await listClientsWithNothingAssignedSoon();
    expect(rows.map((r) => r.uid)).toContain("c1");
  });

  it("excludes a workout outside the window (assignment too far in the future)", async () => {
    mockListClients.mockResolvedValue([client("c1")]);
    mockState.db = makeDb({
      assignments: [{ clientId: "c1", scheduledFor: FAR_FUTURE }],
      habitsByClient: {},
    });

    const { rows } = await listClientsWithNothingAssignedSoon();
    // The far-future assignment does NOT cover the client → still surfaced.
    expect(rows.map((r) => r.uid)).toContain("c1");
  });

  it("ignores soft-deleted habits when deciding coverage", async () => {
    mockListClients.mockResolvedValue([client("c1")]);
    mockState.db = makeDb({
      assignments: [],
      habitsByClient: {
        c1: [
          {
            clientId: "c1",
            deleted: true, // soft-deleted → does NOT cover
            scheduleType: "recurring",
            scheduleCadence: "daily",
          },
        ],
      },
    });

    const { rows } = await listClientsWithNothingAssignedSoon();
    expect(rows.map((r) => r.uid)).toContain("c1");
  });

  it("the windowed-query index-error fallback still produces correct coverage", async () => {
    mockListClients.mockResolvedValue([client("c1"), client("c2")]);
    const flags = { windowedAttempted: false, fallbackUsed: false };
    mockState.db = makeDb({
      // c1 has an in-window assignment, c2 has a far-future one. The fallback
      // returns BOTH; the in-memory window filter must still cover only c1.
      assignments: [
        { clientId: "c1", scheduledFor: IN_WINDOW },
        { clientId: "c2", scheduledFor: FAR_FUTURE },
      ],
      habitsByClient: {},
      failWindowedAssignments: true,
      flags,
    });

    const { rows } = await listClientsWithNothingAssignedSoon();
    expect(flags.windowedAttempted).toBe(true);
    expect(flags.fallbackUsed).toBe(true);
    const uids = rows.map((r) => r.uid);
    expect(uids).not.toContain("c1"); // in-window assignment covers c1
    expect(uids).toContain("c2"); // far-future assignment does NOT cover c2
  });

  it("skips pendingProvisioning clients entirely", async () => {
    const pending = { ...client("cp"), pendingProvisioning: true };
    mockListClients.mockResolvedValue([pending, client("c1")]);
    mockState.db = makeDb({ assignments: [], habitsByClient: {} });

    const { rows } = await listClientsWithNothingAssignedSoon();
    const uids = rows.map((r) => r.uid);
    expect(uids).not.toContain("cp");
    expect(uids).toContain("c1");
  });

  // #513 — the cap was 50 and cut SILENTLY; now 150 (the mobile callable's
  // ATTENTION_MAX_CLIENTS, #1588) and the cut is reported.
  it("checks up to 150 active clients and says nothing was cut", async () => {
    const roster = Array.from({ length: 150 }, (_, i) => client(`c${String(i).padStart(3, "0")}`));
    mockListClients.mockResolvedValue(roster);
    mockState.db = makeDb({ assignments: [], habitsByClient: {} });

    const result = await listClientsWithNothingAssignedSoon();
    expect(result.truncated).toBe(false);
    expect(result.scanned).toBe(150);
    expect(result.rows).toHaveLength(150);
    // The 51st..150th client used to vanish from the card.
    expect(result.rows.map((r) => r.uid)).toContain("c149");
  });

  it("reports `truncated` past 150 active clients (pending ones don't count)", async () => {
    const roster = [
      ...Array.from({ length: 151 }, (_, i) => client(`c${String(i).padStart(3, "0")}`)),
      { ...client("cp"), pendingProvisioning: true },
    ];
    mockListClients.mockResolvedValue(roster);
    mockState.db = makeDb({ assignments: [], habitsByClient: {} });

    const result = await listClientsWithNothingAssignedSoon();
    expect(result.truncated).toBe(true);
    expect(result.scanned).toBe(150);
    expect(result.rows.map((r) => r.uid)).not.toContain("c150");
  });

  it("150 active clients exactly is NOT truncated even with pending invites on top", async () => {
    const roster = [
      ...Array.from({ length: 150 }, (_, i) => client(`c${i}`)),
      { ...client("cp1"), pendingProvisioning: true },
    ];
    mockListClients.mockResolvedValue(roster);
    mockState.db = makeDb({ assignments: [], habitsByClient: {} });

    expect((await listClientsWithNothingAssignedSoon()).truncated).toBe(false);
  });

  it("reads habits only for the clients no workout already covers", async () => {
    mockListClients.mockResolvedValue([client("c1"), client("c2")]);
    mockState.db = makeDb({
      assignments: [{ clientId: "c1", scheduledFor: IN_WINDOW }],
      habitsByClient: {},
    });

    await listClientsWithNothingAssignedSoon();
    expect(habitReads).toEqual(["c2"]);
  });

  it("an empty roster is an empty, untruncated answer", async () => {
    mockListClients.mockResolvedValue([]);
    mockState.db = makeDb({ assignments: [], habitsByClient: {} });
    await expect(listClientsWithNothingAssignedSoon()).resolves.toEqual({
      rows: [],
      truncated: false,
      scanned: 0,
    });
  });
});

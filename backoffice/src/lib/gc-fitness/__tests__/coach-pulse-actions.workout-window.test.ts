// coach-pulse-actions.workout-window.test.ts — golden-crow-website#535.
//
// The weekly workout bars read workout_logs with ONE trainer-wide `limit(600)`,
// no order, no window: past 600 logs in a coach's history this week's logs could
// be the ones left out. Now they are read per roster client, windowed on
// (clientId, startedAt) — and a failing windowed read falls back to the old
// query instead of zeroing the bars.

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "t1", email: "t@x.com" })),
}));
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClients: jest.fn(async () => [
    { uid: "c1", email: "c1@x.com", displayName: "One", timezone: "UTC", photoURL: null, pendingProvisioning: false },
  ]),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { getCoachPulse } from "../coach-pulse-actions";
import { FirestoreCollections } from "../collections";
import { civilDateToday } from "../civil-date";

const TODAY = civilDateToday("UTC");
const snap = (docs: unknown[]) => ({ docs, size: docs.length, empty: docs.length === 0 });
const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data, get: (f: string) => data[f] });

interface Seen {
  logQueries: Array<Record<string, unknown>>;
}

function makeDb(seen: Seen, windowedFails: boolean) {
  const assignment = doc("a1", { clientId: "c1", trainerId: "t1", scheduledFor: TODAY, status: "completed" });
  const log = doc("l1", {
    clientId: "c1",
    trainerId: "t1",
    startedAt: new Date(`${TODAY}T10:00:00Z`),
    completedAt: new Date(`${TODAY}T11:00:00Z`),
    sets: [],
  });
  function makeQuery(coll: string) {
    const filters: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      where(field: string, _op: string, value: unknown) {
        filters[field] = value;
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }),
      get() {
        if (coll === FirestoreCollections.workoutAssignments) return Promise.resolve(snap([assignment]));
        if (coll === FirestoreCollections.workoutLogs) {
          seen.logQueries.push({ ...filters });
          if ("startedAt" in filters && windowedFails) return Promise.reject(new Error("9 FAILED_PRECONDITION"));
          return Promise.resolve(snap([log]));
        }
        return Promise.resolve(snap([]));
      },
    };
    return q;
  }
  return { collection: (name: string) => makeQuery(name) };
}

beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it("reads this week's logs per client on (clientId, startedAt), never the trainer-wide 600", async () => {
  const seen: Seen = { logQueries: [] };
  mockState.db = makeDb(seen, false);
  const pulse = await getCoachPulse();
  expect(seen.logQueries).toHaveLength(1);
  expect(seen.logQueries[0]).toMatchObject({ clientId: "c1" });
  expect(seen.logQueries[0].startedAt).toBeInstanceOf(Date);
  expect(seen.logQueries[0]).not.toHaveProperty("trainerId");
  expect(pulse.weekWorkoutPct).toBe(100);
});

it("a failing windowed read falls back to the old query (no silent zero)", async () => {
  const seen: Seen = { logQueries: [] };
  mockState.db = makeDb(seen, true);
  const pulse = await getCoachPulse();
  expect(seen.logQueries.at(-1)).toMatchObject({ trainerId: "t1" });
  expect(pulse.weekWorkoutPct).toBe(100);
});

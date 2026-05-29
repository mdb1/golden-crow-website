// __tests__/coach-pulse-actions.resilience.test.ts
//
// 260529 outage regression test — the SILENT-ZERO variant.
//
// ROOT CAUSE (confirmed against prod via the Firestore REST API): the pulse's
// per-client habit_logs fan-out was windowed with `civilDate >= start AND
// <= end`. With no explicit orderBy, Firestore needs an ASCENDING
// `(clientId, civilDate)` composite index — but the only deployed index was
// `(clientId, civilDate DESC)`, which does NOT serve an ascending range. So the
// query threw FAILED_PRECONDITION on EVERY client, the old `.catch → null`
// swallowed it, and the dashboard rendered "Habit compliance 0% / week" with
// empty Top-performers cards — WRONG numbers that look real (worse than a
// visible error).
//
// THE FIX (coach-pulse-actions.ts): on failure, fall back to the unwindowed
// `clientId`-only query (always served by the single-field index) and let the
// existing in-memory `civ < windowStart || civ > windowEnd` filter trim to the
// window. These tests lock that the fallback produces REAL compliance, not 0%.

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
      timezone: "UTC",
      photoURL: null,
      pendingProvisioning: false,
    },
  ]),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { getCoachPulse } from "../coach-pulse-actions";
import { FirestoreCollections } from "../collections";
import { civilDateToday } from "../civil-date";

function snap(docs: unknown[]) {
  return { docs, size: docs.length, empty: docs.length === 0 };
}
function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, get: (f: string) => data[f] };
}

// "today" in the same tz the action uses, so the seeded log lands in-window.
const TODAY = civilDateToday("UTC");

interface Flags {
  habitIndexReady: boolean;
  habitWindowedAttempted: boolean;
  habitFallbackUsed: boolean;
}

function makeDb(flags: Flags) {
  // one daily binary habit + one completed log for today
  const HABIT_ID = "hab-c1-1";
  const habitDocs = [
    doc(HABIT_ID, {
      clientId: "c1",
      type: "binary",
      deleted: false,
      scheduleType: "recurring",
      scheduleCadence: "daily",
    }),
  ];
  const habitLogDocs = [
    doc(`${HABIT_ID}_${TODAY}`, {
      clientId: "c1",
      habitId: HABIT_ID,
      civilDate: TODAY,
      value: true,
      deleted: false,
    }),
  ];

  function makeQuery(coll: string): Record<string, unknown> {
    const wheres: string[] = [];
    const q: Record<string, unknown> = {
      where(field: string) {
        wheres.push(field);
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      // `.count().get()` → AggregateQuery returning { data: () => { count } }
      count: () => ({
        get: async () => ({ data: () => ({ count: 0 }) }),
      }),
      get() {
        if (coll === FirestoreCollections.habits) {
          return Promise.resolve(snap(habitDocs));
        }
        if (coll === FirestoreCollections.habitLogs) {
          const windowed = wheres.includes("civilDate");
          if (windowed) {
            flags.habitWindowedAttempted = true;
            if (flags.habitIndexReady) return Promise.resolve(snap(habitLogDocs));
            const err = new Error("9 FAILED_PRECONDITION: requires an index") as Error & {
              code: number;
            };
            err.code = 9;
            return Promise.reject(err);
          }
          // unwindowed clientId-only fallback — always serveable
          flags.habitFallbackUsed = true;
          return Promise.resolve(snap(habitLogDocs));
        }
        // workout_assignments / workout_logs / everything else
        return Promise.resolve(snap([]));
      },
    };
    return q;
  }

  return {
    collection: (name: string) => makeQuery(name),
  };
}

describe("getCoachPulse — habit_logs index resilience (260529 silent-zero)", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("computes REAL compliance via the fallback when the windowed index is missing (not a silent 0%)", async () => {
    const flags: Flags = {
      habitIndexReady: false,
      habitWindowedAttempted: false,
      habitFallbackUsed: false,
    };
    mockState.db = makeDb(flags);

    const pulse = await getCoachPulse();

    // The windowed query was attempted, failed, and the fallback ran.
    expect(flags.habitWindowedAttempted).toBe(true);
    expect(flags.habitFallbackUsed).toBe(true);

    // The bug: this used to be 0% with EMPTY performers. With the fallback the
    // numbers are real again. The habit is daily (scheduled all 7 window days)
    // but only completed today, so the WEEK rollup is 1/7 = 14% — the point is
    // it is NON-ZERO and the performer surfaces, not the exact rollup.
    expect(pulse.weekHabitPct).toBeGreaterThan(0);
    expect(pulse.topPerformersWeek.length).toBe(1);
    expect(pulse.topPerformersWeek[0]?.numerator).toBe(1);
    // Today's bar reflects the single scheduled+completed habit: 1/1 = 100%.
    const todayBar = pulse.habitDaily.find((d) => d.civilDate === TODAY);
    expect(todayBar?.numerator).toBe(1);
    expect(todayBar?.denominator).toBe(1);
    expect(todayBar?.percentage).toBe(100);
    expect(pulse.topPerformersToday[0]?.pct).toBe(100);
  });

  it("uses the windowed query directly (no fallback) once the index is READY", async () => {
    const flags: Flags = {
      habitIndexReady: true,
      habitWindowedAttempted: false,
      habitFallbackUsed: false,
    };
    mockState.db = makeDb(flags);

    const pulse = await getCoachPulse();

    expect(flags.habitWindowedAttempted).toBe(true);
    expect(flags.habitFallbackUsed).toBe(false);
    expect(pulse.weekHabitPct).toBeGreaterThan(0); // same correct result
    const todayBar = pulse.habitDaily.find((d) => d.civilDate === TODAY);
    expect(todayBar?.percentage).toBe(100);
  });
});

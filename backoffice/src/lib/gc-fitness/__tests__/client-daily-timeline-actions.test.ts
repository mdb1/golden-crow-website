import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockState: {
  db: unknown;
  trainerTimezone: string;
} = {
  db: null,
  trainerTimezone: "UTC",
};

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
  gcFitnessStorage: () => ({
    bucket: () => ({
      file: () => ({
        getSignedUrl: async () => ["https://example.com/photo.jpg"],
      }),
    }),
  }),
}));

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "trainer-1", email: "t@x.com" })),
}));

jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => mockState.trainerTimezone),
}));

jest.mock("@/lib/gc-fitness/client-daily-timeline-utils", () => ({
  buildClientDailyTimelineDates: jest.fn(() => ["2026-05-21", "2026-05-22"]),
}));

import {
  getClientDailyTimeline,
  getClientDailyTimelineDay,
} from "../client-daily-timeline-actions";
import { FirestoreCollections } from "../collections";

function snap(docs: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    exists: docs.length > 0,
    forEach: (cb: (doc: unknown) => void) => docs.forEach(cb),
    get: (field: string) => (overrides as Record<string, unknown>)[field],
    ...overrides,
  };
}

function makeDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    exists: true,
    data: () => data,
    get: (field: string) => data[field],
  };
}

function makeDb() {
  const habit = {
    id: "habit-1",
    clientId: "client-1",
    trainerId: "trainer-1",
    deleted: false,
    name: { en: "Monthly check", es: "Chequeo mensual" },
    scheduleType: "recurring",
    scheduleCadence: "monthly",
    scheduleMonthDays: [22],
    reminderEnabled: true,
    reminderTime: "08:00",
    reminderCadence: "monthly",
  };

  const habitLog = {
    habitId: "habit-1",
    clientId: "client-1",
    civilDate: "2026-05-21",
    value: true,
    deleted: false,
  };

  function makeQuery(collName: string): Record<string, unknown> {
    const wheres: Array<{ field: string; op?: string; value?: unknown }> = [];
    const q: Record<string, unknown> = {
      where(field: string, op?: string, value?: unknown) {
        wheres.push({ field, op, value });
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        if (collName === FirestoreCollections.users) {
          return snap([makeDoc("client-1", { coachId: "trainer-1", timezone: null })]);
        }
        if (collName === FirestoreCollections.habits) {
          return snap([
            makeDoc("habit-1", habit),
            // Issue #437: client-created habit (clientOwned, trainerId ===
            // clientId, NO `deleted` field). Same monthly-22 schedule so it
            // shares the day-22 assertion window and never lands on day 21.
            makeDoc("habit-client", {
              id: "habit-client",
              clientId: "client-1",
              trainerId: "client-1",
              clientOwned: true,
              name: { en: "Client self habit", es: "Hábito propio" },
              scheduleType: "recurring",
              scheduleCadence: "monthly",
              scheduleMonthDays: [22],
            }),
            // Soft-deleted habit — must be filtered out in memory.
            makeDoc("habit-gone", {
              id: "habit-gone",
              clientId: "client-1",
              trainerId: "trainer-1",
              deleted: true,
              name: { en: "Deleted habit" },
              scheduleType: "recurring",
              scheduleCadence: "monthly",
              scheduleMonthDays: [22],
            }),
          ]);
        }
        if (collName === FirestoreCollections.habitLogs) {
          return snap([makeDoc("log-1", habitLog)]);
        }
        if (collName === FirestoreCollections.workoutAssignments) {
          return snap([]);
        }
        if (collName === FirestoreCollections.workoutLogs) {
          return snap([]);
        }
        if (collName === FirestoreCollections.progressPhotos) {
          return snap([]);
        }
        if (collName === FirestoreCollections.chats) {
          return snap([]);
        }
        if (collName === FirestoreCollections.clientNotes) {
          return snap([], { exists: false, get: () => undefined });
        }
        return snap([]);
      },
      doc(id: string) {
        if (collName === FirestoreCollections.users && id === "client-1") {
          return {
            id: "client-1",
            get: async () => makeDoc("client-1", { coachId: "trainer-1", timezone: null }),
          };
        }
        if (collName === FirestoreCollections.chats) {
          return {
            id,
            exists: false,
            collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
            get: async () => ({ exists: false, get: () => undefined }),
          };
        }
        return {
          id,
          exists: false,
          get: async () => ({ exists: false, get: () => undefined }),
          collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
        };
      },
    };
    return q;
  }

  return {
    collection: (name: string) => makeQuery(name),
  };
}

describe("client-daily-timeline-actions — habit schedule filtering", () => {
  beforeEach(() => {
    mockState.db = makeDb();
    mockState.trainerTimezone = "UTC";
  });

  it("hides unscheduled habits from the full timeline", async () => {
    const timeline = await getClientDailyTimeline("client-1");
    const day21 = timeline.days.find((day) => day.date === "2026-05-21");
    const day22 = timeline.days.find((day) => day.date === "2026-05-22");

    expect(day21?.habits).toEqual([]);
    expect(day21?.reminders).toEqual([]);
    // Issue #437: trainer-assigned + client-created habits both show; the
    // soft-deleted one does not.
    expect(day22?.habits).toHaveLength(2);
    const trainerHabit = day22?.habits.find((h) => h.name === "Monthly check");
    const clientHabit = day22?.habits.find((h) => h.name === "Client self habit");
    expect(trainerHabit?.clientOwned).toBe(false);
    expect(clientHabit?.clientOwned).toBe(true);
    expect(day22?.habits.some((h) => h.name === "Deleted habit")).toBe(false);
  });

  it("hides unscheduled habits from the single-day view", async () => {
    const day = await getClientDailyTimelineDay("client-1", "2026-05-21");

    expect(day.habits).toEqual([]);
    expect(day.reminders).toEqual([]);
  });
});

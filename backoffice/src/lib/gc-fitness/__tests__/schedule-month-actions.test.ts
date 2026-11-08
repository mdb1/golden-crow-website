// __tests__/schedule-month-actions.test.ts
//
// Transferred-client regression: a client moved from coach A to coach B can
// still have historical habits tagged with coach A. The current coach must see
// those habits in the schedule because the client still sees them in the app.

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "t1", email: "t1@example.com" })),
}));

import { listMonthForClients } from "../schedule-month-actions";
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
  return {
    id,
    data: () => data,
    get: (field: string) => data[field],
  };
}

function makeDb() {
  function makeQuery(collectionName: string): Record<string, unknown> {
    const q: Record<string, unknown> = {
      // Roster gate point-read: c1 is t1's CURRENT client (the transfer
      // already happened — only the old content still carries old-coach).
      doc: (id: string) => ({
        get: async () => {
          const data: Record<string, unknown> | null =
            collectionName === FirestoreCollections.users && id === "c1"
              ? { coachId: "t1" }
              : null;
          return {
            exists: data !== null,
            get: (field: string) => data?.[field],
          };
        },
      }),
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        if (collectionName === FirestoreCollections.workoutAssignments) {
          return snap([
            doc("old-assignment", {
              trainerId: "old-coach",
              clientId: "c1",
              scheduledFor: "2026-06-10",
              templateSnapshot: { name: "Old workout" },
              status: "scheduled",
            }),
            doc("new-assignment", {
              trainerId: "t1",
              clientId: "c1",
              scheduledFor: "2026-06-10",
              templateSnapshot: { name: "New workout" },
              status: "scheduled",
            }),
            // Issue #449: client self-assigned workout (issue #392 shape —
            // trainerId === clientId + selfAssigned: true). Must surface on
            // the coach's calendar, tagged selfAssigned.
            doc("self-assignment", {
              trainerId: "c1",
              clientId: "c1",
              scheduledFor: "2026-06-10",
              selfAssigned: true,
              templateSnapshot: { name: "Self workout" },
              status: "scheduled",
            }),
          ]);
        }
        if (collectionName === FirestoreCollections.habits) {
          return snap([
            doc("old-habit", {
              trainerId: "old-coach",
              clientId: "c1",
              deleted: false,
              name: { en: "Old coach habit" },
              type: "binary",
              scheduleType: "recurring",
              scheduleCadence: "daily",
              startsOn: "2026-06-01",
            }),
            doc("new-habit", {
              trainerId: "t1",
              clientId: "c1",
              deleted: false,
              name: { en: "New coach habit" },
              type: "binary",
              scheduleType: "recurring",
              scheduleCadence: "daily",
              startsOn: "2026-06-01",
            }),
            // Issue #437: client-created habit. trainerId === clientId, marked
            // clientOwned, and crucially NO `deleted` field (rules forbid it at
            // create) — it must still surface, tagged clientOwned.
            doc("client-habit", {
              trainerId: "c1",
              clientId: "c1",
              clientOwned: true,
              name: { en: "Client self habit" },
              type: "binary",
              scheduleType: "recurring",
              scheduleCadence: "daily",
              startsOn: "2026-06-01",
            }),
            // Soft-deleted habit must NOT surface (in-memory filter).
            doc("gone-habit", {
              trainerId: "t1",
              clientId: "c1",
              deleted: true,
              name: { en: "Deleted habit" },
              type: "binary",
              scheduleType: "recurring",
              scheduleCadence: "daily",
              startsOn: "2026-06-01",
            }),
          ]);
        }
        return snap([]);
      },
    };
    return q;
  }

  return {
    collection: (name: string) => makeQuery(name),
  };
}

describe("listMonthForClients", () => {
  beforeEach(() => {
    mockState.db = makeDb();
  });

  it("keeps old-coach habits visible for a transferred client", async () => {
    const result = await listMonthForClients({
      monthFirstCivil: "2026-06-01",
      clientIds: ["c1"],
      todayCivil: "2026-06-08",
    });

    // Chips sort by templateName. The old-coach doc (trainerId "old-coach" !==
    // clientId) surfaces marked inherited (#1504, it used to be hidden, #446); the
    // client self-assigned doc too (#449), tagged selfAssigned.
    const inheritedChip = result.workoutsByDay["2026-06-10"].find((w) => w.id === "old-assignment");
    expect(inheritedChip).toEqual(expect.objectContaining({ inherited: true, selfAssigned: false }));
    expect(result.workoutsByDay["2026-06-10"].filter((w) => !w.inherited)).toEqual([
      expect.objectContaining({
        id: "new-assignment",
        templateName: "New workout",
        selfAssigned: false,
      }),
      expect.objectContaining({
        id: "self-assignment",
        templateName: "Self workout",
        selfAssigned: true,
      }),
    ]);
    expect(result.habitsByDay["2026-06-10"]).toEqual([
      expect.objectContaining({
        id: "client-habit:2026-06-10",
        habitName: "Client self habit",
        clientOwned: true,
      }),
      expect.objectContaining({
        id: "new-habit:2026-06-10",
        habitName: "New coach habit",
        clientOwned: false,
      }),
      expect.objectContaining({
        id: "old-habit:2026-06-10",
        habitName: "Old coach habit",
        clientOwned: false,
      }),
    ]);
    // Soft-deleted habit is filtered out.
    const ids = result.habitsByDay["2026-06-10"].map((h) => h.id);
    expect(ids).not.toContain("gone-habit:2026-06-10");
  });
});

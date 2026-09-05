// __tests__/recent-logs-actions.nutrition.test.ts
//
// The nutrition row of the recent-activity feed reads "{done} de {expected}
// comidas según el plan", and `expected` is the ONLY half of it that anything
// outside the row itself can get wrong.
//
// It shipped reading `Object.values(data.meals).length` — the size of the map of
// marks. But `nutrition_logs.meals` holds only the slots the client TOUCHED, so
// the denominator followed the numerator and every day printed as complete: a
// day whose plan asked for four meals, with one of them marked, reached the
// coach as "1 de 1 comidas según el plan". The number a coach opens this feed to
// read was structurally incapable of showing a miss.
//
// `expected` comes from the day's FROZEN `targetsSnapshot` instead — the same
// source `summarizeNutritionMarks` already gave the admin feed, and the same one
// `expectedNutritionMeals` uses for adherence. These tests pin the denominator
// against the snapshot, the `max(snapshot, marked)` floor for a plan edited
// mid-day, the untouched-day guard, and a legacy log with no snapshot at all.
//
// Firestore is mocked with the same tiny chainable builder the sibling
// recent-logs suites use. Trainer tz is forced to "UTC" so the civil-date
// arithmetic is deterministic.

// ---- module mocks (must precede the SUT import) ---------------------------

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

import { listRecentLogsForClient } from "../recent-logs-actions";
import { FirestoreCollections } from "../collections";

// ---- fixtures --------------------------------------------------------------

function snap(docs: unknown[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (d: unknown) => void) => docs.forEach(cb),
  };
}

const MARKED_AT = "2026-09-05T12:16:00Z";
const CIVIL_DATE = "2026-09-05";

/** A snapshot meal, as `nutrition_logs.targetsSnapshot.meals[]` freezes it. */
function snapshotMeal(mealId: string, order: number) {
  return {
    mealId,
    name: { en: mealId, es: mealId },
    order,
    targets: null,
  };
}

/**
 * One `nutrition_logs` day.
 *
 * `marks` is the map the client actually wrote — deliberately smaller than
 * `snapshotMealIds` in most of these cases, because that gap IS the bug.
 * `snapshotMealIds: null` models a legacy day written before the snapshot
 * existed.
 */
function nutritionLogDoc(
  marks: Record<string, { status: string }>,
  snapshotMealIds: string[] | null,
) {
  const data: Record<string, unknown> = {
    clientId: "c1",
    civilDate: CIVIL_DATE,
    planId: "p1",
    meals: marks,
    updatedAt: MARKED_AT,
    createdAt: MARKED_AT,
  };
  if (snapshotMealIds) {
    data.targetsSnapshot = {
      daily: { kcal: 2400, proteinG: 180, carbsG: 240, fatG: 80 },
      meals: snapshotMealIds.map((id, i) => snapshotMeal(id, i)),
    };
  }
  return {
    id: `c1_${CIVIL_DATE}`,
    exists: true,
    data: () => data,
    get: (f: string) => data[f],
  };
}

function userDocData() {
  return {
    email: "c1@x.com",
    displayName: "Manolo",
    role: "client",
    coachId: "t1",
    timezone: null,
  };
}

function makeDb(nutritionDocs: unknown[]) {
  function resolve(collName: string) {
    if (collName === FirestoreCollections.nutritionLogs) {
      return Promise.resolve(snap(nutritionDocs));
    }
    // habit_logs / workout_logs / workout_assignments / progress_photos /
    // body_weight_logs / habits — nothing else is under test here.
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
    // The single doc read that matters is `users/c1` — `loadClientRosterEntry`
    // uses it for the ownership gate, and a miss there throws "Forbidden"
    // before any feed row is built.
    if (collName === FirestoreCollections.users && id === "c1") {
      const data = userDocData();
      const docSnap = {
        id,
        exists: true,
        data: () => data,
        get: (f: string) => (data as Record<string, unknown>)[f],
      };
      return {
        id,
        get: () => Promise.resolve(docSnap),
        collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
      };
    }
    return {
      id,
      exists: false,
      get: () =>
        Promise.resolve({ exists: false, data: () => ({}), get: () => undefined }),
      collection: (sub: string) => makeQuery(`${collName}/${id}/${sub}`),
    };
  }

  return {
    collection: (name: string) => ({
      ...makeQuery(name),
      doc: (id: string) => makeDocRef(name, id),
    }),
    getAll: () => Promise.resolve([]),
  };
}

async function nutritionDetail(nutritionDocs: unknown[]): Promise<string | null> {
  mockState.db = makeDb(nutritionDocs);
  const { logs } = await listRecentLogsForClient("c1");
  const row = logs.find((r) => r.category === "nutrition");
  return row ? row.detail : null;
}

// ---- tests -----------------------------------------------------------------

describe("listRecentLogsForClient — nutrition row denominator", () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("counts the FROZEN snapshot's meals, not the meals that were marked", async () => {
    // The exact reported shape: a 4-meal plan, one meal marked done. Before the
    // fix this read "1 de 1" — the map of marks was both halves of the fraction.
    const detail = await nutritionDetail([
      nutritionLogDoc({ m1: { status: "done" } }, ["m1", "m2", "m3", "m4"]),
    ]);

    expect(detail).toBe("1 de 4 comidas según el plan");
  });

  it("counts only `done` in the numerator — `different` and `missed` do not score", async () => {
    const detail = await nutritionDetail([
      nutritionLogDoc(
        {
          m1: { status: "done" },
          m2: { status: "different" },
          m3: { status: "missed" },
          m4: { status: "done" },
        },
        ["m1", "m2", "m3", "m4"],
      ),
    ]);

    expect(detail).toBe("2 de 4 comidas según el plan");
  });

  it("reads N de N when the client marked every meal the day asked for", async () => {
    const detail = await nutritionDetail([
      nutritionLogDoc(
        { m1: { status: "done" }, m2: { status: "done" }, m3: { status: "done" } },
        ["m1", "m2", "m3"],
      ),
    ]);

    expect(detail).toBe("3 de 3 comidas según el plan");
  });

  it("never reports more marks than expected slots when the plan was edited mid-day", async () => {
    // The coach dropped m3 from the phase after the client had already marked
    // it. The mark is real and stays counted, so `expected` floors at `marked`
    // rather than printing the nonsense "3 de 2".
    const detail = await nutritionDetail([
      nutritionLogDoc(
        { m1: { status: "done" }, m2: { status: "done" }, m3: { status: "done" } },
        ["m1", "m2"],
      ),
    ]);

    expect(detail).toBe("3 de 3 comidas según el plan");
  });

  it("still emits a row for a legacy day with no targetsSnapshot", async () => {
    // Days written before the snapshot field existed have nothing to count
    // against. Falling back to the marks is the old behavior — wrong as a
    // denominator, but the alternative is dropping the row entirely, and the
    // guard is on the MARKS for exactly this reason.
    const detail = await nutritionDetail([
      nutritionLogDoc({ m1: { status: "done" }, m2: { status: "missed" } }, null),
    ]);

    expect(detail).toBe("1 de 2 comidas según el plan");
  });

  it("emits no row at all for a day that was created and never marked", async () => {
    // A day document with an empty `meals` map is not activity: something else
    // created it, and "0 de 4" would claim the client did something.
    const detail = await nutritionDetail([
      nutritionLogDoc({}, ["m1", "m2", "m3", "m4"]),
    ]);

    expect(detail).toBeNull();
  });
});

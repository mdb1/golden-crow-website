// nutrition-actions.test.ts
// The Server Actions behind the coach's assign flow (#914).
//
// What these lock, in order of how expensive the bug would be:
//   1. the assign and the trims land in ONE batch (a half-applied assign leaves the
//      client with a day that has two plans, or none, and the apps resolve it silently);
//   2. `endsOn: null` reaches Firestore as a PRESENT key;
//   3. ownership is checked against `users/{clientId}.coachId`, not against the argument;
//   4. `undefined` never reaches a write (the Admin SDK throws on it here);
//   5. every mutation emits `coach_activity` — "My Activity" reads that, not the raw docs.

const mockGetCurrentTrainer = jest.fn();
const mockUserGet = jest.fn();
const mockPlansGet = jest.fn();
const mockPlanDocGet = jest.fn();

const batchSet = jest.fn();
const batchUpdate = jest.fn();
const batchCommit = jest.fn().mockResolvedValue(undefined);
const planDocUpdate = jest.fn().mockResolvedValue(undefined);
const recordCoachActivityEvent = jest.fn().mockResolvedValue(undefined);

const planDocRefs = new Map<string, unknown>();

function planDocRef(id: string) {
  if (!planDocRefs.has(id)) {
    planDocRefs.set(id, { __planId: id, get: mockPlanDocGet, update: planDocUpdate });
  }
  return planDocRefs.get(id);
}

const mockCollection = jest.fn((name: string) => {
  if (name === "users") {
    return { doc: () => ({ get: mockUserGet }) };
  }
  if (name === "nutrition_plans") {
    return {
      doc: (id: string) => planDocRef(id),
      where: () => ({ limit: () => ({ get: mockPlansGet }) }),
    };
  }
  return { doc: () => ({ set: jest.fn(), get: jest.fn() }) };
});

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({
    collection: mockCollection,
    batch: () => ({ set: batchSet, update: batchUpdate, commit: batchCommit }),
  }),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__serverTimestamp__" },
}));

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

jest.mock("../coach-activity-log", () => ({
  recordCoachActivityEvent: (...args: unknown[]) => recordCoachActivityEvent(...args),
  nutritionPlanEvent: (args: Record<string, unknown>) => ({ eventId: `nut:${args.planId}`, ...args }),
}));

jest.mock("../civil-date", () => {
  const actual = jest.requireActual("../civil-date");
  return { ...actual, civilDateToday: () => "2026-08-18" };
});

import {
  assignNutritionPlan,
  listNutritionPlansForClient,
  previewNutritionAssign,
  softDeleteNutritionPlan,
} from "../nutrition-actions";

const TRAINER = "trainer-1";
const CLIENT = "client-sofia";

/** A stored plan doc as Firestore would hand it back. */
function planDoc(
  id: string,
  overrides: Record<string, unknown> = {},
): { id: string; data: () => Record<string, unknown> } {
  return {
    id,
    data: () => ({
      clientId: CLIENT,
      trainerId: TRAINER,
      source: "coach",
      name: { en: "Maintenance", es: "Mantenimiento" },
      startsOn: "2026-08-01",
      endsOn: null,
      targets: { kcal: 2400 },
      meals: [],
      ...overrides,
    }),
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT,
    name: { en: "Cut", es: "Definición" },
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    targets: { kcal: 2000, proteinG: 170, carbsG: null, fatG: null },
    meals: [
      {
        name: { en: "Breakfast", es: "Desayuno" },
        moment: "breakfast",
        targets: { kcal: 450, proteinG: null, carbsG: null, fatG: null },
        options: [{ text: { en: "Oats", es: "Avena" }, targets: { kcal: 450 } }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  planDocRefs.clear();
  mockGetCurrentTrainer.mockResolvedValue({ uid: TRAINER, email: "coach@example.com" });
  mockUserGet.mockResolvedValue({
    exists: true,
    data: () => ({ coachId: TRAINER, timezone: "America/Argentina/Buenos_Aires" }),
  });
  mockPlansGet.mockResolvedValue({ docs: [] });
});

describe("listNutritionPlansForClient", () => {
  it("refuses a client the caller does not coach", async () => {
    mockUserGet.mockResolvedValue({ exists: true, data: () => ({ coachId: "another-coach" }) });
    await expect(listNutritionPlansForClient(CLIENT)).rejects.toThrow("Forbidden");
  });

  it("refuses a client that does not exist", async () => {
    mockUserGet.mockResolvedValue({ exists: false });
    await expect(listNutritionPlansForClient(CLIENT)).rejects.toThrow("NotFound");
  });

  it("returns phases sorted by start date and today in the CLIENT's zone", async () => {
    mockPlansGet.mockResolvedValue({
      docs: [planDoc("late", { startsOn: "2026-09-01" }), planDoc("early")],
    });
    const { plans, context } = await listNutritionPlansForClient(CLIENT);
    expect(plans.map((plan) => plan.id)).toEqual(["early", "late"]);
    expect(context.clientTimezone).toBe("America/Argentina/Buenos_Aires");
    expect(context.todayCivil).toBe("2026-08-18");
  });

  it("skips a malformed doc instead of blanking the whole strip", async () => {
    mockPlansGet.mockResolvedValue({
      docs: [
        { id: "broken", data: () => ({ clientId: CLIENT }) }, // no trainerId / startsOn
        planDoc("good"),
      ],
    });
    const { plans } = await listNutritionPlansForClient(CLIENT);
    expect(plans.map((plan) => plan.id)).toEqual(["good"]);
  });

  it("reads an absent endsOn as open-ended, not as a missing plan", async () => {
    mockPlansGet.mockResolvedValue({ docs: [planDoc("open", { endsOn: undefined })] });
    const { plans } = await listNutritionPlansForClient(CLIENT);
    expect(plans[0]!.endsOn).toBeNull();
  });
});

describe("previewNutritionAssign", () => {
  it("describes the trim the save is about to apply", async () => {
    mockPlansGet.mockResolvedValue({ docs: [planDoc("running", { endsOn: null })] });
    const notices = await previewNutritionAssign({
      clientId: CLIENT,
      startsOn: "2026-09-01",
      endsOn: null,
    });
    expect(notices).toEqual([
      { planId: "running", planName: "Mantenimiento", kind: "trim", date: "2026-08-31" },
    ]);
  });

  it("excludes the plan being edited, so a phase does not trim itself", async () => {
    mockPlansGet.mockResolvedValue({ docs: [planDoc("self-edit", { endsOn: null })] });
    const notices = await previewNutritionAssign({
      clientId: CLIENT,
      startsOn: "2026-09-01",
      endsOn: null,
      excludePlanId: "self-edit",
    });
    expect(notices).toEqual([]);
  });
});

describe("assignNutritionPlan", () => {
  it("writes the new phase and the trim in ONE batch", async () => {
    mockPlansGet.mockResolvedValue({ docs: [planDoc("running", { endsOn: null })] });

    const result = await assignNutritionPlan(validInput());

    // The trim and the create must commit together. Half of this — a trim without its new
    // phase, or a new phase without the trim — leaves a day with two plans or none, and
    // the apps resolve it silently rather than fail.
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(batchSet).toHaveBeenCalledTimes(1);
    expect(batchCommit).toHaveBeenCalledTimes(1);

    const [trimmedRef, trimPatch] = batchUpdate.mock.calls[0]!;
    expect((trimmedRef as { __planId: string }).__planId).toBe("running");
    expect(trimPatch).toMatchObject({ endsOn: "2026-08-31" });

    expect(result.applied).toEqual([
      { planId: "running", planName: "Mantenimiento", kind: "trim", date: "2026-08-31" },
    ]);
  });

  it("stamps trainerId from the session and source from the branch", async () => {
    await assignNutritionPlan(validInput({ trainerId: "impostor" }));
    const [, payload] = batchSet.mock.calls[0]!;
    expect(payload).toMatchObject({ trainerId: TRAINER, source: "coach", clientId: CLIENT });
  });

  it("writes endsOn: null as a PRESENT key for an open-ended phase", async () => {
    await assignNutritionPlan(validInput({ endsOn: null }));
    const [, payload] = batchSet.mock.calls[0]!;
    expect(Object.prototype.hasOwnProperty.call(payload, "endsOn")).toBe(true);
    expect((payload as { endsOn: unknown }).endsOn).toBeNull();
  });

  it("never writes an undefined macro — the Admin SDK throws on those", async () => {
    // `gcFitnessFirestore()` does not set `ignoreUndefinedProperties`, so one
    // `field: undefined` takes the whole batch down. A macro the coach left blank is the
    // most likely source in this feature.
    await assignNutritionPlan(validInput());
    const [, payload] = batchSet.mock.calls[0]!;
    const serialized = JSON.stringify(payload, (_key, value) =>
      value === undefined ? "__UNDEFINED__" : value,
    );
    expect(serialized).not.toContain("__UNDEFINED__");
    expect((payload as { targets: Record<string, unknown> }).targets).toEqual({
      kcal: 2000,
      proteinG: 170,
    });
  });

  it("mints a mealId for every inline meal and numbers the order", async () => {
    await assignNutritionPlan(
      validInput({
        meals: [
          { name: { en: "A", es: "A" }, moment: "breakfast", options: [] },
          { name: { en: "B", es: "B" }, moment: "dinner", options: [] },
        ],
      }),
    );
    const [, payload] = batchSet.mock.calls[0]!;
    const meals = (payload as { meals: Array<{ mealId: string; order: number }> }).meals;
    expect(meals).toHaveLength(2);
    expect(meals[0]!.mealId).not.toBe(meals[1]!.mealId);
    expect(meals.map((meal) => meal.order)).toEqual([0, 1]);
  });

  it("emits coach_activity for the new phase AND for the one it trimmed", async () => {
    // A silent trim is exactly the thing a coach later swears they never did, and
    // "My Activity" reads coach_activity — not the raw docs.
    mockPlansGet.mockResolvedValue({ docs: [planDoc("running", { endsOn: null })] });
    await assignNutritionPlan(validInput());
    expect(recordCoachActivityEvent).toHaveBeenCalledTimes(2);
    const changes = recordCoachActivityEvent.mock.calls.map(
      (call) => (call[1] as { change: string }).change,
    );
    expect(changes).toEqual(["assigned", "trimmed"]);
  });

  it("refuses to assign to a client the caller does not coach", async () => {
    mockUserGet.mockResolvedValue({ exists: true, data: () => ({ coachId: "another-coach" }) });
    await expect(assignNutritionPlan(validInput())).rejects.toThrow("Forbidden");
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload before touching Firestore", async () => {
    await expect(assignNutritionPlan(validInput({ meals: [] }))).rejects.toBeDefined();
    expect(batchCommit).not.toHaveBeenCalled();
  });
});

describe("softDeleteNutritionPlan", () => {
  it("soft-deletes and logs it — there is no hard delete anywhere", async () => {
    mockPlanDocGet.mockResolvedValue({
      exists: true,
      data: () => planDoc("p1").data(),
    });
    await softDeleteNutritionPlan("p1");
    expect(planDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted: true }),
    );
    expect(recordCoachActivityEvent).toHaveBeenCalledTimes(1);
  });

  it("refuses a plan authored by another coach", async () => {
    mockPlanDocGet.mockResolvedValue({
      exists: true,
      data: () => planDoc("p1", { trainerId: "another-coach" }).data(),
    });
    await expect(softDeleteNutritionPlan("p1")).rejects.toThrow("Forbidden");
    expect(planDocUpdate).not.toHaveBeenCalled();
  });
});

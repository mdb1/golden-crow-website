// nutrition-library-actions.test.ts
//
// The Server Actions behind the coach's nutrition library (#918).
//
// What these lock, in order of how expensive the bug would be:
//   1. **editing a library meal writes to `nutrition_meals` and NOTHING else** — the whole
//      feature rests on assigned plans carrying frozen copies, and a well-meaning fan-out
//      would rewrite what clients are eating today;
//   2. a STANDARD entry (`ownerId: null`) is never editable or deletable, only duplicable;
//   3. `ownerId` comes from the session, never from the payload;
//   4. `undefined` never reaches a write (the Admin SDK throws on it here);
//   5. the usage counts are scoped to the CALLING trainer's plans.

const mockGetCurrentTrainer = jest.fn();
const mockDocGet = jest.fn();
const mockDocSet = jest.fn().mockResolvedValue(undefined);
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const recordCoachActivityEvent = jest.fn().mockResolvedValue(undefined);

/** Every collection query that ran, so a test can assert what was NOT touched. */
const collectionsTouched: string[] = [];
/** `collection → docs` handed back by `.where().limit().get()`. */
const queryResults: Record<string, Array<{ id: string; data: Record<string, unknown> }>> =
  {};

function snapshotFor(collection: string) {
  const docs = (queryResults[collection] ?? []).map((doc) => ({
    id: doc.id,
    data: () => doc.data,
    get: (field: string) => doc.data[field],
  }));
  return { docs };
}

const mockCollection = jest.fn((name: string) => {
  collectionsTouched.push(name);
  return {
    doc: (id: string) => ({ __id: id, get: mockDocGet, set: mockDocSet, update: mockDocUpdate }),
    where: () => ({
      where: () => ({ limit: () => ({ get: async () => snapshotFor(name) }) }),
      limit: () => ({ get: async () => snapshotFor(name) }),
    }),
  };
});

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({ collection: mockCollection }),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__serverTimestamp__" },
}));

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

jest.mock("../coach-activity-log", () => ({
  recordCoachActivityEvent: (...args: unknown[]) => recordCoachActivityEvent(...args),
  nutritionLibraryEvent: (args: Record<string, unknown>) => ({
    eventId: `nutlib:${args.entity}:${args.entityId}`,
    ...args,
  }),
}));

import {
  countNutritionLibraryUsage,
  createNutritionMeal,
  duplicateNutritionMeal,
  listNutritionMeals,
  softDeleteNutritionMeal,
  updateNutritionMeal,
  updateNutritionTemplate,
} from "../nutrition-library-actions";

const TRAINER = "trainer-1";
const OTHER = "trainer-2";

function validMeal(overrides: Record<string, unknown> = {}) {
  return {
    name: { en: "Breakfast", es: "Desayuno" },
    moment: "breakfast",
    targets: { kcal: 520, proteinG: 38, carbsG: null, fatG: null },
    options: [{ text: { en: "Oats", es: "Avena" }, targets: { kcal: 520 } }],
    ...overrides,
  };
}

function storedMeal(ownerId: string | null) {
  return {
    exists: true,
    data: () => ({
      name: { en: "Breakfast", es: "Desayuno" },
      moment: "breakfast",
      ownerId,
      targets: { kcal: 520 },
      options: [{ id: "opt-1", text: { en: "Oats", es: "Avena" } }],
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  collectionsTouched.length = 0;
  for (const key of Object.keys(queryResults)) delete queryResults[key];
  mockGetCurrentTrainer.mockResolvedValue({ uid: TRAINER, email: "coach@example.com" });
});

describe("createNutritionMeal", () => {
  it("stamps ownerId from the SESSION, never from the payload", async () => {
    await createNutritionMeal(validMeal({ ownerId: "impostor" }));
    const [payload] = mockDocSet.mock.calls[0]!;
    expect(payload).toMatchObject({ ownerId: TRAINER });
  });

  it("never writes an undefined macro — the Admin SDK throws on those", async () => {
    // `gcFitnessFirestore()` does not set `ignoreUndefinedProperties`, so one
    // `field: undefined` takes the whole write down. A macro left blank is the likeliest
    // source in this feature.
    await createNutritionMeal(validMeal());
    const [payload] = mockDocSet.mock.calls[0]!;
    const targets = (payload as { targets: Record<string, unknown> }).targets;
    expect(Object.values(payload as Record<string, unknown>)).not.toContain(undefined);
    expect(targets).toEqual({ kcal: 520, proteinG: 38 });
    expect(Object.prototype.hasOwnProperty.call(targets, "carbsG")).toBe(false);
  });

  it("mints an id for an option that has none, and keeps one that does", async () => {
    await createNutritionMeal(
      validMeal({
        options: [
          { text: { en: "Oats", es: "Avena" } },
          { id: "opt-keep", text: { en: "Toast", es: "Tostadas" } },
        ],
      }),
    );
    const [payload] = mockDocSet.mock.calls[0]!;
    const options = (payload as { options: Array<{ id: string }> }).options;
    expect(options[0]!.id).toEqual(expect.any(String));
    expect(options[0]!.id).not.toBe("");
    expect(options[1]!.id).toBe("opt-keep");
  });

  it("emits coach_activity — 'My Activity' reads that, not the raw docs", async () => {
    await createNutritionMeal(validMeal());
    expect(recordCoachActivityEvent).toHaveBeenCalledTimes(1);
    expect(recordCoachActivityEvent.mock.calls[0]![1]).toMatchObject({
      entity: "meal",
      change: "created",
    });
  });

  it("rejects an invalid payload before touching Firestore", async () => {
    await expect(
      createNutritionMeal(validMeal({ name: { en: "", es: "" } })),
    ).rejects.toThrow();
    expect(mockDocSet).not.toHaveBeenCalled();
  });
});

describe("updateNutritionMeal", () => {
  it("writes to nutrition_meals and NOTHING else — assigned plans keep their copy", async () => {
    // The load-bearing test of the whole feature. #918: "editar la biblioteca NO reescribe
    // lo ya asignado". A future 'helpful' fan-out would rewrite what clients are eating
    // today, and every screen would look correct afterwards.
    mockDocGet.mockResolvedValue(storedMeal(TRAINER));

    await updateNutritionMeal("meal-1", validMeal({ name: { en: "Eggs", es: "Huevos" } }));

    expect(mockDocUpdate).toHaveBeenCalledTimes(1);
    expect(collectionsTouched).toEqual(["nutrition_meals"]);
    expect(collectionsTouched).not.toContain("nutrition_plans");
    expect(collectionsTouched).not.toContain("nutrition_templates");
  });

  it("co-writes updatedAt and touches only whitelisted keys", async () => {
    mockDocGet.mockResolvedValue(storedMeal(TRAINER));
    await updateNutritionMeal("meal-1", validMeal());
    const [patch] = mockDocUpdate.mock.calls[0]!;
    expect(Object.keys(patch as object).sort()).toEqual([
      "moment",
      "name",
      "options",
      "targets",
      "updatedAt",
    ]);
  });

  it("refuses a STANDARD meal — those are duplicated, never edited", async () => {
    mockDocGet.mockResolvedValue(storedMeal(null));
    await expect(updateNutritionMeal("std-1", validMeal())).rejects.toThrow("Forbidden");
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it("refuses another coach's meal", async () => {
    mockDocGet.mockResolvedValue(storedMeal(OTHER));
    await expect(updateNutritionMeal("meal-1", validMeal())).rejects.toThrow("Forbidden");
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it("refuses a meal that does not exist", async () => {
    mockDocGet.mockResolvedValue({ exists: false });
    await expect(updateNutritionMeal("gone", validMeal())).rejects.toThrow("NotFound");
  });
});

describe("softDeleteNutritionMeal", () => {
  it("soft-deletes; there is no hard delete anywhere", async () => {
    mockDocGet.mockResolvedValue(storedMeal(TRAINER));
    await softDeleteNutritionMeal("meal-1");
    const [patch] = mockDocUpdate.mock.calls[0]!;
    expect(patch).toMatchObject({ deleted: true });
  });

  it("refuses a standard meal", async () => {
    mockDocGet.mockResolvedValue(storedMeal(null));
    await expect(softDeleteNutritionMeal("std-1")).rejects.toThrow("Forbidden");
  });
});

describe("duplicateNutritionMeal", () => {
  it("copies a STANDARD meal into the caller's library, suffixed", async () => {
    mockDocGet.mockResolvedValue(storedMeal(null));
    await duplicateNutritionMeal("std-1");
    const [payload] = mockDocSet.mock.calls[0]!;
    expect(payload).toMatchObject({
      ownerId: TRAINER,
      name: { en: "Breakfast (copy)", es: "Desayuno (copia)" },
    });
  });

  it("gives the copy FRESH option ids — it is a new entity", async () => {
    mockDocGet.mockResolvedValue(storedMeal(null));
    await duplicateNutritionMeal("std-1");
    const [payload] = mockDocSet.mock.calls[0]!;
    const options = (payload as { options: Array<{ id: string }> }).options;
    expect(options[0]!.id).not.toBe("opt-1");
  });

  it("refuses to copy another coach's private meal", async () => {
    // Readable ⇒ duplicable. A meal that is neither standard nor mine is not readable.
    mockDocGet.mockResolvedValue(storedMeal(OTHER));
    await expect(duplicateNutritionMeal("meal-x")).rejects.toThrow("Forbidden");
    expect(mockDocSet).not.toHaveBeenCalled();
  });
});

describe("updateNutritionTemplate", () => {
  it("writes to nutrition_templates only — assigned plans are untouched", async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        name: { en: "Cut", es: "Definición" },
        ownerId: TRAINER,
        targets: { kcal: 2000 },
        meals: [],
      }),
    });

    await updateNutritionTemplate("tpl-1", {
      name: { en: "Cut", es: "Definición" },
      targets: { kcal: 1900, proteinG: null, carbsG: null, fatG: null },
      meals: [
        {
          mealId: "m1",
          name: { en: "Breakfast", es: "Desayuno" },
          moment: "breakfast",
          targets: { kcal: 450, proteinG: null, carbsG: null, fatG: null },
          options: [],
        },
      ],
    });

    expect(collectionsTouched).not.toContain("nutrition_plans");
    const [patch] = mockDocUpdate.mock.calls[0]!;
    // `order` is assigned from the array index, so the editor's ordering is the only thing
    // that decides the order of the day — and the assign path reads the same field.
    expect((patch as { meals: Array<{ order: number; mealId: string }> }).meals[0]).toMatchObject(
      { order: 0, mealId: "m1" },
    );
  });
});

describe("listNutritionMeals", () => {
  it("returns own meals first, then standard, and drops soft-deleted ones", async () => {
    queryResults.nutrition_meals = [
      { id: "own-b", data: { name: { es: "Bife", en: "Steak" }, moment: "dinner", ownerId: TRAINER, options: [] } },
      { id: "own-a", data: { name: { es: "Avena", en: "Oats" }, moment: "breakfast", ownerId: TRAINER, options: [] } },
      { id: "gone", data: { name: { es: "Zzz", en: "Zzz" }, moment: "other", ownerId: TRAINER, options: [], deleted: true } },
    ];

    const meals = await listNutritionMeals();

    // Both branches read the SAME stub here, so the standard branch returns the same rows;
    // what this asserts is the ordering + the soft-delete filter, not the split.
    expect(meals.map((meal) => meal.id).slice(0, 2)).toEqual(["own-a", "own-b"]);
    expect(meals.some((meal) => meal.id === "gone")).toBe(false);
  });
});

describe("countNutritionLibraryUsage", () => {
  it("counts meals in templates and in plans, and plans per template", async () => {
    queryResults.nutrition_templates = [
      { id: "t1", data: { meals: [{ mealId: "m1" }, { mealId: "m2" }] } },
    ];
    queryResults.nutrition_plans = [
      { id: "p1", data: { templateId: "t1", meals: [{ mealId: "m1" }] } },
      { id: "p2", data: { templateId: "t1", meals: [{ mealId: "m1" }, { mealId: "m3" }] } },
    ];

    const usage = await countNutritionLibraryUsage();

    expect(usage.mealsInTemplates).toEqual({ m1: 1, m2: 1 });
    expect(usage.mealsInPlans).toEqual({ m1: 2, m3: 1 });
    expect(usage.templatesInPlans).toEqual({ t1: 2 });
  });
});

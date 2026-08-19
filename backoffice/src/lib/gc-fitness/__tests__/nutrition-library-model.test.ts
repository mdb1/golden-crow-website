// nutrition-library-model.test.ts
//
// The pure half of the nutrition library (#918). What these lock, in order of how expensive
// the bug would be:
//
//   1. the usage counts, because the pill is a WARNING — it is the only thing that tells a
//      coach an edit will NOT reach the 9 plans that already carry this meal;
//   2. the deviation diff, because "lo modificado marcado" that marks the wrong rows is
//      worse than no marking at all;
//   3. the form schemas, which have to accept exactly what the assign schema accepts, or a
//      meal that is legal in the library blows up at ASSIGN time.

import {
  duplicatedLibraryName,
  nutritionMealFormSchema,
  nutritionTemplateFormSchema,
  tallyMealUsageInPlans,
  tallyMealUsageInTemplates,
  tallyTemplateUsageInPlans,
  templateDeviations,
  libraryUsageFor,
} from "../nutrition-library-model";

describe("tallyMealUsageInTemplates", () => {
  it("counts each template once, even when it lists the meal twice", () => {
    // The question the pill answers is "how many templates would I have to re-check",
    // not "how many rows exist".
    const counts = tallyMealUsageInTemplates([
      { id: "t1", meals: [{ mealId: "m1" }, { mealId: "m1" }, { mealId: "m2" }] },
      { id: "t2", meals: [{ mealId: "m1" }] },
    ]);
    expect(counts).toEqual({ m1: 2, m2: 1 });
  });

  it("ignores soft-deleted templates", () => {
    const counts = tallyMealUsageInTemplates([
      { id: "t1", deleted: true, meals: [{ mealId: "m1" }] },
      { id: "t2", meals: [{ mealId: "m1" }] },
    ]);
    expect(counts).toEqual({ m1: 1 });
  });

  it("survives a template with no meals array at all", () => {
    expect(tallyMealUsageInTemplates([{ id: "t1" }])).toEqual({});
    expect(tallyMealUsageInTemplates([{ id: "t1", meals: null }])).toEqual({});
  });
});

describe("tallyMealUsageInPlans", () => {
  it("counts CLOSED phases too — that is where the history is", () => {
    // The number exists to warn that a name is the one a client already read on a day they
    // logged. Dropping past phases would under-warn exactly where it matters.
    const counts = tallyMealUsageInPlans([
      { id: "p1", meals: [{ mealId: "m1" }] },
      { id: "p2", meals: [{ mealId: "m1" }, { mealId: "m3" }] },
      { id: "p3", deleted: true, meals: [{ mealId: "m1" }] },
    ]);
    expect(counts).toEqual({ m1: 2, m3: 1 });
  });
});

describe("tallyTemplateUsageInPlans", () => {
  it("counts plans by the template they came from", () => {
    const counts = tallyTemplateUsageInPlans([
      { id: "p1", templateId: "t1" },
      { id: "p2", templateId: "t1" },
      { id: "p3", templateId: null },
      { id: "p4", deleted: true, templateId: "t1" },
    ]);
    expect(counts).toEqual({ t1: 2 });
  });
});

describe("libraryUsageFor", () => {
  it("reads a missing id as zero, not undefined", () => {
    // Rendering `undefined` as a pill label is how "in undefined plans" ships.
    expect(libraryUsageFor("nope", { m1: 2 }, { m1: 3 })).toEqual({
      templates: 0,
      plans: 0,
    });
    expect(libraryUsageFor("m1", { m1: 2 }, { m1: 3 })).toEqual({
      templates: 2,
      plans: 3,
    });
  });
});

describe("duplicatedLibraryName", () => {
  it("suffixes BOTH slots in their own language", () => {
    expect(duplicatedLibraryName({ en: "Breakfast", es: "Desayuno" })).toEqual({
      en: "Breakfast (copy)",
      es: "Desayuno (copia)",
    });
  });

  it("stays inside the 120-char field limit", () => {
    const long = "x".repeat(119);
    const copy = duplicatedLibraryName({ en: long, es: long });
    expect(copy.en.length).toBeLessThanOrEqual(120);
    expect(copy.es.length).toBeLessThanOrEqual(120);
  });
});

describe("nutritionMealFormSchema", () => {
  const valid = {
    name: { en: "Breakfast", es: "Desayuno" },
    moment: "breakfast",
    targets: { kcal: 520, proteinG: 38, carbsG: null, fatG: null },
    options: [{ text: { en: "Oats", es: "Avena" }, targets: { kcal: 520 } }],
  };

  it("accepts a meal with calories only", () => {
    const parsed = nutritionMealFormSchema.safeParse({
      ...valid,
      targets: { kcal: 520, proteinG: null, carbsG: null, fatG: null },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a meal with NO targets at all", () => {
    const parsed = nutritionMealFormSchema.safeParse({
      name: valid.name,
      moment: "snack",
      options: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a blank name in either language", () => {
    expect(
      nutritionMealFormSchema.safeParse({ ...valid, name: { en: "", es: "Desayuno" } })
        .success,
    ).toBe(false);
    expect(
      nutritionMealFormSchema.safeParse({ ...valid, name: { en: "Breakfast", es: "" } })
        .success,
    ).toBe(false);
  });

  it("rejects a fat-fingered macro", () => {
    // 24000 kcal would sit in a client's plan looking authoritative.
    expect(
      nutritionMealFormSchema.safeParse({
        ...valid,
        targets: { kcal: 24000, proteinG: null, carbsG: null, fatG: null },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown moment", () => {
    expect(
      nutritionMealFormSchema.safeParse({ ...valid, moment: "brunch" }).success,
    ).toBe(false);
  });
});

describe("nutritionTemplateFormSchema", () => {
  const meal = {
    name: { en: "Breakfast", es: "Desayuno" },
    moment: "breakfast" as const,
    targets: { kcal: 520, proteinG: null, carbsG: null, fatG: null },
    options: [],
  };

  it("accepts a one-meal template", () => {
    const parsed = nutritionTemplateFormSchema.safeParse({
      name: { en: "Cut", es: "Definición" },
      targets: { kcal: 2000, proteinG: null, carbsG: null, fatG: null },
      meals: [meal],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a template with no meals", () => {
    // A plan with nothing to mark cannot be complied with, and the day would read
    // `unmarked` forever with no way out.
    const parsed = nutritionTemplateFormSchema.safeParse({
      name: { en: "Cut", es: "Definición" },
      targets: {},
      meals: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses two meals sharing a mealId", () => {
    // Once assigned, both rows would collapse into ONE key of the daily log's `meals` map:
    // the client marks breakfast and dinner changes too.
    const parsed = nutritionTemplateFormSchema.safeParse({
      name: { en: "Cut", es: "Definición" },
      targets: {},
      meals: [
        { ...meal, mealId: "m1" },
        { ...meal, mealId: "m1" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("allows two meals with NO mealId — inline rows are not duplicates", () => {
    const parsed = nutritionTemplateFormSchema.safeParse({
      name: { en: "Cut", es: "Definición" },
      targets: {},
      meals: [meal, meal],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("templateDeviations", () => {
  const template = {
    targets: { kcal: 2000, proteinG: 170 },
    meals: [
      {
        name: { en: "Breakfast", es: "Desayuno" },
        moment: "breakfast" as const,
        targets: { kcal: 450 },
        options: [{ text: { en: "Oats", es: "Avena" } }],
      },
      {
        name: { en: "Lunch", es: "Almuerzo" },
        moment: "lunch" as const,
        targets: { kcal: 700 },
        options: [],
      },
    ],
  };

  it("reports nothing when the draft matches the template", () => {
    expect(templateDeviations(template, template)).toEqual([]);
  });

  it("does not report a macro the template never set and the draft left unset", () => {
    // Absent, null and undefined are ONE value: "no target". Reporting that as a change
    // would light up every row of every assign made from a calories-only template.
    const draft = {
      targets: { kcal: 2000, proteinG: 170, carbsG: null, fatG: undefined },
      meals: template.meals.map((meal) => ({
        ...meal,
        targets: { ...meal.targets, fatG: null },
      })),
    };
    expect(templateDeviations(template, draft)).toEqual([]);
  });

  it("reports a retouched daily macro", () => {
    const draft = { ...template, targets: { kcal: 1800, proteinG: 170 } };
    expect(templateDeviations(template, draft)).toEqual([
      { scope: "daily", field: "kcal" },
    ]);
  });

  it("reports a retouched meal by its INDEX, not by name", () => {
    const draft = {
      ...template,
      meals: [
        template.meals[0]!,
        { ...template.meals[1]!, targets: { kcal: 650 } },
      ],
    };
    expect(templateDeviations(template, draft)).toEqual([
      { scope: { mealIndex: 1 }, field: "kcal" },
    ]);
  });

  it("reports a renamed meal, a moved moment and changed options", () => {
    const draft = {
      ...template,
      meals: [
        {
          ...template.meals[0]!,
          name: { en: "Breakfast", es: "Desayuno grande" },
          moment: "snack" as const,
          options: [{ text: { en: "Toast", es: "Tostadas" } }],
        },
        template.meals[1]!,
      ],
    };
    expect(templateDeviations(template, draft)).toEqual([
      { scope: { mealIndex: 0 }, field: "name" },
      { scope: { mealIndex: 0 }, field: "moment" },
      { scope: { mealIndex: 0 }, field: "options" },
    ]);
  });

  it("marks a meal the coach ADDED on top of the template", () => {
    const draft = {
      ...template,
      meals: [
        ...template.meals,
        {
          name: { en: "Snack", es: "Merienda" },
          moment: "snack" as const,
          targets: {},
          options: [],
        },
      ],
    };
    expect(templateDeviations(template, draft)).toEqual([
      { scope: { mealIndex: 2 }, field: "name" },
    ]);
  });

  it("says nothing about a meal the coach REMOVED — there is no row left to mark", () => {
    const draft = { ...template, meals: [template.meals[0]!] };
    expect(templateDeviations(template, draft)).toEqual([]);
  });
});

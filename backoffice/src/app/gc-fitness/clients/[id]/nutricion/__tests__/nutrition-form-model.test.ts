// nutrition-form-model.test.ts
//
// #507 — the pure half of AssignNutritionForm, moved out of the component. The
// form's own suite (assign-nutrition-form.test.tsx) still drives it end to end;
// these pin the conversions and the payload directly.

import type { NutritionTemplateRow } from "@/lib/gc-fitness/nutrition-library-model";
import type { NutritionPlan } from "@/lib/gc-fitness/nutrition-schema";

import {
  buildNutritionPayload,
  canSplitPhase,
  draftMealsFromPlan,
  draftMealsFromTemplate,
  emptyMeal,
  englishOr,
  initialName,
  macroText,
  momentKey,
  numberOrNull,
  nutritionFormDeviations,
  rekeyDraftMeals,
  type NutritionEditContext,
} from "../asignar/nutrition-form-model";

function plan(overrides: Partial<NutritionPlan> = {}): NutritionPlan {
  return {
    name: { es: "Definición", en: "" },
    startsOn: "2026-11-01",
    endsOn: null,
    targets: { kcal: 2000, proteinG: 150, carbsG: null, fatG: 60 },
    meals: [
      {
        mealId: "m2",
        order: 2,
        name: { es: "Cena", en: "Dinner" },
        moment: "dinner",
        targets: { kcal: 700 },
        options: [{ id: "o1", text: { es: "Pollo", en: "" }, targets: { kcal: 650 } }],
      },
      {
        mealId: "m1",
        order: 1,
        name: { es: "", en: "Breakfast" },
        moment: "breakfast",
        options: [],
      },
    ],
    ...overrides,
  } as unknown as NutritionPlan;
}

function editing(overrides: Partial<NutritionEditContext> = {}): NutritionEditContext {
  return {
    planId: "p1",
    plan: plan(),
    state: "current",
    todayCivil: "2026-11-15",
    ...overrides,
  };
}

describe("small helpers", () => {
  it("englishOr falls back to the Spanish text", () => {
    expect(englishOr("  ", " Cena ")).toBe("Cena");
    expect(englishOr(" Dinner ", "Cena")).toBe("Dinner");
  });

  it("numberOrNull keeps blanks unset and reads es decimals (#451)", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("  ")).toBeNull();
    expect(numberOrNull("12,5")).toBe(12.5);
    expect(numberOrNull("abc")).toBeNull();
  });

  it("macroText never turns a missing macro into 0", () => {
    expect(macroText(null)).toBe("");
    expect(macroText(undefined)).toBe("");
    expect(macroText(0)).toBe("0");
  });

  it("initialName prefers the asked language and falls back", () => {
    expect(initialName(null, "es")).toBe("");
    expect(initialName(editing(), "es")).toBe("Definición");
    expect(initialName(editing(), "en")).toBe("Definición");
  });

  it("momentKey maps every moment", () => {
    expect(momentKey("breakfast")).toBe("momentBreakfast");
    expect(momentKey("lunch")).toBe("momentLunch");
    expect(momentKey("snack")).toBe("momentSnack");
    expect(momentKey("dinner")).toBe("momentDinner");
    expect(momentKey("other")).toBe("momentOther");
  });

  it("emptyMeal mints a unique key", () => {
    const a = emptyMeal("breakfast");
    const b = emptyMeal("breakfast");
    expect(a.key).not.toBe(b.key);
    expect(a).toMatchObject({ name: "", moment: "breakfast", options: [] });
  });
});

describe("canSplitPhase (#949)", () => {
  it("only for a running phase that started before today", () => {
    expect(canSplitPhase(null)).toBe(false);
    expect(canSplitPhase(editing())).toBe(true);
    expect(canSplitPhase(editing({ state: "scheduled" }))).toBe(false);
    expect(canSplitPhase(editing({ todayCivil: "2026-11-01" }))).toBe(false);
  });
});

describe("draftMealsFromPlan", () => {
  it("keeps mealId + option ids, sorts by order, and mirrors blank languages", () => {
    const meals = draftMealsFromPlan(plan());
    expect(meals.map((m) => m.mealId)).toEqual(["m1", "m2"]);
    expect(meals[0]).toMatchObject({ name: "Breakfast", nameEn: "Breakfast", kcal: "" });
    expect(meals[1]).toMatchObject({ name: "Cena", nameEn: "Dinner", kcal: "700", proteinG: "" });
    expect(meals[1].options[0]).toMatchObject({ id: "o1", text: "Pollo", textEn: "Pollo", kcal: "650" });
  });

  it("falls back to one empty breakfast", () => {
    const meals = draftMealsFromPlan(plan({ meals: [] }));
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ moment: "breakfast", name: "" });
  });
});

describe("draftMealsFromTemplate / rekeyDraftMeals", () => {
  const template = {
    id: "tpl1",
    name: { es: "Volumen", en: "Bulk" },
    targets: { kcal: 3000 },
    // Both languages filled: a blank slot is mirrored on load, which the diff
    // would (correctly) report as a retouch.
    meals: plan().meals.map((meal) =>
      meal.mealId === "m1" ? { ...meal, name: { es: "Desayuno", en: "Breakfast" } } : meal,
    ),
  } as unknown as NutritionTemplateRow;

  it("copies the template's meals keeping mealId but NOT option ids", () => {
    const meals = draftMealsFromTemplate(template);
    expect(meals.map((m) => m.mealId)).toEqual(["m1", "m2"]);
    expect(meals[1].options[0]).not.toHaveProperty("id");
    expect(meals[1].options[0]).toMatchObject({ text: "Pollo", kcal: "650" });
  });

  it("re-keys restored meals and options", () => {
    const meals = draftMealsFromTemplate(template);
    const rekeyed = rekeyDraftMeals(meals);
    expect(rekeyed[1].key).not.toBe(meals[1].key);
    expect(rekeyed[1].options[0].key).not.toBe(meals[1].options[0].key);
    expect(rekeyed[1]).toMatchObject({ ...meals[1], key: rekeyed[1].key, options: rekeyed[1].options });
  });

  it("deviations: none for an untouched copy, daily once a target changes", () => {
    const meals = draftMealsFromTemplate(template);
    const values = { kcal: "3000", proteinG: "", carbsG: "", fatG: "", meals };
    expect(nutritionFormDeviations(null, values)).toEqual([]);
    expect(nutritionFormDeviations(template, values)).toEqual([]);
    const changed = nutritionFormDeviations(template, { ...values, kcal: "2900" });
    expect(changed.some((d) => d.scope === "daily")).toBe(true);
  });
});

describe("buildNutritionPayload", () => {
  it("maps the drafts to the wire shape", () => {
    const meals = draftMealsFromPlan(plan());
    const payload = buildNutritionPayload({
      clientId: "c1",
      sourceTemplate: null,
      name: " Definición ",
      nameEn: "",
      startsOn: "2026-11-15",
      effectiveEndsOn: null,
      kcal: "2000",
      proteinG: "150,5",
      carbsG: "",
      fatG: "60",
      meals,
    });
    expect(payload).toEqual({
      clientId: "c1",
      templateId: null,
      name: { es: "Definición", en: "Definición" },
      startsOn: "2026-11-15",
      endsOn: null,
      targets: { kcal: 2000, proteinG: 150.5, carbsG: null, fatG: 60 },
      meals: [
        {
          mealId: "m1",
          name: { es: "Breakfast", en: "Breakfast" },
          moment: "breakfast",
          targets: { kcal: null, proteinG: null, carbsG: null, fatG: null },
          options: [],
        },
        {
          mealId: "m2",
          name: { es: "Cena", en: "Dinner" },
          moment: "dinner",
          targets: { kcal: 700, proteinG: null, carbsG: null, fatG: null },
          options: [{ id: "o1", text: { es: "Pollo", en: "Pollo" }, targets: { kcal: 650 } }],
        },
      ],
    });
  });

  it("carries the template id and omits ids a draft never had", () => {
    const payload = buildNutritionPayload({
      clientId: "c1",
      sourceTemplate: { id: "tpl9" } as NutritionTemplateRow,
      name: "X",
      nameEn: "Y",
      startsOn: "2026-11-15",
      effectiveEndsOn: "2026-12-15",
      kcal: "",
      proteinG: "",
      carbsG: "",
      fatG: "",
      meals: [emptyMeal("other")],
    });
    expect(payload.templateId).toBe("tpl9");
    expect(payload.name).toEqual({ es: "X", en: "Y" });
    expect(payload.endsOn).toBe("2026-12-15");
    expect(payload.meals[0]).not.toHaveProperty("mealId");
  });
});

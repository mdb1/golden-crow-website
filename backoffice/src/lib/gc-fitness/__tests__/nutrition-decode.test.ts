// nutrition-decode.test.ts — #451 regression net.
//
// The forgiving decoders every server surface uses to read `/nutrition_plans`.
// "Forgiving" is the contract: ONE malformed doc must be skipped (null), never
// thrown on, so the rest of a coach's phase strip still renders. And legacy /
// missing fields must decode to their explicit "absent" values — never to a
// zero or to "open-ended" by accident.

import { decodeNutritionPlan, normalizeNutritionTargets } from "../nutrition-decode";

describe("normalizeNutritionTargets", () => {
  it("keeps the four finite numeric macros", () => {
    expect(normalizeNutritionTargets({ kcal: 2000, proteinG: 150, carbsG: 220.5, fatG: 0 })).toEqual(
      { kcal: 2000, proteinG: 150, carbsG: 220.5, fatG: 0 },
    );
  });

  it("drops strings, null, NaN, Infinity, booleans and objects", () => {
    expect(
      normalizeNutritionTargets({
        kcal: "2000",
        proteinG: null,
        carbsG: Number.NaN,
        fatG: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({});
    expect(normalizeNutritionTargets({ kcal: true, proteinG: {}, carbsG: [1], fatG: undefined })).toEqual(
      {},
    );
  });

  it("drops unknown keys (no smuggled fields onto the wire)", () => {
    expect(normalizeNutritionTargets({ kcal: 1800, fiberG: 30, trainerId: "x" })).toEqual({
      kcal: 1800,
    });
  });

  it("an empty object stays empty — absent is not zero", () => {
    expect(normalizeNutritionTargets({})).toEqual({});
  });
});

function plan(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    trainerId: "coach-1",
    source: "coach",
    name: { en: "Cut", es: "Definición" },
    templateId: "tpl-1",
    startsOn: "2026-10-01",
    endsOn: "2026-12-31",
    targets: { kcal: 2000 },
    meals: [{ mealId: "m1" }],
    reminders: { mode: "daily", dailyTime: "08:00" },
    deleted: false,
    ...overrides,
  };
}

describe("decodeNutritionPlan", () => {
  it("decodes a complete document", () => {
    expect(decodeNutritionPlan("p1", plan())).toEqual({
      id: "p1",
      clientId: "client-1",
      trainerId: "coach-1",
      source: "coach",
      name: { en: "Cut", es: "Definición" },
      templateId: "tpl-1",
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
      targets: { kcal: 2000 },
      meals: [{ mealId: "m1" }],
      reminders: { mode: "daily", dailyTime: "08:00" },
      deleted: false,
    });
  });

  it.each([null, undefined, "plan", 42, true])("returns null for a non-object (%p)", (raw) => {
    expect(decodeNutritionPlan("p1", raw)).toBeNull();
  });

  it.each(["clientId", "trainerId", "startsOn"])("returns null when %s is missing", (key) => {
    const raw: Record<string, unknown> = plan();
    delete raw[key];
    expect(decodeNutritionPlan("p1", raw)).toBeNull();
  });

  it.each(["clientId", "trainerId", "startsOn"])("returns null when %s is empty or not a string", (key) => {
    expect(decodeNutritionPlan("p1", plan({ [key]: "" }))).toBeNull();
    expect(decodeNutritionPlan("p1", plan({ [key]: 123 }))).toBeNull();
  });

  it("decodes a legacy doc with only the required keys to explicit defaults", () => {
    expect(
      decodeNutritionPlan("legacy", {
        clientId: "c",
        trainerId: "t",
        startsOn: "2026-01-01",
      }),
    ).toEqual({
      id: "legacy",
      clientId: "c",
      trainerId: "t",
      source: "coach",
      name: { en: "", es: "" },
      templateId: null,
      startsOn: "2026-01-01",
      endsOn: null,
      targets: {},
      meals: [],
      reminders: null,
      deleted: false,
    });
  });

  it("an explicit endsOn: null stays open-ended", () => {
    expect(decodeNutritionPlan("p", plan({ endsOn: null }))?.endsOn).toBeNull();
  });

  it("only 'self' maps to source self; anything else is coach", () => {
    expect(decodeNutritionPlan("p", plan({ source: "self" }))?.source).toBe("self");
    expect(decodeNutritionPlan("p", plan({ source: "SELF" }))?.source).toBe("coach");
    expect(decodeNutritionPlan("p", plan({ source: undefined }))?.source).toBe("coach");
  });

  it("deleted is true ONLY for literal true", () => {
    expect(decodeNutritionPlan("p", plan({ deleted: true }))?.deleted).toBe(true);
    expect(decodeNutritionPlan("p", plan({ deleted: "true" }))?.deleted).toBe(false);
    expect(decodeNutritionPlan("p", plan({ deleted: 1 }))?.deleted).toBe(false);
  });

  it("tolerates a malformed name, meals, endsOn and templateId", () => {
    const decoded = decodeNutritionPlan(
      "p",
      plan({ name: "Cut", meals: { m1: {} }, endsOn: 20261231, templateId: 7 }),
    );
    expect(decoded?.name).toEqual({ en: "", es: "" });
    expect(decoded?.meals).toEqual([]);
    expect(decoded?.endsOn).toBeNull();
    expect(decoded?.templateId).toBeNull();
    expect(decodeNutritionPlan("p", plan({ name: { en: 1, es: "Corte" } }))?.name).toEqual({
      en: "",
      es: "Corte",
    });
    expect(decodeNutritionPlan("p", plan({ name: null }))?.name).toEqual({ en: "", es: "" });
  });

  it("null targets / reminders decode to {} / null", () => {
    const decoded = decodeNutritionPlan("p", plan({ targets: null, reminders: undefined }));
    expect(decoded?.targets).toEqual({});
    expect(decoded?.reminders).toBeNull();
  });

  // Regression (#451): the read path passed `targets` through VERBATIM while the
  // write path ran `normalizeNutritionTargets`, so a doc with `kcal: "2000"`
  // decoded as a STRING typed as number (`target + x` concatenated). The decode
  // now runs the same normalization and drops non-finite-number targets.
  it("drops non-numeric targets on read, like the writer does", () => {
    const decoded = decodeNutritionPlan(
      "p",
      plan({ targets: { kcal: "2000", proteinG: 150, carbsG: Number.NaN } }),
    );
    expect(decoded?.targets).toEqual({ proteinG: 150 });
  });
});

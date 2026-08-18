// nutrition-schema.test.ts
// Twin of iOS `NutritionSchemaTests.swift` and Kotlin `NutritionSchemaTest.kt` (#913).
// Locks the wire shapes: the composite doc id, forgiving decode, the explicit-`null` keys
// that #400 taught us to write, coach/self field-set parity, and the macro delta.

import { FirestoreCollections } from "../collections";
import {
  computeMacroDelta,
  isSelfAuthoredPlan,
  isStandardNutritionEntry,
  isValidNutritionTime,
  macroDeltaIsEmpty,
  macroTargetsAreEmpty,
  nutritionLogDocId,
  parseNutritionMealMoment,
  parseNutritionMealStatus,
  parseNutritionPlanSource,
  parseNutritionReminderMode,
  planIsActiveOn,
  statusCountsAsCompliant,
  type NutritionMeal,
} from "../nutrition-schema";
import { CLIENT_ID, TODAY, mixed, name, phaseA, selfPlan } from "./nutrition-fixtures";

describe("the composite doc id", () => {
  it("is ${clientId}_${civilDate}", () => {
    expect(nutritionLogDocId("client-sofia", "2026-08-18")).toBe(
      "client-sofia_2026-08-18",
    );
  });

  it("re-marking the same day targets the same doc — idempotent by construction", () => {
    // A day is ONE document. Marking four meals is four updates to one doc, not four
    // docs, so a re-tap can never fork the day's history.
    const first = nutritionLogDocId(CLIENT_ID, TODAY);
    expect(nutritionLogDocId(CLIENT_ID, TODAY)).toBe(first);
    // And the civil date is what separates days — NOT an instant. 23:50 in Buenos Aires
    // must produce the 18th's id, which is only true because the caller passes a
    // civilDateToday() string rather than slicing a toISOString().
    expect(nutritionLogDocId(CLIENT_ID, "2026-08-19")).not.toBe(first);
  });
});

describe("forgiving decode", () => {
  it("an unknown meal status decodes to missed, never inflating adherence", () => {
    // The conservative reading: an unparseable state is not a completion. A forgiving
    // fallback to "done" would let a corrupt value hand out credit.
    expect(parseNutritionMealStatus("halfway")).toBe("missed");
    expect(parseNutritionMealStatus(undefined)).toBe("missed");
    expect(statusCountsAsCompliant(parseNutritionMealStatus("halfway"))).toBe(false);
    expect(statusCountsAsCompliant("done")).toBe(true);
    expect(statusCountsAsCompliant("different")).toBe(false);
  });

  it("an unknown meal moment decodes to other rather than dropping the doc", () => {
    // One malformed doc must never empty the whole library list.
    expect(parseNutritionMealMoment("brunch")).toBe("other");
    expect(parseNutritionMealMoment("lunch")).toBe("lunch");
  });

  it("an unknown plan source decodes to coach — the read-only reading", () => {
    // A plan of unknown provenance is treated as the coach's, i.e. read-only for the
    // client — better than accidentally handing them the editor.
    expect(parseNutritionPlanSource("imported")).toBe("coach");
    expect(parseNutritionPlanSource("self")).toBe("self");
  });

  it("an unknown reminder mode decodes to off — never to a mode that pushes", () => {
    // A corrupt value must not start sending notifications nobody asked for.
    expect(parseNutritionReminderMode("hourly")).toBe("off");
    expect(parseNutritionReminderMode("perMeal")).toBe("perMeal");
  });
});

describe("the keys that must exist on the wire", () => {
  it("an open-ended plan carries endsOn as an explicit null, not an omitted key", () => {
    // #400's receipt: a client-created habit that simply OMITTED `deleted` vanished from
    // every `where("deleted","==",false)` query, because Firestore cannot match a field
    // that is not there. Open-ended is the common case for self-authored plans, so those
    // are exactly the docs that would disappear.
    const plan = selfPlan();
    expect(Object.prototype.hasOwnProperty.call(plan, "endsOn")).toBe(true);
    expect(plan.endsOn).toBeNull();
  });

  it("a standard library entry carries ownerId as an explicit null", () => {
    const meal: NutritionMeal = {
      name: name("Protein breakfast", "Desayuno proteico"),
      moment: "breakfast",
      ownerId: null,
      targets: { kcal: 520, proteinG: 38 },
      options: [],
    };
    expect(isStandardNutritionEntry(meal)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(meal, "ownerId")).toBe(true);
    expect(meal.ownerId).toBeNull();
  });
});

describe("self-authored parity", () => {
  it("a self plan carries the SAME field set as a coach plan", () => {
    // #392 and #400 both came from self-authored docs being shaped differently from
    // coach-authored ones. Identical key sets is what makes every query that works for
    // one work for the other.
    expect(Object.keys(selfPlan()).sort()).toEqual(Object.keys(phaseA()).sort());
    expect(selfPlan().clientId).toBe(selfPlan().trainerId);
    expect(isSelfAuthoredPlan(selfPlan())).toBe(true);
  });

  it("isSelfAuthoredPlan needs BOTH the source and the id equality", () => {
    // Says self, but clientId !== trainerId.
    expect(isSelfAuthoredPlan({ ...phaseA(), source: "self" })).toBe(false);
    // Ids match, but source says coach.
    expect(isSelfAuthoredPlan({ ...phaseA(), trainerId: phaseA().clientId })).toBe(false);
  });
});

describe("planIsActiveOn", () => {
  it("is inclusive on both ends and false for soft-deleted plans", () => {
    expect(planIsActiveOn(phaseA(), "2026-08-01")).toBe(true);
    expect(planIsActiveOn(phaseA(), "2026-08-31")).toBe(true);
    expect(planIsActiveOn(phaseA(), "2026-07-31")).toBe(false);
    expect(planIsActiveOn(phaseA(), "2026-09-01")).toBe(false);
    expect(planIsActiveOn({ ...phaseA(), deleted: true }, "2026-08-15")).toBe(false);
  });
});

describe("reminder times", () => {
  it("accepts HH:mm and rejects everything else", () => {
    expect(isValidNutritionTime("00:00")).toBe(true);
    expect(isValidNutritionTime("09:05")).toBe(true);
    expect(isValidNutritionTime("23:59")).toBe(true);
    expect(isValidNutritionTime("24:00")).toBe(false);
    expect(isValidNutritionTime("9:05")).toBe(false); // unpadded
    expect(isValidNutritionTime("21:60")).toBe(false);
    expect(isValidNutritionTime("21:00:00")).toBe(false);
    expect(isValidNutritionTime("")).toBe(false);
  });
});

describe("the frozen snapshot travels with the log", () => {
  it("carries the daily targets AND the expected meal list", () => {
    // The snapshot is never filtered or capped at write time. Any widget projects it
    // verbatim, so a truncated one makes the widget lie and nothing fails — that was
    // #900.
    const day = mixed(TODAY);
    expect(day.targetsSnapshot.daily.kcal).toBe(2400);
    expect(day.targetsSnapshot.meals.map((m) => m.mealId)).toEqual(["m1", "m2", "m3"]);
    expect(day.meals.m2!.note).toBe("Comí afuera — milanesa con puré");
  });
});

describe("the macro delta", () => {
  it("is actual − target, per field", () => {
    // The exact table from the note sheet:
    //            Kcal  Prot  Carb  Gras
    //   Tenías    780    55    78    22
    //   Comiste   950    48    95    38
    //   Dif.     +170    −7   +17   +16
    const delta = computeMacroDelta(
      { kcal: 780, proteinG: 55, carbsG: 78, fatG: 22 },
      { kcal: 950, proteinG: 48, carbsG: 95, fatG: 38 },
    );
    expect(delta).toEqual({ kcal: 170, proteinG: -7, carbsG: 17, fatG: 16 });
  });

  it("is null per field when EITHER side lacks it — not zero", () => {
    const delta = computeMacroDelta({ kcal: 780 }, { kcal: 950, proteinG: 48 });
    expect(delta.kcal).toBe(170);
    // A delta against a target the coach never set is unknowable, not zero. Rendering
    // "+0" would claim the client hit a target that does not exist.
    expect(delta.proteinG).toBeNull();
    expect(delta.carbsG).toBeNull();
  });

  it("is empty when there is no target or no actual, so the UI hides the table", () => {
    expect(macroDeltaIsEmpty(computeMacroDelta(null, { kcal: 900 }))).toBe(true);
    expect(macroDeltaIsEmpty(computeMacroDelta({ kcal: 900 }, null))).toBe(true);
    expect(macroTargetsAreEmpty({})).toBe(true);
    expect(macroTargetsAreEmpty({ kcal: 0 })).toBe(false); // an explicit 0 is a statement
  });
});

describe("collection constants", () => {
  it("match the Swift and Kotlin twins verbatim", () => {
    // A typo on either side would silently split writes and reads across phantom
    // collections (Pitfall 7).
    expect(FirestoreCollections.nutritionMeals).toBe("nutrition_meals");
    expect(FirestoreCollections.nutritionTemplates).toBe("nutrition_templates");
    expect(FirestoreCollections.nutritionPlans).toBe("nutrition_plans");
    expect(FirestoreCollections.nutritionLogs).toBe("nutrition_logs");
  });
});

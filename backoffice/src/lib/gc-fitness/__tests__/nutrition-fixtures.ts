// nutrition-fixtures.ts
// SHARED FIXTURE BLOCK for the nutrition twins (#913).
//
// ⚠️ TRIPLE-TWIN CONTRACT — these exact values are duplicated in:
//   gc-fitness/iOS/Packages/GCFitnessCore/Tests/GCFitnessCoreTests/NutritionFixtures.swift
//   gc-fitness/android/core/src/test/.../algorithms/NutritionFixtures.kt
//
// The point of copying literals instead of sharing a file is that a change on one
// platform has to be typed on the other two, in the same PR, or the parity tests stop
// agreeing. Habit-compliance is the precedent: three implementations that merely
// resemble each other print three different numbers, and no test fails.
//
// THE CANONICAL SCENARIO
//   Phase A "Mantenimiento": coach, 2026-08-01 → 2026-08-31, 3 meals (m1/m2/m3).
//   Phase B "Definición":    coach, 2026-09-01 → open-ended, same 3 meal ids, new targets.
//   Logs: 2026-08-15/16/17 fully done; 2026-08-18 done / different / missed.
//   ⇒ adherence over 08-17…08-18 is 4 done of 6 expected = 0.666… → 67%.
//   ⇒ streak on 2026-08-18 is 3 (today incomplete, grace day applies).

import {
  nutritionLogDocId,
  type LocalizedText,
  type NutritionLog,
  type NutritionMealEntry,
  type NutritionPlan,
  type NutritionPlanMeal,
  type NutritionTargetsSnapshot,
} from "../nutrition-schema";

export const CLIENT_ID = "client-sofia";
export const COACH_ID = "coach-martin";

export const DAY_BEFORE = "2026-08-15";
export const MID_DAY = "2026-08-16";
export const YESTERDAY = "2026-08-17";
export const TODAY = "2026-08-18";

export function name(en: string, es: string): LocalizedText {
  return { en, es };
}

export function planMeals(
  breakfastKcal: number,
  lunchKcal: number,
  dinnerKcal: number,
): NutritionPlanMeal[] {
  return [
    {
      mealId: "m1",
      name: name("Breakfast", "Desayuno"),
      moment: "breakfast",
      targets: { kcal: breakfastKcal, proteinG: 38 },
      options: [
        {
          id: "o1",
          text: name("Oats + eggs", "Avena + huevos"),
          targets: { kcal: breakfastKcal },
        },
      ],
      order: 0,
    },
    {
      mealId: "m2",
      name: name("Lunch", "Almuerzo"),
      moment: "lunch",
      targets: { kcal: lunchKcal, proteinG: 55, carbsG: 78, fatG: 22 },
      options: [],
      order: 1,
    },
    {
      mealId: "m3",
      name: name("Dinner", "Cena"),
      moment: "dinner",
      targets: { kcal: dinnerKcal, proteinG: 45 },
      options: [],
      order: 2,
    },
  ];
}

/** "Mantenimiento" — the phase in force for the whole of August. */
export function phaseA(): NutritionPlan {
  return {
    id: "plan-a",
    clientId: CLIENT_ID,
    trainerId: COACH_ID,
    source: "coach",
    name: name("Maintenance", "Mantenimiento"),
    templateId: null,
    startsOn: "2026-08-01",
    endsOn: "2026-08-31",
    targets: { kcal: 2400, proteinG: 180, carbsG: 240, fatG: 80 },
    meals: planMeals(520, 780, 800),
  };
}

/** "Definición" — the open-ended phase queued behind A. */
export function phaseB(): NutritionPlan {
  return {
    id: "plan-b",
    clientId: CLIENT_ID,
    trainerId: COACH_ID,
    source: "coach",
    name: name("Cut", "Definición"),
    templateId: null,
    startsOn: "2026-09-01",
    endsOn: null,
    targets: { kcal: 2000, proteinG: 170, carbsG: 180, fatG: 65 },
    meals: planMeals(450, 700, 650),
  };
}

/** A client-authored plan — `clientId === trainerId`, `source === "self"`. */
export function selfPlan(): NutritionPlan {
  return {
    id: "plan-self",
    clientId: CLIENT_ID,
    trainerId: CLIENT_ID,
    source: "self",
    name: name("My plan", "Mi plan"),
    templateId: null,
    startsOn: "2026-06-01",
    endsOn: null,
    targets: { kcal: 2200, proteinG: 160, carbsG: 220, fatG: 70 },
    meals: planMeals(480, 700, 700),
  };
}

export function snapshot(plan: NutritionPlan): NutritionTargetsSnapshot {
  return {
    daily: plan.targets,
    meals: plan.meals.map((meal) => ({
      mealId: meal.mealId,
      name: meal.name,
      order: meal.order,
      targets: meal.targets ?? null,
    })),
  };
}

export function log(
  civilDate: string,
  entries: Record<string, NutritionMealEntry>,
  plan: NutritionPlan = phaseA(),
): NutritionLog {
  return {
    id: nutritionLogDocId(CLIENT_ID, civilDate),
    clientId: CLIENT_ID,
    civilDate,
    planId: plan.id ?? "",
    meals: entries,
    targetsSnapshot: snapshot(plan),
  };
}

export function fullyDone(
  civilDate: string,
  plan: NutritionPlan = phaseA(),
): NutritionLog {
  return log(
    civilDate,
    {
      m1: { status: "done" },
      m2: { status: "done" },
      m3: { status: "done" },
    },
    plan,
  );
}

/** The mixed day: one of each status. */
export function mixed(civilDate: string, plan: NutritionPlan = phaseA()): NutritionLog {
  return log(
    civilDate,
    {
      m1: { status: "done" },
      m2: { status: "different", note: "Comí afuera — milanesa con puré" },
      m3: { status: "missed" },
    },
    plan,
  );
}

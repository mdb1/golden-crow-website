// #1148 — twin of gc-fitness `NutritionExcuseAnalyzerTests.swift` and
// `NutritionExcuseAnalyzerTest.kt`, case for case, same literals, same expected output (order
// included). A case added on one side only lets the coach and the client read the same history
// differently with every suite green.
//
// Every date is a FIXED civil date in August 2026 (phase A). Nothing reads today.

import {
  analyzeNutritionExcuses,
  excusePercent,
  nutritionExcuseHeadline,
  nutritionFailureSlotId,
  nutritionNoteSegments,
  type NutritionExcuseInsights,
  type NutritionExcuseReason,
} from "../nutrition-excuses";
import type { NutritionLog, NutritionMealEntry } from "../nutrition-schema";
import { log, name, phaseA } from "./nutrition-fixtures";

/** What the apps pass with the app in Spanish: current language first. */
const presetGroups = [
  ["Comí afuera", "Ate out"],
  ["Menos cantidad", "Smaller portion"],
  ["No tenía los ingredientes", "Didn't have the ingredients"],
  ["No me dio el tiempo", "No time"],
];

function missed(note: string | null): NutritionMealEntry {
  return { status: "missed", note };
}

/** 28 days, Monday 08-03 → Sunday 08-30. m1 Desayuno, m2 Almuerzo, m3 Cena. Nine failures. */
function scenario(): NutritionLog[] {
  return [
    log("2026-08-06", { m3: missed("Pizza con amigos") }), // Thu
    log("2026-08-08", { m3: missed("Comí afuera · había cumpleaños") }), // Sat
    log("2026-08-10", { m2: { status: "different", note: "Comí afuera" } }), // Mon
    log("2026-08-13", { m3: missed("  pizza   con amigos ") }), // Thu
    log("2026-08-15", { m3: missed(null) }), // Sat
    log("2026-08-19", { m2: missed("   ") }), // Wed
    log("2026-08-20", { m3: missed("Ate out") }), // Thu
    log("2026-08-21", { m1: { status: "done" }, m3: missed("Pizza con amigos") }), // Fri
    log("2026-08-25", { m1: missed("No me dio el tiempo") }), // Tue
  ];
}

function analyze(logs: NutritionLog[], start = "2026-08-03", end = "2026-08-30"): NutritionExcuseInsights {
  return analyzeNutritionExcuses([phaseA()], logs, start, end, presetGroups);
}

function summary(reasons: NutritionExcuseReason[]): string[] {
  return reasons.map((r) => `${r.text ?? "∅"} ${r.count} ${r.percent}`);
}

describe("analyzeNutritionExcuses (#1148 — twin of the apps)", () => {
  it("global ranking: count DESC → recency; presets merged across languages; no note = ∅", () => {
    const insights = analyze(scenario());
    expect(insights.totalFailures).toBe(9);
    expect(insights.hasEnoughData).toBe(true);
    expect(summary(insights.reasons)).toEqual([
      "Pizza con amigos 3 33",
      "Comí afuera 3 33",
      "∅ 2 22",
      "No me dio el tiempo 1 11",
      "había cumpleaños 1 11",
    ]);
  });

  it("per meal: ranked by failures²/expected, denominator = every expected slot", () => {
    const meals = analyze(scenario()).byMeal;
    expect(meals.map(nutritionFailureSlotId)).toEqual(["m3", "m2"]);

    const dinner = meals[0];
    expect(dinner.name).toEqual(name("Dinner", "Cena"));
    expect(dinner.weekday).toBeNull();
    expect(dinner.expected).toBe(28);
    expect(dinner.failures).toBe(6);
    expect(dinner.percent).toBe(21);
    expect(summary(dinner.reasons)).toEqual(["Pizza con amigos 3 50", "Comí afuera 2 33", "∅ 1 17"]);

    // Lunch: the legacy `different` counts, a whitespace-only note is "sin motivo".
    const lunch = meals[1];
    expect(lunch.failures).toBe(2);
    expect(lunch.percent).toBe(7);
    expect(summary(lunch.reasons)).toEqual(["∅ 1 50", "Comí afuera 1 50"]);
  });

  it("meal × weekday: unmarked stays in the denominator; < 50% and 1-failure slots drop", () => {
    const insights = analyze(scenario());
    const slots = insights.byMealWeekday;
    expect(slots.map(nutritionFailureSlotId)).toEqual(["m3#3", "m3#5"]);

    const thursday = slots[0];
    expect(thursday.weekday).toBe(3);
    expect(thursday.expected).toBe(4);
    expect(thursday.failures).toBe(3);
    expect(thursday.percent).toBe(75);
    expect(summary(thursday.reasons)).toEqual(["Pizza con amigos 2 67", "Comí afuera 1 33"]);

    const saturday = slots[1];
    expect(saturday.expected).toBe(4);
    expect(saturday.failures).toBe(2);
    expect(saturday.percent).toBe(50);
    expect(summary(saturday.reasons)).toEqual(["∅ 1 50", "Comí afuera 1 50", "había cumpleaños 1 50"]);

    expect(nutritionFailureSlotId(nutritionExcuseHeadline(insights)!)).toBe("m3#3");
  });

  it("the preset shows in the CURRENT language, whatever language it was saved in", () => {
    const english = analyzeNutritionExcuses(
      [phaseA()],
      scenario(),
      "2026-08-03",
      "2026-08-30",
      presetGroups.map((group) => [...group].reverse()),
    );
    expect(english.reasons.map((r) => r.text ?? "∅")).toEqual([
      "Pizza con amigos",
      "Ate out",
      "∅",
      "No time",
      "había cumpleaños",
    ]);
  });

  it("below the minimum failures nothing is claimed", () => {
    const insights = analyze([
      log("2026-08-06", { m3: missed("Pizza con amigos") }),
      log("2026-08-13", { m3: missed("Pizza con amigos") }),
    ]);
    expect(insights.totalFailures).toBe(2);
    expect(insights.hasEnoughData).toBe(false);
    expect(insights.reasons).toEqual([]);
    expect(insights.byMeal).toEqual([]);
    expect(insights.byMealWeekday).toEqual([]);
    expect(nutritionExcuseHeadline(insights)).toBeNull();
  });

  it("two Thursdays out of two is not a weekday pattern; 2 of 5 is under 50%", () => {
    const short = analyze(
      [
        log("2026-08-06", { m3: missed("Pizza") }),
        log("2026-08-13", { m3: missed("Pizza") }),
        log("2026-08-14", { m3: missed("Pizza") }),
      ],
      "2026-08-03",
      "2026-08-16",
    );
    expect(short.hasEnoughData).toBe(true);
    expect(short.byMealWeekday).toEqual([]);
    expect(short.byMeal.map(nutritionFailureSlotId)).toEqual(["m3"]);

    const long = analyze(
      [
        log("2026-08-01", { m3: missed("Pizza") }),
        log("2026-08-08", { m3: missed("Pizza") }),
        log("2026-08-12", { m3: missed("Pizza") }),
      ],
      "2026-08-01",
      "2026-08-31",
    );
    expect(long.hasEnoughData).toBe(true);
    expect(long.byMealWeekday).toEqual([]);
  });

  it("a slot with every Thursday failed wins over a diluted, bigger one", () => {
    const logs: NutritionLog[] = [];
    for (const day of ["2026-08-06", "2026-08-13", "2026-08-20", "2026-08-27"]) {
      logs.push(log(day, { m3: missed("Pizza") }));
    }
    for (const day of ["2026-08-03", "2026-08-10", "2026-08-17"]) {
      logs.push(log(day, { m2: missed("Reunión") }));
    }
    for (const day of ["2026-08-04", "2026-08-11"]) {
      logs.push(log(day, { m2: missed("Reunión") }));
    }
    const insights = analyze(logs);
    expect(insights.byMealWeekday.map(nutritionFailureSlotId)).toEqual(["m3#3", "m2#0", "m2#1"]);
    expect(insights.byMealWeekday.map((s) => s.percent)).toEqual([100, 75, 50]);
    expect(insights.byMeal.map(nutritionFailureSlotId)).toEqual(["m2", "m3"]);
  });

  it("percent never rounds to 100 or 0 unless it is", () => {
    expect(excusePercent(199, 200)).toBe(99);
    expect(excusePercent(1, 200)).toBe(1);
    expect(excusePercent(0, 5)).toBe(0);
    expect(excusePercent(5, 5)).toBe(100);
    expect(excusePercent(1, 3)).toBe(33);
    expect(excusePercent(2, 3)).toBe(67);
    expect(excusePercent(1, 2)).toBe(50);
    expect(excusePercent(3, 0)).toBe(0);
  });

  it("the shared segmenter is exactly the pills' normalization", () => {
    const pieces = nutritionNoteSegments("  Comí   afuera ·· PIZZA · comí afuera ");
    expect(pieces.map((p) => p.display)).toEqual(["Comí afuera", "PIZZA", "comí afuera"]);
    expect(pieces.map((p) => p.key)).toEqual(["comí afuera", "pizza", "comí afuera"]);
    expect(nutritionNoteSegments(null)).toEqual([]);
    expect(nutritionNoteSegments(" · ")).toEqual([]);
  });
});

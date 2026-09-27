// nutrition-highlights.ts
// "Más números" — the extra numbers under the compliance grid: perfect days, best streak, how
// much the client logs at all, and the best / toughest weekday.
//
// TRIPLE TWIN (same-PR invariant): `NutritionWeekHeatmapBuilder.highlights` in gc-fitness
//   iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/NutritionWeekHeatmap.swift
//   android/core/.../algorithms/NutritionWeekHeatmap.kt
// and `__tests__/nutrition-highlights.test.ts` pins the same cases as the mobile suites.
//
// PURE, NO SERVER-ACTION DIRECTIVE (#785).

import { civilDateAddDays } from "./civil-date";
import {
  MAX_NUTRITION_RANGE_DAYS,
  expectedNutritionMeals,
  nutritionBestStreak,
  nutritionCompliancePercent,
  nutritionDayIsFullyCompliant,
} from "./nutrition-adherence";
import { nutritionWeekdayIndex } from "./nutrition-metrics";
import type { NutritionLog, NutritionPlan } from "./nutrition-schema";

export interface NutritionHighlights {
  /** Days where every expected meal was `done`. */
  perfectDays: number;
  /** Days where anything was expected at all — the denominator for `perfectDays`. */
  daysWithPlan: number;
  /** Longest run of perfect days in the range (planless days are skipped, not breaks). */
  bestStreak: number;
  /** Percent of expected slots marked AT ALL; `null` when nothing was expected. */
  loggedPercent: number | null;
  /** Monday-first; `null` below the sample bar or when best and worst tie. */
  bestWeekday: number | null;
  bestWeekdayPercent: number | null;
  worstWeekday: number | null;
  worstWeekdayPercent: number | null;
}

/** A weekday needs this many days with something expected before it is best / worst. */
export const MIN_DAYS_PER_WEEKDAY = 2;

/** The numbers over the closed range `[start, end]` (callers pass today as `end`). */
export function nutritionHighlights(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
): NutritionHighlights {
  const logsByDate = new Map<string, NutritionLog>();
  for (const log of logs) logsByDate.set(log.civilDate, log);

  let perfectDays = 0;
  let daysWithPlan = 0;
  let expectedSlots = 0;
  let markedSlots = 0;
  const weekdayDone = new Array<number>(7).fill(0);
  const weekdayExpected = new Array<number>(7).fill(0);
  const weekdayDays = new Array<number>(7).fill(0);

  let cursor: string | null = start;
  for (let guard = 0; guard < MAX_NUTRITION_RANGE_DAYS && cursor !== null; guard += 1) {
    const day: string = cursor;
    if (day > end) break;
    cursor = civilDateAddDays(day, 1);

    const expected = expectedNutritionMeals(day, plans, logsByDate);
    const weekday = nutritionWeekdayIndex(day);
    if (expected.length === 0 || weekday === null) continue;
    daysWithPlan += 1;
    weekdayDays[weekday] += 1;
    if (nutritionDayIsFullyCompliant(day, plans, logsByDate)) perfectDays += 1;
    const log = logsByDate.get(day);
    for (const meal of expected) {
      expectedSlots += 1;
      weekdayExpected[weekday] += 1;
      const status = log?.meals[meal.mealId]?.status;
      if (!status) continue;
      markedSlots += 1;
      if (status === "done") weekdayDone[weekday] += 1;
    }
  }

  let best: { index: number; percent: number } | null = null;
  let worst: { index: number; percent: number } | null = null;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (weekdayDays[weekday] < MIN_DAYS_PER_WEEKDAY || weekdayExpected[weekday] === 0) continue;
    const percent = nutritionCompliancePercent(weekdayDone[weekday] / weekdayExpected[weekday]);
    // Strict comparisons: on a tie the EARLIER weekday wins, on all three platforms.
    if (best === null || percent > best.percent) best = { index: weekday, percent };
    if (worst === null || percent < worst.percent) worst = { index: weekday, percent };
  }
  if (best !== null && worst !== null && best.percent === worst.percent) {
    best = null;
    worst = null;
  }

  return {
    perfectDays,
    daysWithPlan,
    bestStreak: nutritionBestStreak(plans, logs, start, end),
    loggedPercent: expectedSlots > 0 ? nutritionCompliancePercent(markedSlots / expectedSlots) : null,
    bestWeekday: best?.index ?? null,
    bestWeekdayPercent: best?.percent ?? null,
    worstWeekday: worst?.index ?? null,
    worstWeekdayPercent: worst?.percent ?? null,
  };
}

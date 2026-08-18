// nutrition-metrics.ts
// The numbers behind "Ver todo" (#920) — and, more importantly, the WRITTEN CONCLUSION.
//
// TRIPLE-TWIN CONTRACT (Pitfall 7): any behavioral change here lands in the SAME PR as
//   gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/NutritionMetrics.swift
//   gc-fitness/android/core/src/main/kotlin/.../algorithms/NutritionMetrics.kt
// and the shared fixture block in the three test files must keep agreeing. Habit
// compliance is the precedent: three implementations that merely resemble each other print
// three different numbers on three screens, and no test fails.
//
// ⚠️ **The client apps are the only surface rendering this today.** It lives here anyway
// because the twin discipline is what makes the number one fact: the day the coach's
// screen wants to say "su punto flojo es la cena" — #926 is already pointed at that — it
// has to say the SAME sentence the client is reading, not a second implementation that
// merely resembles it.
//
// FOUNDATION-FREE / NO server-action directive: pure functions, no firebase-admin. Jest
// exercises it directly and a client component may import it (#785).
//
// ── Why the sentence matters more than the chart ────────────────────────────────────
//
// Nobody looks at twelve bars and concludes "dinner collapses on weekends". They see that
// some bars are shorter. The chart is evidence for a claim the product has to be willing
// to MAKE — "la cena es tu punto flojo, 8 de 11 fallas fueron viernes o sábado" — and that
// claim is what someone can act on tomorrow.
//
// The conclusion is therefore computed as DATA: ids, counts and weekday indices. **No
// Spanish and no English in this module.** Each surface renders its own sentence, which is
// what lets the catalogues be diffed key by key instead of hoping two hand-written
// sentences stayed equivalent.

import { civilDateAddDays, civilDaysBetween } from "./civil-date";
import { civilWeekStart } from "./muscle-group-weeks";
import {
  expectedNutritionMeals,
  nutritionAdherence,
  nutritionAdherenceByMeal,
  type NutritionAdherenceBreakdown,
  type NutritionMealAdherence,
} from "./nutrition-adherence";
import type { LocalizedText, NutritionLog, NutritionPlan } from "./nutrition-schema";

/**
 * Minimum failures before either claim is allowed to fire. Below this, a "pattern" is two
 * bad days in a row, which everybody has.
 */
export const MINIMUM_FAILURES_FOR_INSIGHT = 4;

/**
 * A meal must own at least this share of the range's failures to be called the culprit.
 * Below it there is no single culprit, and naming one anyway is the kind of
 * confident-and-wrong that makes people stop reading.
 */
export const WORST_MEAL_SHARE_THRESHOLD = 0.4;

/**
 * The top two weekdays must hold at least this share before we claim concentration. Two of
 * seven weekdays hold ~29% by chance alone, so the bar is well above that.
 */
export const CONCENTRATION_SHARE_THRESHOLD = 0.6;

/**
 * Monday-first weekday index for a civil date: `0` = Monday … `6` = Sunday.
 *
 * Pure integer math on the days-from-epoch serial — no `Date`, no timezone. The civil date
 * is ALREADY resolved in the client's zone by the time it gets here, so re-involving a
 * timezone could only re-introduce the off-by-one this whole feature is written around.
 * 1970-01-01 was a Thursday, hence the `+3`.
 */
export function nutritionWeekdayIndex(civilDate: string): number | null {
  const serial = civilDaysBetween("1970-01-01", civilDate);
  if (serial === null) return null;
  return (((serial + 3) % 7) + 7) % 7;
}

/**
 * One calendar week of the range — **Monday → Sunday**, never a rolling 7 days.
 *
 * Fixed cross-surface and already corrected once (#534): mobile bucketed rolling 7-day
 * windows while every other surface used calendar weeks, so the same client had two
 * different "last week" numbers and neither screen was wrong on its own terms.
 */
export interface NutritionWeekBucket {
  weekStart: string;
  weekEnd: string;
  breakdown: NutritionAdherenceBreakdown;
  /** True when the week asked nothing — a gap between phases, not a zero. */
  isEmpty: boolean;
}

/** The meal dragging the rest down — absent when no single meal is to blame. */
export interface NutritionWorstMeal {
  mealId: string;
  name: LocalizedText;
  /** Slots this meal failed (anything not `done`). */
  failures: number;
  /** This meal's own adherence percent over the range. */
  percent: number;
}

/** Failures piling up on specific weekdays — absent when they are spread out. */
export interface NutritionConcentration {
  /**
   * Monday-first indices, at most two, ordered by weekday (not by count) so the sentence
   * reads "viernes y sábados" rather than "sábados y viernes".
   */
  weekdays: number[];
  failures: number;
  totalFailures: number;
}

export interface NutritionInsight {
  worstMeal: NutritionWorstMeal | null;
  concentration: NutritionConcentration | null;
  totalFailures: number;
  /**
   * Every expected slot was `done`. Say so — it is the one time a congratulation is earned
   * rather than decorative.
   */
  isPerfect: boolean;
  /**
   * False when the range asked too little to conclude anything. Callers MUST branch on
   * this instead of printing "no failures" for somebody who simply has no plan.
   */
  hasEnoughData: boolean;
}

export interface NutritionRangeMetrics {
  start: string;
  end: string;
  overall: NutritionAdherenceBreakdown;
  /** The equally-long window immediately before `start`. */
  previous: NutritionAdherenceBreakdown;
  /**
   * `overall.percent − previous.percent`, in PERCENTAGE POINTS.
   *
   * `null` when either window asked nothing: a client with no plan last month did not
   * "improve by 84 points", and printing that would be the most flattering lie the screen
   * could tell.
   */
  deltaPercentPoints: number | null;
  weeks: NutritionWeekBucket[];
  /** Worst first — there is almost always one meal dragging the rest down. */
  byMeal: NutritionMealAdherence[];
  insight: NutritionInsight;
}

/**
 * Everything "Ver todo" renders, for the closed civil range `[start, end]`.
 *
 * @param end today in the CLIENT's timezone. This function never reads the clock, so a
 *   future `end` would count unlived days as unmarked.
 */
export function nutritionRangeMetrics(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
): NutritionRangeMetrics {
  const overall = nutritionAdherence(plans, logs, start, end);
  const byMeal = nutritionAdherenceByMeal(plans, logs, start, end);

  // The previous window is the same LENGTH, immediately before — not "last month".
  // Comparing a 28-day window against a 31-day one would move the number without anybody
  // changing anything.
  const span = civilDaysBetween(start, end) ?? 0;
  const previousEnd = civilDateAddDays(start, -1) ?? start;
  const previousStart = civilDateAddDays(previousEnd, -span) ?? previousEnd;
  const previous = nutritionAdherence(plans, logs, previousStart, previousEnd);

  return {
    start,
    end,
    overall,
    previous,
    deltaPercentPoints:
      overall.isEmpty || previous.isEmpty ? null : overall.percent - previous.percent,
    weeks: nutritionWeekBuckets(plans, logs, start, end),
    byMeal,
    insight: nutritionInsight(plans, logs, start, end, byMeal),
  };
}

/**
 * Monday-anchored calendar weeks covering `[start, end]`, oldest first.
 *
 * The first and last buckets are CLIPPED to the range, so a range starting on a Thursday
 * does not silently score the Monday–Wednesday before it.
 */
export function nutritionWeekBuckets(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
): NutritionWeekBucket[] {
  if (start > end) return [];
  const buckets: NutritionWeekBucket[] = [];
  let cursor: string | null = civilWeekStart(start);
  // 5 years of weeks is far past any range a screen asks for, and a hard stop so a
  // malformed date cannot loop unbounded.
  for (let guard = 0; guard < 53 * 5 && cursor !== null; guard += 1) {
    const weekStart: string = cursor;
    if (weekStart > end) break;
    const weekEnd = civilDateAddDays(weekStart, 6) ?? weekStart;
    const breakdown = nutritionAdherence(
      plans,
      logs,
      weekStart < start ? start : weekStart,
      weekEnd > end ? end : weekEnd,
    );
    buckets.push({ weekStart, weekEnd, breakdown, isEmpty: breakdown.isEmpty });
    cursor = civilDateAddDays(weekStart, 7);
  }
  return buckets;
}

/** The claim the screen is willing to make, or the absence of one. */
export function nutritionInsight(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
  byMeal?: NutritionMealAdherence[],
): NutritionInsight {
  const meals = byMeal ?? nutritionAdherenceByMeal(plans, logs, start, end);
  const overall = nutritionAdherence(plans, logs, start, end);
  const totalFailures = overall.expected - overall.done;

  // Nothing was asked: not perfect, not failing — no data.
  if (overall.isEmpty) {
    return empty(false, 0);
  }
  if (totalFailures === 0) {
    return { ...empty(true, 0), isPerfect: true, hasEnoughData: true };
  }
  if (totalFailures < MINIMUM_FAILURES_FOR_INSIGHT) {
    return empty(false, totalFailures);
  }

  // ── The culprit meal ──────────────────────────────────────────────────────────────
  let worstMeal: NutritionWorstMeal | null = null;
  const ranked = [...meals].sort((a, b) => {
    const af = a.breakdown.expected - a.breakdown.done;
    const bf = b.breakdown.expected - b.breakdown.done;
    // Failures DESC, then mealId ASC — deterministic across the three platforms.
    return bf !== af ? bf - af : a.mealId.localeCompare(b.mealId);
  });
  const candidate = ranked[0];
  if (candidate) {
    const failures = candidate.breakdown.expected - candidate.breakdown.done;
    if (failures >= 2 && failures / totalFailures >= WORST_MEAL_SHARE_THRESHOLD) {
      worstMeal = {
        mealId: candidate.mealId,
        name: candidate.name,
        failures,
        percent: candidate.breakdown.percent,
      };
    }
  }

  // ── The weekday concentration ─────────────────────────────────────────────────────
  const failuresByWeekday = new Array<number>(7).fill(0);
  const logsByDate = new Map<string, NutritionLog>();
  for (const log of logs) logsByDate.set(log.civilDate, log);

  let day: string | null = end;
  for (let guard = 0; guard < 366 * 5 && day !== null; guard += 1) {
    const civilDate: string = day;
    if (civilDate < start) break;
    const weekday = nutritionWeekdayIndex(civilDate);
    if (weekday !== null) {
      for (const meal of expectedNutritionMeals(civilDate, plans, logsByDate)) {
        const status = logsByDate.get(civilDate)?.meals[meal.mealId]?.status ?? null;
        if (status !== "done") failuresByWeekday[weekday] += 1;
      }
    }
    day = civilDateAddDays(civilDate, -1);
  }

  const weekdayRanking = failuresByWeekday
    .map((count, weekday) => ({ weekday, count }))
    // Count DESC, then weekday ASC so the pair is deterministic.
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.weekday - b.weekday));
  const topTwo = weekdayRanking.slice(0, 2).filter((entry) => entry.count > 0);
  const topFailures = topTwo.reduce((sum, entry) => sum + entry.count, 0);
  const concentration: NutritionConcentration | null =
    topTwo.length > 0 && topFailures / totalFailures >= CONCENTRATION_SHARE_THRESHOLD
      ? {
          weekdays: topTwo.map((entry) => entry.weekday).sort((a, b) => a - b),
          failures: topFailures,
          totalFailures,
        }
      : null;

  return {
    worstMeal,
    concentration,
    totalFailures,
    isPerfect: false,
    hasEnoughData: true,
  };
}

function empty(hasEnoughData: boolean, totalFailures: number): NutritionInsight {
  return {
    worstMeal: null,
    concentration: null,
    totalFailures,
    isPerfect: false,
    hasEnoughData,
  };
}

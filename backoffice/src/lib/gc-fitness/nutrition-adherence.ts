// nutrition-adherence.ts
// TS twin of GCFitnessCore `NutritionAdherenceCalculator.swift` /
// `NutritionStreakCalculator.swift` and of the Kotlin twins (#913).
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7): iOS, Android and the backoffice have to
// print the SAME number. This is the exact precedent of habit-compliance, where #173
// shipped one surface truncating 85 while every other rounded 86.
//
// FOUNDATION-FREE / NO server-action directive: pure functions, importable from a client
// component, exercised directly by Jest. The Server Actions that fetch logs live in a
// sibling `*-actions.ts` (#785).
//
// ── The rules, stated once ──────────────────────────────────────────────────────────
//
// 1. `done` is the ONLY compliant status. `different` and `missed` are both
//    non-compliant. "Distinto" literally means the plan was not followed, and a
//    half-credit fraction would be arbitrary and unexplainable on screen. The full
//    breakdown is returned anyway, so a UI can show the split without recomputing.
//
// 2. The denominator is EVERY EXPECTED MEAL-SLOT in the range — an unmarked day counts
//    against you, the same convention `computeCompliance` already uses for habits.
//    Silently dropping unmarked days would make adherence RISE the longer someone
//    ignores the app.
//
// 3. Days with NO plan in force contribute ZERO to both numerator and denominator. That
//    is what makes "sin plan vigente" render as an empty state instead of 0% — the case
//    a coach with twenty clients most needs to spot on the roster.
//
// 4. `actualMacros` IS NOT READ. Not here, not anywhere in this file. There is an
//    explicit test asserting that attaching actual macros to a log leaves the breakdown
//    identical.
//
// ── Where "expected" comes from ─────────────────────────────────────────────────────
//
// If a log exists for the day, the expected meals are the ones frozen in ITS
// `targetsSnapshot`. Otherwise they are the meals of the plan in force that day. This is
// the whole point of freezing: starting a new phase must not re-judge the past against
// the new targets, or the coach's historical number moves without anybody doing
// anything.

import { civilDateAddDays } from "./civil-date";
import { activeNutritionPlan } from "./nutrition-plan-resolution";
import type {
  LocalizedText,
  NutritionLog,
  NutritionMealStatus,
  NutritionPlan,
  NutritionSnapshotMeal,
} from "./nutrition-schema";

/**
 * Upper bound on any backward civil-day walk. Five years of daily steps — far past any
 * range a screen asks for, and a hard stop so a malformed date cannot loop unbounded.
 */
export const MAX_NUTRITION_RANGE_DAYS = 366 * 5;

/** Upper bound on the streak walk — a year covers any streak worth advertising. */
export const MAX_NUTRITION_LOOKBACK_DAYS = 366;

/** The split of a range's meal-slots. */
export interface NutritionAdherenceBreakdown {
  done: number;
  different: number;
  missed: number;
  /**
   * Expected but never marked. A distinct state from `missed`: the client did not declare
   * a failure, they said nothing. It still counts against adherence, but a UI must not
   * draw it as one.
   */
  unmarked: number;
  /** Total meal-slots the range expected — the denominator. */
  expected: number;
  /** `done / expected`, in `[0, 1]`. Zero expected slots yields 0. */
  ratio: number;
  /** The integer percent, through the one canonical rounding rule. */
  percent: number;
  /**
   * True when the range asked nothing of the client. Callers MUST branch on this to
   * render the empty state — showing "0%" reads as a client who is failing.
   */
  isEmpty: boolean;
}

/** One row of the "dónde fallás más" breakdown. */
export interface NutritionMealAdherence {
  mealId: string;
  /**
   * The meal name as most recently frozen in a log's snapshot (falling back to the plan),
   * so a renamed meal still labels its own history.
   */
  name: LocalizedText;
  breakdown: NutritionAdherenceBreakdown;
}

/**
 * SOLE conversion of a ratio to a displayed integer percent: clamp to `[0, 1]`, multiply
 * by 100, round half-up.
 *
 * Every surface that renders a nutrition percent MUST route through this, for the reason
 * #173 already cost us on habits: one screen truncated `Math.trunc(ratio * 100)` to 85
 * while every other rounded to 86, and the coach saw two numbers for one fact.
 */
export function nutritionCompliancePercent(ratio: number): number {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clamped * 100);
}

/**
 * The meals expected on `civilDate`, in display order.
 *
 * Reads the log's frozen `targetsSnapshot` when a log exists — the past is not re-read —
 * and falls back to the plan in force when it does not. Returns `[]` when no plan is in
 * force, which is what keeps a planless day out of the denominator.
 */
export function expectedNutritionMeals(
  civilDate: string,
  plans: NutritionPlan[],
  logsByDate: Map<string, NutritionLog>,
): NutritionSnapshotMeal[] {
  const log = logsByDate.get(civilDate);
  if (log && log.targetsSnapshot.meals.length > 0) {
    return [...log.targetsSnapshot.meals].sort((a, b) => a.order - b.order);
  }
  const plan = activeNutritionPlan(plans, civilDate);
  if (!plan) return [];
  return [...plan.meals]
    .sort((a, b) => a.order - b.order)
    .map((meal) => ({
      mealId: meal.mealId,
      name: meal.name,
      order: meal.order,
      targets: meal.targets ?? null,
    }));
}

/**
 * True when every meal expected on `civilDate` is marked `done`. A day with nothing
 * expected is NOT compliant — it is simply not a day the streak counts (the streak skips
 * it rather than breaking on it).
 */
export function nutritionDayIsFullyCompliant(
  civilDate: string,
  plans: NutritionPlan[],
  logsByDate: Map<string, NutritionLog>,
): boolean {
  const expected = expectedNutritionMeals(civilDate, plans, logsByDate);
  if (expected.length === 0) return false;
  const log = logsByDate.get(civilDate);
  if (!log) return false;
  return expected.every((meal) => log.meals[meal.mealId]?.status === "done");
}

/**
 * Adherence across the closed civil-date range `[start, end]`.
 *
 * Callers pass *today* as `end` — this function does not read the clock, so a future date
 * would count unlived days as unmarked.
 */
export function nutritionAdherence(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
): NutritionAdherenceBreakdown {
  const counts = emptyCounts();
  forEachSlot(plans, logs, start, end, (_meal, status) => accumulate(counts, status));
  return finalize(counts);
}

/**
 * Per-meal adherence across the range, sorted **worst first** — the "dónde fallás más"
 * list, where the point is that there is almost always one meal dragging the rest down.
 * Ties break on `mealId` so the order is stable across the three platforms.
 *
 * Meals that were never expected in the range do not appear.
 */
export function nutritionAdherenceByMeal(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
): NutritionMealAdherence[] {
  const counts = new Map<string, Counts>();
  const names = new Map<string, LocalizedText>();

  forEachSlot(plans, logs, start, end, (meal, status) => {
    let bucket = counts.get(meal.mealId);
    if (!bucket) {
      bucket = emptyCounts();
      counts.set(meal.mealId, bucket);
    }
    accumulate(bucket, status);
    // The walk runs newest → oldest, so the FIRST name seen is the most recent one. Keep
    // it: a renamed meal should label its own history with the name the client sees today.
    if (!names.has(meal.mealId)) names.set(meal.mealId, meal.name);
  });

  return [...counts.entries()]
    .map(([mealId, bucket]) => ({
      mealId,
      name: names.get(mealId) ?? { en: "", es: "" },
      breakdown: finalize(bucket),
    }))
    .sort((a, b) => {
      if (a.breakdown.ratio !== b.breakdown.ratio) {
        return a.breakdown.ratio - b.breakdown.ratio;
      }
      return a.mealId.localeCompare(b.mealId);
    });
}

/**
 * Adherence for ONE phase, clamped to `end` (normally today) so an open-ended or
 * still-running phase is not judged on days that have not happened.
 *
 * This is the "Adherencia" column of the phase table the coach reads next to Δ peso.
 */
export function nutritionAdherenceForPlan(
  plan: NutritionPlan,
  logs: NutritionLog[],
  end: string,
): NutritionAdherenceBreakdown {
  const planEnd = plan.endsOn ?? end;
  const clampedEnd = planEnd < end ? planEnd : end;
  if (plan.startsOn > clampedEnd) return finalize(emptyCounts());
  return nutritionAdherence([plan], logs, plan.startsOn, clampedEnd);
}

// ── Streak ──────────────────────────────────────────────────────────────────────────

/**
 * Consecutive fully-compliant civil days ending at (or the day before) `today`.
 *
 * A day counts when EVERY expected meal is `done` — the advertised "N días seguidos
 * cumpliendo" has to mean one thing. Days with no plan in force are SKIPPED: they neither
 * extend nor break the run, because nothing was asked of the user, and punishing someone
 * for the gap between two phases would be punishing them for the coach's calendar.
 *
 * GRACE DAY, same as habits: if today is not complete yet, the walk starts at yesterday.
 * Without it every streak reads 0 every morning until the first tap, which is precisely
 * when the number is supposed to be motivating.
 */
export function nutritionCurrentStreak(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  today: string,
): number {
  if (plans.length === 0) return 0;

  const logsByDate = indexLogs(logs);
  let streak = 0;
  let cursor: string | null = today;

  for (let guard = 0; guard < MAX_NUTRITION_LOOKBACK_DAYS && cursor !== null; guard += 1) {
    const day: string = cursor;
    const expected = expectedNutritionMeals(day, plans, logsByDate);

    if (expected.length === 0) {
      cursor = civilDateAddDays(day, -1);
      continue;
    }

    if (nutritionDayIsFullyCompliant(day, plans, logsByDate)) {
      streak += 1;
    } else if (day === today && streak === 0) {
      // Grace day: today is still in progress. Let yesterday anchor the run.
    } else {
      break;
    }

    cursor = civilDateAddDays(day, -1);
  }

  return streak;
}

/**
 * The LONGEST run of consecutive fully-compliant days inside the closed range — the
 * record streak, a historical fact that does not move with the clock. Same predicate as
 * `nutritionCurrentStreak`, so "best" can never mean something different from "current".
 */
export function nutritionBestStreak(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
): number {
  if (plans.length === 0 || start > end) return 0;

  const logsByDate = indexLogs(logs);
  let best = 0;
  let current = 0;
  let cursor: string | null = end;

  for (let guard = 0; guard < MAX_NUTRITION_RANGE_DAYS && cursor !== null; guard += 1) {
    const day: string = cursor;
    if (day < start) break;

    if (expectedNutritionMeals(day, plans, logsByDate).length > 0) {
      if (nutritionDayIsFullyCompliant(day, plans, logsByDate)) {
        current += 1;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    }

    cursor = civilDateAddDays(day, -1);
  }

  return best;
}

// ── Private ─────────────────────────────────────────────────────────────────────────

interface Counts {
  done: number;
  different: number;
  missed: number;
  unmarked: number;
}

function emptyCounts(): Counts {
  return { done: 0, different: 0, missed: 0, unmarked: 0 };
}

function accumulate(counts: Counts, status: NutritionMealStatus | null): void {
  if (status === "done") counts.done += 1;
  else if (status === "different") counts.different += 1;
  else if (status === "missed") counts.missed += 1;
  else counts.unmarked += 1;
}

function finalize(counts: Counts): NutritionAdherenceBreakdown {
  const expected = counts.done + counts.different + counts.missed + counts.unmarked;
  const ratio = expected > 0 ? counts.done / expected : 0;
  return {
    ...counts,
    expected,
    ratio,
    percent: nutritionCompliancePercent(ratio),
    isEmpty: expected === 0,
  };
}

function indexLogs(logs: NutritionLog[]): Map<string, NutritionLog> {
  const byDate = new Map<string, NutritionLog>();
  for (const log of logs) byDate.set(log.civilDate, log);
  return byDate;
}

/**
 * Walks the range backward day by day, visiting every expected meal-slot with the status
 * it ended up in (`null` ⇒ unmarked).
 *
 * Backward, by `civilDateAddDays`, for the same reason the habit walks are: it is the
 * single rolling-day mechanism, and re-deriving day arithmetic at a call site is how
 * three platforms drift apart.
 */
function forEachSlot(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  start: string,
  end: string,
  visit: (meal: NutritionSnapshotMeal, status: NutritionMealStatus | null) => void,
): void {
  if (start > end) return;

  const logsByDate = indexLogs(logs);
  let cursor: string | null = end;

  for (let guard = 0; guard < MAX_NUTRITION_RANGE_DAYS && cursor !== null; guard += 1) {
    const day: string = cursor;
    if (day < start) return;

    const expected = expectedNutritionMeals(day, plans, logsByDate);
    const log = logsByDate.get(day);
    for (const meal of expected) {
      visit(meal, log?.meals[meal.mealId]?.status ?? null);
    }

    cursor = civilDateAddDays(day, -1);
  }
}

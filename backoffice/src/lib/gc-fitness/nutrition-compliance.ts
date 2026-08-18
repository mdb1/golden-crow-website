// nutrition-compliance.ts
// What the coach reads to DECIDE (#919): the weekly grid, the note feed, and the
// phase-vs-weight table.
//
// FOUNDATION-FREE / NO server-action directive: pure functions, no firebase-admin, no
// next/headers. Jest exercises it directly and the client components import it. The
// Server Actions that fetch plans and logs live in `nutrition-actions.ts` — every export
// in a `"use server"` file must be async, so a synchronous helper cannot sit next to them
// (#785: it passes the whole suite and dies in `next build`, which auto-deploys).
//
// ── This file DERIVES, it does not RE-DERIVE ────────────────────────────────────────
//
// Every number here comes out of `nutrition-adherence.ts` — `nutritionAdherence`,
// `nutritionAdherenceByMeal`, `expectedNutritionMeals`, `nutritionDayIsFullyCompliant`.
// Nothing recounts meal-slots locally. That is not tidiness: the grid and the "78%"
// printed above it must be the SAME fact seen twice, and #173 already cost us a screen
// that truncated a habit percentage to 85 while every other screen rounded to 86. If the
// grid counted its own cells, a coach would see a row of four ✓ next to "75%" and neither
// number would be wrong on its own terms.
//
// ── Why a grid and not a bigger number ──────────────────────────────────────────────
//
// "78% de adherencia" tells a coach nothing they can act on. The grid shows the PATTERN:
// dinner collapses on weekends, breakfast never fails. That is a plan mis-set at dinner,
// not an undisciplined client — and it is a different conversation.
//
// ── Twin status: BACKOFFICE-ONLY, deliberately ──────────────────────────────────────
//
// The cell states and the derived day-row are a COACH-side presentation; iOS and Android
// have no grid today. The compliance PREDICATES underneath are already triple-twinned
// (`statusCountsAsCompliant`, `nutritionDayIsFullyCompliant`), so nothing here can drift
// from the apps' idea of "cumplió". If #920 ever draws this grid in an app, port
// `nutritionDayCellState` — do NOT rewrite the precedence, or the same week renders two
// different colours on two screens and no test fails.

import { civilDateAddDays, civilDaysBetween } from "./civil-date";
import {
  expectedNutritionMeals,
  nutritionAdherence,
  nutritionAdherenceByMeal,
  nutritionAdherenceForPlan,
  nutritionDayIsFullyCompliant,
  type NutritionAdherenceBreakdown,
} from "./nutrition-adherence";
import { civilWeekStart } from "./muscle-group-weeks";
import {
  computeMacroDelta,
  type LocalizedText,
  type MacroTargets,
  type NutritionLog,
  type NutritionMacroDelta,
  type NutritionMealStatus,
  type NutritionPlan,
} from "./nutrition-schema";

/** Monday-anchored week, the boundary every other week in this codebase uses. */
export { civilWeekStart };

// ── The grid ────────────────────────────────────────────────────────────────────────

/**
 * What one cell of the grid shows.
 *
 * `unmarked` and `missed` are DIFFERENT STATES and must not be drawn alike: `missed` is
 * the client declaring a failure, `unmarked` is the client saying nothing. Both count
 * against adherence (an unmarked day rising your score is how a metric rewards ignoring
 * the app), but only one of them is information.
 *
 * `future` and `noPlan` are the two ways a cell can be blank for a reason that is not the
 * client's: the day has not happened yet, or no phase was in force. Neither is in any
 * denominator — that is what makes "sin plan vigente" an empty state instead of a 0%.
 */
export type NutritionCellState =
  | "done"
  | "different"
  | "missed"
  | "unmarked"
  | "future"
  | "noPlan";

export interface NutritionGridCell {
  civilDate: string;
  state: NutritionCellState;
  /** True when the client wrote something for this meal-day — the feed has the text. */
  hasNote: boolean;
}

export interface NutritionGridRow {
  mealId: string;
  /** The most recent name frozen for this meal, so a rename still labels its own row. */
  name: LocalizedText;
  cells: NutritionGridCell[];
  /** Straight from `nutritionAdherenceByMeal` — never recounted from `cells`. */
  breakdown: NutritionAdherenceBreakdown;
}

export interface NutritionWeekGrid {
  /** Monday of the rendered week. */
  weekStart: string;
  /** Sunday of the rendered week. */
  weekEnd: string;
  /** The seven civil dates, Monday → Sunday. */
  days: string[];
  rows: NutritionGridRow[];
  /** The derived "Día" row — one cell per day, `nutritionDayCellState`. */
  dayRow: NutritionGridCell[];
  /** The week's adherence, clamped at `today`. */
  breakdown: NutritionAdherenceBreakdown;
  /** True when the week asked nothing of the client at all — render the empty state. */
  isEmpty: boolean;
}

/**
 * The state of the derived "Día" row for `civilDate`. **Worst wins**, in this order:
 *
 *   noPlan → future → missed → different → unmarked → done
 *
 * A day is `done` ONLY when every expected meal is done, and that verdict is delegated to
 * `nutritionDayIsFullyCompliant` — the same predicate the streak reads on all three
 * platforms. If this file decided "the day counted" on its own, a day could be green here
 * and not extend the client's streak in the app.
 *
 * Worst-wins is the only precedence a coach can read at a glance without a legend: one red
 * cell in the column means something went wrong that day, full stop. An "average" cell
 * (2 done + 2 missed → amber) would hide a missed dinner behind a good breakfast.
 */
export function nutritionDayCellState(
  civilDate: string,
  plans: NutritionPlan[],
  logsByDate: Map<string, NutritionLog>,
  today: string,
): NutritionCellState {
  const expected = expectedNutritionMeals(civilDate, plans, logsByDate);
  if (expected.length === 0) return civilDate > today ? "future" : "noPlan";
  if (civilDate > today) return "future";

  if (nutritionDayIsFullyCompliant(civilDate, plans, logsByDate)) return "done";

  const log = logsByDate.get(civilDate);
  const statuses = expected.map((meal) => log?.meals[meal.mealId]?.status ?? null);
  if (statuses.some((status) => status === "missed")) return "missed";
  if (statuses.some((status) => status === "different")) return "different";
  return "unmarked";
}

/**
 * The week grid for the Monday-anchored week containing `anchorCivilDate`.
 *
 * @param today today in the CLIENT's timezone. Days after it render as `future` and are
 *   excluded from every breakdown — counting unlived days as unmarked would make the
 *   current week's adherence fall a little further behind every morning, all by itself.
 */
export function buildNutritionWeekGrid(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  anchorCivilDate: string,
  today: string,
): NutritionWeekGrid {
  const weekStart = civilWeekStart(anchorCivilDate);
  const days: string[] = [];
  let cursor: string | null = weekStart;
  for (let i = 0; i < 7 && cursor !== null; i += 1) {
    days.push(cursor);
    cursor = civilDateAddDays(cursor, 1);
  }
  const weekEnd = days[days.length - 1] ?? weekStart;

  const logsByDate = new Map<string, NutritionLog>();
  for (const log of logs) logsByDate.set(log.civilDate, log);

  // The scored window stops at today. `nutritionAdherence` returns an empty breakdown when
  // start > end, which is exactly right for a week entirely in the future.
  const scoredEnd = weekEnd < today ? weekEnd : today;
  const breakdown = nutritionAdherence(plans, logs, weekStart, scoredEnd);
  const byMeal = nutritionAdherenceByMeal(plans, logs, weekStart, scoredEnd);

  // Row order is the meal's own order within the day, NOT the worst-first order
  // `nutritionAdherenceByMeal` sorts by: the grid is a timetable, and a coach reads it
  // against the day they wrote. Desayuno stays above Cena even when Cena is the problem.
  const order = new Map<string, number>();
  const names = new Map<string, LocalizedText>();
  for (const day of days) {
    if (day > today) continue;
    for (const meal of expectedNutritionMeals(day, plans, logsByDate)) {
      const known = order.get(meal.mealId);
      if (known === undefined || meal.order < known) order.set(meal.mealId, meal.order);
      // Walking forward, the LAST name seen is the most recent one.
      names.set(meal.mealId, meal.name);
    }
  }

  const rows: NutritionGridRow[] = byMeal
    .map((entry) => ({
      mealId: entry.mealId,
      name: names.get(entry.mealId) ?? entry.name,
      breakdown: entry.breakdown,
      cells: days.map((day) => cellFor(day, entry.mealId, plans, logsByDate, today)),
    }))
    .sort((a, b) => {
      const orderA = order.get(a.mealId) ?? Number.MAX_SAFE_INTEGER;
      const orderB = order.get(b.mealId) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.mealId.localeCompare(b.mealId);
    });

  return {
    weekStart,
    weekEnd,
    days,
    rows,
    dayRow: days.map((day) => ({
      civilDate: day,
      state: nutritionDayCellState(day, plans, logsByDate, today),
      hasNote: dayHasNote(day, plans, logsByDate),
    })),
    breakdown,
    isEmpty: breakdown.isEmpty,
  };
}

function cellFor(
  civilDate: string,
  mealId: string,
  plans: NutritionPlan[],
  logsByDate: Map<string, NutritionLog>,
  today: string,
): NutritionGridCell {
  const expected = expectedNutritionMeals(civilDate, plans, logsByDate);
  // Not expected THAT day — a meal the coach added mid-week, or a phase that does not
  // carry it. Blank, and out of every denominator: the client was never asked.
  if (!expected.some((meal) => meal.mealId === mealId)) {
    return { civilDate, state: civilDate > today ? "future" : "noPlan", hasNote: false };
  }
  if (civilDate > today) return { civilDate, state: "future", hasNote: false };

  const entry = logsByDate.get(civilDate)?.meals[mealId];
  const state: NutritionCellState = entry ? entry.status : "unmarked";
  return {
    civilDate,
    state,
    hasNote: !!entry && (!!entry.note?.trim() || !!entry.actualMacros),
  };
}

function dayHasNote(
  civilDate: string,
  plans: NutritionPlan[],
  logsByDate: Map<string, NutritionLog>,
): boolean {
  const log = logsByDate.get(civilDate);
  if (!log) return false;
  return expectedNutritionMeals(civilDate, plans, logsByDate).some((meal) => {
    const entry = log.meals[meal.mealId];
    return !!entry && (!!entry.note?.trim() || !!entry.actualMacros);
  });
}

// ── The note feed ───────────────────────────────────────────────────────────────────

export interface NutritionNoteEntry {
  civilDate: string;
  mealId: string;
  mealName: LocalizedText;
  status: NutritionMealStatus;
  note: string | null;
  /** What the client says they actually ate. CONTEXT ONLY — never scored. */
  actualMacros: MacroTargets | null;
  /** The meal's target, read from the log's FROZEN snapshot. */
  targets: MacroTargets | null;
  /** `actual − target`, per field; `null` per field when either side is missing. */
  delta: NutritionMacroDelta;
}

/** Bound on the feed — a coach reads the recent ones, not a year of them. */
export const MAX_NUTRITION_NOTES = 60;

/**
 * The client's notes, newest first, then in meal order within a day.
 *
 * This is what a coach actually reads. Two Fridays in a row saying "salí tarde del
 * trabajo" is a plan put in the wrong place, not an undisciplined client — and that only
 * becomes visible when the notes sit next to each other with their dates.
 *
 * An entry is included when it carries a note OR actual macros, whatever its status. The
 * UI only offers the note sheet on `different` / `missed`, but reading the wire
 * defensively costs nothing and a note attached to a `done` is real data, not a bug to
 * hide.
 *
 * Targets come from the log's FROZEN `targetsSnapshot`, never from the live plan: the
 * delta a coach reads for a day in July has to be against what was asked in July.
 */
export function collectNutritionNotes(
  logs: NutritionLog[],
  limit: number = MAX_NUTRITION_NOTES,
): NutritionNoteEntry[] {
  const entries: Array<NutritionNoteEntry & { order: number }> = [];

  for (const log of logs) {
    const snapshotByMeal = new Map(
      log.targetsSnapshot.meals.map((meal) => [meal.mealId, meal]),
    );
    for (const [mealId, entry] of Object.entries(log.meals)) {
      const hasNote = !!entry.note && entry.note.trim().length > 0;
      const hasMacros = !!entry.actualMacros;
      if (!hasNote && !hasMacros) continue;

      const snapshot = snapshotByMeal.get(mealId);
      const targets = snapshot?.targets ?? null;
      entries.push({
        civilDate: log.civilDate,
        mealId,
        // A meal marked on a day whose snapshot no longer lists it (a mid-day edit) still
        // deserves its note read. An empty name renders as the meal id upstream, never as
        // a dropped entry.
        mealName: snapshot?.name ?? { en: "", es: "" },
        status: entry.status,
        note: hasNote ? entry.note!.trim() : null,
        actualMacros: entry.actualMacros ?? null,
        targets,
        delta: computeMacroDelta(targets, entry.actualMacros),
        order: snapshot?.order ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return entries
    .sort((a, b) => {
      if (a.civilDate !== b.civilDate) return a.civilDate < b.civilDate ? 1 : -1;
      if (a.order !== b.order) return a.order - b.order;
      return a.mealId.localeCompare(b.mealId);
    })
    .slice(0, limit)
    .map(({ order: _order, ...entry }) => entry);
}

// ── Stats ───────────────────────────────────────────────────────────────────────────

export interface NutritionStats {
  /** Rolling 7 days ending today (inclusive) — the "last week" a coach means. */
  last7Days: NutritionAdherenceBreakdown;
  /** The phase in force today, clamped at today. `null` when there is none. */
  currentPhase: NutritionAdherenceBreakdown | null;
}

/**
 * The two numbers above the grid.
 *
 * The streak is NOT computed here: `nutritionCurrentStreak` is the triple-twinned
 * function and the caller reads it directly, so "N días seguidos" can never mean one
 * thing on the coach's screen and another on the client's.
 */
export function buildNutritionStats(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  today: string,
  activePlan: NutritionPlan | null,
): NutritionStats {
  const weekStart = civilDateAddDays(today, -6) ?? today;
  return {
    last7Days: nutritionAdherence(plans, logs, weekStart, today),
    currentPhase: activePlan ? nutritionAdherenceForPlan(activePlan, logs, today) : null,
  };
}

// ── Phase vs. weight ────────────────────────────────────────────────────────────────

/** One body-weight measurement, already resolved to a civil date upstream. */
export interface NutritionWeightPoint {
  date: string;
  weight: number;
}

export interface NutritionPhaseRow {
  planId: string;
  name: LocalizedText;
  startsOn: string;
  /** `null` for an open-ended phase. */
  endsOn: string | null;
  /** The window actually observed: `[startsOn, min(endsOn ?? today, today)]`. */
  observedEnd: string;
  isActive: boolean;
  isSelfAuthored: boolean;
  kcalTarget: number | null;
  adherence: NutritionAdherenceBreakdown;
  /**
   * The first day the adherence figure actually covers. Equal to `startsOn` unless the
   * phase began before the loaded log window.
   */
  adherenceFrom: string;
  /**
   * True when the phase started before the loaded window, so its adherence is computed
   * over PART of it.
   *
   * This flag exists because the alternative is a lie with no symptom: every day before
   * the window has no log in memory, the walk counts each one as unmarked, and a phase
   * the client followed perfectly in May prints 8%. The UI says "desde <fecha>" when this
   * is set — the number is real, its range is just not the whole phase.
   */
  adherenceIsPartial: boolean;
  /** First and last weigh-in INSIDE the observed window. */
  startWeightKg: number | null;
  endWeightKg: number | null;
  /** `end − start`, `null` when the phase has fewer than two weigh-ins. */
  deltaKg: number | null;
  /**
   * Δ per week, over the days BETWEEN THE TWO WEIGH-INS — not over the phase length.
   *
   * A 30-day phase whose only two weigh-ins are three days apart moved that weight in
   * three days; dividing by 30 would print a rate the client never had, and a coach
   * decides whether the plan is working from exactly this number.
   */
  deltaKgPerWeek: number | null;
}

/**
 * The table under the weight chart: one row per phase, in date order.
 *
 * This is the question a coach actually asks — *¿este plan le está funcionando?* — and it
 * needs three facts side by side that live in three different collections: what was asked
 * (kcal), whether it was followed (adherence), and what the body did (Δ peso). Any two of
 * them are misleading alone: weight dropping on 40% adherence is not evidence the plan
 * works.
 *
 * Soft-deleted phases are dropped — a superseded phase is history the client never lived.
 */
/**
 * @param windowStart the first civil date whose logs the caller actually loaded. Passing
 *   it is what keeps an old phase from reporting a number computed against days nobody
 *   read — see `adherenceIsPartial`.
 */
export function buildNutritionPhaseRows(
  plans: NutritionPlan[],
  logs: NutritionLog[],
  weights: NutritionWeightPoint[],
  today: string,
  activePlanId: string | null,
  windowStart?: string,
): NutritionPhaseRow[] {
  const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));

  return plans
    .filter((plan) => plan.deleted !== true && !!plan.id)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((plan) => {
      const planEnd = plan.endsOn ?? today;
      const observedEnd = planEnd < today ? planEnd : today;
      const inWindow = sortedWeights.filter(
        (point) => point.date >= plan.startsOn && point.date <= observedEnd,
      );
      const first = inWindow[0] ?? null;
      const last = inWindow.length > 1 ? inWindow[inWindow.length - 1]! : null;

      const deltaKg = first && last ? round1(last.weight - first.weight) : null;
      const spanDays = first && last ? civilDaysBetween(first.date, last.date) : null;
      const deltaKgPerWeek =
        deltaKg !== null && spanDays !== null && spanDays > 0
          ? round1((deltaKg / spanDays) * 7)
          : null;

      const adherenceIsPartial = !!windowStart && windowStart > plan.startsOn;
      const adherenceFrom = adherenceIsPartial ? windowStart! : plan.startsOn;
      const adherence = adherenceIsPartial
        ? nutritionAdherence([plan], logs, adherenceFrom, observedEnd)
        : nutritionAdherenceForPlan(plan, logs, today);

      return {
        planId: plan.id!,
        name: plan.name,
        startsOn: plan.startsOn,
        endsOn: plan.endsOn ?? null,
        observedEnd,
        isActive: plan.id === activePlanId,
        isSelfAuthored: plan.source === "self" && plan.clientId === plan.trainerId,
        kcalTarget: typeof plan.targets.kcal === "number" ? plan.targets.kcal : null,
        adherence,
        adherenceFrom,
        adherenceIsPartial,
        startWeightKg: first ? first.weight : null,
        endWeightKg: last ? last.weight : null,
        deltaKg,
        deltaKgPerWeek,
      };
    });
}

/**
 * The coloured bands drawn behind the weight chart, one per phase.
 *
 * `tone` cycles so adjacent phases are visually distinct; it carries no meaning (a "cut"
 * is not red and a "bulk" is not green — the coach names the phase, we do not classify
 * it). Phases that start after the chart window are dropped; the rest are clamped to it,
 * because a band drawn outside the axis makes recharts stretch the domain and the weight
 * line goes flat.
 */
export interface NutritionPhaseBand {
  planId: string;
  label: string;
  from: string;
  to: string;
  tone: number;
}

export function buildNutritionPhaseBands(
  rows: NutritionPhaseRow[],
  windowStart: string,
  windowEnd: string,
  locale: "en" | "es" = "es",
): NutritionPhaseBand[] {
  return rows
    .filter((row) => row.startsOn <= windowEnd && row.observedEnd >= windowStart)
    .map((row, index) => ({
      planId: row.planId,
      label: row.name[locale] || row.name.en || row.name.es,
      from: row.startsOn < windowStart ? windowStart : row.startsOn,
      to: row.observedEnd > windowEnd ? windowEnd : row.observedEnd,
      tone: index % 4,
    }));
}

/** One decimal — weights are read, not computed with; `0.30000000000000004` is noise. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

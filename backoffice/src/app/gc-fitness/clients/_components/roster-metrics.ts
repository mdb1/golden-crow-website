// roster-metrics.ts — pure, view-level numbers of a roster row, shared by the
// card grid and the list view (golden-crow-website#535) so the two can't
// disagree about a percentage, a trend or who owes money.

import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";

function finite(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pct(ratio: number): number {
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/** Habit compliance of the last 7 days, 0–100. */
export function habitCompliancePct(row: ClientRosterRow): number {
  return pct(finite(row.thisWeekComplianceRatio) ?? 0);
}

/** Nutrition adherence of the last 7 days, 0–100 — or null when nothing was asked (#923). */
export function nutritionPct(row: ClientRosterRow): number | null {
  const r = finite(row.nutritionRatio7Days);
  return r === null ? null : pct(r);
}

/** Below this the bar / number reads as "at risk" (same threshold the roster always used). */
export const COMPLIANCE_GOOD_PCT = 70;

/** A change of fewer points than this is "the same as last week". */
export const TREND_FLAT_POINTS = 5;

export interface HabitTrend {
  direction: "up" | "down" | "flat";
  /** Absolute change in percentage points. */
  points: number;
}

/**
 * #535 — this week's habit compliance vs the 7 days before. null when there is
 * nothing to compare: no habit scheduled this week, or none the week before
 * (a new client) — the old card drew an arrow from the absolute value alone,
 * which read as a trend and wasn't one.
 */
export function habitTrend(row: ClientRosterRow): HabitTrend | null {
  if (row.habitsScheduledThisWeek <= 0) return null;
  const prev = finite(row.prevWeekComplianceRatio);
  if (prev === null) return null;
  const delta = habitCompliancePct(row) - pct(prev);
  const points = Math.abs(delta);
  if (points < TREND_FLAT_POINTS) return { direction: "flat", points };
  return { direction: delta > 0 ? "up" : "down", points };
}

/**
 * Sort key for "payments": worst first when ascending. Overdue (most days late
 * first) → due soon (soonest first) → up to date. No plan = null (always last).
 */
export function paymentScore(row: ClientRosterRow): number | null {
  const b = row.billing;
  if (!b) return null;
  switch (b.state) {
    case "overdue":
      return -1 - b.days;
    case "due_soon":
      return b.days;
    default:
      return 1000 + b.days;
  }
}

export function isPaymentOverdue(row: ClientRosterRow): boolean {
  return row.billing?.state === "overdue";
}

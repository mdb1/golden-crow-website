// recurrence-expansion.ts
//
// Pure (no "use server", no Firebase) recurrence date-expansion. This is the
// SINGLE SOURCE OF TRUTH for turning a RecurrenceRule + start/end civil dates
// into the concrete set of civil dates an assignment series lands on.
//
// 260618 (#294): extracted out of workout-assignment-actions.ts so BOTH the
// server write path (assignTemplateRecurring / bulkAssignTemplate) AND the
// client-side calendar PREVIEW import the exact same matcher. Previously the
// matcher lived inside the "use server" actions file and could not be imported
// by client components — a client preview would have had to duplicate it and
// could silently drift from what actually gets written. Keep all behavioral
// changes here; both call sites pick them up automatically.
//
// CIVIL-DATE CONTRACT (Pitfall 1): every date here is a "YYYY-MM-DD" civil-date
// string, never a Timestamp/instant. Day arithmetic is UTC-anchored so it is
// exact-day and DST-free.

import { civilDateFormat } from "./civil-date";

export const MAX_RECURRING_OCCURRENCES = 104; // ~2 years weekly cap
export const NO_END_HORIZON_DAYS = 365; // "no end" operational horizon (rolling)

export type ExpandableRecurrence =
  | { kind: "single" }
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number }
  | { kind: "weekly_days"; weekdays: number[] }
  | { kind: "every_n_days"; everyN: number }
  | { kind: "monthly"; dayOfMonth: number };

/** Add whole calendar days to a civil date string (UTC-anchored, no DST drift). */
export function addCivilDays(civilDate: string, days: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  // Construct at UTC midnight so the arithmetic is exact-day.
  const utcMidnight = Date.UTC(y, m - 1, d);
  const shifted = new Date(utcMidnight + days * 86_400_000);
  return civilDateFormat(shifted, "UTC");
}

/** Local-time weekday index (0=Sun … 6=Sat) for a civil date. */
export function dayOfWeekFromCivil(civilDate: string): number {
  const [y, m, d] = civilDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** True when `date` (a civil-date string) matches `recurrence` anchored at `startDate`. */
export function matchesRecurrence(
  recurrence: ExpandableRecurrence,
  startDate: string,
  date: string,
  dayIndex: number,
): boolean {
  switch (recurrence.kind) {
    case "single":
      return date === startDate;
    case "daily":
      return true;
    case "weekly":
      return dayIndex === recurrence.weekday;
    case "weekly_days":
      return recurrence.weekdays.includes(dayIndex);
    case "every_n_days": {
      const [y0, m0, d0] = startDate.split("-").map(Number);
      const [y1, m1, d1] = date.split("-").map(Number);
      const diff =
        (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / 86_400_000;
      return diff >= 0 && diff % recurrence.everyN === 0;
    }
    case "monthly": {
      const [y, m, d] = date.split("-").map(Number);
      const target = recurrence.dayOfMonth;
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const clamped = Math.min(target, lastDayOfMonth);
      return d === clamped;
    }
  }
}

/**
 * Expand a recurrence rule into the matching civil dates in
 * `[startDate, endDate ?? startDate + NO_END_HORIZON_DAYS]`, capped at
 * `MAX_RECURRING_OCCURRENCES`. Returns the dates in ascending order.
 */
export function expandRecurrenceDates(
  recurrence: ExpandableRecurrence,
  startDate: string,
  endDate?: string,
): string[] {
  const hardWindowEnd = addCivilDays(startDate, NO_END_HORIZON_DAYS);
  const windowEnd = endDate ?? hardWindowEnd;
  const dates: string[] = [];
  for (let date = startDate; date <= windowEnd; date = addCivilDays(date, 1)) {
    if (
      matchesRecurrence(recurrence, startDate, date, dayOfWeekFromCivil(date))
    ) {
      dates.push(date);
      if (dates.length >= MAX_RECURRING_OCCURRENCES) break;
    }
  }
  return dates;
}

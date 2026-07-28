// month-grid.ts
//
// Pure civil-date math for a Monday-first month grid — the read-only admin
// calendar's layout, and the prev/next-month arrows behind it.
//
// Firebase-free and timezone-free ON PURPOSE: every date here is a CIVIL date
// string (`YYYY-MM-DD`) already resolved in the client's timezone upstream.
// Doing the arithmetic on strings (via UTC-noon Dates) is what keeps a DST
// boundary from shifting a cell — the trap a naive `new Date(y, m, d)` walk
// falls into.
//
// Week starts MONDAY, matching every other week boundary in this codebase
// (`DashboardAggregator.weekStart` / `civilWeekStart`).

/** A single cell of the rendered grid. */
export interface MonthGridDay {
  /** Civil date `YYYY-MM-DD`. */
  civil: string;
  /** Day-of-month number to print. */
  dayOfMonth: number;
  /** False for the leading/trailing days that belong to the adjacent months. */
  inMonth: boolean;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → a UTC Date at midnight (no local-timezone drift). */
function parseCivil(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** UTC Date → `YYYY-MM-DD`. */
function formatCivil(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shift a civil date by whole days. */
export function shiftCivil(civil: string, days: number): string {
  return formatCivil(new Date(parseCivil(civil).getTime() + days * DAY_MS));
}

/** The first day of the month a civil date falls in (`YYYY-MM-01`). */
export function monthFirst(civil: string): string {
  return `${civil.slice(0, 7)}-01`;
}

/** The first day of the PREVIOUS month, relative to any day in this one. */
export function previousMonthFirst(civil: string): string {
  // Step back one day from the 1st — always lands in the previous month, for
  // any month length, without month-arithmetic overflow.
  return monthFirst(shiftCivil(monthFirst(civil), -1));
}

/** The first day of the NEXT month, relative to any day in this one. */
export function nextMonthFirst(civil: string): string {
  // 31 days past the 1st always lands in the next month (max month length),
  // then snap to its 1st.
  return monthFirst(shiftCivil(monthFirst(civil), 31));
}

/**
 * The Monday-first grid for the month containing `civil`: leading days from the
 * previous month, every day of this month, then trailing days to complete the
 * final week. Always a whole number of weeks, so the caller can chunk by 7.
 */
export function monthGridDays(civil: string): MonthGridDay[] {
  const first = parseCivil(monthFirst(civil));
  // getUTCDay(): 0=Sun … 6=Sat. Monday-first offset: Mon→0 … Sun→6.
  const leading = (first.getUTCDay() + 6) % 7;
  const monthKey = monthFirst(civil).slice(0, 7);

  const days: MonthGridDay[] = [];
  let cursor = new Date(first.getTime() - leading * DAY_MS);
  // 6 weeks covers every possible month layout (31 days + 6 leading).
  for (let i = 0; i < 42; i += 1) {
    const value = formatCivil(cursor);
    days.push({
      civil: value,
      dayOfMonth: cursor.getUTCDate(),
      inMonth: value.slice(0, 7) === monthKey,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  // Drop trailing all-adjacent-month weeks (a 28-day February starting Monday
  // needs 4 rows, not 6) so the grid never renders an empty week.
  while (days.length > 7 && days.slice(-7).every((d) => !d.inMonth)) {
    days.length -= 7;
  }
  return days;
}

/** Split the flat grid into weeks of 7 for rendering. */
export function chunkWeeks(days: MonthGridDay[]): MonthGridDay[][] {
  const weeks: MonthGridDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** "2026-07" → a display label, e.g. "julio 2026" / "July 2026". */
export function monthLabel(civil: string, locale: string): string {
  const date = parseCivil(monthFirst(civil));
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

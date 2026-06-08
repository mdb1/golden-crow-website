// end-date-presets.ts
//
// Small helper for preset duration pills in GC Fitness forms.
//
// The inputs and outputs are civil dates ("YYYY-MM-DD"), not instants.

import { civilDateFormat } from "@/lib/gc-fitness/civil-date";

export const END_DATE_PRESET_MONTHS = [1, 3, 6, 12] as const;

export type EndDatePresetMonths = (typeof END_DATE_PRESET_MONTHS)[number];

export const END_DATE_PRESET_WEEKS = [1, 2, 4] as const;

export type EndDatePresetWeeks = (typeof END_DATE_PRESET_WEEKS)[number];

/**
 * Add whole calendar months to a civil date string and clamp overflow to the
 * last valid day of the target month.
 *
 * Examples:
 *   - 2026-01-31 + 1 month -> 2026-02-28
 *   - 2024-01-31 + 1 month -> 2024-02-29
 */
export function addCivilMonths(civilDate: string, months: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDay);
  const shifted = new Date(Date.UTC(y, m - 1 + months, clampedDay));
  return civilDateFormat(shifted, "UTC");
}

/** Add whole calendar days to a civil date string (UTC-anchored, no DST drift). */
export function addCivilDays(civilDate: string, days: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return civilDateFormat(shifted, "UTC");
}

/**
 * Inclusive end date for an N-week window anchored to the START date.
 *
 * The habit/assignment window [startsOn, endsOn] is INCLUSIVE, so an N-week
 * duration must end (N*7 - 1) days after the start for a daily cadence to
 * yield exactly N*7 occurrences. Example: a 2-week daily habit starting
 * 2026-05-08 ends 2026-05-21 → 14 occurrences (NOT 2026-05-22 → 15).
 */
export function endDateForWeeks(startCivilDate: string, weeks: number): string {
  return addCivilDays(startCivilDate, weeks * 7 - 1);
}

export function inferEndDatePresetWeeks(
  startCivilDate: string,
  endCivilDate?: string,
): EndDatePresetWeeks | null {
  if (!endCivilDate) return null;
  return (
    END_DATE_PRESET_WEEKS.find(
      (weeks) => endDateForWeeks(startCivilDate, weeks) === endCivilDate,
    ) ?? null
  );
}

export function localDateToCivil(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function inferEndDatePresetMonths(
  startCivilDate: string,
  endCivilDate?: string,
): EndDatePresetMonths | null {
  if (!endCivilDate) return null;
  return (
    END_DATE_PRESET_MONTHS.find(
      (months) => addCivilMonths(startCivilDate, months) === endCivilDate,
    ) ?? null
  );
}

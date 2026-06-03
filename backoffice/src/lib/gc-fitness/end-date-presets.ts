// end-date-presets.ts
//
// Small helper for preset duration pills in GC Fitness forms.
//
// The inputs and outputs are civil dates ("YYYY-MM-DD"), not instants.

import { civilDateFormat } from "@/lib/gc-fitness/civil-date";

export const END_DATE_PRESET_MONTHS = [1, 3, 6, 12] as const;

export type EndDatePresetMonths = (typeof END_DATE_PRESET_MONTHS)[number];

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

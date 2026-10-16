// trend-range.ts — Shared time-range vocabulary for the client-profile
// trend widgets (HabitTrendsWidget + WorkoutTrendsWidget).
//
// Both the habits-% chart and the workout-frequency chart expose the same
// selector — All time / 90d / 30d / 7d — so the range keys, their day
// spans, and the civil-date math live here once.
//
// "all" is bounded to 365 days. A year of lookback effectively covers
// "all time" for any habit/workout history we'd want to surface on a
// coaching profile while keeping the server-side aggregation bounded
// (mirrors the 365-day cap the iOS HabitStreakCalculator uses).

export type TrendRangeKey = "all" | "90" | "30" | "7";

export interface TrendRangeDef {
  key: TrendRangeKey;
  /** Lookback window in days. `all` is capped at one year. */
  days: number;
}

/** Display order: widest → narrowest, matching the segmented selector. */
export const TREND_RANGES: readonly TrendRangeDef[] = [
  { key: "all", days: 365 },
  { key: "90", days: 90 },
  { key: "30", days: 30 },
  { key: "7", days: 7 },
] as const;

/** Default range when the widget first paints — a coaching-relevant month. */
export const DEFAULT_TREND_RANGE: TrendRangeKey = "30";

/** Bar buckets switch from daily to weekly once the window passes ~30 days. */
export function bucketGranularity(range: TrendRangeKey): "day" | "week" {
  return range === "7" || range === "30" ? "day" : "week";
}

// ---- civil-date arithmetic (YYYY-MM-DD strings, timezone-agnostic) ----
//
// We anchor each parsed civil date at UTC noon so a ±1-day shift never
// trips over a DST boundary. Inputs/outputs are always the 10-char
// "YYYY-MM-DD" civil-date form produced by `civilDateFormat`.

function civilToUtcNoon(civilDate: string): Date | null {
  // Digits-only components (unpadded accepted); an empty one is malformed (`Number("")` is 0).
  const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(civilDate);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  // `setUTCFullYear` keeps the year literal — `Date.UTC` maps 0–99 to 1900–1999.
  const date = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  date.setUTCFullYear(y, m - 1, d);
  // Calendar-invalid dates ("2026-02-30", "2026-13-01") would otherwise roll over
  // to a different day; treat them as malformed like every other bad input (#451).
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

function utcNoonToCivil(date: Date): string {
  const yy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Returns `civilDate` shifted by `delta` days (delta may be negative). */
export function addCivilDays(civilDate: string, delta: number): string {
  const date = civilToUtcNoon(civilDate);
  if (!date) return civilDate;
  date.setUTCDate(date.getUTCDate() + delta);
  return utcNoonToCivil(date);
}

/** Whole-day difference `a - b` (positive when `a` is later than `b`). */
export function civilDiffDays(a: string, b: string): number {
  const da = civilToUtcNoon(a);
  const db = civilToUtcNoon(b);
  if (!da || !db) return 0;
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

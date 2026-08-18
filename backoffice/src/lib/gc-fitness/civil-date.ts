// civil-date.ts
// TypeScript twin of GCFitnessCore CivilDate.swift.
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7 from 04-RESEARCH.md):
//   Any behavioral change here MUST be matched in:
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/CivilDate.swift
//   in the SAME commit, and the shared fixture block at the top of both test
//   files must continue to agree.
//
// Why this exists (Pitfall 1 from 04-RESEARCH.md):
//   The backoffice trainer UI works in civil dates ("YYYY-MM-DD" strings),
//   never wall-clock instants. If we serialize `new Date()` through
//   `.toISOString().slice(0, 10)`, a trainer in Mexico City (UTC-6) at
//   22:00 will see tomorrow's date because the same instant in UTC is
//   already the next day. The same is true on iOS — see CivilDate.swift.
//   Reading and writing `"YYYY-MM-DD"` keyed off an IANA timezone via
//   Intl.DateTimeFormat is the only correct approach.
//
// Why we never call Date.prototype methods that return UTC strings:
//   `toISOString`, `toJSON`, `getUTCFullYear`, `getUTCMonth`, `getUTCDate`
//   all serialize in UTC. A locked source-contract test in __tests__/
//   civil-date.test.ts asserts that this file's source code (with line
//   comments stripped) never contains the string "toISOString". If you
//   need to touch this file and the contract feels in the way — the
//   contract is the whole point.
//
// Why Intl.DateTimeFormat(undefined, { ... }) instead of a fixed locale:
//   We rely on `formatToParts()` to extract the year/month/day numerals
//   from a stable representation and then concatenate them. Passing
//   `undefined` keeps the locale at the host default, which is fine
//   because we override every relevant token (`year: 'numeric'`,
//   `month: '2-digit'`, `day: '2-digit'`, `calendar: 'gregory'`). The
//   `formatToParts()` output is a tagged array, so we never have to
//   pattern-match a locale-shaped string like "06/01/2026".

const CALENDAR_OPTIONS: Intl.DateTimeFormatOptions = {
  // `calendar: 'gregory'` is the Latin name for the Gregorian calendar
  // ICU recognises; passing this prevents a Thai-Buddhist or
  // Japanese-Imperial host locale from emitting "2569-06-01" etc.
  calendar: "gregory",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

/**
 * Returns today's civil date ("YYYY-MM-DD") in the supplied IANA timezone.
 *
 * @param timezone IANA timezone identifier (e.g. "America/Mexico_City").
 *   Unknown identifiers fall back to the host runtime's default zone —
 *   see file header.
 * @param now Optional override for testing. Defaults to a fresh `new Date()`.
 */
export function civilDateToday(timezone: string, now: Date = new Date()): string {
  return civilDateFormat(now, timezone);
}

/**
 * Formats an arbitrary instant to "YYYY-MM-DD" in the given IANA timezone.
 *
 * The output is exactly 10 characters: 4-digit year, 2-digit month,
 * 2-digit day, hyphen-separated.
 */
export function civilDateFormat(date: Date, timezone: string): string {
  const parts = formatPartsInZone(date, timezone);
  return assemble(parts);
}

/**
 * Formats a civil date (`YYYY-MM-DD`) for display without letting the host
 * timezone reinterpret it as an instant.
 *
 * The input is treated as a calendar date in UTC noon and rendered with an
 * explicit `timeZone: "UTC"` so browser/server locale differences cannot
 * shift the visible day.
 */
export function formatCivilDateLabel(
  civilDate: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  },
  locale?: string,
): string {
  const date = parseCivilDate(civilDate);
  if (!date) return civilDate;
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      calendar: "gregory",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      calendar: "gregory",
    }).format(date);
  }
}

/**
 * Adds `days` (may be negative) to a `"YYYY-MM-DD"` civil date. Returns `null` on
 * malformed input.
 *
 * Twin of Swift `CivilDate.addDays` and Kotlin `CivilDate.addDays`. This is the SINGLE
 * rolling-day mechanism the nutrition walks (adherence, streak, phase trimming) derive
 * from — never re-implement civil-day arithmetic at a call site, which is exactly how
 * three platforms drift apart.
 *
 * The arithmetic runs in UTC anchored at noon: UTC has no DST, and the input carries no
 * time component, so only the calendar day matters. February 2026 has 28 days, so
 * `addDays("2026-03-01", -1)` is `"2026-02-28"` — not `"2026-03-00"`, and not
 * `"2026-02-29"`.
 */
export function civilDateAddDays(civilDate: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civilDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(anchor.getTime())) return null;
  anchor.setUTCDate(anchor.getUTCDate() + days);

  const yy = String(anchor.getUTCFullYear()).padStart(4, "0");
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// MARK: - Photo-comparator elapsed span (twin of PhotoCompareElapsed.swift /
//         PhotoCompareElapsed.kt)
//
// SAME-SOURCE-OF-TRUTH CONTRACT: any behavioral change to `photoCompareElapsed`
// (or `daysFromCivil`) MUST be matched in:
//   gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/PhotoCompareElapsed.swift
//   gc-fitness/android/core/src/main/kotlin/com/goldencrow/fitness/core/schema/PhotoCompareElapsed.kt
// and the shared fixture block in the three test files must keep agreeing.
//
// Why a shared calculator: the before/after photo picker labels the "after"
// options with the elapsed time since the selected "before" (e.g. "1 mes",
// "~2 meses"). iOS, Android and the backoffice must produce the SAME buckets
// for the same pair of civil days, so the pure math lives in one place per
// platform.

export type PhotoCompareElapsedUnit = "day" | "week" | "month";

export interface PhotoCompareElapsed {
  value: number;
  unit: PhotoCompareElapsedUnit;
  /** True when the span does not land exactly on the unit boundary (renders a
   * leading "~"): e.g. 2-months-and-19-days → `{value: 2, unit: "month",
   * approximate: true}` → "~2 meses". */
  approximate: boolean;
}

/** A civil day as its calendar components (proleptic Gregorian). */
export interface CivilYMD {
  year: number;
  month: number;
  day: number;
}

/**
 * Splits a `"YYYY-MM-DD"` civil string into its calendar components, or returns
 * `null` if the string is not a well-formed civil date. Used by the photo
 * comparator to feed `photoCompareElapsed`.
 */
export function parseCivilYMD(civil: string): CivilYMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  if (!match) return null;
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Serial day number for a civil date (days since 1970-01-01), via Howard
 * Hinnant's `days_from_civil`. Pure integer math — no `Date`, no timezone —
 * so the three platform twins stay bit-identical.
 */
function daysFromCivil({ year, month, day }: CivilYMD): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Elapsed span between two civil days, bucketed to the coarsest sensible unit
 * (months ≥ 1 → months; else weeks ≥ 1 → weeks; else days).
 *
 * Returns `null` when `after` is not strictly after `before` (same day or
 * earlier) — the picker treats that as "not selectable as the after photo".
 *
 * Month counting is calendar-based ("1 mes" for Mar 1 → Apr 1) so it matches a
 * human reading of the dates rather than a 30-day approximation. `approximate`
 * is true whenever there is a leftover remainder past the whole unit.
 */
export function photoCompareElapsed(
  before: CivilYMD,
  after: CivilYMD,
): PhotoCompareElapsed | null {
  const beforeSerial = daysFromCivil(before);
  const afterSerial = daysFromCivil(after);
  if (afterSerial <= beforeSerial) return null;

  let months = (after.year - before.year) * 12 + (after.month - before.month);
  if (after.day < before.day) months -= 1;
  if (months >= 1) {
    return { value: months, unit: "month", approximate: after.day !== before.day };
  }

  const days = afterSerial - beforeSerial;
  if (days >= 7) {
    return { value: Math.floor(days / 7), unit: "week", approximate: days % 7 !== 0 };
  }
  return { value: days, unit: "day", approximate: false };
}

// MARK: - Helpers

/**
 * Runs `Intl.DateTimeFormat(...).formatToParts(date)` with a graceful
 * fallback if the supplied IANA identifier is unknown.
 *
 * Node and modern browsers throw a `RangeError` for unrecognised IANA
 * identifiers. Catching the error and re-running without the `timeZone`
 * option keeps the function from crashing the caller — matches the
 * `TimeZone(identifier:) ?? .current` fallback in CivilDate.swift.
 */
function formatPartsInZone(date: Date, timezone: string): Intl.DateTimeFormatPart[] {
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...CALENDAR_OPTIONS,
      timeZone: timezone,
    }).formatToParts(date);
  } catch {
    // Fallback: host-default zone. Mirrors Swift's
    // `TimeZone(identifier:) ?? .current` fallback.
    return new Intl.DateTimeFormat(undefined, CALENDAR_OPTIONS).formatToParts(date);
  }
}

function parseCivilDate(civilDate: string): Date | null {
  const [yearText, monthText, dayText] = civilDate.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (civilDateFormat(date, "UTC") !== civilDate) return null;
  return date;
}

function assemble(parts: readonly Intl.DateTimeFormatPart[]): string {
  // `formatToParts()` returns parts tagged with `type`. Locale-specific
  // ordering ("01/06/2026" vs "2026-06-01" vs "1/6/2026") doesn't matter
  // because we pluck values by tag, not by position. Falls back to "0000"
  // / "00" if a part is missing, which is defensive — Intl always emits
  // year/month/day when those options are requested.
  const year = pad(part(parts, "year"), 4);
  const month = pad(part(parts, "month"), 2);
  const day = pad(part(parts, "day"), 2);
  return `${year}-${month}-${day}`;
}

function part(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

function pad(value: string, width: number): string {
  return value.padStart(width, "0");
}

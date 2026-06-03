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

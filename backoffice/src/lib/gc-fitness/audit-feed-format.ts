// audit-feed-format.ts — human dates for the admin Monitoring feed.
//
// Pure, locale-aware and zone-aware. The feed's data (model meta lines, stored
// `coach_activity.detail`) speaks ISO — «Fecha: 2026-12-26», «2026-08-08 → 2026-09-05» —
// and that stays as it is: the CSV export and the tests read it. The RENDER turns
// it into «26 dic 2026» here.

/** "es" → "es-AR" (the product's Spanish), anything else → "en-US". */
export function intlLocale(locale: string): string {
  return locale.startsWith("es") ? "es-AR" : "en-US";
}

function civilParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** A civil day at noon UTC — formatting it in UTC can never shift the day. */
function civilDate(iso: string): Date | null {
  const p = civilParts(iso);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d, 12)) : null;
}

/** Short month without the trailing dot es-AR adds («nov.» → «nov»). */
function shortMonth(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(/\.$/, "");
}

/**
 * "2026-11-14" → es «14 nov 2026» / en «Nov 14, 2026». `withYear: false` drops the
 * year (for the first end of a same-year range).
 */
export function humanDate(iso: string, locale: string, withYear = true): string {
  const date = civilDate(iso);
  if (!date) return iso;
  const day = date.getUTCDate();
  const month = shortMonth(date, locale);
  const year = date.getUTCFullYear();
  if (locale.startsWith("es")) return withYear ? `${day} ${month} ${year}` : `${day} ${month}`;
  return withYear ? `${month} ${day}, ${year}` : `${month} ${day}`;
}

/** «14 nov → 26 dic 2026» (one year written once) or «28 dic 2026 → 4 ene 2027». */
export function humanDateRange(first: string, last: string, locale: string): string {
  if (first === last) return humanDate(first, locale);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${humanDate(first, locale, !sameYear)} → ${humanDate(last, locale)}`;
}

const ISO_IN_TEXT = /(?<![\d-])(\d{4}-\d{2}-\d{2})(?![\d:T])/g;

/** Every bare ISO civil date inside a sentence, humanized. Timestamps are left alone. */
export function humanizeDatesInText(text: string, locale: string): string {
  return text.replace(ISO_IN_TEXT, (iso) => humanDate(iso, locale));
}

/**
 * The day separator: «Hoy», «Ayer», «Lunes 16 nov» (es) / «Monday, Nov 16» (en);
 * the year is added when it is not `today`'s. Both days are civil "YYYY-MM-DD" in
 * the viewer's zone, so this never looks at a clock.
 */
export function daySeparatorLabel(
  day: string,
  today: string,
  locale: string,
  words: { today: string; yesterday: string },
): string {
  if (day === today) return words.today;
  const date = civilDate(day);
  const todayDate = civilDate(today);
  if (!date) return day;
  if (todayDate && todayDate.getTime() - date.getTime() === 86_400_000) return words.yesterday;
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" }).format(date);
  const cap = weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
  const month = shortMonth(date, locale);
  const yearSuffix = today.slice(0, 4) === day.slice(0, 4) ? "" : ` ${date.getUTCFullYear()}`;
  return locale.startsWith("es")
    ? `${cap} ${date.getUTCDate()} ${month}${yearSuffix}`
    : `${cap}, ${month} ${date.getUTCDate()}${yearSuffix ? `,${yearSuffix}` : ""}`;
}

/** «hace 5 min» / «5 min. ago». Null when the instant is unknown. */
export function relativeTime(iso: string | null, nowMs: number, locale: string): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const seconds = Math.round((at - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto", style: "short" });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / (7 * 86_400)), "week");
  if (abs < 365 * 86_400) return rtf.format(Math.round(seconds / (30 * 86_400)), "month");
  return rtf.format(Math.round(seconds / (365 * 86_400)), "year");
}

/** Plural weekday name for a cadence: es «sábados» / «lunes», en «Saturdays». */
export function weekdayPlural(jsWeekday: number, locale: string): string {
  // 2026-11-15 is a Sunday: + n days lands on weekday n.
  const date = new Date(Date.UTC(2026, 10, 15 + (((jsWeekday % 7) + 7) % 7), 12));
  const name = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" }).format(date);
  if (locale.startsWith("es")) return name.endsWith("s") ? name : `${name}s`;
  return `${name}s`;
}

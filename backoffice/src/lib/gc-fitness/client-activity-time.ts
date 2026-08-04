import { civilDateFormat } from "./civil-date";

/**
 * The locale for values that are DATA, not presentation.
 *
 * `Intl` with an `undefined` locale resolves to the RUNTIME's locale, which is the right
 * behaviour for anything a coach reads — they should see their own formatting — and the wrong
 * behaviour for anything used as a key, where the output has to be identical everywhere.
 *
 * It is also what made `client-activity-time.test.ts` fail on a developer machine and pass in
 * CI for two months: same code, same input, different default locale.
 */
const KEY_LOCALE = "en-US";

function formatInZone(
  iso: string | null,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

export function formatClientActivityDateTime(
  iso: string | null,
  timezone: string,
  locale?: string,
): string {
  return formatInZone(
    iso,
    timezone,
    {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    locale,
  );
}

export function formatClientActivityTime(
  iso: string | null,
  timezone: string,
  locale?: string,
): string {
  return formatInZone(
    iso,
    timezone,
    {
      hour: "2-digit",
      minute: "2-digit",
    },
    locale,
  );
}

export function formatClientActivityDate(
  iso: string | null,
  timezone: string,
  locale?: string,
): string {
  return formatInZone(
    iso,
    timezone,
    {
      month: "short",
      day: "numeric",
    },
    locale,
  );
}

export function formatClientActivityFullDate(
  iso: string | null,
  timezone: string,
  locale?: string,
): string {
  return formatInZone(
    iso,
    timezone,
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
    locale,
  );
}

export function formatClientActivityDayHeader(
  iso: string | null,
  timezone: string,
  locale?: string,
): string {
  return formatInZone(
    iso,
    timezone,
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    },
    locale,
  );
}

/**
 * Bucket an instant into `YYYY-MM-DDTHH` in the client's timezone.
 *
 * ⚠️ **Locale-pinned on purpose: this is a KEY.** `ChatHistoryWidget` groups messages by this
 * value, so it has to depend on the instant and the timezone and on nothing else. Left to the
 * runtime locale, the hour part is not stable — `hour12: false` yields `24` at midnight under
 * the `h24` cycle some locales resolve to, and `00` under `h23` — so the same message could
 * land in a different bucket for two coaches looking at the same client.
 */
export function clientActivityGroupKey(
  iso: string | null,
  timezone: string,
): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const day = civilDateFormat(date, timezone);
  const hour = formatInZone(
    iso,
    timezone,
    {
      hour: "2-digit",
      // `hourCycle` rather than `hour12: false`, which is what leaves the 24-vs-00 choice to
      // the locale in the first place.
      hourCycle: "h23",
    },
    KEY_LOCALE,
  );
  return `${day}T${hour}`;
}

export function clientActivityCivilDateKey(
  iso: string | null,
  timezone: string,
): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return civilDateFormat(date, timezone);
}

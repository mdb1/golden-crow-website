import { civilDateFormat, civilDateToday } from "./civil-date";

export interface RecentLogsDayLabels {
  today: string;
  yesterday: string;
}

export function formatRecentLogTime(
  iso: string,
  timezone: string,
  locale: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
}

export function recentLogDayKeyFromIso(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return civilDateFormat(date, timezone);
}

export function formatRecentLogDayHeading(
  iso: string,
  timezone: string,
  locale: string,
  labels: RecentLogsDayLabels,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const key = recentLogDayKeyFromIso(iso, timezone);
  const todayKey = civilDateToday(timezone, now);
  const yesterdayKey = addCivilDays(todayKey, -1);

  if (key === todayKey) return labels.today;
  if (key === yesterdayKey) return labels.yesterday;

  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    }).format(date);
  }
}

export function addCivilDays(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return civilDate;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return civilDate;

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

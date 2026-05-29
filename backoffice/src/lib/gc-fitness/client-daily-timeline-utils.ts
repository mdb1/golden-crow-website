import { civilDateFormat } from "./civil-date";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildClientDailyTimelineDates(
  timezone: string,
  anchor = new Date(),
): string[] {
  // Center the 29-day window on the client-tz civil "today" rather than the
  // UTC date, so the timeline matches the client's local calendar. We resolve
  // today in the client tz, then anchor an instant at midnight UTC of that
  // civil day and step the window with pure civil-date arithmetic (the
  // addDays/civilDateFormat("UTC") projection is tz-independent on a fixed
  // civil-day base — DST-safe).
  const today = civilDateFormat(anchor, timezone);
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: 29 }, (_, index) =>
    civilDateFormat(addDays(base, index - 14), "UTC"),
  );
}

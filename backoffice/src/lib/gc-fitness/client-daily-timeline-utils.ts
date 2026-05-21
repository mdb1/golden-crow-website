import { civilDateFormat } from "./civil-date";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildClientDailyTimelineDates(anchor = new Date()): string[] {
  const base = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()),
  );
  return Array.from({ length: 29 }, (_, index) =>
    civilDateFormat(addDays(base, index - 14), "UTC"),
  );
}

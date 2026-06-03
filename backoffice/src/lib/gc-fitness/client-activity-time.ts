import { civilDateFormat } from "./civil-date";

function formatInZone(
  iso: string | null,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

export function formatClientActivityDateTime(
  iso: string | null,
  timezone: string,
): string {
  return formatInZone(iso, timezone, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClientActivityTime(
  iso: string | null,
  timezone: string,
): string {
  return formatInZone(iso, timezone, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClientActivityDate(
  iso: string | null,
  timezone: string,
): string {
  return formatInZone(iso, timezone, {
    month: "short",
    day: "numeric",
  });
}

export function formatClientActivityDayHeader(
  iso: string | null,
  timezone: string,
): string {
  return formatInZone(iso, timezone, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
  });
}

export function clientActivityGroupKey(
  iso: string | null,
  timezone: string,
): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const day = civilDateFormat(date, timezone);
  const hour = formatInZone(iso, timezone, {
    hour: "2-digit",
    hour12: false,
  });
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

export const CLIENT_BOOKING_TIMEZONE = "America/Argentina/Buenos_Aires";
export const CLIENT_BOOKING_TIMEZONE_LABEL = "Buenos Aires (GMT−3)";
export const CLIENT_BOOKING_DURATION_MINUTES = 30;
export const SUPPORT_BOOKING_CONTEXT = "pocket-genes-support";

export const SUPPORT_BOOKING_REASONS = {
  account_access: { en: "Account access", es: "Acceso a la cuenta" },
  publishing: { en: "Publishing and content", es: "Publicaciones y contenido" },
  app_configuration: { en: "App setup and configuration", es: "Configuración de la app" },
  services_and_transactions: { en: "Services and transactions", es: "Servicios y transacciones" },
  billing: { en: "Billing", es: "Facturación" },
  technical_issue: { en: "Technical issue", es: "Problema técnico" },
  other: { en: "Other", es: "Otro" },
} as const;

export type SupportBookingReason = keyof typeof SUPPORT_BOOKING_REASONS;

export function isSupportBookingReason(value: unknown): value is SupportBookingReason {
  return typeof value === "string" && Object.hasOwn(SUPPORT_BOOKING_REASONS, value);
}

export function bookingLanguage(locale: string): "en" | "es" {
  return locale.toLowerCase().startsWith("es") ? "es" : "en";
}

function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const SLOT_TIMES = Array.from({ length: 17 }, (_, index) =>
  formatTime(9 * 60 + index * CLIENT_BOOKING_DURATION_MINUTES),
);
const FILTERABLE_SLOTS = SLOT_TIMES.filter((time) => time >= "11:00");
const BOOKING_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLIENT_BOOKING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function hashStringToSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let randomValue = value;
    randomValue = Math.imul(randomValue ^ (randomValue >>> 15), randomValue | 1);
    randomValue ^= randomValue + Math.imul(randomValue ^ (randomValue >>> 7), randomValue | 61);
    return ((randomValue ^ (randomValue >>> 14)) >>> 0) / 4294967296;
  };
}

export function clientBookingSlotTimes(date: string, context: string, path?: string) {
  const usePocketGenesSchedule = context.toLowerCase().startsWith("pocket-genes") ||
    /(^|\/)pocket-genes(\/|$)/i.test(path ?? "");
  if (!usePocketGenesSchedule) return SLOT_TIMES;

  const shuffled = [...FILTERABLE_SLOTS];
  const random = createSeededRandom(hashStringToSeed(`pocket-genes-booking:${date}`));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  const hidden = new Set(shuffled.slice(0, Math.round(shuffled.length * 0.5)));
  return SLOT_TIMES.filter((time) => !hidden.has(time));
}

function todayInBookingTimezone(now: Date) {
  const parts = BOOKING_DATE_FORMATTER.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isClientBookingDateAvailable(date: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return false;
  }

  const weekday = parsed.getUTCDay();
  return weekday >= 1 && weekday <= 5 && date > todayInBookingTimezone(now);
}

export function clientBookingSlotEvent(date: string, startTime: string) {
  const startsAt = new Date(`${date}T${startTime}:00-03:00`);
  const endsAt = new Date(startsAt.getTime() + CLIENT_BOOKING_DURATION_MINUTES * 60_000);
  const [hours = 0, minutes = 0] = startTime.split(":").map(Number);

  return {
    date,
    startTime,
    endTime: formatTime(hours * 60 + minutes + CLIENT_BOOKING_DURATION_MINUTES),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: CLIENT_BOOKING_TIMEZONE,
    timezoneLabel: CLIENT_BOOKING_TIMEZONE_LABEL,
    durationMinutes: CLIENT_BOOKING_DURATION_MINUTES,
  };
}

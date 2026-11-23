export const CLIENT_BOOKING_TIMEZONE = "America/Argentina/Buenos_Aires";
export const CLIENT_BOOKING_TIMEZONE_LABEL = "Buenos Aires (GMT−3)";
export const CLIENT_BOOKING_DURATION_MINUTES = 30;
export const SUPPORT_BOOKING_CONTEXT = "pocket-genes-support";

export type PartnerMeetingSlot = { date: string; startTime: string };

export const SUPPORT_BOOKING_REASONS = {
  account_access: { en: "Account access", es: "Acceso a la cuenta" },
  publishing: { en: "Publishing and content", es: "Publicaciones y contenido" },
  app_configuration: { en: "App setup and configuration", es: "Configuración de la app" },
  services_and_transactions: { en: "Services and transactions", es: "Servicios y transacciones" },
  billing: { en: "Billing", es: "Facturación" },
  technical_issue: { en: "Technical issue", es: "Problema técnico" },
  other: { en: "Other", es: "Otro" },
  portal_walkthrough: { en: "Publisher portal walkthrough", es: "Recorrido del portal de publicadores" },
  follow_up: { en: "Follow-up meeting", es: "Reunión de seguimiento" },
  support_consultation: { en: "Support consultation", es: "Consulta de soporte" },
  first_note: { en: "Publish your first note", es: "Publicar tu primera nota" },
  first_service: { en: "Publish your first service", es: "Publicar tu primer servicio" },
  app_store_publication: { en: "Publish your app in the stores", es: "Publicar tu app en los stores" },
  professional_directory: { en: "Add your professional directory", es: "Incorporar a los profesionales de tu organización" },
  push_notifications: { en: "Send notifications from your own app", es: "Enviar notificaciones desde tu propia app" },
  personalized_lessons: { en: "Send personalized lessons", es: "Enviar lecciones personalizadas" },
  mobile_surveys: { en: "Send a mobile survey", es: "Enviar una encuesta móvil" },
  interactive_lessons: { en: "Design an interactive lesson", es: "Diseñar una lección interactiva" },
  interactive_patient_guides: { en: "Create an interactive patient guide", es: "Crear una guía interactiva para pacientes" },
  interactive_reports: { en: "Design an interactive report", es: "Diseñar un informe interactivo" },
  frequent_question_note: { en: "Publish a note on a frequent question", es: "Publicar una nota sobre una consulta frecuente" },
  service_listing_review: { en: "Review your service listing", es: "Revisar la ficha de tu servicio" },
  survey_results: { en: "Review survey results", es: "Revisar los resultados de tu encuesta" },
  release_notification: { en: "Announce a release with a notification", es: "Anunciar un lanzamiento con una notificación" },
  interactive_report_review: { en: "Review an interactive report", es: "Revisar un informe interactivo" },
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

export function todayInBookingTimezone(now: Date) {
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

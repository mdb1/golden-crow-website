export const SUPPORT_BOOKING_REASON_LABELS = {
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

export type SupportBookingReason = keyof typeof SUPPORT_BOOKING_REASON_LABELS;
export const SUPPORT_BOOKING_REASONS = Object.keys(SUPPORT_BOOKING_REASON_LABELS) as SupportBookingReason[];

export function isSupportBookingReason(value: unknown): value is SupportBookingReason {
  return typeof value === "string" && Object.hasOwn(SUPPORT_BOOKING_REASON_LABELS, value);
}

type BookingEmailStatus = "delivered" | "failed" | "unknown";

export interface ClientBookingRecord {
  id: string;
  kind?: "consultation" | "publisher_support" | "public_support";
  reason?: SupportBookingReason;
  googleCalendar?: {
    eventId: string;
    htmlLink: string;
    meetLink?: string;
  };
  emailNotification?: {
    host?: BookingEmailStatus;
    attendee?: BookingEmailStatus;
  };
  schemaVersion: number;
  status: string;
  ack: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  archived: boolean;
  archivedAt?: string;
  archivedBy?: string;
  source: {
    context: string;
    locale: string;
    pageUrl?: string;
    path?: string;
    referrer?: string;
    origin?: string | null;
  };
  event: {
    title: string;
    durationMinutes: number;
    timezone: string;
    timezoneLabel: string;
    date: string;
    startTime: string;
    endTime: string;
    startsAt: string;
    endsAt: string;
    startsAtTimestamp?: string;
    endsAtTimestamp?: string;
  };
  form: {
    fullName: string;
    email: string;
    whatsapp: string;
    companyName: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientBookingsResponse {
  bookings: ClientBookingRecord[];
  nextCursor?: string;
}

export function formatBookingClockTime(time: string) {
  const [hourToken = "", minuteToken = ""] = time.split(":");
  const hour = Number(hourToken);
  const minute = Number(minuteToken);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export const SUPPORT_BOOKING_REASONS = [
  "account_access",
  "publishing",
  "app_configuration",
  "services_and_transactions",
  "billing",
  "technical_issue",
  "other",
] as const;

export type SupportBookingReason = (typeof SUPPORT_BOOKING_REASONS)[number];
type BookingEmailStatus = "delivered" | "failed" | "unknown";

export const SUPPORT_BOOKING_REASON_LABELS: Record<
  SupportBookingReason,
  { en: string; es: string }
> = {
  account_access: { en: "Account access", es: "Acceso a la cuenta" },
  publishing: { en: "Publishing and content", es: "Publicaciones y contenido" },
  app_configuration: { en: "App setup and configuration", es: "Configuración de la app" },
  services_and_transactions: { en: "Services and transactions", es: "Servicios y transacciones" },
  billing: { en: "Billing", es: "Facturación" },
  technical_issue: { en: "Technical issue", es: "Problema técnico" },
  other: { en: "Other", es: "Otro" },
};

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

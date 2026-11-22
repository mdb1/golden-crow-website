import type { ClientBookingRecord } from "@/lib/client-bookings";
import type { AppLanguage } from "@/lib/language";

export const PUBLISHER_SUPPORT_BOOKING_API = "/admin/publisher-support-bookings";
export const SUPPORT_BOOKING_TIMEZONE = "America/Argentina/Buenos_Aires";

export type PublisherSupportBooking = Pick<ClientBookingRecord, "id" | "reason"> & {
  event: Pick<ClientBookingRecord["event"], "date" | "startTime" | "endTime">;
  googleCalendar?: { meetLink?: string };
};

export interface PublisherSupportBookingsPage {
  bookings: PublisherSupportBooking[];
  nextCursor?: string;
}

export interface PublisherSupportBookingAvailability {
  month: string;
  timezone: string;
  slotsByDate: Record<string, string[]>;
}

export function formatSupportBookingDate(date: string, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

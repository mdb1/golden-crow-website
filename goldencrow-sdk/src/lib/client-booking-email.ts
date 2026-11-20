import type { ClientBookingInput } from "../repositories/client-bookings.repository.js";
import { bookingLanguage, CLIENT_BOOKING_TIMEZONE, SUPPORT_BOOKING_REASONS } from "./client-booking-schedule.js";
import type { GmailMessageInput } from "./gmail-mailer.js";

export const CLIENT_BOOKING_HOST_EMAIL = "federico@goldencrowvs.com";

type BookingEmailAudience = "host" | "attendee";

export function buildClientBookingEmails(
  bookingId: string,
  booking: ClientBookingInput,
): { audience: BookingEmailAudience; message: GmailMessageInput }[] {
  const language = bookingLanguage(booking.source.locale);
  const date = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeZone: CLIENT_BOOKING_TIMEZONE,
  }).format(new Date(booking.event.startsAt));
  const dateInEnglish = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: CLIENT_BOOKING_TIMEZONE,
  }).format(new Date(booking.event.startsAt));
  const time = `${booking.event.startTime}–${booking.event.endTime} (Buenos Aires, GMT−3)`;
  const reason = booking.reason && SUPPORT_BOOKING_REASONS[booking.reason];
  const bookingsUrl = "https://golden-crow-backoffice.vercel.app/god-mode/bookings";
  const details = [
    `Nombre: ${booking.form.fullName}`,
    `Correo: ${booking.form.email}`,
    booking.form.whatsapp && `WhatsApp: ${booking.form.whatsapp}`,
    booking.form.companyName && `Organización: ${booking.form.companyName}`,
    reason && `Motivo: ${reason.es}`,
  ].filter(Boolean);

  const messages: { audience: BookingEmailAudience; message: GmailMessageInput }[] = [
    {
      audience: "host",
      message: {
        to: CLIENT_BOOKING_HOST_EMAIL,
        subject: `Nueva reserva · ${booking.event.title} · ${date}`,
        text: [
          "Se reservó una reunión.",
          "",
          `${date} · ${time}`,
          ...details,
          `Reserva: ${bookingId}`,
          "",
          `Ver reservas: ${bookingsUrl}`,
        ].join("\n"),
      },
    },
  ];

  if (booking.form.email === CLIENT_BOOKING_HOST_EMAIL) return messages;

  messages.push({
    audience: "attendee",
    message: {
      to: booking.form.email,
      subject: language === "es" ? "Tu reserva está confirmada" : "Your booking is confirmed",
      text: (language === "es"
        ? [
            `Hola, ${booking.form.fullName}:`,
            "",
            "Reservamos el horario que elegiste.",
            "",
            booking.event.title,
            `${date} · ${time}`,
            reason && `Motivo: ${reason.es}`,
            `Reserva: ${bookingId}`,
            "",
            `Para consultas sobre tu reserva, escribinos a ${CLIENT_BOOKING_HOST_EMAIL}.`,
          ]
        : [
            `Hi ${booking.form.fullName},`,
            "",
            "We've reserved the time you selected.",
            "",
            booking.event.title,
            `${dateInEnglish} · ${time}`,
            reason && `Reason: ${reason.en}`,
            `Booking: ${bookingId}`,
            "",
            `For questions about your booking, email ${CLIENT_BOOKING_HOST_EMAIL}.`,
          ]).filter((line) => line !== undefined).join("\n"),
    },
  });

  return messages;
}

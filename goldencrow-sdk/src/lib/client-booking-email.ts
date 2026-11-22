import type { ClientBookingInput } from "../repositories/client-bookings.repository.js";
import {
  escapeEmailHtml,
  renderBrandedEmail,
  renderBrandedEmailButton,
} from "./branded-email-layout.js";
import {
  bookingLanguage,
  CLIENT_BOOKING_TIMEZONE,
  SUPPORT_BOOKING_REASONS,
} from "./client-booking-schedule.js";
import type { GmailMessageInput } from "./gmail-mailer.js";

export const CLIENT_BOOKING_HOST_EMAIL = "federico@goldencrowvs.com";

type BookingEmailAudience = "host" | "attendee";
type BookingEmailDetails = readonly (readonly [label: string, value: string | undefined])[];

type BookingEmailContent = {
  brandName: string;
  title: string;
  greeting?: string;
  intro: string;
  eventTitle: string;
  details: BookingEmailDetails;
  action: { href: string; label: string };
};

function renderBookingEmail({ brandName, title, greeting, intro, eventTitle, details, action }: BookingEmailContent) {
  const rows = details.flatMap(([label, value]) => value ? [`
    <tr>
      <td width="34%" valign="top" style="border-top:1px solid #e8e3f7;padding:12px 8px 12px 20px;font-size:14px;line-height:20px;color:#625773;">${escapeEmailHtml(label)}</td>
      <td valign="top" style="border-top:1px solid #e8e3f7;padding:12px 20px 12px 8px;font-size:15px;line-height:22px;color:#171126;overflow-wrap:anywhere;">${escapeEmailHtml(value)}</td>
    </tr>`] : []).join("");

  return renderBrandedEmail({
    brandName,
    title,
    preheader: intro,
    bodyHtml: `
      ${greeting ? `<p style="margin:0 0 12px;font-size:20px;line-height:30px;color:#111827;">${escapeEmailHtml(greeting)}</p>` : ""}
      <p style="margin:0 0 24px;font-size:18px;line-height:28px;color:#4b5563;">${escapeEmailHtml(intro)}</p>
      <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;border:1px solid #e8e3f7;border-radius:14px;background:#f8f6ff;border-collapse:separate;border-spacing:0;">
        <tr>
          <td colspan="2" style="padding:18px 20px;font-size:22px;line-height:29px;font-weight:800;color:#171126;overflow-wrap:anywhere;">${escapeEmailHtml(eventTitle)}</td>
        </tr>
        ${rows}
      </table>
      ${renderBrandedEmailButton(action.href, action.label)}
    `,
  });
}

export function buildClientBookingEmails(
  bookingId: string,
  booking: ClientBookingInput,
): { audience: BookingEmailAudience; message: GmailMessageInput }[] {
  const language = bookingLanguage(booking.source.locale);
  const isSpanish = language === "es";
  const isPocketGenes = booking.kind === "publisher_support" ||
    booking.kind === "public_support" || booking.source.context.toLowerCase().startsWith("pocket-genes");
  const brandName = isPocketGenes ? "Pocket Genes" : "Golden Crow Venture Studio";
  const startsAt = new Date(booking.event.startsAt);
  const date = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeZone: CLIENT_BOOKING_TIMEZONE,
  }).format(startsAt);
  const attendeeDate = isSpanish ? date : new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: CLIENT_BOOKING_TIMEZONE,
  }).format(startsAt);
  const time = `${booking.event.startTime}–${booking.event.endTime} (Buenos Aires, GMT−3)`;
  const duration = `${booking.event.durationMinutes} min`;
  const reason = booking.reason && SUPPORT_BOOKING_REASONS[booking.reason];
  const bookingsUrl = "https://golden-crow-backoffice.vercel.app/god-mode/bookings";
  const hostContactDetails: BookingEmailDetails = [
    ["Nombre", booking.form.fullName],
    ["Correo", booking.form.email],
    ["WhatsApp", booking.form.whatsapp],
    ["Organización", booking.form.companyName],
    ["Motivo", reason?.es],
  ];
  const hostIntro = "Se reservó una reunión.";

  const messages: { audience: BookingEmailAudience; message: GmailMessageInput }[] = [
    {
      audience: "host",
      message: {
        to: CLIENT_BOOKING_HOST_EMAIL,
        subject: `Nueva reserva · ${booking.event.title} · ${date}`,
        text: [
          hostIntro,
          "",
          `${date} · ${time}`,
          ...hostContactDetails.flatMap(([label, value]) => value ? [`${label}: ${value}`] : []),
          `Reserva: ${bookingId}`,
          "",
          `Ver reservas: ${bookingsUrl}`,
        ].join("\n"),
        html: renderBookingEmail({
          brandName,
          title: "Nueva reserva",
          intro: hostIntro,
          eventTitle: booking.event.title,
          details: [
            ["Fecha", date],
            ["Horario", time],
            ["Duración", duration],
            ...hostContactDetails,
            ["Reserva", bookingId],
          ],
          action: { label: "Ver reservas", href: bookingsUrl },
        }),
      },
    },
  ];

  if (booking.form.email === CLIENT_BOOKING_HOST_EMAIL) return messages;

  const subject = isSpanish ? "Tu reserva está confirmada" : "Your booking is confirmed";
  const greeting = isSpanish ? `Hola, ${booking.form.fullName}:` : `Hi ${booking.form.fullName},`;
  const intro = isSpanish ? "Reservamos el horario que elegiste." : "We've reserved the time you selected.";
  const reasonLabel = isSpanish ? "Motivo" : "Reason";
  const bookingLabel = isSpanish ? "Reserva" : "Booking";
  const contactText = isSpanish
    ? `Para consultas sobre tu reserva, escribinos a ${CLIENT_BOOKING_HOST_EMAIL}.`
    : `For questions about your booking, email ${CLIENT_BOOKING_HOST_EMAIL}.`;

  messages.push({
    audience: "attendee",
    message: {
      to: booking.form.email,
      subject,
      text: [
        greeting,
        "",
        intro,
        "",
        booking.event.title,
        `${attendeeDate} · ${time}`,
        ...(reason ? [`${reasonLabel}: ${reason[language]}`] : []),
        `${bookingLabel}: ${bookingId}`,
        "",
        contactText,
      ].join("\n"),
      html: renderBookingEmail({
        brandName,
        title: subject,
        greeting,
        intro,
        eventTitle: booking.event.title,
        details: [
          [isSpanish ? "Fecha" : "Date", attendeeDate],
          [isSpanish ? "Horario" : "Time", time],
          [isSpanish ? "Duración" : "Duration", duration],
          [reasonLabel, reason?.[language]],
          [bookingLabel, bookingId],
        ],
        action: {
          label: isSpanish ? "Contactar al equipo" : "Contact the team",
          href: `mailto:${CLIENT_BOOKING_HOST_EMAIL}`,
        },
      }),
    },
  });

  return messages;
}

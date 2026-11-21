import { clientBookingSlotEvent } from "./client-booking-schedule.js";
import type {
  PartnerEmailCopy,
  PartnerEmailLanguage,
  PartnerEmailTemplateVariant,
} from "./partner-email-copy.js";

const invitations = {
  3: {
    es: {
      subject: "¿Agendamos una consulta con el equipo de Pocket Genes?",
      heading: "¿En qué te podemos ayudar?",
      lead: "Te invitamos a una reunión de soporte para conversar sobre las dudas que tengas al usar Pocket Genes.",
    },
    en: {
      subject: "Would you like to meet with Pocket Genes support?",
      heading: "How can we help?",
      lead: "We’d like to invite you to a support meeting to talk through any questions you have about using Pocket Genes.",
    },
  },
  1: {
    es: {
      subject: "Recorré el portal con el equipo de Pocket Genes",
      heading: "Conozcamos juntos tu portal",
      lead: "Podemos recorrer tu cuenta con vos y mostrarte cómo preparar y publicar tu próximo contenido.",
    },
    en: {
      subject: "Explore the publisher portal with the Pocket Genes team",
      heading: "Let’s walk through your portal",
      lead: "We can walk you through your account and show you how to prepare and publish your next piece of content.",
    },
  },
  2: {
    es: {
      subject: "¿Cómo te está yendo con Pocket Genes?",
      heading: "Hablemos de tus próximos pasos",
      lead: "Nos gustaría saber cómo te está yendo con Pocket Genes y ayudarte a resolver lo que tengas pendiente.",
    },
    en: {
      subject: "How is Pocket Genes working for you?",
      heading: "Let’s talk about your next steps",
      lead: "We’d love to hear how things are going with Pocket Genes and help you work through anything that’s still open.",
    },
  },
} satisfies Record<
  PartnerEmailTemplateVariant,
  Record<PartnerEmailLanguage, Pick<PartnerEmailCopy, "subject" | "heading" | "lead">>
>;

export function partnerMeetingInvitationCopy(
  language: PartnerEmailLanguage,
  variant: PartnerEmailTemplateVariant,
  meetingSlot: { date: string; startTime: string },
): PartnerEmailCopy {
  const isSpanish = language === "es";
  const event = clientBookingSlotEvent(meetingSlot.date, meetingSlot.startTime);
  const date = new Intl.DateTimeFormat(isSpanish ? "es-AR" : "en-US", {
    dateStyle: "full",
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
  const proposedTime = isSpanish
    ? `Te proponemos el ${date} a las ${event.startTime}, hora de ${event.timezoneLabel}. La reunión dura ${event.durationMinutes} minutos.`
    : `We suggest ${date} at ${event.startTime}, ${event.timezoneLabel} time. The meeting lasts ${event.durationMinutes} minutes.`;
  const query = new URLSearchParams({ date: meetingSlot.date, startTime: meetingSlot.startTime });
  return {
    ...invitations[variant][language],
    preheader: proposedTime,
    paragraphs: [
      proposedTime,
      isSpanish
        ? "Entrá al portal para confirmar la reunión. Si preferís otro horario, podés elegir uno de los disponibles."
        : "Open your portal to confirm the meeting. If another time works better, you can choose an available slot.",
    ],
    ctaLabel: isSpanish ? "Agendar mi reunión" : "Book my meeting",
    closing: isSpanish ? "¡Nos vemos!" : "We look forward to talking with you.",
    callback: `/publisher-portal/support-bookings/new?${query}`,
  };
}

import type { PartnerSection } from "../contracts/connected-partners.js";
import { clientBookingSlotEvent, type SupportBookingReason } from "./client-booking-schedule.js";
import type {
  PartnerEmailCopy,
  PartnerEmailLanguage,
  PartnerMeetingTemplateVariant,
} from "./partner-email-copy.js";

type MeetingInvitation = Pick<PartnerEmailCopy, "subject" | "heading" | "lead"> & {
  paragraphs?: string[];
};

const invitationBookingReasons = {
  1: "portal_walkthrough",
  2: "follow_up",
  3: "support_consultation",
  4: "first_note",
  5: "first_service",
  6: "app_store_publication",
  7: "professional_directory",
  8: "push_notifications",
  9: "personalized_lessons",
  10: "mobile_surveys",
  11: "interactive_lessons",
  12: "interactive_patient_guides",
  13: "interactive_reports",
  14: "frequent_question_note",
  15: "service_listing_review",
  16: "survey_results",
  17: "release_notification",
  18: "interactive_report_review",
} satisfies Record<PartnerMeetingTemplateVariant, SupportBookingReason>;

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
  4: {
    es: {
      subject: "Publicá tu primera nota en Pocket Genes",
      heading: "Tu primera nota en el portal",
      lead: "Te mostramos cómo preparar y publicar tu primera nota.",
    },
    en: {
      subject: "Publish your first note on Pocket Genes",
      heading: "Your first note in the portal",
      lead: "We’ll show you how to draft and publish your first note.",
    },
  },
  5: {
    es: {
      subject: "Publicá tu primer servicio en Pocket Genes",
      heading: "Configuración de tu primer servicio",
      lead: "Te ayudamos a crear la ficha y configurar cómo recibir solicitudes.",
    },
    en: {
      subject: "Publish your first service on Pocket Genes",
      heading: "Set up your first service",
      lead: "We’ll help you create the listing and set up how to receive requests.",
    },
  },
  6: {
    es: {
      subject: "Asesoramiento para publicar tu app",
      heading: "Publicación en App Store y Google Play",
      lead: "Revisamos las cuentas de desarrollador y los materiales necesarios para publicar tu app.",
    },
    en: {
      subject: "Guidance for publishing your own app",
      heading: "Publishing on the App Store and Google Play",
      lead: "We’ll review the developer accounts and materials you need to publish your app.",
    },
  },
  7: {
    es: {
      subject: "Sumá a tus profesionales sin cargo",
      heading: "Nómina de tu organización en Pocket Genes",
      lead: "Podemos incorporar sin cargo a todos tus profesionales y vincularlos a tu organización.",
    },
    en: {
      subject: "Add your professional roster at no charge",
      heading: "Your organization’s roster in Pocket Genes",
      lead: "We can import your full professional roster and link each person to your organization at no charge.",
    },
  },
  8: {
    es: {
      subject: "Notificaciones para los usuarios de tu app",
      heading: "Notificaciones desde tu propia app",
      lead: "Desde tu app podés enviar notificaciones directamente a tus usuarios.",
      paragraphs: [
        "También podemos incorporar sin cargo a todos los profesionales de tu organización en Pocket Genes.",
        "Desde una notificación, tus usuarios pueden responder una encuesta en el celular, abrir lecciones personalizadas, consultar guías interactivas para pacientes o explorar un informe dinámico.",
      ],
    },
    en: {
      subject: "Push notifications for your app users",
      heading: "Push notifications from your own app",
      lead: "You can send push notifications directly to users from your own app.",
      paragraphs: [
        "We can also add your organization’s full professional roster to Pocket Genes for free.",
        "From a notification, users can answer a mobile survey, open personalized lessons, view interactive patient guides or explore a dynamic report.",
      ],
    },
  },
  9: {
    es: {
      subject: "Lecciones personalizadas para tus estudiantes",
      heading: "Envío de lecciones personalizadas",
      lead: "Te mostramos cómo tus docentes pueden adaptar una lección y enviarla directamente a sus estudiantes.",
    },
    en: {
      subject: "Personalized lessons for your students",
      heading: "Deliver personalized lessons",
      lead: "We’ll show how your teachers can adapt a lesson and send it directly to their students.",
    },
  },
  10: {
    es: {
      subject: "Encuestas para tus usuarios",
      heading: "Encuestas desde el celular",
      lead: "Te mostramos cómo crear y enviar una encuesta que tus usuarios puedan responder desde el celular.",
    },
    en: {
      subject: "Surveys for your users",
      heading: "Mobile surveys",
      lead: "We’ll show you how to create and send a survey users can answer on their phones.",
    },
  },
  11: {
    es: {
      subject: "Lecciones interactivas para tus clases",
      heading: "Diseño de una lección interactiva",
      lead: "Te mostramos cómo convertir un ejercicio de clase en una lección interactiva.",
    },
    en: {
      subject: "Interactive lessons for your classes",
      heading: "Design an interactive lesson",
      lead: "We’ll show you how to turn a classroom exercise into an interactive lesson.",
    },
  },
  12: {
    es: {
      subject: "Material interactivo para tus pacientes",
      heading: "Guías interactivas para pacientes",
      lead: "Te mostramos cómo adaptar una guía para que tus pacientes consulten las indicaciones desde el celular.",
    },
    en: {
      subject: "Interactive resources for your patients",
      heading: "Interactive patient guides",
      lead: "We’ll show you how to adapt a guide so patients can review instructions on their phones.",
    },
  },
  13: {
    es: {
      subject: "Informes dinámicos para tus clientes",
      heading: "Diseño de un informe interactivo",
      lead: "Te mostramos cómo crear informes con secciones que tus clientes puedan explorar.",
    },
    en: {
      subject: "Dynamic reports for your clients",
      heading: "Design an interactive report",
      lead: "We’ll show you how to create reports with sections your clients can explore.",
    },
  },
  14: {
    es: {
      subject: "Una nota para responder consultas frecuentes",
      heading: "Publicación de respuestas frecuentes",
      lead: "Convertimos una consulta frecuente de tu equipo en una nota que puedas compartir.",
    },
    en: {
      subject: "A note that answers a common question",
      heading: "Publish answers to common questions",
      lead: "We’ll turn a recurring question your team receives into a note you can share.",
    },
  },
  15: {
    es: {
      subject: "Revisá la ficha de tu servicio",
      heading: "Revisión de la ficha y la solicitud",
      lead: "Revisamos qué incluye el servicio, sus requisitos y cómo solicitarlo.",
    },
    en: {
      subject: "Review your service listing",
      heading: "Review the listing and request process",
      lead: "We’ll review what the service includes, its requirements and how to request it.",
    },
  },
  16: {
    es: {
      subject: "Revisá los resultados de tu encuesta",
      heading: "Seguimiento de los resultados",
      lead: "Revisamos las respuestas y definimos si conviene compartir los resultados o hacer una consulta de seguimiento.",
    },
    en: {
      subject: "Review your survey results",
      heading: "Follow up on survey results",
      lead: "We’ll review the responses and decide whether to share the results or ask a follow-up question.",
    },
  },
  17: {
    es: {
      subject: "Anunciá una nueva función en tu app",
      heading: "Notificación para un lanzamiento",
      lead: "Te ayudamos a redactar la notificación y elegir qué pantalla abre.",
    },
    en: {
      subject: "Announce a new feature in your app",
      heading: "Push notification for a release",
      lead: "We’ll help draft the notification and choose which screen it opens.",
    },
  },
  18: {
    es: {
      subject: "Revisá un informe interactivo",
      heading: "Claridad de los resultados para tus clientes",
      lead: "Revisamos un informe de ejemplo y mejoramos la explicación de un resultado que genere dudas.",
    },
    en: {
      subject: "Review an interactive report",
      heading: "Clearer results for your clients",
      lead: "We’ll review a sample report and clarify a result that often raises questions.",
    },
  },
} satisfies Record<
  PartnerMeetingTemplateVariant,
  Record<PartnerEmailLanguage, MeetingInvitation>
>;

function invitationForPartner(
  variant: PartnerMeetingTemplateVariant,
  language: PartnerEmailLanguage,
  category?: PartnerSection,
): MeetingInvitation {
  if (variant === 6 && (category === "freeApp" || category === "individualFreeApp")) {
    return language === "es"
      ? {
          subject: "Prepará tu demo para los stores",
          heading: "Preparación para publicar tu app",
          lead: "Revisamos tu demo, las cuentas de desarrollador y los materiales necesarios para enviarla a los stores.",
        }
      : {
          subject: "Prepare your demo for the app stores",
          heading: "Prepare to publish your app",
          lead: "We’ll review your demo, developer accounts and the materials you need for submission.",
        };
  }
  if (variant === 6 && (category === "contract" || category === "individualContract")) {
    return language === "es"
      ? {
          subject: "Prepará la próxima publicación de tu app",
          heading: "Envío al App Store o a Google Play",
          lead: "Revisamos las capturas, la descripción y los requisitos para un lanzamiento o una actualización.",
        }
      : {
          subject: "Prepare your app’s next store submission",
          heading: "Submission to the App Store or Google Play",
          lead: "We’ll review the screenshots, description and requirements for a first release or an update.",
        };
  }
  if (variant === 7 && category?.startsWith("individual")) {
    return language === "es"
      ? {
          subject: "La nómina de tu institución, sin cargo",
          heading: "Nómina institucional en Pocket Genes",
          lead: "Podemos incorporar sin cargo a todos los profesionales y vincularlos a tu institución.",
        }
      : {
          subject: "Add your institution’s roster at no charge",
          heading: "Your institution’s roster in Pocket Genes",
          lead: "We can import the full professional roster and link each person to your institution at no charge.",
        };
  }
  return invitations[variant][language];
}

export function partnerMeetingInvitationCopy(
  language: PartnerEmailLanguage,
  variant: PartnerMeetingTemplateVariant,
  meetingSlot: { date: string; startTime: string },
  category?: PartnerSection,
): PartnerEmailCopy {
  const isSpanish = language === "es";
  const isFeatureInvitation = variant >= 4;
  const event = clientBookingSlotEvent(meetingSlot.date, meetingSlot.startTime);
  const startsAt = new Date(event.startsAt);
  const date = new Intl.DateTimeFormat(isSpanish ? "es-AR" : "en-US", {
    dateStyle: "full",
    timeZone: event.timezone,
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: event.timezone,
  }).format(startsAt);
  const proposedTime = isSpanish
    ? `Te proponemos el ${date} a las ${time}, hora de Buenos Aires. La reunión dura ${event.durationMinutes} minutos.`
    : `We suggest ${date} at ${time}, Buenos Aires time. The meeting lasts ${event.durationMinutes} minutes.`;
  const query = new URLSearchParams({
    date: meetingSlot.date,
    startTime: meetingSlot.startTime,
    category: invitationBookingReasons[variant],
  });
  const invitation = invitationForPartner(variant, language, category);
  return {
    ...invitation,
    preheader: proposedTime,
    paragraphs: [
      ...(invitation.paragraphs ?? []),
      proposedTime,
      isSpanish
        ? "Entrá al portal para confirmar la reunión. Si preferís otro horario, podés elegir uno de los disponibles."
        : "Open your portal to confirm the meeting. If another time works better, you can choose an available slot.",
    ],
    ctaLabel: isFeatureInvitation
      ? isSpanish ? "Agendar reunión" : "Book a meeting"
      : isSpanish ? "Agendar mi reunión" : "Book my meeting",
    closing: isFeatureInvitation
      ? isSpanish ? "Saludos," : "Best regards,"
      : isSpanish ? "¡Nos vemos!" : "We look forward to talking with you.",
    callback: `/publisher-portal/support-bookings/new?${query}`,
  };
}

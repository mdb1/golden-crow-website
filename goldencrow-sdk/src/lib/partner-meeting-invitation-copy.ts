import type { PartnerSection } from "../contracts/connected-partners.js";
import { clientBookingSlotEvent } from "./client-booking-schedule.js";
import type {
  PartnerEmailCopy,
  PartnerEmailLanguage,
  PartnerMeetingTemplateVariant,
} from "./partner-email-copy.js";

type MeetingInvitation = Pick<PartnerEmailCopy, "subject" | "heading" | "lead"> & {
  paragraphs?: string[];
};

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
      subject: "¿Publicamos tu primera nota en Pocket Genes?",
      heading: "Traé una idea para tu primera nota",
      lead: "Puede ser una novedad del laboratorio o una pregunta que escuchás seguido. En la reunión armamos el borrador con vos y te mostramos cómo publicarlo desde el portal.",
    },
    en: {
      subject: "Shall we publish your first note on Pocket Genes?",
      heading: "Bring an idea for your first note",
      lead: "A lab update or a question you hear all the time is a good place to start. We’ll draft the note together and show you how to publish it from your portal.",
    },
  },
  5: {
    es: {
      subject: "Te acompañamos a lanzar tu primer servicio",
      heading: "Preparemos un servicio para recibir solicitudes",
      lead: "Elegí un servicio que ya ofrezcas. Podemos armar juntos su ficha, definir qué datos necesitás pedir y recorrer la solicitud tal como la vería la persona interesada.",
    },
    en: {
      subject: "Let’s launch your first service on Pocket Genes",
      heading: "Get a service ready to receive requests",
      lead: "Pick a service you already offer. We can build its listing together, decide what information you need and walk through a request from the applicant’s point of view.",
    },
  },
  6: {
    es: {
      subject: "¿Querés llevar tu propia app al App Store o a Google Play?",
      heading: "Revisemos qué te falta para publicar tu app",
      lead: "En una llamada podemos elegir por qué tienda empezar, revisar qué cuenta de desarrollador necesitás y preparar una lista de las capturas y los textos que vas a presentar.",
    },
    en: {
      subject: "Planning to launch your own app on the App Store or Google Play?",
      heading: "Find out what you need for your store listing",
      lead: "We can help you choose a store to start with, check which developer account you’ll need and put together a list of screenshots and descriptions for submission.",
    },
  },
  7: {
    es: {
      subject: "Podemos sumar sin cargo a todos los profesionales de tu organización",
      heading: "Incorporemos a tu equipo a Pocket Genes",
      lead: "Te ofrecemos cargar sin cargo tu nómina completa de profesionales y vincularlos a tu organización. En la reunión revisamos cómo tenés armado el listado y qué datos hacen falta para incorporarlo.",
    },
    en: {
      subject: "We can add your organization’s entire professional roster for free",
      heading: "Bring your team into Pocket Genes",
      lead: "We can import your full list of professionals and link them to your organization at no charge. Let’s look at how your directory is organized and agree on the details we’ll need for the import.",
    },
  },
  8: {
    es: {
      subject: "Llevá las novedades de tu organización al teléfono de tus usuarios",
      heading: "Preparemos una notificación para tu propia app",
      lead: "Con tu propia app podés enviar notificaciones directamente a tus usuarios. Podemos tomar una novedad real, como la apertura de inscripciones, y preparar el mensaje que querés que les llegue al teléfono.",
      paragraphs: [
        "Si trabajás con una organización, te ofrecemos cargar sin cargo su nómina completa de profesionales y vincularlos a la organización en Pocket Genes.",
        "Elegí qué te gustaría abrir desde esa notificación. Tus docentes pueden enviar lecciones interactivas personalizadas directamente a sus estudiantes. Un equipo de salud puede compartir una guía interactiva con sus pacientes, y una empresa puede entregar un informe dinámico que el cliente explore desde su teléfono. También podemos probar una encuesta que se responda en el celular.",
      ],
    },
    en: {
      subject: "Send your organization’s updates straight to users’ phones",
      heading: "Draft a push notification for your own app",
      lead: "With your own app, you can send push notifications directly to your users. Bring a real update, such as registration opening, and we’ll draft the message you’d like them to see on their phones.",
      paragraphs: [
        "If you work with an organization, we can add its entire professional roster to Pocket Genes for free and link each person to the organization.",
        "What would you like people to open from that notification? Teachers can send personalized interactive lessons directly to their students. A clinic can share an interactive guide with patients, and a company can deliver a dynamic report that clients explore on their phones. We can also try a survey that people answer on their phones.",
      ],
    },
  },
  9: {
    es: {
      subject: "¿Cómo le harías llegar una lección a tus estudiantes?",
      heading: "Armemos una lección con tu equipo docente",
      lead: "Tus docentes pueden enviar lecciones personalizadas directamente a sus estudiantes. En la reunión elegimos un tema del programa y vemos cómo adaptarlo para un grupo que recién empieza o para otro que ya lo trabajó.",
    },
    en: {
      subject: "How would you deliver a lesson to your students?",
      heading: "Build a lesson with your teaching team",
      lead: "Your teachers can send personalized lessons directly to their students. We can pick a topic from your syllabus and show how to adapt it for a new group or for students who have already covered the basics.",
    },
  },
  10: {
    es: {
      subject: "Probemos una encuesta que se responda desde el celular",
      heading: "¿Qué te gustaría preguntarle a tu comunidad?",
      lead: "Podemos armar una encuesta corta para enviar a los celulares de tus usuarios. Traé una pregunta que te ayude a decidir algo, como el tema del próximo taller, y probemos juntos cómo se responde.",
    },
    en: {
      subject: "Try a survey people can answer on their phones",
      heading: "What would you like to ask your community?",
      lead: "We can build a short survey to send to your users’ phones. Bring a question that will help you make a decision, such as which workshop to run next, and try answering it together.",
    },
  },
  11: {
    es: {
      subject: "Convirtamos un ejercicio de clase en una lección interactiva",
      heading: "Dales a tus estudiantes un caso para resolver",
      lead: "Tomemos un ejercicio que ya uses en clase. Podemos armar una lección interactiva con una situación, una pregunta y una explicación, y recorrerla desde el lugar de un estudiante.",
    },
    en: {
      subject: "Turn a classroom exercise into an interactive lesson",
      heading: "Give your students a case to work through",
      lead: "Choose an exercise you already use in class. We can turn it into an interactive lesson with a scenario, a question and an explanation, then try it from a student’s perspective.",
    },
  },
  12: {
    es: {
      subject: "¿Qué material les gustaría a tus pacientes consultar desde el celular?",
      heading: "Transformemos una guía en material interactivo",
      lead: "Traé una guía de tu equipo, por ejemplo la bienvenida a una primera consulta. Podemos organizarla en un formato interactivo para que tus pacientes recorran las indicaciones y vuelvan al paso que necesiten.",
    },
    en: {
      subject: "What would your patients like to consult on their phones?",
      heading: "Turn a patient guide into an interactive resource",
      lead: "Bring a guide your team already shares, such as a welcome sheet for a first appointment. We can put it into an interactive format patients can explore and revisit whenever they need a particular step.",
    },
  },
  13: {
    es: {
      subject: "¿Cómo se vería un informe interactivo de tu empresa?",
      heading: "Probemos con un informe de ejemplo",
      lead: "Podemos mostrarte cómo ofrecer informes dinámicos desde tu empresa. Con un ejemplo ficticio, armamos un resumen y secciones que tu cliente pueda explorar para encontrar el detalle que le interesa.",
    },
    en: {
      subject: "What would an interactive report from your company look like?",
      heading: "Try it with a sample report",
      lead: "We can show your team how to offer dynamic, interactive reports. Using a fictional example, we’ll sketch a summary and sections a client can explore to find the details they care about.",
    },
  },
  14: {
    es: {
      subject: "¿Hay una pregunta que tu equipo responde todas las semanas?",
      heading: "De una consulta frecuente a una nota para compartir",
      lead: "Elegí una de esas consultas y traé la respuesta que suele dar tu equipo. En la reunión la convertimos en una nota breve para que la tengas a mano la próxima vez que te escriban.",
    },
    en: {
      subject: "Is there a question your team answers every week?",
      heading: "Turn a recurring question into a note worth sharing",
      lead: "Pick one of those questions and bring the answer your team usually gives. We’ll turn it into a short note you can share the next time someone gets in touch.",
    },
  },
  15: {
    es: {
      subject: "¿Tu ficha de servicio responde lo que te preguntan antes de solicitarlo?",
      heading: "Revisemos tu servicio desde el otro lado del mostrador",
      lead: "Tomemos una ficha publicada o en borrador y hagamos el recorrido de quien quiere pedir el servicio. Podemos aclarar qué incluye, qué necesita tener a mano y cómo enviar la solicitud.",
    },
    en: {
      subject: "Does your service listing answer the questions people ask before requesting it?",
      heading: "Look at your service through a customer’s eyes",
      lead: "Let’s open a published listing or a draft and follow the steps someone would take to request it. We can clarify what’s included, what they need to have ready and how to submit their request.",
    },
  },
  16: {
    es: {
      subject: "¿Qué decisión podés tomar con las respuestas de tu encuesta?",
      heading: "Leamos los resultados y elijamos el próximo paso",
      lead: "Si hiciste una encuesta, traé los resultados generales. Podemos revisar qué tema se repite y preparar una devolución para tus usuarios o una segunda pregunta que aclare lo que quedó abierto.",
    },
    en: {
      subject: "What decision could your survey responses help you make?",
      heading: "Read the results and choose a next step",
      lead: "If you’ve run a survey, bring the overall results. We can look for a recurring theme and draft an update for your users or a follow-up question about something that’s still unclear.",
    },
  },
  17: {
    es: {
      subject: "Después de lanzar una novedad, ¿qué conviene avisar desde tu app?",
      heading: "Dale a tu próxima notificación un motivo concreto",
      lead: "Si estás por lanzar una función en tu propia app, podemos escribir juntos la notificación que la presente. Elegimos qué necesita saber quien la recibe y qué le conviene abrir primero para probarla.",
    },
    en: {
      subject: "After your next release, what should your app users hear about?",
      heading: "Give your next notification a clear purpose",
      lead: "If you’re releasing a feature in your own app, we can write the push notification that introduces it. We’ll choose what users need to know and what they should open first to try it.",
    },
  },
  18: {
    es: {
      subject: "Después de entregar un informe, ¿qué parte genera más preguntas?",
      heading: "Hagamos más claro un informe interactivo",
      lead: "Con un informe de ejemplo podemos recorrer la lectura como lo haría tu cliente. Elegimos un resultado que suele generar dudas y probamos cómo presentar su explicación dentro del informe interactivo.",
    },
    en: {
      subject: "Which part of a report gets the most questions after delivery?",
      heading: "Make one part of an interactive report easier to understand",
      lead: "Bring a sample report and we’ll read it the way your client would. We can pick a result that often prompts questions and try placing its explanation where the reader needs it in the interactive report.",
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
          subject: "¿Qué le falta a tu demo para llegar a las tiendas?",
          heading: "De la demo a la publicación",
          lead: "Podemos abrir tu demo durante la reunión, elegir las pantallas que mejor muestran tu propuesta y revisar qué cuenta y materiales vas a necesitar para presentar la app en la tienda.",
        }
      : {
          subject: "What does your demo need before it can go to the stores?",
          heading: "Take your demo one step closer to release",
          lead: "We can open your demo together, choose the screens that best show what it offers and check which account and materials you’ll need to submit the app to a store.",
        };
  }
  if (variant === 6 && (category === "contract" || category === "individualContract")) {
    return language === "es"
      ? {
          subject: "¿Revisamos la próxima publicación de tu app?",
          heading: "Preparemos la entrega al App Store o a Google Play",
          lead: "Podemos trabajar sobre la tienda que tengas en mente, ya sea para un primer lanzamiento o una actualización. Revisamos juntos las capturas, la descripción y los cambios que quieras destacar.",
        }
      : {
          subject: "Shall we review your app’s next store submission?",
          heading: "Prepare your App Store or Google Play listing",
          lead: "Pick the store you have in mind for a first release or an update. We can review the screenshots, description and changes you’d like people to notice.",
        };
  }
  if (variant === 7 && category?.startsWith("individual")) {
    return language === "es"
      ? {
          subject: "¿Trabajás con un equipo de profesionales?",
          heading: "La carga de la nómina de tu organización es gratuita",
          lead: "Si trabajás con una institución, podemos incorporar sin cargo toda su nómina de profesionales a Pocket Genes y vincularla a la organización. En la reunión te mostramos qué datos hacen falta para que se los puedas acercar a tu equipo.",
        }
      : {
          subject: "Do you work with a team of professionals?",
          heading: "Your organization can bring its full roster in for free",
          lead: "If you work with an institution, we can import its entire professional roster into Pocket Genes and link the professionals to the organization at no charge. We’ll walk through the details you can take back to your team.",
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
  const event = clientBookingSlotEvent(meetingSlot.date, meetingSlot.startTime);
  const date = new Intl.DateTimeFormat(isSpanish ? "es-AR" : "en-US", {
    dateStyle: "full",
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
  const proposedTime = isSpanish
    ? `Te proponemos el ${date} a las ${event.startTime}, hora de ${event.timezoneLabel}. La reunión dura ${event.durationMinutes} minutos.`
    : `We suggest ${date} at ${event.startTime}, ${event.timezoneLabel} time. The meeting lasts ${event.durationMinutes} minutes.`;
  const query = new URLSearchParams({ date: meetingSlot.date, startTime: meetingSlot.startTime });
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
    ctaLabel: isSpanish ? "Agendar mi reunión" : "Book my meeting",
    closing: isSpanish ? "¡Nos vemos!" : "We look forward to talking with you.",
    callback: `/publisher-portal/support-bookings/new?${query}`,
  };
}

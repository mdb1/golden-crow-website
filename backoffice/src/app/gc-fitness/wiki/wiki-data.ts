// wiki-data.ts
//
// Content model for the public Coach Wiki (/gc-fitness/wiki). The wiki is a
// no-auth, anyone-can-read page, so the copy lives here as a self-contained
// ES/EN dictionary (same pattern the workout generator uses) instead of going
// through the next-intl message catalog — it keeps the long-form help text and
// the Loom IDs in one reviewable place.
//
// To add a recorded walkthrough: drop the Loom share id into `loomId`. A video
// without a `loomId` renders as a "coming soon" placeholder, so the section
// structure can ship before every clip is recorded.

export type Localized = { es: string; en: string };

export type WikiVideo = {
  /** Stable anchor id used for the table-of-contents deep links (#id). */
  id: string;
  title: Localized;
  description: Localized;
  /** Loom share id (the slug after /share/). Omit until the clip is recorded. */
  loomId?: string;
};

export type WikiGroup = {
  id: string;
  title: Localized;
  videos: WikiVideo[];
};

export type WikiLink = {
  /** Stable anchor id used for the table-of-contents deep links (#id). */
  id: string;
  label: Localized;
  description: Localized;
  /** Absolute URL (http(s) or mailto:). Always opened in a new tab. */
  href: string;
};

export type WikiFaq = {
  /** Stable anchor id used for the table-of-contents deep links (#id). */
  id: string;
  question: Localized;
  answer: Localized;
};

export function pick(locale: string, value: Localized): string {
  return locale.startsWith("en") ? value.en : value.es;
}

/** Build the Loom embed URL from a share id. `autoplay` starts it on mount. */
export function loomEmbedUrl(
  loomId: string,
  opts?: { autoplay?: boolean },
): string {
  const params = new URLSearchParams({
    hide_owner: "true",
    hideEmbedTopBar: "true",
  });
  if (opts?.autoplay) params.set("autoplay", "1");
  return `https://www.loom.com/embed/${loomId}?${params.toString()}`;
}

/** Build the public Loom share URL (the "open in Loom" fallback link). */
export function loomShareUrl(loomId: string): string {
  return `https://www.loom.com/share/${loomId}`;
}

/**
 * Loom-hosted poster frame for a video, used on the click-to-play facade. Loaded
 * as a CSS background so a miss degrades gracefully to the dark poster + play
 * button (no broken-image icon).
 */
export function loomThumbnailUrl(loomId: string): string {
  return `https://cdn.loom.com/sessions/thumbnails/${loomId}-with-play.jpg`;
}

export const WIKI_GROUPS: WikiGroup[] = [
  {
    id: "primeros-pasos",
    title: { es: "Primeros pasos", en: "Getting started" },
    videos: [
      {
        id: "dashboard",
        title: { es: "Dashboard", en: "Dashboard" },
        description: {
          es: "Tu pantalla de inicio: un vistazo rápido al estado de tus clientes y los pendientes del día.",
          en: "Your home screen: a quick look at how your clients are doing and what needs attention today.",
        },
        loomId: "b1600e3dfe244d85aecf0a6260894cb4",
      },
      {
        id: "actividad-reciente",
        title: { es: "Actividad reciente", en: "Recent activity" },
        description: {
          es: "Seguí en tiempo real lo que registran tus clientes: entrenamientos completados y hábitos marcados.",
          en: "Follow what your clients log in real time: completed workouts and checked-off habits.",
        },
        loomId: "8fb8fa2ec3db4a5f8b922849d1d82e18",
      },
    ],
  },
  {
    id: "clientes",
    title: { es: "Clientes", en: "Clients" },
    videos: [
      {
        id: "agregar-cliente",
        title: { es: "Agregar cliente", en: "Add a client" },
        description: {
          es: "Cómo dar de alta un nuevo cliente y dejarlo listo para empezar a entrenar.",
          en: "How to create a new client and get them ready to start training.",
        },
        loomId: "2f7301abc91043f5a05ef94e464cee42",
      },
      {
        id: "clientes-detalle",
        title: {
          es: "Clientes, detalle y comparador de fotos",
          en: "Clients, detail view & photo comparator",
        },
        description: {
          es: "El listado de clientes, la ficha detallada de cada uno y el comparador de fotos de progreso.",
          en: "The client roster, each client's detail view, and the progress-photo comparator.",
        },
        loomId: "6b2b66c131f24a5ea0cb1c13cab34cfb",
      },
    ],
  },
  {
    id: "planificacion",
    title: { es: "Planificación", en: "Planning" },
    videos: [
      {
        id: "agenda-asignaciones",
        title: { es: "Agenda y asignaciones", en: "Schedule & assignments" },
        description: {
          es: "Programá entrenamientos en la agenda y asignáselos a tus clientes, incluyendo recurrencias.",
          en: "Schedule workouts on the calendar and assign them to your clients, including recurring ones.",
        },
        loomId: "bd5a237e34e44bcfba23cdee1a224d71",
      },
      {
        id: "checklist",
        title: { es: "Checklist", en: "Checklist" },
        description: {
          es: "Tu lista de tareas pendientes para no perder de vista lo que tenés que hacer con cada cliente.",
          en: "Your to-do list so nothing slips through the cracks for any client.",
        },
        loomId: "0b4ae86864184137aa87b8dc774280e2",
      },
      {
        id: "notificaciones",
        title: { es: "Notificaciones", en: "Notifications" },
        description: {
          es: "Renovaciones de entrenamientos y hábitos, cumpleaños y activaciones recientes de clientes.",
          en: "Workout and habit renewals, birthdays, and recent client activations.",
        },
        loomId: "86cf6fb192044164871a8326a7a45aad",
      },
    ],
  },
  {
    id: "biblioteca",
    title: { es: "Biblioteca", en: "Library" },
    videos: [
      {
        id: "biblioteca",
        title: { es: "Biblioteca", en: "Library" },
        description: {
          es: "El centro de contenido: entrenamientos, ejercicios y hábitos en un solo lugar.",
          en: "Your content hub: workouts, exercises, and habits all in one place.",
        },
        loomId: "ff4f7b3d6a724effb971f5f2b1742aa0",
      },
      {
        id: "crear-entrenamiento",
        title: {
          es: "Crear entrenamiento",
          en: "Create a workout",
        },
        description: {
          es: "Armá un entrenamiento a mano desde cero, ejercicio por ejercicio.",
          en: "Build a workout by hand from scratch, exercise by exercise.",
        },
        loomId: "fd2087071c4e4c3eb1c8c3487c8db39b",
      },
      {
        id: "generador-entrenamientos",
        title: {
          es: "Generador de entrenamientos",
          en: "Workout generator",
        },
        description: {
          es: "Generá entrenamientos automáticamente eligiendo equipo, músculos, duración y estilo.",
          en: "Auto-generate workouts by choosing equipment, muscles, duration, and style.",
        },
        loomId: "10a9e60ad71a449a84b3499fb8f52b7e",
      },
      {
        id: "crear-ejercicio",
        title: {
          es: "Ejercicios y creación de ejercicios",
          en: "Exercises & creating exercises",
        },
        description: {
          es: "Explorá la biblioteca de ejercicios y agregá los tuyos propios con su GIF.",
          en: "Browse the exercise library and add your own, GIF included.",
        },
        // Pendiente de grabación.
      },
      {
        id: "crear-habito",
        title: {
          es: "Hábitos y creación de hábitos",
          en: "Habits & creating habits",
        },
        description: {
          es: "Definí hábitos para asignar a tus clientes y armá los tuyos propios.",
          en: "Define habits to assign to your clients and build your own.",
        },
        // Pendiente de grabación.
      },
    ],
  },
  {
    id: "app-clientes",
    title: { es: "App de clientes", en: "Client app" },
    videos: [
      {
        id: "demo-app",
        title: { es: "Demo de la app de clientes", en: "Client app demo" },
        description: {
          es: "Un recorrido por la experiencia que viven tus clientes en la app móvil.",
          en: "A walkthrough of the experience your clients get in the mobile app.",
        },
        // Pendiente de grabación.
      },
    ],
  },
];

// Useful links — each opens in a new tab. Order matters (rendered as-is).
export const WIKI_LINKS: WikiLink[] = [
  {
    id: "link-dashboard",
    label: { es: "Dashboard de GC Fitness", en: "GC Fitness dashboard" },
    description: {
      es: "El portal de coaches donde gestionás a tus clientes, entrenamientos y hábitos.",
      en: "The coach portal where you manage your clients, workouts, and habits.",
    },
    href: "https://golden-crow-backoffice.vercel.app/gc-fitness",
  },
  {
    id: "link-support",
    label: { es: "Soporte: support@goldencrowvs.com", en: "Support: support@goldencrowvs.com" },
    description: {
      es: "Escribinos por cualquier duda, consulta o pedido de una nueva función.",
      en: "Email us with any question, issue, or feature request.",
    },
    href: "mailto:support@goldencrowvs.com",
  },
  {
    id: "link-app-store",
    label: {
      es: "App de clientes para iPhone (App Store)",
      en: "Client app for iPhone (App Store)",
    },
    description: {
      es: "Para iPhone: descargá GC Fitness desde la App Store.",
      en: "For iPhone: download GC Fitness from the App Store.",
    },
    href: "https://apps.apple.com/us/app/gc-fitness/id6771836254",
  },
  {
    id: "link-play-store",
    label: {
      es: "App de clientes para Android (Google Play)",
      en: "Client app for Android (Google Play)",
    },
    description: {
      es: "Para Android: descargá GC Fitness desde Google Play.",
      en: "For Android: download GC Fitness from Google Play.",
    },
    href: "https://play.google.com/store/apps/details?id=com.goldencrow.fitness",
  },
];

// Frequently asked questions. Answers may contain newlines (rendered with
// `whitespace-pre-line`).
export const WIKI_FAQ: WikiFaq[] = [
  {
    id: "faq-cliente-no-aparece",
    question: {
      es: "Mi cliente entró a la app pero no lo veo en el dashboard.",
      en: "My client signed into the app but I can't see them in my dashboard.",
    },
    answer: {
      es: "Si el cliente inició sesión con un email distinto al que vos pre-cargaste, queda asignado a un coach general en lugar de a tu cuenta. Esto también pasa con “Iniciar sesión con Apple” cuando usan la opción de ocultar el email (Apple genera un email “relay” distinto al real). Para moverlo a tu cuenta, contactá a un miembro de GC Fitness o escribí a support@goldencrowvs.com y transferimos a ese cliente a tu cuenta.",
      en: "If the client signed in with an email different from the one you pre-loaded, they get assigned to a general coach instead of your account. This also happens with “Sign in with Apple” when they choose to hide their email (Apple issues a “relay” address that differs from the real one). To move them to your account, contact a GC Fitness team member or email support@goldencrowvs.com and we'll transfer that client to your account.",
    },
  },
  {
    id: "faq-prellenado-pesos",
    question: {
      es: "¿Cómo funciona el pre-llenado de pesos para mis clientes?",
      en: "How does weight pre-fill work for my clients?",
    },
    answer: {
      es: "La primera vez que el cliente hace un ejercicio, la app le muestra los pesos que planificaste vos (los del entrenamiento). Una vez que registra ese entrenamiento, en las siguientes sesiones la app le muestra sus propios últimos pesos registrados, no los planificados.\n\nCuando cambiás los pesos de un entrenamiento —editándolo y eligiendo “actualizar ocurrencias”, o con un ajuste puntual por asignación— el cliente vuelve a ver tu nuevo plan UNA vez, con un aviso de que el coach actualizó la rutina. Después de que lo registra, vuelve a recordar sus propios pesos.\n\nEn resumen: gana siempre la intención más reciente. Si tocaste el plan después de su última carga, ve tu plan; si no, ve lo último que levantó.",
      en: "The first time a client does an exercise, the app shows the weights you planned (the workout's prescribed weights). Once they log that workout, in later sessions the app shows their own last logged weights instead of the planned ones.\n\nWhen you change a workout's weights — editing it and choosing “update occurrences”, or making a per-assignment adjustment — the client sees your new plan ONCE, with a notice that the coach updated the routine. After they log it, it goes back to remembering their own weights.\n\nIn short: the most recent intent wins. If you touched the plan after their last log, they see your plan; otherwise they see what they last lifted.",
    },
  },
  {
    id: "faq-semanas-entrenamientos",
    question: {
      es: "¿Cómo funciona el sistema de semanas de los entrenamientos?",
      en: "How does the weekly workout system work?",
    },
    answer: {
      es: "Los entrenamientos se organizan por semana (de lunes a domingo, en la zona horaria del cliente). Dentro de la semana en curso, el cliente puede mover sus entrenamientos a otro día manteniendo presionada (long tap) la tarjeta del entrenamiento y eligiendo el nuevo día.\n\nEse reordenamiento solo es posible dentro de la misma semana: no se pueden mover entrenamientos de una semana a otra. Cuando termina la semana, los entrenamientos que quedaron sin hacer aparecen como “perdidos” (missed) y ya no se pueden iniciar ni registrar. La idea es que cada semana arranque limpia y la adherencia refleje lo que realmente pasó.",
      en: "Workouts are organized by week (Monday to Sunday, in the client's timezone). Within the current week, the client can move their workouts to a different day by long-pressing (long tap) the workout card and picking the new day.\n\nThat reordering only works inside the same week — workouts can't be moved across weeks. When the week ends, any workouts left undone show up as “missed” and can no longer be started or logged. The point is that each week starts fresh and adherence reflects what actually happened.",
    },
  },
  {
    id: "faq-habitos-si-no",
    question: {
      es: "¿Cómo funcionan los hábitos?",
      en: "How do habits work?",
    },
    answer: {
      es: "Los hábitos son de tipo SÍ/NO: el cliente simplemente marca si lo cumplió o no en el día. Por ahora no admiten cantidades, valores numéricos ni objetivos parciales (eso puede llegar más adelante).\n\nVos definís qué hábitos asignar y en qué días aplican; el cliente los marca desde la app y vos ves la adherencia en el portal. El peso corporal NO es un hábito: se registra por separado en su propia sección de seguimiento.",
      en: "Habits are YES/NO: the client simply checks off whether they did it that day. For now they don't support quantities, numeric values, or partial goals (that may come later).\n\nYou define which habits to assign and which days they apply to; the client checks them off in the app and you see adherence in the portal. Body weight is NOT a habit — it's logged separately in its own tracking section.",
    },
  },
  {
    id: "faq-fotos-progreso",
    question: {
      es: "¿Cómo funcionan las fotos de progreso?",
      en: "How do progress photos work?",
    },
    answer: {
      es: "Las fotos de progreso las saca y sube únicamente el cliente desde la app; el coach no puede subir ni borrar fotos. Se organizan por check-in (una fecha) y por ángulo: frente, perfil y espalda.\n\nAl principio el cliente puede subir libremente para armar su línea base. Una vez establecida, la app habilita un nuevo check-in cada 7 días, para tener una cadencia pareja de comparación.\n\nVos ves todas las fotos de tus clientes desde el portal, con un comparador “antes/después” y filtros por ángulo. Las fotos son privadas: solo las pueden ver el cliente y su coach asignado (regla de seguridad reforzada en Firestore y Storage). No están vinculadas al peso corporal: son un seguimiento visual aparte.",
      en: "Progress photos are taken and uploaded only by the client from the app; the coach can't upload or delete photos. They're organized by check-in (a date) and by angle: front, side, and back.\n\nAt first the client can upload freely to build their baseline. Once that's set, the app opens a new check-in every 7 days, to keep a steady comparison cadence.\n\nYou see all of your clients' photos in the portal, with a “before/after” comparator and angle filters. Photos are private: only the client and their assigned coach can see them (enforced in both Firestore and Storage rules). They're not tied to body weight — they're a separate visual record.",
    },
  },
  {
    id: "faq-notificaciones-push",
    question: {
      es: "¿Cómo funcionan las notificaciones de hábitos y entrenamientos?",
      en: "How do habit and workout notifications work?",
    },
    answer: {
      es: "Los recordatorios de hábitos y de entrenamientos se envían desde nuestro servidor como notificaciones push. El recordatorio de entrenamiento se dispara unos 30 minutos antes del horario que tenga programado la asignación (necesita tener una hora asignada); el de hábitos llega en su horario diario.\n\nEl cliente puede activar o desactivar cada tipo de recordatorio desde Ajustes → Notificaciones en la app.\n\nMuy importante: si el cliente nunca le dio permiso de notificaciones a la app (el permiso del sistema operativo), no le va a llegar ninguna notificación, aunque tenga los recordatorios activados. Si un cliente dice que no recibe nada, lo primero a revisar es que haya aceptado el permiso de notificaciones del teléfono.",
      en: "Habit and workout reminders are sent from our server as push notifications. The workout reminder fires about 30 minutes before the assignment's scheduled time (it needs a time set); the habit reminder arrives at its daily time.\n\nThe client can turn each reminder type on or off from Settings → Notifications in the app.\n\nVery important: if the client never granted the app notification permission (the OS-level permission), they won't get any notifications at all, even with reminders enabled. If a client says they're not getting anything, the first thing to check is that they accepted the phone's notification permission.",
    },
  },
  {
    id: "faq-iphone-apple-watch",
    question: {
      es: "¿Cómo funciona la integración con el Apple Watch?",
      en: "How does the Apple Watch integration work?",
    },
    answer: {
      es: "El cliente puede hacer todo el entrenamiento desde el Apple Watch: ver el entrenamiento del día, registrar series y repeticiones, y usar el temporizador de descanso, sin tocar el teléfono durante la sesión.\n\nAhora bien, el reloj no escribe directamente en la base de datos: le pasa los datos al iPhone. Por eso, al terminar, el cliente tiene que abrir la app de iPhone para que el entrenamiento termine de sincronizarse y quede guardado (es el iPhone el que confirma y guarda el entrenamiento final). Si solo usa el reloj y nunca abre el iPhone, el entrenamiento puede quedar pendiente de sincronizar y no te va a aparecer todavía en el portal.",
      en: "The client can do the whole workout from the Apple Watch: see the day's workout, log sets and reps, and use the rest timer, without touching the phone during the session.\n\nThat said, the watch doesn't write to the database directly — it hands the data off to the iPhone. So when they finish, the client needs to open the iPhone app for the workout to finish syncing and be saved (the iPhone is what confirms and stores the final workout). If they only use the watch and never open the iPhone, the workout may stay pending sync and won't show up in your portal yet.",
    },
  },
  {
    id: "faq-editar-recurrencia",
    question: {
      es: "Edité un entrenamiento recurrente: ¿afecta a las sesiones que el cliente ya hizo?",
      en: "I edited a recurring workout — does it affect sessions the client already did?",
    },
    answer: {
      es: "No. Cuando editás un entrenamiento recurrente y elegís “actualizar ocurrencias”, los cambios se aplican a las sesiones futuras (de la ocurrencia que estás viendo en adelante), no a las que el cliente ya completó. Las sesiones ya registradas quedan tal cual se hicieron, como historial.\n\nSi solo querés cambiar una sesión puntual, podés editar esa asignación sin tocar el resto de la serie.",
      en: "No. When you edit a recurring workout and choose “update occurrences”, the changes apply to future sessions (from the occurrence you're viewing onward), not to ones the client already completed. Already-logged sessions stay exactly as they were done, as history.\n\nIf you only want to change a single session, you can edit that one assignment without touching the rest of the series.",
    },
  },
  {
    id: "faq-reps-sin-peso",
    question: {
      es: "¿Puedo asignar ejercicios sin peso (peso corporal) y cómo se calcula el volumen?",
      en: "Can I assign exercises with no weight (bodyweight), and how is volume calculated?",
    },
    answer: {
      es: "Sí. Podés configurar ejercicios para que se registren solo con repeticiones (o tiempo), sin pedir peso. Es ideal para movimientos de peso corporal y movilidad.\n\nSobre el volumen: hoy se calcula como peso × repeticiones (o, en ejercicios por tiempo, en base a la duración). Los ejercicios sin peso aportan 0 al volumen total por ahora, así que no infles las expectativas de “volumen” en rutinas mayormente de peso corporal: la adherencia y las repeticiones siguen quedando registradas igual.",
      en: "Yes. You can set up exercises to be logged with reps only (or time), without asking for weight. It's ideal for bodyweight and mobility movements.\n\nAbout volume: today it's computed as weight × reps (or, for time-based exercises, from duration). Weightless exercises contribute 0 to total volume for now, so don't over-read the “volume” number on mostly-bodyweight routines — adherence and reps are still recorded all the same.",
    },
  },
  {
    id: "faq-biblioteca-estandar",
    question: {
      es: "¿Para qué sirven los ejercicios y entrenamientos “estándar” de la biblioteca?",
      en: "What are the “standard” library exercises and workouts for?",
    },
    answer: {
      es: "La biblioteca incluye contenido estándar compartido (ejercicios y plantillas de entrenamiento ya armados) para que no tengas que empezar de cero. Ese contenido es de solo lectura: no se puede editar directamente.\n\nSi querés partir de una plantilla estándar y adaptarla, usá “Duplicar”: eso crea una copia tuya, editable, que podés modificar y asignar sin afectar el original compartido.",
      en: "The library includes shared standard content (ready-made exercises and workout templates) so you don't have to start from scratch. That content is read-only — it can't be edited directly.\n\nIf you want to start from a standard template and adapt it, use “Duplicate”: that creates your own editable copy, which you can modify and assign without affecting the shared original.",
    },
  },
];

export const WIKI_COPY = {
  brand: { es: "GC Fitness", en: "GC Fitness" },
  eyebrow: { es: "Centro de ayuda", en: "Help center" },
  title: { es: "Wiki para coaches", en: "Coach Wiki" },
  subtitle: {
    es: "Videos cortos que explican cómo usar cada sección del portal de coaches.",
    en: "Short videos explaining how to use every section of the coach portal.",
  },
  tocTitle: { es: "Secciones", en: "Sections" },
  linksTitle: { es: "Links útiles", en: "Useful links" },
  linksSubtitle: {
    es: "Cada link abre en una pestaña nueva.",
    en: "Each link opens in a new tab.",
  },
  faqTitle: { es: "Preguntas frecuentes", en: "FAQ" },
  comingSoon: { es: "Próximamente", en: "Coming soon" },
  comingSoonHint: {
    es: "Estamos grabando este video. Vuelve pronto.",
    en: "We're still recording this one. Check back soon.",
  },
  copyLink: { es: "Copiar", en: "Copy" },
  copiedLink: { es: "¡Copiado!", en: "Copied!" },
  openLink: { es: "Abrir en una pestaña nueva", en: "Open in a new tab" },
  footer: {
    es: "¿Tenés dudas que no están acá? Escribinos por chat.",
    en: "Got a question that isn't covered here? Reach out on chat.",
  },
} satisfies Record<string, Localized>;

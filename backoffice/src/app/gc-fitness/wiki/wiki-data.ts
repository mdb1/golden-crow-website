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
        id: "generador-entrenamientos",
        title: {
          es: "Generador y creación de entrenamientos",
          en: "Workout generator & creation",
        },
        description: {
          es: "Generá entrenamientos automáticamente o creálos a mano desde cero.",
          en: "Auto-generate workouts or build them by hand from scratch.",
        },
        // Pendiente de grabación.
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
  openInLoom: { es: "Ver en Loom", en: "Open in Loom" },
  footer: {
    es: "¿Tenés dudas que no están acá? Escribinos por chat.",
    en: "Got a question that isn't covered here? Reach out on chat.",
  },
} satisfies Record<string, Localized>;

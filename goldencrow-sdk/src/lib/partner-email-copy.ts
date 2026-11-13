export type PartnerEmailLanguage = "es" | "en";
export type PartnerEmailTemplateVariant = 1 | 2 | 3;
export type PartnerEmailStage =
  | "noOrganization"
  | "withoutApp"
  | "freeApp"
  | "contract";
export type PartnerEmailCopy = {
  subject: string;
  preheader: string;
  heading: string;
  lead: string;
  paragraphs: string[];
  ctaLabel: string;
  closing: string;
  callback?: string;
};

const APP_NEW_PATH = "/publisher-portal/app/new";
const APP_TERMS_PATH = "/publisher-portal/app/accept-terms-and-conditions";
const APP_EDIT_PATH = "/publisher-portal/app/edit";

export const PARTNER_EMAIL_COPY: Record<
  PartnerEmailTemplateVariant,
  Record<PartnerEmailStage, Record<PartnerEmailLanguage, PartnerEmailCopy>>
> = {
  1: {
    noOrganization: {
      es: {
        subject: "¡Sumate a Pocket Genes!",
        preheader:
          "Compartí tu trabajo, conectá con la red y descubrí tu propia app.",
        heading: "¡Sumate a Pocket Genes!",
        lead: "¡Queremos a {companyName} en nuestra red!",
        paragraphs: [
          "Compartí tus proyectos, novedades y eventos.",
          "Conectá con profesionales, investigadores y organizaciones.",
          "Sumarte es gratis. También te preparamos una demo gratuita de tu propia app.",
          "Dejanos los datos de {companyName} y empecemos.",
        ],
        ctaLabel: "¡Quiero mi demo gratuita!",
        closing: "¡Te esperamos!",
      },
      en: {
        subject: "Join us on Pocket Genes!",
        preheader:
          "Share your work, connect with the community, and discover your own app.",
        heading: "Join us on Pocket Genes!",
        lead: "We’d love to have {companyName} in our community!",
        paragraphs: [
          "Share your projects, news, and events.",
          "Connect with professionals, researchers, and organizations.",
          "Joining is free. We’ll also create a free demo of your own app.",
          "Tell us about {companyName} and let’s get started.",
        ],
        ctaLabel: "Count me in!",
        closing: "See you there!",
      },
    },
    withoutApp: {
      es: {
        subject: "¡Hagamos la app de {publisherName}!",
        preheader:
          "Tu marca, tus contenidos, tu comunidad. Empezá con una demo gratis.",
        heading: "¡Estrená tu propia app!",
        lead: "¡Hagamos la app de {publisherName}!",
        paragraphs: [
          "Elegí las funciones, los colores y las plataformas.",
          "Nosotros armamos la demo. Vos la probás gratis con tu equipo.",
          "Tocá el siguiente botón para descubrir cómo se vería la app de {publisherName}.",
        ],
        ctaLabel: "¡Quiero mi demo gratuita!",
        closing: "Ya probaste la app de Pocket Genes ¡Ahora podés tener la tuya!",
        callback: APP_NEW_PATH,
      },
      en: {
        subject: "Let’s create {publisherName}’s app!",
        preheader:
          "Your brand, your content, your community. Start with a free demo.",
        heading: "Say hello to your own app!",
        lead: "Let’s make {publisherName}’s app happen!",
        paragraphs: [
          "Choose your features, colors, and platforms.",
          "We build the demo. You try it with your team, for free.",
          "Tap the button below to discover what {publisherName}’s app could look like.",
        ],
        ctaLabel: "Get my free demo",
        closing: "Let’s make it yours!",
        callback: APP_NEW_PATH,
      },
    },
    freeApp: {
      es: {
        subject: "¡La app de {publisherName} está lista para probar!",
        preheader:
          "Tu demo ya está lista. Probala con tu equipo y preparemos el lanzamiento.",
        heading: "¡Tenemos lista la app de {publisherName}!",
        lead: "Probá la demo con tu equipo. ¿La lanzamos?",
        paragraphs: [
          "Revisá y aceptá las condiciones en el portal para pedir la publicación.",
          "Después, consultá la información de pago y coordiná el lanzamiento con nosotros.",
          "Entrá con la cuenta de publicador de {publisherName}.",
        ],
        ctaLabel: "¡Vamos a publicarla!",
        closing: "¡Vamos con ese lanzamiento!",
        callback: APP_TERMS_PATH,
      },
      en: {
        subject: "{publisherName}’s app is ready to try!",
        preheader:
          "Your demo is ready. Try it with your team, then let’s plan your launch.",
        heading: "{publisherName}’s app is ready!",
        lead: "Try the demo with your team. Ready to launch?",
        paragraphs: [
          "Review and accept the terms in the portal to request publication.",
          "Then check the payment details and plan the launch with us.",
          "Sign in with {publisherName}’s publisher account.",
        ],
        ctaLabel: "Let’s launch my app!",
        closing: "Let’s get your app out there!",
        callback: APP_TERMS_PATH,
      },
    },
    contract: {
      es: {
        subject: "¡Dale tu toque a la app de {publisherName}!",
        preheader: "Ajustá tu app desde el portal. Estamos para ayudarte.",
        heading: "¡Tu app, a tu manera!",
        lead: "Todo para gestionar la app de {publisherName}, en un solo lugar.",
        paragraphs: [
          "Entrá al portal para ajustar la configuración. ¿Necesitás ayuda? Respondé a este correo.",
          "Entrá con la cuenta de publicador de {publisherName}.",
        ],
        ctaLabel: "Gestionar mi app",
        closing: "¡Seguimos con vos!",
        callback: APP_EDIT_PATH,
      },
      en: {
        subject: "Make {publisherName}’s app your own!",
        preheader: "Fine-tune your app in the portal. We’re here to help.",
        heading: "Your app, your way!",
        lead: "One place to manage {publisherName}’s app.",
        paragraphs: [
          "Open the portal to update your settings. Need a hand? Reply to this email.",
          "Sign in with {publisherName}’s publisher account.",
        ],
        ctaLabel: "Manage my app",
        closing: "We’re here for you!",
        callback: APP_EDIT_PATH,
      },
    },
  },
  2: {
    noOrganization: {
      es: {
        subject: "¡Sumate a Pocket Genes!",
        preheader: "Que más gente conozca el trabajo de {companyName}.",
        heading: "¡Sumate a Pocket Genes!",
        lead: "¡Hagamos que más gente conozca {companyName}!",
        paragraphs: [
          "Compartí tus novedades, difundí tus eventos y conectá con la comunidad.",
          "Sumarte es gratis. También te preparamos una demo gratuita para que puedas visualizar como sería tu propia app.",
        ],
        ctaLabel: "¡Quiero mi demo gratuita!",
        closing: "¡Te esperamos!",
      },
      en: {
        subject: "Join us on Pocket Genes!",
        preheader: "Let more people discover {companyName}.",
        heading: "Join us on Pocket Genes!",
        lead: "Let’s put {companyName} in front of more people!",
        paragraphs: [
          "Share your news, spread the word about your events, and meet the community.",
          "And yes—you can have your own app, too.",
        ],
        ctaLabel: "Count me in",
        closing: "See you there!",
      },
    },
    withoutApp: {
      es: {
        subject: "¡Hagamos la app de {publisherName}!",
        preheader: "Tu marca tiene mucho para contar. Dale su propia app.",
        heading: "¡Dale a {publisherName} su propia app!",
        lead: "Tus novedades, tus eventos y tu comunidad. Todo con tu marca.",
        paragraphs: ["¿La probamos?"],
        ctaLabel: "Quiero mi demo gratis",
        closing: "",
        callback: APP_NEW_PATH,
      },
      en: {
        subject: "Let’s create {publisherName}’s app!",
        preheader: "Your brand has a story to tell. Give it an app of its own.",
        heading: "Give {publisherName} its own app!",
        lead: "Your news, your events, your community. All under your brand.",
        paragraphs: ["Ready to try it?"],
        ctaLabel: "Get my free demo",
        closing: "",
        callback: APP_NEW_PATH,
      },
    },
    freeApp: {
      es: {
        subject: "¡Llevemos la app de {publisherName} al mundo!",
        preheader: "Tu marca, más cerca de tu comunidad.",
        heading: "¡Que tu app salga al mundo!",
        lead: "¿Llevamos la app de {publisherName} a tu comunidad?",
        paragraphs: [
          "Tus novedades, tus eventos y tus contenidos, en un lugar propio.",
        ],
        ctaLabel: "Quiero publicar mi app",
        closing: "¡Hagámoslo!",
        callback: APP_TERMS_PATH,
      },
      en: {
        subject: "Let’s launch {publisherName}’s app!",
        preheader: "Bring your brand closer to your community.",
        heading: "Let’s get your app out there!",
        lead: "Ready to share {publisherName}’s app with your community?",
        paragraphs: [
          "Give your news, events, and content a home of their own.",
        ],
        ctaLabel: "Let’s launch my app",
        closing: "Let’s make it happen!",
        callback: APP_TERMS_PATH,
      },
    },
    contract: {
      es: {
        subject: "¿Qué hay de nuevo en {publisherName}?",
        preheader: "Dale un nuevo toque a tu app.",
        heading: "¡Que tu app siga tu ritmo!",
        lead: "¿Novedades en {publisherName}? Que también se noten en tu app.",
        paragraphs: [],
        ctaLabel: "Actualizar mi app",
        closing: "¿Tenés una idea? ¡Contanos!",
        callback: APP_EDIT_PATH,
      },
      en: {
        subject: "What’s new at {publisherName}?",
        preheader: "Give your app a fresh touch.",
        heading: "Keep your app fresh!",
        lead: "Something new at {publisherName}? Give your app a refresh.",
        paragraphs: [],
        ctaLabel: "Update my app",
        closing: "Have an idea? Tell us!",
        callback: APP_EDIT_PATH,
      },
    },
  },
  // IDs 1 and 2 keep their existing copy; the new first option uses ID 3.
  3: {
    noOrganization: {
      es: {
        subject: "¡Sumate a Pocket Genes!",
        preheader:
          "Compartí tus proyectos y eventos con la comunidad. Sumarte es gratis.",
        heading: "¡Sumate a Pocket Genes!",
        lead: "¡Queremos que seas parte de nuestra comunidad!",
        paragraphs: [
          "Compartí tus proyectos, novedades y eventos. Conectá con profesionales, investigadores y organizaciones.",
          "Sumarte es gratis. Y también te preparamos una demo gratuita de tu propia app.",
        ],
        ctaLabel: "¡Quiero darme de alta en la plataforma!",
        closing: "¡Te esperamos!",
      },
      en: {
        subject: "Join us on Pocket Genes!",
        preheader:
          "Share your projects and events with the community. Joining is free.",
        heading: "Join us on Pocket Genes!",
        lead: "We’d love for you to be part of our community!",
        paragraphs: [
          "Share your projects, news, and events. Connect with professionals, researchers, and organizations.",
          "Joining is free. We'll also create a free demo of your own app.",
        ],
        ctaLabel: "Sign me up for the platform!",
        closing: "See you there!",
      },
    },
    withoutApp: {
      es: {
        subject: "¡Hagamos la app de {publisherName}!",
        preheader: "Te preparamos una demo gratis de tu propia app.",
        heading: "¡Hagamos tu app!",
        lead: "Te preparamos una demo gratis con el nombre y la imagen de {publisherName}.",
        paragraphs: [
          "Compartí tus novedades y eventos con tu comunidad desde tu propia app.",
        ],
        ctaLabel: "¡Quiero mi demo gratis!",
        closing: "",
        callback: APP_NEW_PATH,
      },
      en: {
        subject: "Let’s create {publisherName}’s app!",
        preheader: "We'll create a free demo of your own app.",
        heading: "Let's create your app!",
        lead: "We'll create a free app demo with {publisherName}'s name and branding.",
        paragraphs: [
          "Share news and events with your community through your own app.",
        ],
        ctaLabel: "Get my free app demo",
        closing: "",
        callback: APP_NEW_PATH,
      },
    },
    freeApp: {
      es: {
        subject: "¡Tenemos lista tu app de {publisherName}!",
        preheader: "Probá tu demo gratis. ¿La publicamos?",
        heading: "¡Tenemos lista tu app de {publisherName}!",
        lead: "Probá la demo gratis con tu equipo. ¿La publicamos?",
        paragraphs: [
          "Llevá tus novedades y eventos a tu comunidad desde la app de {publisherName}.",
        ],
        ctaLabel: "¡Quiero publicar mi app!",
        closing: "",
        callback: APP_TERMS_PATH,
      },
      en: {
        subject: "Your {publisherName} app is ready!",
        preheader: "Try your free demo. Ready to publish?",
        heading: "Your {publisherName} app is ready!",
        lead: "Try the free demo with your team. Ready to publish your app?",
        paragraphs: [
          "Bring news and events to your community through the {publisherName} app.",
        ],
        ctaLabel: "Publish my app",
        closing: "",
        callback: APP_TERMS_PATH,
      },
    },
    contract: {
      es: {
        subject: "Gestioná la app de {publisherName}",
        preheader: "Actualizá la configuración de tu app desde el portal.",
        heading: "Gestioná tu app",
        lead: "Entrá al portal para actualizar la configuración de la app de {publisherName}.",
        paragraphs: [
          "¿Necesitás ayuda? Respondé a este correo y lo vemos juntos.",
        ],
        ctaLabel: "Gestionar mi app",
        closing: "",
        callback: APP_EDIT_PATH,
      },
      en: {
        subject: "Manage your {publisherName} app",
        preheader: "Update your app's settings in the portal.",
        heading: "Manage your app",
        lead: "Open the portal to update your {publisherName} app's settings.",
        paragraphs: ["Need a hand? Reply to this email and we'll help."],
        ctaLabel: "Manage my app",
        closing: "",
        callback: APP_EDIT_PATH,
      },
    },
  },
};

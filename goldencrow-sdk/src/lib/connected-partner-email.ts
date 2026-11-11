import { createHash } from "node:crypto";
import type {
  Partner,
  PartnerSection,
} from "../contracts/connected-partners.js";
import { ENV } from "../config/env.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import { partnerSection } from "./partner-section.js";
import {
  PARTNER_BANNER_CONTENT_ID,
  type PartnerEmailBannerBrand,
  type PartnerEmailBannerInput,
} from "./partner-email-banner.js";

export type PartnerEmailLanguage = "es" | "en";
export type PartnerEmailPreview = {
  partnerId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  ctaLabel: string;
  ctaUrl: string;
  category: PartnerSection;
  language: PartnerEmailLanguage;
  previewHash: string;
  accessCodeExpiresAt?: string;
  accessCodeUnavailableReason?: string;
  bannerBrand?: PartnerEmailBannerBrand;
  banner?: PartnerEmailBannerInput;
};

const JOIN_URL = "https://goldencrowvs.com/pocket-genes/join-us/new/";
const APP_NEW_PATH = "/publisher-portal/app/new";
const APP_TERMS_PATH = "/publisher-portal/app/accept-terms-and-conditions";

type Copy = {
  subject: string;
  preheader: string;
  heading: string;
  lead: string;
  paragraphs: string[];
  ctaLabel: string;
  closing: string;
  callback?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publisherLoginUrl(
  callback: string,
  email: string,
  accessKey?: string,
) {
  const url = new URL(
    "/publisher-portal/login",
    `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("email", email);
  if (accessKey) url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("callbackUrl", callback);
  return url.toString();
}

function emailCopy(
  partner: Partner,
  category: PartnerSection,
  language: PartnerEmailLanguage,
  currentPublisherName?: string,
): Copy {
  const spanish = language === "es";
  const publisher =
    currentPublisherName ??
    partner.linkedApp?.publisherName ??
    partner.linkedOrganization?.name ??
    partner.linkedIndividualPublisher?.name ??
    partner.companyName;
  if (category === "noOrganization")
    return spanish
      ? {
          subject: `Descubrí qué puede hacer ${partner.companyName} en Pocket Genes`,
          preheader:
            "Explorá posibles alianzas, descuentos de la red y una demo gratuita de tu propia app.",
          heading: "Alianzas, beneficios y una app con tu marca",
          lead: `Con Pocket Genes, ${partner.companyName} puede explorar nuevas colaboraciones y conocer cómo sería una app con su propia identidad.`,
          paragraphs: [
            "El primer paso es solicitar la incorporación de tu organización a la red de Pocket Genes.",
            "Una vez aprobada la solicitud, podrás conocer los descuentos disponibles y explorar posibles alianzas con otras organizaciones y profesionales.",
            `También podrás solicitar una demo gratuita de una app con la identidad de ${partner.companyName}, para conocer la experiencia y evaluarla con tu equipo antes de decidir si querés avanzar.`,
            `Completá el formulario con los datos de ${partner.companyName}. Revisaremos la solicitud y, si es aprobada, te enviaremos las instrucciones para ingresar al portal.`,
          ],
          ctaLabel: "Solicitar incorporación",
          closing: `Nos encantará conocer más sobre ${partner.companyName}.`,
        }
      : {
          subject: `See what’s possible for ${partner.companyName} on Pocket Genes`,
          preheader:
            "Explore potential partnerships, network discounts, and a free demo of your own branded app.",
          heading: "Partnerships, benefits, and an app with your branding",
          lead: `Pocket Genes gives ${partner.companyName} a place to explore potential collaborations and discover what an app with your own branding could look like.`,
          paragraphs: [
            "Start by requesting to add your organization to the Pocket Genes network.",
            "Once approved, you can explore available network discounts and potential partnerships with other organizations and professionals.",
            `You can also request a free demo of an app branded for ${partner.companyName}, so your team can explore the experience before deciding whether to move forward.`,
            `Fill out the form with ${partner.companyName}’s details. We’ll review the request and, if approved, send you instructions to access the portal.`,
          ],
          ctaLabel: "Request to join",
          closing: `We’d love to learn more about ${partner.companyName}.`,
        };
  if (
    category === "organizationWithoutApp" ||
    category === "individualWithoutApp"
  )
    return spanish
      ? {
          subject: `¿Y si ${publisher} tuviera su propia app?`,
          preheader:
            "Elegí el look, pedí una demo gratis y empezá a imaginarla.",
          heading: "Tu marca. Tu app. Tu estilo. 🔥",
          lead: "¿Querés verla? Pedí tu demo gratis.",
          paragraphs: [
            "Elegí las plataformas, funciones y colores que imaginás. Nosotros revisamos tu solicitud.",
            "Con esos datos, podemos preparar una demo para que la pruebes antes de decidir si querés publicarla.",
            `Entrá con la cuenta de publicador de ${publisher} y empezá.`,
          ],
          ctaLabel: "Pedir mi demo gratis",
          closing: "¡Qué ganas de ver tu app tomar forma!",
          callback: APP_NEW_PATH,
        }
      : {
          subject: `What if ${publisher} had its own app?`,
          preheader:
            "Pick the look, request a free demo, and picture the possibilities.",
          heading: "Your brand. Your app. Your style. 🔥",
          lead: "Want to see it? Request your free demo.",
          paragraphs: [
            "Choose your platforms, features, and colors. We’ll review your request.",
            "With those details, we can prepare a demo for you to try before deciding whether to publish.",
            `Sign in with ${publisher}’s publisher account to get started.`,
          ],
          ctaLabel: "Request my free demo",
          closing: "Can’t wait to see your app take shape!",
          callback: APP_NEW_PATH,
        };
  if (category === "freeApp" || category === "individualFreeApp")
    return spanish
      ? {
          subject: `¿Listos para publicar la app de ${publisher}?`,
          preheader:
            "Tu demo gratuita está activa. Conocé los pasos para solicitar la publicación.",
          heading: "De la prueba a la publicación",
          lead: `La demo gratuita de la app de ${publisher} ya está disponible para probar. Si la experiencia te convence, podés empezar el proceso para publicarla.`,
          paragraphs: [
            "El primer paso es ingresar al portal y revisar los términos y condiciones de tu app.",
            "Si decidís aceptarlos y solicitar la publicación, podrás consultar la información de pago y coordinar con nuestro equipo la preparación de tu app para publicarla.",
            `Ingresá con la cuenta de publicador que administra ${publisher}.`,
          ],
          ctaLabel: "Revisar condiciones de publicación",
          closing:
            "Cuando decidas avanzar, estaremos para ayudarte con la publicación.",
          callback: APP_TERMS_PATH,
        }
      : {
          subject: `Ready to publish ${publisher}’s app?`,
          preheader:
            "Your free app demo is ready to test. See how to request publication.",
          heading: "From demo to publication",
          lead: `The free demo of ${publisher}’s app is ready to test. If the experience works for your team, you can begin the publication process.`,
          paragraphs: [
            "Start by signing in to the portal and reviewing your app’s terms and conditions.",
            "If you decide to accept the terms and request publication, you’ll be able to review payment information and coordinate the preparation of your app with our team.",
            `Sign in with the publisher account for ${publisher}.`,
          ],
          ctaLabel: "Review publication terms",
          closing:
            "When you’re ready, we’ll help you through the publication process.",
          callback: APP_TERMS_PATH,
        };
  if (category === "contract" || category === "individualContract")
    return spanish
      ? {
          subject: `Tu app de ${publisher}, desde un solo lugar`,
          preheader:
            "Revisá la configuración de tu app y consultá los próximos pasos desde el portal.",
          heading: "Tu app, bajo control",
          lead: `La app de ${publisher} tiene su espacio de gestión. Desde el portal podés revisar su configuración y consultar qué sigue.`,
          paragraphs: [
            "Ingresá cuando necesites revisar o mantener la configuración de tu app. Si te surge alguna duda, respondé a este correo y nuestro equipo te ayudará.",
            `Ingresá con la cuenta de publicador que administra ${publisher}.`,
          ],
          ctaLabel: "Abrir el portal de mi app",
          closing: "Estamos a un correo de distancia si necesitás ayuda.",
          callback: "/publisher-portal/app/edit",
        }
      : {
          subject: `Your ${publisher} app, all in one place`,
          preheader:
            "Review your app settings and next steps in the publisher portal.",
          heading: "Stay on top of your app",
          lead: `There’s a dedicated place to manage ${publisher}’s app. Use the portal to review its settings and see what comes next.`,
          paragraphs: [
            "Open the portal whenever you need to review or maintain your app’s settings. Have a question? Reply to this email and our team will help.",
            `Sign in with the publisher account for ${publisher}.`,
          ],
          ctaLabel: "Open my app portal",
          closing: "We’re an email away whenever you need help.",
          callback: "/publisher-portal/app/edit",
        };
  throw new AdminRepositoryError(
    "Review the partner's missing connections or app status before sending an email.",
    409,
  );
}

export function buildConnectedPartnerEmail(
  partner: Partner,
  language: PartnerEmailLanguage = "es",
  accessKey?: string,
  presentation?: {
    brand: PartnerEmailBannerBrand;
    banner?: PartnerEmailBannerInput;
  },
): PartnerEmailPreview {
  const category = partnerSection(partner);
  const copy = emailCopy(partner, category, language, presentation?.brand.name);
  const ctaUrl = copy.callback
    ? publisherLoginUrl(copy.callback, partner.email, accessKey)
    : JOIN_URL;
  const greeting =
    language === "es"
      ? partner.firstName.trim() ? `Hola ${partner.firstName.trim()},` : "Hola,"
      : partner.firstName.trim() ? `Hi ${partner.firstName.trim()},` : "Hi,";
  const signature =
    language === "es" ? "Equipo Pocket Genes" : "The Pocket Genes team";
  const closing = `${copy.closing}\n\n${signature}`;
  const bannerHtml = presentation?.banner
    ? `<div style="margin:0 0 24px;"><a href="${escapeHtml(ctaUrl)}" style="display:block;text-decoration:none;"><img src="cid:${PARTNER_BANNER_CONTENT_ID}" width="600" alt="${escapeHtml(language === "es" ? `Así podría verse la app de ${presentation.brand.name}` : `See what ${presentation.brand.name}’s app could look like`)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:14px;"></a></div>`
    : "";
  const ctaHtml = `<a href="${escapeHtml(ctaUrl)}" class="pg-email-cta" style="display:block;max-width:100%;box-sizing:border-box;text-align:center;overflow-wrap:break-word;background:#6f3cc3;color:#ffffff;text-decoration:none;border-radius:12px;padding:22px 24px;font-size:17px;line-height:24px;font-weight:800;">${escapeHtml(copy.ctaLabel)}</a>`;
  const text = [
    greeting,
    "",
    copy.heading,
    "",
    copy.lead,
    "",
    ...copy.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    `${copy.ctaLabel}: ${ctaUrl}`,
    "",
    closing,
  ].join("\n");
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
@media only screen and (max-width:480px) {
  .pg-email-outer { padding:20px 8px !important; }
  .pg-email-header, .pg-email-content { padding:28px 24px !important; }
  .pg-email-title { font-size:28px !important; line-height:34px !important; }
}
</style></head><body style="margin:0;padding:0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f8f7ff;font-family:Arial,Helvetica,sans-serif;color:#111827;"><tr><td class="pg-email-outer" align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;table-layout:fixed;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e7e5ff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(86,50,164,0.14);"><tr><td class="pg-email-header" style="background:#2d1b69;padding:36px 40px;overflow-wrap:break-word;word-wrap:break-word;"><div style="font-size:13px;line-height:18px;letter-spacing:0.26em;text-transform:uppercase;font-weight:800;color:#d8c9ff;">Pocket Genes</div><div class="pg-email-title" style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">${escapeHtml(copy.heading)}</div></td></tr>
<tr><td class="pg-email-content" style="padding:40px;background:#ffffff;overflow-wrap:break-word;word-wrap:break-word;"><p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">${escapeHtml(greeting)}</p><p style="margin:0 0 28px;font-size:22px;line-height:32px;font-weight:800;color:#111827;">${escapeHtml(copy.lead)}</p>
${bannerHtml}${presentation?.banner ? `<div style="margin:0 0 28px;">${ctaHtml}</div>` : ""}
${copy.paragraphs.map((paragraph) => `<p style="margin:0 0 24px;font-size:18px;line-height:30px;color:#4b5563;">${escapeHtml(paragraph)}</p>`).join("\n")}
${ctaHtml}
<p style="margin:28px 0 0;font-size:16px;line-height:26px;color:#6b7280;">${escapeHtml(closing).replace(/\n/g, "<br>")}</p></td></tr></table></td></tr></table></body></html>`;
  const content = {
    partnerId: partner.id,
    to: partner.email,
    subject: copy.subject,
    text,
    html,
    ctaLabel: copy.ctaLabel,
    ctaUrl,
    category,
    language,
  };
  // Bind both exact rendered content and current publisher/app identity. Historical
  // snapshots cannot authorize an email or decide which stage it describes.
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        content,
        linkedOrganization: partner.linkedOrganization,
        linkedIndividualPublisher: partner.linkedIndividualPublisher,
        linkedApp: partner.linkedApp,
        bannerBrand: presentation?.brand,
        bannerDigest: presentation?.banner
          ? createHash("sha256")
              .update(presentation.banner.dataUrl)
              .digest("hex")
          : undefined,
      }),
    )
    .digest("hex");
  return {
    ...content,
    previewHash,
    ...(presentation
      ? {
          bannerBrand: presentation.brand,
          ...(presentation.banner ? { banner: presentation.banner } : {}),
        }
      : {}),
  };
}

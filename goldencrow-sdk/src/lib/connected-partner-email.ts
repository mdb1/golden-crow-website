import { createHash } from "node:crypto";
import type {
  Partner,
  PartnerSection,
} from "../contracts/connected-partners.js";
import { ENV } from "../config/env.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import { partnerSection } from "./partner-section.js";

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
};

const JOIN_URL = "https://goldencrowvs.com/pocket-genes/join-us/new/";
const APP_NEW_PATH = "/publisher-portal/app/new";
const APP_TERMS_PATH = "/publisher-portal/app/accept-terms-and-conditions";

type Copy = {
  subject: string;
  heading: string;
  lead: string;
  paragraphs: string[];
  ctaLabel: string;
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

function publisherLoginUrl(callback: string, email: string) {
  const url = new URL(
    "/publisher-portal/login",
    `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("email", email);
  url.searchParams.set("callbackUrl", callback);
  return url.toString();
}

function emailCopy(
  partner: Partner,
  category: PartnerSection,
  language: PartnerEmailLanguage,
): Copy {
  const spanish = language === "es";
  const publisher =
    partner.linkedApp?.publisherName ??
    partner.linkedOrganization?.name ??
    partner.linkedIndividualPublisher?.name ??
    partner.companyName;
  const accountInstruction = spanish
    ? `Usá la cuenta de publicador que administra ${publisher}.`
    : `Use the publisher account that manages ${publisher}.`;
  if (category === "noOrganization")
    return spanish
      ? {
          subject: "Sumá tu organización a la red de Pocket Genes",
          heading: "Tu organización tiene un lugar en Pocket Genes",
          lead: "Conectá tu organización con una red de nuevas oportunidades.",
          paragraphs: [
            `Te invitamos a sumar ${partner.companyName} a Pocket Genes solicitando el perfil de tu organización.`,
            "Una vez aprobada la solicitud, podrás acceder a los descuentos disponibles en la red y explorar alianzas con otras organizaciones y profesionales.",
            "También podrás solicitar una muestra gratuita de tu propia app para conocer la experiencia y evaluarla con tu equipo antes de avanzar.",
            "Completá el formulario con los datos de tu organización. Nuestro equipo revisará la solicitud y, cuando sea aprobada, recibirás las instrucciones de acceso al portal.",
          ],
          ctaLabel: "Solicitar mi organización",
        }
      : {
          subject: "Bring your organization into the Pocket Genes network",
          heading: "Your organization belongs in Pocket Genes",
          lead: "Connect your organization with new opportunities.",
          paragraphs: [
            `We’d love to welcome ${partner.companyName} to Pocket Genes. Start by requesting your organization’s profile.`,
            "Once your request is approved, you can access available network discounts and explore partnerships with other organizations and professionals.",
            "You can also request a free sample of your own app to explore the experience with your team before taking the next step.",
            "Complete the form with your organization's details. Our team will review the request and send portal access instructions after approval.",
          ],
          ctaLabel: "Request my organization",
        };
  if (
    category === "organizationWithoutApp" ||
    category === "individualWithoutApp"
  )
    return spanish
      ? {
          subject: "Dale el primer paso a tu propia app en Pocket Genes",
          heading: "Empecemos a preparar tu app",
          lead: `${publisher} ya forma parte de Pocket Genes. El siguiente paso es preparar la solicitud de su propia app.`,
          paragraphs: [
            "En el portal de publicadores podés elegir las plataformas, funciones y colores de tu app y enviar la solicitud para que nuestro equipo la revise.",
            "Con esa información podremos preparar una muestra gratuita para que conozcas la experiencia y la evalúes con tu equipo. El botón te lleva al inicio de sesión y después al formulario de tu nueva app.",
            accountInstruction,
          ],
          ctaLabel: "Preparar mi app",
          callback: APP_NEW_PATH,
        }
      : {
          subject: "Take the first step towards your own Pocket Genes app",
          heading: "Let's start preparing your app",
          lead: `${publisher} is already part of Pocket Genes. The next step is to prepare a request for its own app.`,
          paragraphs: [
            "Use the publisher portal to choose your app’s platforms, features and colors, then submit the request for our team to review.",
            "With those details, we can prepare a free sample for you to explore with your team. The button takes you to sign in and then to your new app form.",
            accountInstruction,
          ],
          ctaLabel: "Prepare my app",
          callback: APP_NEW_PATH,
        };
  if (category === "freeApp" || category === "individualFreeApp")
    return spanish
      ? {
          subject: "El próximo paso para tu app en Pocket Genes",
          heading: "De la muestra a tu próxima etapa",
          lead: `La app de ${publisher} está activa como muestra gratuita para pruebas.`,
          paragraphs: [
            `Cuando quieras avanzar a la publicación de la app de ${publisher}, ingresá al portal para revisar y aceptar los términos y condiciones.`,
            "Después de aceptar las condiciones y solicitar la publicación, vas a poder revisar la información de pago y coordinar la preparación de tu app.",
            accountInstruction,
          ],
          ctaLabel: "Revisar términos de mi app",
          callback: APP_TERMS_PATH,
        }
      : {
          subject: "The next step for your Pocket Genes app",
          heading: "From your sample to the next stage",
          lead: `The app for ${publisher} is active as a free testing sample.`,
          paragraphs: [
            `When you are ready to move towards publication of the app for ${publisher}, sign in to the portal to review and accept the terms and conditions.`,
            "After accepting the terms and requesting publication, you can review payment information and coordinate preparation of your app.",
            accountInstruction,
          ],
          ctaLabel: "Review my app's terms",
          callback: APP_TERMS_PATH,
        };
  if (category === "contract" || category === "individualContract") {
    return spanish
      ? {
          subject: "Gestioná tu app en Pocket Genes",
          heading: "Tu app, siempre a mano",
          lead: `Podés gestionar la app de ${publisher} desde el portal de publicadores.`,
          paragraphs: [
            "Ingresá al portal de publicadores para revisar y mantener la configuración de tu app y consultar sus próximos pasos. Si necesitás acompañamiento, respondé a este correo y el equipo te ayudará.",
            accountInstruction,
          ],
          ctaLabel: "Gestionar mi app",
          callback: "/publisher-portal/app/edit",
        }
      : {
          subject: "Manage your Pocket Genes app",
          heading: "Your app, always within reach",
          lead: `You can manage the app for ${publisher} in the publisher portal.`,
          paragraphs: [
            "Sign in to the publisher portal to review and maintain your app's configuration and check its next steps. If you need guidance, reply to this email and our team will help.",
            accountInstruction,
          ],
          ctaLabel: "Manage my app",
          callback: "/publisher-portal/app/edit",
        };
  }
  throw new AdminRepositoryError(
    "Review the partner's missing connections or app status before sending an email.",
    409,
  );
}

export function buildConnectedPartnerEmail(
  partner: Partner,
  language: PartnerEmailLanguage = "es",
): PartnerEmailPreview {
  const category = partnerSection(partner);
  const copy = emailCopy(partner, category, language);
  const ctaUrl = copy.callback
    ? publisherLoginUrl(copy.callback, partner.email)
    : JOIN_URL;
  const greeting =
    language === "es"
      ? `Hola ${partner.firstName} ${partner.lastName},`
      : `Hello ${partner.firstName} ${partner.lastName},`;
  const closing =
    language === "es"
      ? "Nos alegra acompañarte en el próximo paso.\n\nEquipo Pocket Genes"
      : "We're glad to help you take the next step.\n\nThe Pocket Genes team";
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.lead)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f8f7ff;font-family:Arial,Helvetica,sans-serif;color:#111827;"><tr><td class="pg-email-outer" align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;table-layout:fixed;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e7e5ff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(86,50,164,0.14);"><tr><td class="pg-email-header" style="background:#2d1b69;padding:36px 40px;overflow-wrap:break-word;word-wrap:break-word;"><div style="font-size:13px;line-height:18px;letter-spacing:0.26em;text-transform:uppercase;font-weight:800;color:#d8c9ff;">Pocket Genes</div><div class="pg-email-title" style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">${escapeHtml(copy.heading)}</div></td></tr>
<tr><td class="pg-email-content" style="padding:40px;background:#ffffff;overflow-wrap:break-word;word-wrap:break-word;"><p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">${escapeHtml(greeting)}</p><p style="margin:0 0 28px;font-size:22px;line-height:32px;font-weight:800;color:#111827;">${escapeHtml(copy.lead)}</p>
${copy.paragraphs.map((paragraph) => `<p style="margin:0 0 24px;font-size:18px;line-height:30px;color:#4b5563;">${escapeHtml(paragraph)}</p>`).join("\n")}
<a href="${escapeHtml(ctaUrl)}" class="pg-email-cta" style="display:inline-block;max-width:100%;box-sizing:border-box;text-align:center;overflow-wrap:break-word;background:#6f3cc3;color:#ffffff;text-decoration:none;border-radius:12px;padding:16px 24px;font-size:15px;line-height:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(copy.ctaLabel)}</a>
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
      }),
    )
    .digest("hex");
  return { ...content, previewHash };
}

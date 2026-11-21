import { ENV } from "../config/env.js";
import {
  escapeEmailHtml,
  renderBrandedEmail,
  renderBrandedEmailButton,
} from "./branded-email-layout.js";
import { sendGmailMessage } from "./gmail-mailer.js";

const PUBLISHER_PORTAL_LOGIN_PATH = "/publisher-portal/login";
const PUBLISHER_PORTAL_HOME_PATH = "/publisher-portal/home";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type PublisherPortalEmailRecipient = {
  email: string;
  displayName?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function backofficeUrl(path: string) {
  const origin = `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`;
  return new URL(path, origin);
}

function publisherPortalLoginUrl(email: string) {
  const url = backofficeUrl(PUBLISHER_PORTAL_LOGIN_PATH);
  url.searchParams.set("email", email);
  url.searchParams.set("callbackUrl", PUBLISHER_PORTAL_HOME_PATH);
  return url.toString();
}

function displayName(recipient: PublisherPortalEmailRecipient) {
  return optionalString(recipient.displayName) ?? "Publicador";
}

export function buildPublisherPortalInviteEmailMessage(
  recipient: PublisherPortalEmailRecipient,
  temporaryPassword: string,
): EmailMessage {
  const portalUrl = publisherPortalLoginUrl(recipient.email);
  const safeName = escapeEmailHtml(displayName(recipient));
  const safeTemporaryPassword = escapeEmailHtml(temporaryPassword);
  const preheader =
    "Tu solicitud fue aprobada. Ya podés entrar a Pocket Genes.";

  return {
    to: recipient.email,
    subject:
      "¡Te damos la bienvenida a Pocket Genes! Tu clave de acceso está lista.",
    text: [
      `Hola ${displayName(recipient)},`,
      "",
      "¡Tu solicitud fue aprobada!",
      "",
      "Te damos la bienvenida a Pocket Genes. Ya podés entrar al portal para preparar tu perfil y publicar contenido para la comunidad.",
      "",
      "Tu clave de acceso:",
      temporaryPassword,
      "",
      `Portal de Pocket Genes: ${portalUrl}`,
      "",
      "Nos alegra tenerte cerca.",
      "",
      "Equipo Pocket Genes",
    ].join("\n"),
    html: renderBrandedEmail({
      brandName: "Pocket Genes",
      title: "Te damos la bienvenida a Pocket Genes",
      preheader,
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">
          Hola ${safeName},
        </p>
        <p style="margin:0 0 12px;font-size:22px;line-height:32px;font-weight:800;color:#111827;">
          Tu solicitud fue aprobada.
        </p>
        <p style="margin:0 0 28px;font-size:18px;line-height:30px;color:#4b5563;">
          Te damos la bienvenida a Pocket Genes. Ya podés entrar al portal para preparar tu perfil y publicar contenido para la comunidad.
        </p>
        <p style="margin:0 0 18px;font-size:18px;line-height:28px;color:#4b5563;">
          Tu clave de acceso está lista.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 32px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
          <tr>
            <td style="padding:18px 20px;font-size:16px;line-height:22px;color:#6b7280;">
              Clave de acceso
            </td>
            <td align="right" style="padding:18px 20px;font-size:22px;line-height:28px;font-weight:800;letter-spacing:0.18em;color:#111827;">
              ${safeTemporaryPassword}
            </td>
          </tr>
        </table>
        ${renderBrandedEmailButton(portalUrl, "Entrar a Pocket Genes")}
        <p style="margin:28px 0 0;font-size:16px;line-height:26px;color:#6b7280;">
          Nos alegra tenerte cerca.
        </p>
      `,
    }),
  };
}

export async function sendPublisherPortalInviteEmail(
  recipient: PublisherPortalEmailRecipient,
  temporaryPassword: string,
) {
  await sendGmailMessage(
    buildPublisherPortalInviteEmailMessage(recipient, temporaryPassword),
  );
}

import { ENV } from "../config/env.js";
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayName(recipient: PublisherPortalEmailRecipient) {
  return optionalString(recipient.displayName) ?? "Publicador";
}

export function buildPublisherPortalInviteEmailMessage(
  recipient: PublisherPortalEmailRecipient,
  temporaryPassword: string,
): EmailMessage {
  const portalUrl = publisherPortalLoginUrl(recipient.email);
  const safeName = escapeHtml(displayName(recipient));
  const safeTemporaryPassword = escapeHtml(temporaryPassword);
  const safePortalUrl = escapeHtml(portalUrl);
  const preheader =
    "Usá tu clave de acceso para entrar al portal de publicadores.";

  return {
    to: recipient.email,
    subject: "Acceso Publisher Portal",
    text: [
      `Hola ${displayName(recipient)},`,
      "",
      "Aprobamos tu solicitud de publicador para Pocket Genes.",
      "",
      "Esta es tu clave de acceso:",
      temporaryPassword,
      "",
      `Link al portal: ${portalUrl}`,
      "",
      "Gracias.",
    ].join("\n"),
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${escapeHtml(preheader)}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f8f7ff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <tr>
          <td align="center" style="padding:40px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e7e5ff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(86,50,164,0.14);">
              <tr>
                <td style="background:#2d1b69;padding:36px 40px;">
                  <div style="font-size:13px;line-height:18px;letter-spacing:0.26em;text-transform:uppercase;font-weight:800;color:#d8c9ff;">
                    Pocket Genes
                  </div>
                  <div style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">
                    Acceso de publicador
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;background:#ffffff;">
                  <p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">
                    Hola ${safeName},
                  </p>
                  <p style="margin:0 0 28px;font-size:20px;line-height:32px;color:#111827;">
                    Aprobamos tu solicitud de publicador para Pocket Genes.
                  </p>
                  <p style="margin:0 0 18px;font-size:18px;line-height:28px;color:#4b5563;">
                    Esta es tu clave de acceso.
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
                  <a href="${safePortalUrl}" style="display:inline-block;background:#6f3cc3;color:#ffffff;text-decoration:none;border-radius:12px;padding:16px 24px;font-size:15px;line-height:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
                    Entrar al portal
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
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

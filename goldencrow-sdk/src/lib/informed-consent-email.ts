import { ENV } from "../config/env.js";
import { sendGmailMessage } from "./gmail-mailer.js";
import type { PatientRecord } from "../types/sdk.types.js";

const CONSENT_PORTAL_PATH = "/patient-portal/consents";
const PATIENT_PORTAL_LOGIN_PATH = "/patient-portal/login";

type ConsentEmailPatient = Pick<PatientRecord, "id" | "email" | "fullName">;

type InformedConsentEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeTemporaryPassword(value: unknown) {
  const password = optionalString(value);
  return password && /^[A-Z]{8}$/.test(password) ? password : undefined;
}

function backofficeUrl(path: string) {
  const origin = `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`;
  return new URL(path, origin);
}

function patientPortalLoginUrl(email: string) {
  const url = backofficeUrl(PATIENT_PORTAL_LOGIN_PATH);
  url.searchParams.set("email", email);
  url.searchParams.set("callbackUrl", CONSENT_PORTAL_PATH);
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

export function buildInformedConsentEmailMessage(
  patient: ConsentEmailPatient,
  temporaryPassword: string,
): InformedConsentEmailMessage {
  const portalUrl = patientPortalLoginUrl(patient.email);
  const safeName = escapeHtml(patient.fullName);
  const safeTemporaryPassword = escapeHtml(temporaryPassword);
  const safePortalUrl = escapeHtml(portalUrl);
  const preheader =
    "Usá tu clave de seguridad para cargar el consentimiento informado.";

  return {
    to: patient.email,
    subject: "Consentimiento informado 2PQ",
    text: [
      `Hola ${patient.fullName},`,
      "",
      "Para poder continuar con el estudio necesitamos que cargues tu consentimiento informado.",
      "",
      "Esta es tu clave de seguridad. Ingresala para poder subir tu reporte:",
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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <tr>
          <td align="center" style="padding:40px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(17,24,39,0.12);">
              <tr>
                <td style="background:#111827;padding:36px 40px;">
                  <div style="font-size:13px;line-height:18px;letter-spacing:0.28em;text-transform:uppercase;font-weight:800;color:#AF8232;">
                    Pocket Genes
                  </div>
                  <div style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">
                    Consentimiento informado
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;background:#ffffff;">
                  <p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">
                    Hola ${safeName},
                  </p>
                  <p style="margin:0 0 28px;font-size:20px;line-height:32px;color:#111827;">
                    Para poder continuar con el estudio necesitamos que cargues tu consentimiento informado.
                  </p>
                  <p style="margin:0 0 18px;font-size:18px;line-height:28px;color:#4b5563;">
                    Esta es tu clave de seguridad. Ingresala para poder subir tu reporte.
                  </p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 32px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                    <tr>
                      <td style="padding:18px 20px;font-size:16px;line-height:22px;color:#6b7280;">
                        Clave de seguridad
                      </td>
                      <td align="right" style="padding:18px 20px;font-size:22px;line-height:28px;font-weight:800;letter-spacing:0.18em;color:#111827;">
                        ${safeTemporaryPassword}
                      </td>
                    </tr>
                  </table>
                  <a href="${safePortalUrl}" style="display:inline-block;background:#AF8232;color:#ffffff;text-decoration:none;border-radius:12px;padding:16px 24px;font-size:15px;line-height:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
                    Cargar consentimiento
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

export async function sendInformedConsentEmail(
  patient: ConsentEmailPatient,
  temporaryPassword: string,
) {
  await sendGmailMessage(
    buildInformedConsentEmailMessage(patient, temporaryPassword),
  );
}

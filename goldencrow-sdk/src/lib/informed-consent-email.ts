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

  return {
    to: patient.email,
    subject: "Consentimiento informado 2PQ",
    text: [
      `Hola ${patient.fullName},`,
      "",
      "Para poder continuar con el estudio necesitamos que cargues tu consentimiento informado.",
      "",
      "Esta es tu clave de seguridad. Ingresala para poder subir tu consentimiento informado:",
      temporaryPassword,
      "",
      `Link al portal: ${portalUrl}`,
      "",
      "Gracias.",
    ].join("\n"),
    html: `
      <p>Hola ${safeName},</p>
      <p>Para poder continuar con el estudio necesitamos que cargues tu consentimiento informado.</p>
      <p>Esta es tu clave de seguridad. Ingresala para poder subir tu consentimiento informado:</p>
      <p><strong>${safeTemporaryPassword}</strong></p>
      <p>Link al portal: <a href="${safePortalUrl}">${safePortalUrl}</a></p>
      <p>Gracias.</p>
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

import { ENV } from "../config/env.js";
import type { PGFlexLogisticsRecord } from "../types/sdk.types.js";
import { sendGmailMessage } from "./gmail-mailer.js";
import { formatPGFlexReadableDateTime } from "./pgflex-readable-date.js";

const PGFLEX_LOGIN_PATH = "/pgflex/login";
const PGFLEX_LOGISTICS_PATH = "/pgflex/logistics";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type PGFlexDispatcherEmailRecipient = {
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

function pgflexLoginUrl(email: string, callbackPath = PGFLEX_LOGISTICS_PATH) {
  const url = backofficeUrl(PGFLEX_LOGIN_PATH);
  url.searchParams.set("email", email);
  url.searchParams.set("callbackUrl", callbackPath);
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

function displayName(recipient: PGFlexDispatcherEmailRecipient) {
  return optionalString(recipient.displayName) ?? "Transportista";
}

export function buildPGFlexDispatcherInviteEmailMessage(
  recipient: PGFlexDispatcherEmailRecipient,
  temporaryPassword: string,
): EmailMessage {
  const portalUrl = pgflexLoginUrl(recipient.email);
  const safeName = escapeHtml(displayName(recipient));
  const safeTemporaryPassword = escapeHtml(temporaryPassword);
  const safePortalUrl = escapeHtml(portalUrl);
  const preheader = "Usá tu clave de seguridad para entrar a PGFlex.";

  return {
    to: recipient.email,
    subject: "Acceso PGFlex",
    text: [
      `Hola ${displayName(recipient)},`,
      "",
      "Creamos tu acceso de transportista para PGFlex.",
      "",
      "Esta es tu clave de seguridad:",
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
                    PGFlex
                  </div>
                  <div style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">
                    Acceso de transportista
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;background:#ffffff;">
                  <p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">
                    Hola ${safeName},
                  </p>
                  <p style="margin:0 0 28px;font-size:20px;line-height:32px;color:#111827;">
                    Creamos tu acceso de transportista para PGFlex.
                  </p>
                  <p style="margin:0 0 18px;font-size:18px;line-height:28px;color:#4b5563;">
                    Esta es tu clave de seguridad.
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
                    Entrar a PGFlex
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

export function buildPGFlexLogisticsAssignmentEmailMessage(
  recipient: PGFlexDispatcherEmailRecipient,
  item: Pick<
    PGFlexLogisticsRecord,
    "id" | "identifier" | "origin" | "destination" | "timeRequested"
  >,
): EmailMessage {
  const callbackPath = `${PGFLEX_LOGISTICS_PATH}/${encodeURIComponent(item.id)}`;
  const portalUrl = pgflexLoginUrl(recipient.email, callbackPath);
  const safeName = escapeHtml(displayName(recipient));
  const safeIdentifier = escapeHtml(item.identifier);
  const safeOrigin = escapeHtml(item.origin);
  const safeDestination = escapeHtml(item.destination);
  const readableTimeRequested =
    formatPGFlexReadableDateTime(item.timeRequested) ?? item.timeRequested;
  const safeTimeRequested = escapeHtml(readableTimeRequested);
  const safePortalUrl = escapeHtml(portalUrl);
  const preheader = "Tenés un nuevo envío asignado en PGFlex.";

  return {
    to: recipient.email,
    subject: "Nuevo envío PGFlex asignado",
    text: [
      `Hola ${displayName(recipient)},`,
      "",
      "Tenés un nuevo envío asignado en PGFlex.",
      "",
      `Identificador: ${item.identifier}`,
      `Origen: ${item.origin}`,
      `Destino: ${item.destination}`,
      `Solicitado: ${readableTimeRequested}`,
      "",
      `Link al envío: ${portalUrl}`,
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
                    PGFlex
                  </div>
                  <div style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">
                    Nuevo envío asignado
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;background:#ffffff;">
                  <p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">
                    Hola ${safeName},
                  </p>
                  <p style="margin:0 0 28px;font-size:20px;line-height:32px;color:#111827;">
                    Tenés un nuevo envío asignado en PGFlex.
                  </p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 32px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                    <tr>
                      <td style="padding:14px 18px;color:#6b7280;">Identificador</td>
                      <td align="right" style="padding:14px 18px;font-weight:800;color:#111827;">${safeIdentifier}</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 18px;color:#6b7280;">Origen</td>
                      <td align="right" style="padding:14px 18px;font-weight:800;color:#111827;">${safeOrigin}</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 18px;color:#6b7280;">Destino</td>
                      <td align="right" style="padding:14px 18px;font-weight:800;color:#111827;">${safeDestination}</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 18px;color:#6b7280;">Solicitado</td>
                      <td align="right" style="padding:14px 18px;font-weight:800;color:#111827;">${safeTimeRequested}</td>
                    </tr>
                  </table>
                  <a href="${safePortalUrl}" style="display:inline-block;background:#AF8232;color:#ffffff;text-decoration:none;border-radius:12px;padding:16px 24px;font-size:15px;line-height:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
                    Abrir envío
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

export async function sendPGFlexDispatcherInviteEmail(
  recipient: PGFlexDispatcherEmailRecipient,
  temporaryPassword: string,
) {
  await sendGmailMessage(
    buildPGFlexDispatcherInviteEmailMessage(recipient, temporaryPassword),
  );
}

export async function sendPGFlexLogisticsAssignmentEmail(
  recipient: PGFlexDispatcherEmailRecipient,
  item: Pick<
    PGFlexLogisticsRecord,
    "id" | "identifier" | "origin" | "destination" | "timeRequested"
  >,
) {
  await sendGmailMessage(
    buildPGFlexLogisticsAssignmentEmailMessage(recipient, item),
  );
}

export type TreatmentPickupEmailKind = "planned" | "confirmed" | "rescheduled" | "cancelled";

export interface TreatmentPickupEmailDetails {
  id: string;
  identifier: string;
  origin: string;
  destination: string;
  pickupDate: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  temperatureC: 4 | -20;
  expectedCaseCount: number;
  codes: string[];
}

const TREATMENT_PICKUP_EMAIL_COPY = {
  planned: {
    title: "Retiro 2PQ planificado",
    message: "Reservá esta fecha y horario. Te avisaremos cuando las biopsias estén listas para retirar.",
  },
  confirmed: {
    title: "Retiro 2PQ confirmado",
    message: "Las biopsias están listas. Podés retirar el material en el horario indicado.",
  },
  rescheduled: {
    title: "Plan de retiro 2PQ actualizado",
    message: "Revisá la fecha, el horario y los destinos actualizados en PGFlex.",
  },
  cancelled: {
    title: "Retiro 2PQ cancelado",
    message: "Este retiro fue cancelado. Liberá el horario que tenías reservado.",
  },
} as const;

export function buildTreatmentPickupEmailMessage(
  kind: TreatmentPickupEmailKind,
  recipient: PGFlexDispatcherEmailRecipient,
  pickup: TreatmentPickupEmailDetails,
): EmailMessage {
  const { title, message } = TREATMENT_PICKUP_EMAIL_COPY[kind];
  const date = pickup.pickupDate.split("-").reverse().join("/");
  const url = pgflexLoginUrl(recipient.email, `${PGFLEX_LOGISTICS_PATH}/${encodeURIComponent(pickup.id)}`);
  const details: [string, string][] = [
    ["Retiro", pickup.identifier],
    ["Origen", pickup.origin],
    ["Destino", pickup.destination],
    ["Horario local", `${date}, ${pickup.pickupWindowStart}–${pickup.pickupWindowEnd}`],
    ["Temperatura", `${pickup.temperatureC} °C`],
    ["Cantidad de casos", String(pickup.expectedCaseCount)],
  ];
  if (pickup.codes.length) details.push(["Códigos", pickup.codes.join(", ")]);
  return {
    to: recipient.email,
    subject: `${title} · ${pickup.identifier}`,
    text: [
      `Hola ${displayName(recipient)},`, "", message, "",
      ...details.map(([label, value]) => `${label}: ${value}`), "", `Abrir en PGFlex: ${url}`,
    ].join("\n"),
    html: `<h1>${escapeHtml(title)}</h1><p>Hola ${escapeHtml(displayName(recipient))},</p>` +
      `<p>${escapeHtml(message)}</p><dl>${details.map(([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`,
      ).join("")}</dl><p><a href="${escapeHtml(url)}">Abrir en PGFlex</a></p>`,
  };
}

export async function sendTreatmentPickupEmail(
  kind: TreatmentPickupEmailKind,
  recipient: PGFlexDispatcherEmailRecipient,
  pickup: TreatmentPickupEmailDetails,
) {
  await sendGmailMessage(buildTreatmentPickupEmailMessage(kind, recipient, pickup));
}

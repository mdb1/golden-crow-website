import { sendGmailMessage } from "./gmail-mailer.js";

export const SERVICE_TRANSACTION_PROVIDER_HUB_URL =
  "https://golden-crow-backoffice.vercel.app/publisher-portal/service-transactions";

export type ServiceTransactionProviderBestEffortEmailInput = {
  providerContactEmail: string;
  serviceName: string;
  requestedByUserEmail: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nonblank(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function providerNoReplyFromHeader() {
  const configured =
    process.env.SERVICE_TRANSACTION_MAIL_FROM?.trim() || undefined;
  if (configured) {
    return configured;
  }

  const authenticatedMailbox = process.env.GMAIL_USER?.trim();
  return authenticatedMailbox
    ? `Pocket Genes no-reply <${authenticatedMailbox}>`
    : "Pocket Genes no-reply <no-reply@pocketgenes.com>";
}

export function buildServiceTransactionProviderBestEffortEmail(
  input: ServiceTransactionProviderBestEffortEmailInput,
) {
  const providerContactEmail = nonblank(
    input.providerContactEmail,
    "providerContactEmail",
  );
  const serviceName = nonblank(input.serviceName, "serviceName");
  const requestedByUserEmail = nonblank(
    input.requestedByUserEmail,
    "requestedByUserEmail",
  );
  const safeServiceName = escapeHtml(serviceName);
  const safeRequestedByUserEmail = escapeHtml(requestedByUserEmail);
  const safeHubUrl = escapeHtml(SERVICE_TRANSACTION_PROVIDER_HUB_URL);
  const preheader =
    "Recibiste una nueva solicitud de servicio a través de Pocket Genes.";

  return {
    to: providerContactEmail,
    subject: "Nueva solicitud de servicio en Pocket Genes",
    text: [
      "Hola,",
      "",
      "Recibiste una nueva solicitud de servicio a través de Pocket Genes.",
      "",
      `Servicio: ${serviceName}`,
      `Solicitado por: ${requestedByUserEmail}`,
      "",
      "Podés revisar y gestionar todas tus solicitudes desde el portal de prestadores:",
      SERVICE_TRANSACTION_PROVIDER_HUB_URL,
      "",
      "Pocket Genes",
    ].join("\n"),
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f6f3fc;font-family:Arial,Helvetica,sans-serif;color:#171126;">
        <tr>
          <td align="center" style="padding:36px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5def5;border-radius:20px;overflow:hidden;box-shadow:0 18px 48px rgba(68,43,109,0.12);">
              <tr>
                <td style="background:#2d1b69;padding:34px 36px;">
                  <div style="font-size:12px;line-height:18px;letter-spacing:0.24em;text-transform:uppercase;font-weight:800;color:#d9ccff;">Pocket Genes</div>
                  <div style="margin-top:14px;font-size:32px;line-height:39px;font-weight:800;color:#ffffff;">Nueva solicitud de servicio</div>
                  <div style="margin-top:12px;font-size:16px;line-height:25px;color:#eee9ff;">Ya podés revisarla desde tu portal de prestadores.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:36px;background:#ffffff;">
                  <p style="margin:0 0 10px;font-size:20px;line-height:30px;font-weight:800;color:#171126;">Hola,</p>
                  <p style="margin:0 0 28px;font-size:17px;line-height:28px;color:#50465f;">Recibiste una nueva solicitud de servicio a través de Pocket Genes.</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;border:1px solid #e8e3f7;border-radius:14px;background:#f8f6ff;border-collapse:separate;">
                    <tr>
                      <td style="padding:24px;">
                        <div style="font-size:11px;line-height:16px;letter-spacing:0.12em;text-transform:uppercase;font-weight:800;color:#7c6f96;">Servicio solicitado</div>
                        <div style="margin-top:5px;font-size:21px;line-height:29px;font-weight:800;color:#171126;">${safeServiceName}</div>
                        <div style="margin-top:18px;font-size:11px;line-height:16px;letter-spacing:0.12em;text-transform:uppercase;font-weight:800;color:#7c6f96;">Solicitado por</div>
                        <div style="margin-top:5px;font-size:16px;line-height:24px;color:#50465f;word-break:break-word;">${safeRequestedByUserEmail}</div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#50465f;">Revisá y gestioná todas tus solicitudes desde el portal de prestadores.</p>
                  <a href="${safeHubUrl}" style="display:inline-block;background:#6d3dc0;color:#ffffff;text-decoration:none;border-radius:12px;padding:15px 22px;font-size:15px;line-height:20px;font-weight:800;">Ver solicitudes</a>
                  <div style="margin-top:22px;font-size:12px;line-height:19px;color:#7c6f96;word-break:break-all;">Si no podés usar el botón: <a href="${safeHubUrl}" style="color:#5b21b6;">${safeHubUrl}</a></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  };
}

export async function sendServiceTransactionProviderBestEffortEmail(
  input: ServiceTransactionProviderBestEffortEmailInput,
) {
  await sendGmailMessage(
    buildServiceTransactionProviderBestEffortEmail(input),
    {
      from: providerNoReplyFromHeader(),
      boundaryPrefix: "pocket-genes-provider-best-effort",
    },
  );
}

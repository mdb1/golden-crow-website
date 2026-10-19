import { sendGmailMessage } from "./gmail-mailer.js";

export const POCKET_GENES_DOWNLOAD_URL =
  "https://goldencrowvs.com/pocket-genes/download/";
export const POCKET_GENES_APP_STORE_URL =
  "https://apps.apple.com/ar/app/pocket-genes/id6748587627";

const APP_STORE_QR_CONTENT_ID =
  "pocket-genes-app-store-qr@goldencrowvs.com";
const APP_STORE_QR_FILENAME = "pocket-genes-app-store-qr.png";

// Fixed 240x240 PNG generated from POCKET_GENES_APP_STORE_URL with:
// `qrcode -w 240 -e M -q 4 <URL>`. Its independently decoded payload is the
// exact URL above and its SHA-256 is pinned in the email test. The standard
// four-module quiet zone improves scanning while this SDK-contained image
// avoids a third-party QR service or a Firestore read.
const APP_STORE_QR_PNG_BASE64 =
  "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";

export type ServiceTransactionRequesterConfirmationEmailItem = {
  serviceName: string;
  providerName: string;
};

export type ServiceTransactionRequesterConfirmationEmailInput = {
  requesterEmail: string;
  items: readonly ServiceTransactionRequesterConfirmationEmailItem[];
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

function requesterNoReplyFromHeader() {
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

function serviceCountLabel(count: number) {
  return count === 1 ? "1 servicio" : `${count} servicios`;
}

function itemText(
  items: readonly ServiceTransactionRequesterConfirmationEmailItem[],
) {
  return items.flatMap((item, index) => [
    `${index + 1}. ${item.serviceName}`,
    `   Prestador: ${item.providerName}`,
  ]);
}

function itemHtml(
  items: readonly ServiceTransactionRequesterConfirmationEmailItem[],
) {
  return items
    .map((item, index) => {
      const itemNumber = String(index + 1).padStart(2, "0");
      return `
        <table role="presentation" aria-label="Servicio solicitado ${index + 1}" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;border:1px solid #e8e3f7;border-radius:14px;background:#ffffff;border-collapse:separate;">
          <tr>
            <td width="56" valign="top" style="padding:20px 0 20px 20px;">
              <div style="width:36px;height:36px;line-height:36px;text-align:center;border-radius:18px;background:#ede9fe;color:#5b21b6;font-size:13px;font-weight:800;">${itemNumber}</div>
            </td>
            <td valign="top" style="padding:20px 20px 20px 14px;">
              <div style="font-size:11px;line-height:16px;letter-spacing:0.12em;text-transform:uppercase;font-weight:800;color:#7c6f96;">Servicio</div>
              <div style="margin-top:4px;font-size:18px;line-height:26px;font-weight:800;color:#171126;">${escapeHtml(item.serviceName)}</div>
              <div style="margin-top:14px;font-size:11px;line-height:16px;letter-spacing:0.12em;text-transform:uppercase;font-weight:800;color:#7c6f96;">Prestador</div>
              <div style="margin-top:4px;font-size:15px;line-height:23px;color:#50465f;">${escapeHtml(item.providerName)}</div>
            </td>
          </tr>
        </table>`;
    })
    .join("");
}

export function buildServiceTransactionRequesterConfirmationEmail(
  input: ServiceTransactionRequesterConfirmationEmailInput,
) {
  const requesterEmail = nonblank(input.requesterEmail, "requesterEmail");
  if (input.items.length === 0) {
    throw new Error("At least one requested service is required");
  }
  const items = input.items.map((item, index) => ({
    serviceName: nonblank(item.serviceName, `items[${index}].serviceName`),
    providerName: nonblank(item.providerName, `items[${index}].providerName`),
  }));
  const countLabel = serviceCountLabel(items.length);
  const safeCountLabel = escapeHtml(countLabel);
  const safeDownloadUrl = escapeHtml(POCKET_GENES_DOWNLOAD_URL);
  const safeAppStoreUrl = escapeHtml(POCKET_GENES_APP_STORE_URL);
  const preheader = `Recibimos tu solicitud de ${countLabel} en Pocket Genes.`;

  return {
    to: requesterEmail,
    subject: "Recibimos tu solicitud de servicios en Pocket Genes",
    text: [
      "Hola,",
      "",
      `Recibimos tu solicitud de ${countLabel}. Este es el detalle:`,
      "",
      ...itemText(items),
      "",
      "Para seguir el estado de tus solicitudes:",
      "1. Descargá Pocket Genes.",
      "2. Creá una cuenta o iniciá sesión con el mismo email que usaste para hacer la solicitud.",
      "3. Abrí Servicios solicitados y confirmá que aparezcan estos servicios.",
      "",
      `Descargar Pocket Genes: ${POCKET_GENES_DOWNLOAD_URL}`,
      `Abrir en App Store: ${POCKET_GENES_APP_STORE_URL}`,
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
                  <div style="margin-top:14px;font-size:32px;line-height:39px;font-weight:800;color:#ffffff;">Solicitud recibida</div>
                  <div style="margin-top:12px;font-size:16px;line-height:25px;color:#eee9ff;">Ya registramos ${safeCountLabel} de tu solicitud.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:34px 36px 20px;background:#ffffff;">
                  <p style="margin:0 0 10px;font-size:20px;line-height:30px;font-weight:800;color:#171126;">Hola,</p>
                  <p style="margin:0 0 28px;font-size:17px;line-height:28px;color:#50465f;">Estos son los servicios que solicitaste y quién estará a cargo de cada uno.</p>
                  ${itemHtml(items)}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 36px 34px;background:#ffffff;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;background:#f8f6ff;border-radius:16px;">
                    <tr>
                      <td style="padding:26px;">
                        <div style="font-size:20px;line-height:28px;font-weight:800;color:#171126;">Seguí tus solicitudes en Pocket Genes</div>
                        <div style="margin-top:10px;font-size:15px;line-height:24px;color:#50465f;">Descargá la app, creá una cuenta o iniciá sesión con el mismo email que usaste para la solicitud. Después, abrí <strong>Servicios solicitados</strong> y confirmá que aparezcan estos servicios.</div>
                        <div style="margin-top:22px;">
                          <a href="${safeDownloadUrl}" style="display:inline-block;background:#6d3dc0;color:#ffffff;text-decoration:none;border-radius:12px;padding:15px 22px;font-size:15px;line-height:20px;font-weight:800;">Descargar Pocket Genes</a>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:32px 36px;background:#f4f0fc;border-top:1px solid #e5def5;">
                  <div style="font-size:18px;line-height:26px;font-weight:800;color:#171126;">¿Estás viendo este email en otro dispositivo?</div>
                  <div style="margin-top:7px;font-size:14px;line-height:22px;color:#625773;">Escaneá este código para abrir Pocket Genes en App Store.</div>
                  <div style="margin-top:20px;">
                    <a href="${safeAppStoreUrl}" style="text-decoration:none;">
                      <img src="cid:${APP_STORE_QR_CONTENT_ID}" width="192" height="192" alt="Código QR para abrir Pocket Genes en App Store" style="display:block;width:192px;height:192px;margin:0 auto;border:12px solid #ffffff;border-radius:12px;" />
                    </a>
                  </div>
                  <div style="margin-top:18px;">
                    <a href="${safeAppStoreUrl}" style="display:inline-block;color:#5b21b6;text-decoration:underline;font-size:14px;line-height:22px;font-weight:800;">Abrir en App Store</a>
                  </div>
                  <div style="margin-top:22px;font-size:12px;line-height:19px;color:#7c6f96;word-break:break-all;">Si no podés usar el botón o el QR: <a href="${safeAppStoreUrl}" style="color:#5b21b6;">${safeAppStoreUrl}</a></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
    inlineAttachments: [
      {
        contentId: APP_STORE_QR_CONTENT_ID,
        filename: APP_STORE_QR_FILENAME,
        mimeType: "image/png",
        contentBase64: APP_STORE_QR_PNG_BASE64,
      },
    ],
  };
}

export async function sendServiceTransactionRequesterConfirmationEmail(
  input: ServiceTransactionRequesterConfirmationEmailInput,
) {
  await sendGmailMessage(
    buildServiceTransactionRequesterConfirmationEmail(input),
    {
      from: requesterNoReplyFromHeader(),
      boundaryPrefix: "pocket-genes-request-confirmation",
    },
  );
}

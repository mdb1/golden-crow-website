import { sendGmailMessage } from "./gmail-mailer.js";

export const PARTNERSHIP_CRM_FROM_EMAIL = "federico@goldencrowvs.com";
export const PARTNERSHIP_CRM_FROM_HEADER = `Federico Bustos Fierro <${PARTNERSHIP_CRM_FROM_EMAIL}>`;
const PARTNERSHIP_CRM_SIGNATURE_FONT_STACK =
  "Verdana, Geneva, Tahoma, sans-serif";
const PARTNERSHIP_CRM_SIGNATURE_FONT_RESET = `font-family: ${PARTNERSHIP_CRM_SIGNATURE_FONT_STACK}; font-stretch: normal; letter-spacing: normal;`;
const PARTNERSHIP_CRM_SIGNATURE_CONTACT_STYLE = `${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} color: #252630; font-size: 10.5px; line-height: 12.5px; text-decoration: none;`;

export const PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML = `
<div dir="ltr" style="${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} color: #252630;">
  <table cellpadding="0" cellspacing="0" role="presentation" style="width: 280px; border-collapse: collapse; table-layout: fixed; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET}">
    <tbody>
      <tr>
        <td valign="top" align="center" style="width: 42px; padding: 8px 8px 0 0; border-right: 1px solid #dcd6cb;">
          <a href="https://goldencrowvs.com/" style="border: 0; text-decoration: none;">
            <img src="https://goldencrowvs.com/golden-crow-signature-logo.png" width="32" height="32" alt="" style="display: block; width: 32px; height: 32px; border: 0;">
          </a>
        </td>
        <td valign="top" style="width: 219px; padding: 0 0 0 12px;">
          <div style="margin: 0; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} font-size: 13.2px; line-height: 15.2px; font-weight: 700; color: #252630;">Federico Bustos Fierro</div>
          <div style="margin: 0 0 5px 0; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} font-size: 10.5px; line-height: 12.5px; color: #98712d;">Co-founder</div>
          <div style="margin: 0 0 3px 0; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} font-size: 10.5px; line-height: 12.5px; color: #252630;">Golden Crow Venture Studio</div>
          <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} font-size: 10.5px; line-height: 12.5px; color: #252630;">
            <tbody>
              <tr>
                <td valign="middle" style="width: 20px; padding: 0 7px 2px 0;"><img src="https://goldencrowvs.com/golden-crow-signature-email.png" width="14" height="14" alt="" style="display: block; width: 14px; height: 14px; border: 0;"></td>
                <td style="padding: 0 0 2px 0; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET}"><a href="mailto:federico@goldencrowvs.com" style="${PARTNERSHIP_CRM_SIGNATURE_CONTACT_STYLE}">federico@goldencrowvs.com</a></td>
              </tr>
              <tr>
                <td valign="middle" style="width: 20px; padding: 0 7px 2px 0;"><img src="https://goldencrowvs.com/golden-crow-signature-phone.png" width="14" height="14" alt="" style="display: block; width: 14px; height: 14px; border: 0;"></td>
                <td style="padding: 0 0 2px 0; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET}"><a href="tel:+5491121846934" style="${PARTNERSHIP_CRM_SIGNATURE_CONTACT_STYLE}">+54 9 11 2184-6934</a></td>
              </tr>
              <tr>
                <td valign="middle" style="width: 20px; padding: 0 7px 0 0;"><img src="https://goldencrowvs.com/golden-crow-signature-website.png" width="14" height="14" alt="" style="display: block; width: 14px; height: 14px; border: 0;"></td>
                <td style="padding: 0; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET}"><a href="https://pocketgenes.com/" style="${PARTNERSHIP_CRM_SIGNATURE_CONTACT_STYLE}">pocketgenes.com</a></td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
      <tr>
        <td valign="top" style="width: 42px; padding: 0 8px 0 0;"></td>
        <td valign="top" style="width: 219px; padding: 7px 0 0 12px;">
          <div style="border-top: 1px solid #dcd6cb; padding-top: 7px; ${PARTNERSHIP_CRM_SIGNATURE_FONT_RESET} font-size: 10.5px; line-height: 13px; color: #656570;">Soluciones digitales para gen&oacute;mica<br>y medicina de precisi&oacute;n.</div>
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim();

type PartnershipCrmEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function buildPartnershipCrmEmailMessage(
  input: PartnershipCrmEmailInput,
) {
  return {
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html?.trim() ? { html: input.html } : {}),
  };
}

export async function sendPartnershipCrmEmail(
  input: PartnershipCrmEmailInput,
) {
  await sendGmailMessage(buildPartnershipCrmEmailMessage(input), {
    from: optionalEnv("CRM_MAIL_FROM") ?? PARTNERSHIP_CRM_FROM_HEADER,
    user: optionalEnv("CRM_GMAIL_USER") ?? PARTNERSHIP_CRM_FROM_EMAIL,
    clientId: optionalEnv("CRM_GMAIL_CLIENT_ID") ?? optionalEnv("GMAIL_CLIENT_ID"),
    clientSecret:
      optionalEnv("CRM_GMAIL_CLIENT_SECRET") ??
      optionalEnv("GMAIL_CLIENT_SECRET"),
    refreshToken:
      optionalEnv("CRM_GMAIL_REFRESH_TOKEN") ??
      optionalEnv("GMAIL_REFRESH_TOKEN"),
    boundaryPrefix: "gc-crm",
    appendSendAsSignature: true,
    sendAsEmail: PARTNERSHIP_CRM_FROM_EMAIL,
    fallbackSignatureHtml: PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML,
  });
}

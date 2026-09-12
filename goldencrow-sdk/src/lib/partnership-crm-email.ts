import { sendGmailMessage } from "./gmail-mailer.js";

export const PARTNERSHIP_CRM_FROM_EMAIL = "federico@goldencrowvs.com";
export const PARTNERSHIP_CRM_FROM_HEADER = `Federico Bustos Fierro <${PARTNERSHIP_CRM_FROM_EMAIL}>`;
export const PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML = `
<div dir="ltr" style="font-family: 'DejaVu Sans', Arial, Helvetica, sans-serif; color: #252630;">
  <div style="margin: 0 0 8px 0; font-size: 9pt; line-height: 12pt; color: #656570;">Saludos,</div>
  <table cellpadding="0" cellspacing="0" role="presentation" style="width: 440px; border-collapse: collapse; table-layout: fixed; font-family: 'DejaVu Sans', Arial, Helvetica, sans-serif;">
    <tbody>
      <tr>
        <td valign="top" style="width: 74px; padding: 0 16px 0 1px; border-right: 1px solid #ddd6c9;">
          <a href="https://goldencrowvs.com/" style="border: 0; text-decoration: none;">
            <img src="https://goldencrowvs.com/logo1024.webp" width="56" height="56" alt="Golden Crow Venture Studio logo" style="display: block; width: 56px; height: 56px; border: 0;">
          </a>
        </td>
        <td valign="top" style="width: 365px; padding: 0 0 0 16px;">
          <div style="margin: 0 0 1px 0; font-size: 12pt; line-height: 15pt; font-weight: 700; color: #252630;">Federico Bustos Fierro</div>
          <div style="margin: 0; font-size: 8.5pt; line-height: 11pt; color: #92722e;">Co-founder</div>
          <div style="margin: 0 0 3px 0; font-size: 9pt; line-height: 12pt; color: #252630;">Golden Crow Venture Studio</div>
          <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; font-family: 'DejaVu Sans', Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 12.5pt; color: #252630;">
            <tbody>
              <tr>
                <td style="width: 18px; padding: 0 8px 0 0; color: #92722e; font-size: 10pt; line-height: 12.5pt;">&#9993;</td>
                <td style="padding: 0;"><a href="mailto:federico@goldencrowvs.com" style="color: #252630; text-decoration: none;">federico@goldencrowvs.com</a></td>
              </tr>
              <tr>
                <td style="width: 18px; padding: 0 8px 0 0; color: #92722e; font-size: 10pt; line-height: 12.5pt;">&#9742;</td>
                <td style="padding: 0;"><a href="tel:+5493546418105" style="color: #252630; text-decoration: none;">+54 9 3546 41-8105</a></td>
              </tr>
              <tr>
                <td style="width: 18px; padding: 0 8px 0 0; color: #92722e; font-size: 10pt; line-height: 12.5pt;">&#9678;</td>
                <td style="padding: 0;"><a href="https://goldencrowvs.com/" style="color: #252630; text-decoration: none;">goldencrowvs.com</a></td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
      <tr>
        <td style="width: 74px; padding: 0;"></td>
        <td valign="top" style="width: 365px; padding: 4px 0 0 16px;">
          <div style="border-top: 1px solid #ddd6c9; padding-top: 3px; font-size: 8.5pt; line-height: 11pt;">
            <a href="https://goldencrowvs.com/pocket-genes/solutions/" style="color: #74389b; font-weight: 700; text-decoration: none;">Pocket Genes</a>
          </div>
          <div style="margin-top: 1px; font-size: 8pt; line-height: 10pt; color: #656570;">Soluciones digitales para gen&oacute;mica y medicina de precisi&oacute;n.</div>
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
    fallbackSignatureHtml:
      optionalEnv("CRM_GMAIL_SIGNATURE_HTML") ??
      optionalEnv("GMAIL_SIGNATURE_HTML") ??
      PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML,
  });
}

import { sendGmailMessage } from "./gmail-mailer.js";

export const PARTNERSHIP_CRM_FROM_EMAIL = "federico@goldencrowvs.com";
export const PARTNERSHIP_CRM_FROM_HEADER = `Federico Bustos Fierro <${PARTNERSHIP_CRM_FROM_EMAIL}>`;
export const PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML = `
<div dir="ltr" style="font-family: Arial, Helvetica, sans-serif; color: #252630;">
  <table cellpadding="0" cellspacing="0" role="presentation" style="width: 280px; border-collapse: collapse; table-layout: fixed; font-family: Arial, Helvetica, sans-serif;">
    <tbody>
      <tr>
        <td valign="top" style="width: 48px; padding: 0 9px 0 0; border-right: 1px solid #d8c8b3;">
          <a href="https://goldencrowvs.com/" style="border: 0; text-decoration: none;">
            <img src="https://goldencrowvs.com/golden-crow-signature-logo.png" width="38" height="38" alt="" style="display: block; width: 38px; height: 38px; border: 0;">
          </a>
        </td>
        <td valign="top" style="width: 205px; padding: 0 0 0 14px;">
          <div style="margin: 0; font-size: 15px; line-height: 18px; font-weight: 700; color: #252630;">Federico Bustos Fierro</div>
          <div style="margin: 0 0 4px 0; font-size: 11px; line-height: 13px; color: #98712d;">Co-founder</div>
          <div style="margin: 0 0 2px 0; font-size: 13px; line-height: 16px; color: #252630;">Golden Crow Venture Studio</div>
          <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 16px; color: #252630;">
            <tbody>
              <tr>
                <td valign="middle" style="width: 13px; padding: 0 6px 0 0;"><img src="https://goldencrowvs.com/golden-crow-signature-email.png" width="10" height="10" alt="" style="display: block; width: 10px; height: 10px; border: 0;"></td>
                <td style="padding: 0;"><a href="mailto:federico@goldencrowvs.com" style="color: #252630; text-decoration: none;">federico@goldencrowvs.com</a></td>
              </tr>
              <tr>
                <td valign="middle" style="width: 13px; padding: 0 6px 0 0;"><img src="https://goldencrowvs.com/golden-crow-signature-phone.png" width="10" height="10" alt="" style="display: block; width: 10px; height: 10px; border: 0;"></td>
                <td style="padding: 0;"><a href="tel:+5491121846934" style="color: #252630; text-decoration: none;">+54 9 11 2184-6934</a></td>
              </tr>
              <tr>
                <td valign="middle" style="width: 13px; padding: 0 6px 0 0;"><img src="https://goldencrowvs.com/golden-crow-signature-website.png" width="10" height="10" alt="" style="display: block; width: 10px; height: 10px; border: 0;"></td>
                <td style="padding: 0;"><a href="https://pocketgenes.com/" style="color: #252630; text-decoration: none;">pocketgenes.com</a></td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 5px; border-top: 1px solid #d8c8b3; padding-top: 6px; font-size: 12px; line-height: 15px; color: #656570;">Soluciones digitales para gen&oacute;mica<br>y medicina de precisi&oacute;n.</div>
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

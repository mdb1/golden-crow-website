import { sendGmailMessage } from "./gmail-mailer.js";

export const PARTNERSHIP_CRM_FROM_EMAIL = "federico@goldencrowvs.com";
export const PARTNERSHIP_CRM_FROM_HEADER = `Federico Bustos Fierro <${PARTNERSHIP_CRM_FROM_EMAIL}>`;

type PartnershipCrmEmailInput = {
  to: string;
  subject: string;
  text: string;
};

function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#111827;">${escapeHtml(
          paragraph,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function buildPartnershipCrmEmailMessage(
  input: PartnershipCrmEmailInput,
) {
  const safeSubject = escapeHtml(input.subject);
  const bodyHtml = textToHtml(input.text);

  return {
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${safeSubject}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f7f7f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <tr>
          <td align="center" style="padding:32px 14px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:660px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:30px 34px;border-bottom:1px solid #e5e7eb;background:#111827;">
                  <div style="font-size:12px;line-height:18px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#c79a43;">Pocket Genes</div>
                  <div style="margin-top:10px;font-size:24px;line-height:31px;font-weight:800;color:#ffffff;">${safeSubject}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:34px;background:#ffffff;">
                  ${bodyHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
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
  });
}

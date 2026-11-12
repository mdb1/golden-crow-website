import { sendGmailMessage, type GmailMessageInput } from "./gmail-mailer.js";
export const PARTNER_EMAIL_FROM_EMAIL = "federico@goldencrowvs.com";
const PARTNER_EMAIL_FROM_HEADER = `Federico Bustos Fierro <${PARTNER_EMAIL_FROM_EMAIL}>`;

function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function sendPartnerEmailMessage(input: GmailMessageInput) {
  return sendGmailMessage(input, {
    from: PARTNER_EMAIL_FROM_HEADER,
    user: PARTNER_EMAIL_FROM_EMAIL,
    clientId:
      optionalEnv("CRM_GMAIL_CLIENT_ID") ?? optionalEnv("GMAIL_CLIENT_ID"),
    clientSecret:
      optionalEnv("CRM_GMAIL_CLIENT_SECRET") ??
      optionalEnv("GMAIL_CLIENT_SECRET"),
    refreshToken:
      optionalEnv("CRM_GMAIL_REFRESH_TOKEN") ??
      optionalEnv("GMAIL_REFRESH_TOKEN"),
    boundaryPrefix: "gc-partners",
    appendSendAsSignature: false,
  });
}

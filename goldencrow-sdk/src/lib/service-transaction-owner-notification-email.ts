import { ENV } from "../config/env.js";
import { sendGmailMessage } from "./gmail-mailer.js";
import {
  resolveServiceTransactionNotificationRouting,
} from "./service-transaction-notification-routing.js";

export type ServiceTransactionOwnerNotificationEmailInput = {
  requesterEmail: string;
  transactionName: string;
  providerContactEmail?: string | null;
};

function notificationDestinationUrl(path: string) {
  const origin = `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`;
  return new URL(path, origin).toString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serviceTransactionNoReplyFromHeader() {
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

export function buildServiceTransactionOwnerNotificationEmail(
  input: ServiceTransactionOwnerNotificationEmailInput,
) {
  const routing = resolveServiceTransactionNotificationRouting(
    input.providerContactEmail,
  );
  const destinationUrl = notificationDestinationUrl(routing.destinationPath);
  const safeDestinationUrl = escapeHtml(destinationUrl);
  const safeRequesterEmail = escapeHtml(input.requesterEmail);
  const safeTransactionName = escapeHtml(input.transactionName);
  const preheader = "A new Pocket Genes service request is ready for review.";

  return {
    recipientMode: routing.recipientMode,
    to: routing.recipientEmail,
    subject: "New Pocket Genes service request",
    text: [
      routing.greeting,
      "",
      "A new service request has been submitted through Pocket Genes.",
      "",
      `Service: ${input.transactionName}`,
      `Requested by: ${input.requesterEmail}`,
      "",
      `${routing.destinationTextLabel}: ${destinationUrl}`,
      "",
      "Pocket Genes",
    ].join("\n"),
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${escapeHtml(preheader)}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f8f7ff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <tr>
          <td align="center" style="padding:40px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e7e5ff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(86,50,164,0.14);">
              <tr>
                <td style="background:#2d1b69;padding:36px 40px;">
                  <div style="font-size:13px;line-height:18px;letter-spacing:0.26em;text-transform:uppercase;font-weight:800;color:#d8c9ff;">
                    Pocket Genes
                  </div>
                  <div style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">
                    New service request
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;background:#ffffff;">
                  <p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">
                    ${escapeHtml(routing.greeting)}
                  </p>
                  <p style="margin:0 0 28px;font-size:18px;line-height:30px;color:#4b5563;">
                    A new service request has been submitted through Pocket Genes and is ready for review.
                  </p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 32px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                    <tr>
                      <td style="padding:20px;">
                        <div style="font-size:13px;line-height:18px;letter-spacing:0.12em;text-transform:uppercase;font-weight:800;color:#6b7280;">
                          Requested service
                        </div>
                        <div style="margin-top:8px;font-size:22px;line-height:30px;font-weight:800;color:#111827;">
                          ${safeTransactionName}
                        </div>
                        <div style="margin-top:12px;font-size:16px;line-height:24px;color:#6b7280;">
                          Requested by ${safeRequesterEmail}
                        </div>
                      </td>
                    </tr>
                  </table>
                  <a href="${safeDestinationUrl}" style="display:inline-block;background:#6f3cc3;color:#ffffff;text-decoration:none;border-radius:12px;padding:16px 24px;font-size:15px;line-height:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
                    ${escapeHtml(routing.destinationButtonLabel)}
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

export async function sendServiceTransactionOwnerNotificationEmail(
  input: ServiceTransactionOwnerNotificationEmailInput,
) {
  await sendGmailMessage(buildServiceTransactionOwnerNotificationEmail(input), {
    from: serviceTransactionNoReplyFromHeader(),
    boundaryPrefix: "pocket-genes-service-request",
  });
}

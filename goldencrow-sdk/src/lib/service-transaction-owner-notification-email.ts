import { ENV } from "../config/env.js";
import { sendGmailMessage } from "./gmail-mailer.js";

export type ServiceTransactionOwnerNotificationEmailInput = {
  ownerEmail: string;
  ownerName: string;
  requesterEmail: string;
  transactionId: string;
  transactionName: string;
  serviceId: string;
  providerName: string;
  requestedAt?: string;
};

function notificationReviewUrl(transactionId: string) {
  const origin = `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`;
  return new URL(
    `publisher-portal/service-transactions/${encodeURIComponent(transactionId)}`,
    origin,
  ).toString();
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
  const reviewUrl = notificationReviewUrl(input.transactionId);
  const requestedAt = input.requestedAt ?? "not available";

  return {
    to: input.ownerEmail,
    subject: `New Pocket Genes service request: ${input.transactionName}`,
    text: [
      `Hello ${input.ownerName},`,
      "",
      "A new request has been submitted for one of your Pocket Genes services.",
      "",
      `Request: ${input.transactionName}`,
      `Request ID: ${input.transactionId}`,
      `Service ID: ${input.serviceId}`,
      `Provider: ${input.providerName}`,
      `Requested by: ${input.requesterEmail}`,
      `Requested at: ${requestedAt}`,
      "",
      `Review the request: ${reviewUrl}`,
      "",
      "This is an automated no-reply notification from Pocket Genes.",
    ].join("\n"),
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

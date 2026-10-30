import type { PublisherAppConfigRecord } from "../types/sdk.types.js";
import { sendGmailMessage } from "./gmail-mailer.js";

export const PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS = [
  "support@goldencrowvs.com",
  "federico@goldencrowvs.com",
] as const;

export function buildPublisherAppCreationNotificationEmail(
  config: PublisherAppConfigRecord,
  recipient: (typeof PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS)[number],
) {
  return {
    to: recipient,
    subject: `Nueva app pendiente de revisión: ${config.publisherName}`,
    text: [
      "Se creó una nueva configuración de app y está pendiente de revisión.",
      "",
      `Publicador: ${config.publisherName}`,
      `Tipo: ${config.publisherKind === "organization" ? "organización" : "individual"}`,
      `Publisher ID: ${config.publisherId}`,
      `Usuario: @${config.publisherUsername}`,
      `Email: ${config.publisherEmail}`,
      `Plataformas: ${config.platformOption === "ios_android" ? "iOS + Android" : "iOS"}`,
      `Estado: ${config.status}`,
      "",
      "Revisar en: https://golden-crow-backoffice.vercel.app/publisher-portal/app/edit",
    ].join("\n"),
  };
}

export async function sendPublisherAppCreationNotificationEmails(
  config: PublisherAppConfigRecord,
) {
  const results = await Promise.allSettled(
    PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS.map((recipient) =>
      sendGmailMessage(
        buildPublisherAppCreationNotificationEmail(config, recipient),
      ),
    ),
  );
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "One or more publisher app creation notifications failed.",
    );
  }
}

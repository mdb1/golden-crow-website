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
    subject: `App creada y lista para pruebas: ${config.publisherName}`,
    text: [
      "Se creó una nueva app y ya está activa para pruebas.",
      "El publicador puede probarla y solicitar su publicación más adelante desde Publicar mi app.",
      "",
      `Publicador: ${config.publisherName}`,
      `Tipo: ${config.publisherKind === "organization" ? "organización" : "individual"}`,
      `Publisher ID: ${config.publisherId}`,
      `Usuario: @${config.publisherUsername}`,
      `Email: ${config.publisherEmail}`,
      `Plataformas: ${config.platformOption === "ios_android" ? "iOS + Android" : "iOS"}`,
      `Estado: ${config.status}`,
      `Identificador para pruebas: ${config.appProviderIdentifier ?? "sin identificador"}`,
      "",
      `Revisar en: https://golden-crow-backoffice.vercel.app/god-mode/apps/${encodeURIComponent(config.id)}`,
    ].join("\n"),
  };
}

export function buildPublisherAppPublicationNotificationEmail(
  config: PublisherAppConfigRecord,
  recipient: (typeof PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS)[number],
) {
  return {
    to: recipient,
    subject: `Publicación solicitada · Coordinar pago: ${config.publisherName}`,
    text: [
      "Se solicitó la publicación de la app en las tiendas y se aceptaron los términos y condiciones.",
      "Próximo paso: contactar al publicador para coordinar el pago y la subida a las tiendas.",
      "",
      `Publicador: ${config.publisherName}`,
      `Tipo: ${config.publisherKind === "organization" ? "organización" : "individual"}`,
      `Publisher ID: ${config.publisherId}`,
      `Usuario: @${config.publisherUsername}`,
      `Email de contacto: ${config.publisherEmail}`,
      `Plataformas: ${config.platformOption === "ios_android" ? "iOS + Android" : "iOS"}`,
      `Estado: ${config.status}`,
      `Identificador: ${config.appProviderIdentifier}`,
      `Términos: ${config.termsVersion}`,
      `Aceptados por: ${config.termsAcceptedByUserId}`,
      `Aceptados el: ${config.termsAcceptedAt}`,
      "",
      `Revisar en: https://golden-crow-backoffice.vercel.app/god-mode/apps/${encodeURIComponent(config.id)}`,
    ].join("\n"),
  };
}

export async function sendPublisherAppPublicationNotificationEmails(config: PublisherAppConfigRecord) {
  const results = await Promise.allSettled(PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS.map(recipient =>
    sendGmailMessage(buildPublisherAppPublicationNotificationEmail(config, recipient)),
  ));
  const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, "One or more publisher app publication notifications failed.");
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

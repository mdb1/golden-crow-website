import type { DiscoverOrganizationRecord } from "../types/sdk.types.js";
import { sendGmailMessage } from "./gmail-mailer.js";

export const DISCOVER_PUBLISHER_REQUEST_NOTIFICATION_EMAIL =
  "federico@goldencrowvs.com";

type DiscoverOrganizationNotificationInput = Pick<
  DiscoverOrganizationRecord,
  "id" | "name" | "contactEmail"
>;

export function buildDiscoverPublisherRequestNotificationEmail(
  organization: DiscoverOrganizationNotificationInput,
) {
  const reviewUrl = `https://golden-crow-backoffice.vercel.app/discover/organizations/${encodeURIComponent(organization.id)}`;

  return {
    to: DISCOVER_PUBLISHER_REQUEST_NOTIFICATION_EMAIL,
    subject: "Nueva organización pendiente en Pocket Genes",
    text: [
      "Hay una nueva organización de Pocket Genes esperando revisión.",
      "",
      `Organización: ${organization.name}`,
      `Email: ${organization.contactEmail ?? "sin email"}`,
      `ID: ${organization.id}`,
      "",
      `Revisar: ${reviewUrl}`,
    ].join("\n"),
  };
}

export async function sendDiscoverPublisherRequestNotificationEmail(
  organization: DiscoverOrganizationNotificationInput,
) {
  await sendGmailMessage(
    buildDiscoverPublisherRequestNotificationEmail(organization),
  );
}

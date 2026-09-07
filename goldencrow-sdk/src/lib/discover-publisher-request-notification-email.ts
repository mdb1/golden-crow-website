import type {
  DiscoverIndividualRecord,
  DiscoverOrganizationRecord,
} from "../types/sdk.types.js";
import { sendGmailMessage } from "./gmail-mailer.js";

export const DISCOVER_PUBLISHER_REQUEST_NOTIFICATION_EMAIL =
  "federico@goldencrowvs.com";

export type DiscoverPublisherRequestNotificationKind =
  | "organization"
  | "individual";

type DiscoverPublisherNotificationInput = Pick<
  DiscoverOrganizationRecord | DiscoverIndividualRecord,
  "id" | "name" | "contactEmail"
>;

function publisherNotificationCopy(
  kind: DiscoverPublisherRequestNotificationKind,
) {
  if (kind === "individual") {
    return {
      routeSegment: "individuals",
      subject: "Nuevo publicador individual pendiente en Pocket Genes",
      intro:
        "Hay un nuevo publicador individual de Pocket Genes esperando revisión.",
      nameLabel: "Publicador individual",
    };
  }

  return {
    routeSegment: "organizations",
    subject: "Nueva organización pendiente en Pocket Genes",
    intro: "Hay una nueva organización de Pocket Genes esperando revisión.",
    nameLabel: "Organización",
  };
}

export function buildDiscoverPublisherRequestNotificationEmail(
  kind: DiscoverPublisherRequestNotificationKind,
  publisher: DiscoverPublisherNotificationInput,
) {
  const copy = publisherNotificationCopy(kind);
  const reviewUrl = `https://golden-crow-backoffice.vercel.app/discover/${copy.routeSegment}/${encodeURIComponent(publisher.id)}`;

  return {
    to: DISCOVER_PUBLISHER_REQUEST_NOTIFICATION_EMAIL,
    subject: copy.subject,
    text: [
      copy.intro,
      "",
      `${copy.nameLabel}: ${publisher.name}`,
      `Email: ${publisher.contactEmail ?? "sin email"}`,
      `ID: ${publisher.id}`,
      "",
      `Revisar: ${reviewUrl}`,
    ].join("\n"),
  };
}

export async function sendDiscoverPublisherRequestNotificationEmail(
  kind: DiscoverPublisherRequestNotificationKind,
  publisher: DiscoverPublisherNotificationInput,
) {
  await sendGmailMessage(
    buildDiscoverPublisherRequestNotificationEmail(kind, publisher),
  );
}

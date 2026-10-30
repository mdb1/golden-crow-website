const mockSendGmailMessage = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: (...args: unknown[]) => mockSendGmailMessage(...args),
}));

import {
  PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS,
  buildPublisherAppCreationNotificationEmail,
  sendPublisherAppCreationNotificationEmails,
} from "../lib/publisher-app-creation-notification-email.js";
import type { PublisherAppConfigRecord } from "../types/sdk.types.js";

const config: PublisherAppConfigRecord = {
  id: "organization_org-1",
  schemaVersion: 1,
  publisherKind: "organization",
  publisherId: "org-1",
  publisherName: "Pocket Genes Lab",
  publisherEmail: "publisher@example.org",
  publisherUsername: "pocketgenes",
  catalogEnabled: true,
  feedEnabled: true,
  status: "pending_revision",
  platformOption: "ios_android",
  connectEnabled: true,
  profileEnabled: true,
  learnCustomizationEnabled: true,
  colors: {
    primary: "#6D28D9",
    secondary: "#A78BFA",
    tertiary: "#F59E0B",
  },
  iconSource: "publisher",
  iconImageUrl: "https://example.org/icon.png",
  iconImageUploadDataUrl: null,
  createdAt: "2026-10-30T15:00:00.000Z",
  updatedAt: "2026-10-30T15:00:00.000Z",
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
};

describe("publisher app creation notification email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds a pending-review message with publisher identity", () => {
    const message = buildPublisherAppCreationNotificationEmail(
      config,
      "support@goldencrowvs.com",
    );

    expect(message.to).toBe("support@goldencrowvs.com");
    expect(message.subject).toContain("Pocket Genes Lab");
    expect(message.text).toContain("Publisher ID: org-1");
    expect(message.text).toContain("Usuario: @pocketgenes");
    expect(message.text).toContain("Estado: pending_revision");
  });

  it("notifies support and Federico on creation", async () => {
    await sendPublisherAppCreationNotificationEmails(config);

    expect(PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS).toEqual([
      "support@goldencrowvs.com",
      "federico@goldencrowvs.com",
    ]);
    expect(mockSendGmailMessage).toHaveBeenCalledTimes(2);
    expect(
      mockSendGmailMessage.mock.calls.map(([message]) => message.to),
    ).toEqual(PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS);
  });
});

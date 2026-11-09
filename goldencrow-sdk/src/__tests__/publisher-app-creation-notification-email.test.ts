const mockSendGmailMessage = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: (...args: unknown[]) => mockSendGmailMessage(...args),
}));

import {
  PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS,
  buildPublisherAppCreationNotificationEmail,
  sendPublisherAppCreationNotificationEmails,
  buildPublisherAppPublicationNotificationEmail,
  sendPublisherAppPublicationNotificationEmails,
} from "../lib/publisher-app-creation-notification-email.js";
import { defaultPublisherAppAdvancedConfiguration } from "../lib/publisher-app-advanced-config.js";
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
  status: "active_for_testing",
  appProviderIdentifier: "app_org_pocket_genes_lab_12345",
  platformOption: "ios_android",
  connectEnabled: true,
  profileEnabled: true,
  learnCustomizationEnabled: true,
  colors: {
    primary: "#6D28D9",
    secondary: "#A78BFA",
    tertiary: "#F59E0B",
    counterpointClockwise: "#EC15CE",
    counterpointAnticlockwise: "#1562EC",
    counterpointFarClockwise: "#EC1562",
    counterpointFarAnticlockwise: "#15CEEC",
  },
  iconSource: "publisher",
  iconImageUrl: "https://example.org/icon.png",
  iconImageUploadDataUrl: null,
  advancedConfiguration: defaultPublisherAppAdvancedConfiguration({
    kind: "organization",
    id: "org-1",
    name: "Pocket Genes Lab",
  }),
  createdAt: "2026-10-30T15:00:00.000Z",
  updatedAt: "2026-10-30T15:00:00.000Z",
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
};

describe("publisher app creation notification email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("announces a newly created testing app without claiming that terms were signed", () => {
    const message = buildPublisherAppCreationNotificationEmail(
      config,
      "support@goldencrowvs.com",
    );

    expect(message.to).toBe("support@goldencrowvs.com");
    expect(message.subject).toContain("Pocket Genes Lab");
    expect(message.text).toContain("Publisher ID: org-1");
    expect(message.text).toContain("Usuario: @pocketgenes");
    expect(message.subject).toContain("lista para pruebas");
    expect(message.text).toContain("Estado: active_for_testing");
    expect(message.text).toContain("Identificador para pruebas: app_org_pocket_genes_lab_12345");
    expect(message.text).not.toContain("Términos:");
    expect(message.text).not.toContain("Aceptados por:");
    expect(message.text).not.toContain("coordinar el pago");
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

const publicationConfig: PublisherAppConfigRecord = {
  ...config,
  status: "active_waiting_for_payment",
  termsVersion: "2026-10-31",
  termsAcceptedAt: "2026-10-31T01:00:00.000Z",
  termsAcceptedByUserId: "publisher-signing-user",
};

describe("publisher app publication notification email", () => {
  beforeEach(() => {
    mockSendGmailMessage.mockReset();
  });

  it("announces the signed publication request and payment coordination with the new state", () => {
    const message = buildPublisherAppPublicationNotificationEmail(publicationConfig, "support@goldencrowvs.com");
    expect(message.subject).toBe("Publicación solicitada · Coordinar pago: Pocket Genes Lab");
    expect(message.text).toContain("Estado: active_waiting_for_payment");
    expect(message.text).toContain("Email de contacto: publisher@example.org");
    expect(message.text).toContain("coordinar el pago y la subida a las tiendas");
    expect(message.text).toContain("Términos: 2026-10-31");
    expect(message.text).toContain("Aceptados por: publisher-signing-user");
    expect(message.text).toContain("Aceptados el: 2026-10-31T01:00:00.000Z");
    expect(message.text).toContain("Identificador: app_org_pocket_genes_lab_12345");
    expect(message.text).not.toContain("Estado: active_for_testing");
    expect(message.text).not.toContain("lista para pruebas");
  });

  it("notifies both established recipients with the payment request", async () => {
    await sendPublisherAppPublicationNotificationEmails(publicationConfig);
    expect(mockSendGmailMessage.mock.calls.map(([message]) => message.to)).toEqual(PUBLISHER_APP_CREATION_NOTIFICATION_EMAILS);
    expect(mockSendGmailMessage.mock.calls.every(([message]) => message.text.includes("Estado: active_waiting_for_payment"))).toBe(true);
  });

  it.each([
    ["testing", sendPublisherAppCreationNotificationEmails, config],
    ["publication", sendPublisherAppPublicationNotificationEmails, publicationConfig],
  ] as const)("attempts both %s recipients and reports a partial delivery failure", async (_stage, send, app) => {
    const deliveryError = new Error("Mailbox temporarily unavailable");
    mockSendGmailMessage.mockRejectedValueOnce(deliveryError).mockResolvedValueOnce(undefined);
    await expect(send(app)).rejects.toMatchObject({ errors: [deliveryError] });
    expect(mockSendGmailMessage).toHaveBeenCalledTimes(2);
  });
});

import {
  DISCOVER_PUBLISHER_REQUEST_NOTIFICATION_EMAIL,
  buildDiscoverPublisherRequestNotificationEmail,
} from "../lib/discover-publisher-request-notification-email.js";

describe("Discover publisher request notification email", () => {
  it("builds the hardcoded Federico notification for organization requests", () => {
    const message = buildDiscoverPublisherRequestNotificationEmail({
      id: "org-1",
      name: "Wizard Genetics Lab",
      contactEmail: "join@example.org",
    });

    expect(DISCOVER_PUBLISHER_REQUEST_NOTIFICATION_EMAIL).toBe(
      "federico@goldencrowvs.com",
    );
    expect(message).toEqual(
      expect.objectContaining({
        to: "federico@goldencrowvs.com",
        subject: "Nueva organización pendiente en Pocket Genes",
      }),
    );
    expect(message.text).toContain(
      "Hay una nueva organización de Pocket Genes esperando revisión.",
    );
    expect(message.text).toContain("Organización: Wizard Genetics Lab");
    expect(message.text).toContain("Email: join@example.org");
    expect(message.text).toContain(
      "https://golden-crow-backoffice.vercel.app/discover/organizations/org-1",
    );
    expect(message).not.toHaveProperty("html");
  });
});

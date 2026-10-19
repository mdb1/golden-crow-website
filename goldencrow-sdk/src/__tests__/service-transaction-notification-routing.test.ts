import {
  SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER,
  ServiceTransactionNotificationRoutingError,
  resolveServiceTransactionNotificationRouting,
} from "../lib/service-transaction-notification-routing.js";

describe("service transaction notification routing", () => {
  it("uses the production switch only as the default resolver mode", () => {
    const providerContactEmail = "provider@example.org";
    expect(
      resolveServiceTransactionNotificationRouting(
        providerContactEmail,
      ),
    ).toEqual(
      resolveServiceTransactionNotificationRouting(
        providerContactEmail,
        SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER,
      ),
    );
  });

  it("preserves the current operations route when that mode is selected", () => {
    expect(
      resolveServiceTransactionNotificationRouting(
        "provider@example.org",
        false,
      ),
    ).toEqual({
      recipientMode: "temporary_operations",
      recipientEmail: "federico@goldencrowvs.com",
      greeting: "Hello Federico,",
      destinationPath: "/god-mode/service-transactions",
      destinationTextLabel: "Review it in the backoffice",
      destinationButtonLabel: "Review in backoffice",
    });
  });

  it("resolves the future provider route independently of the production switch", () => {
    expect(
      resolveServiceTransactionNotificationRouting(
        " Provider.Contact@Example.ORG ",
        true,
      ),
    ).toEqual({
      recipientMode: "provider",
      recipientEmail: "provider.contact@example.org",
      greeting: "Hello,",
      destinationPath: "/publisher-portal/service-transactions",
      destinationTextLabel: "Review it in the publisher portal",
      destinationButtonLabel: "Review in publisher portal",
    });
  });

  it.each([
    undefined,
    null,
    "",
    "not-an-email",
    "provider@example",
    `${"a".repeat(309)}@example.org`,
  ])(
    "fails closed in provider mode for invalid contactEmail %p",
    (providerContactEmail) => {
      expect(() =>
        resolveServiceTransactionNotificationRouting(
          providerContactEmail,
          true,
        ),
      ).toThrow(ServiceTransactionNotificationRoutingError);
    },
  );

  it("does not require provider contactEmail while temporary routing is active", () => {
    expect(
      resolveServiceTransactionNotificationRouting(undefined, false),
    ).toEqual(
      expect.objectContaining({
        recipientMode: "temporary_operations",
        recipientEmail: "federico@goldencrowvs.com",
      }),
    );
  });
});

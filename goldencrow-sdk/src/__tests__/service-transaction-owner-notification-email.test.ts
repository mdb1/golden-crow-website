import {
  SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER,
  resolveServiceTransactionNotificationRouting,
} from "../lib/service-transaction-notification-routing.js";

const sendGmailMessageMock = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

describe("service transaction owner notification email", () => {
  const input = {
    requesterEmail: "requester@example.org",
    transactionName: "Whole genome interpretation",
    providerContactEmail: " Provider@Example.ORG ",
  };

  beforeEach(() => {
    sendGmailMessageMock.mockReset();
    delete process.env.SERVICE_TRANSACTION_MAIL_FROM;
  });

  it("routes a concise card notification using the configured recipient mode", async () => {
    const { buildServiceTransactionOwnerNotificationEmail } = await import(
      "../lib/service-transaction-owner-notification-email.js"
    );

    const message = buildServiceTransactionOwnerNotificationEmail(input);
    const routing = resolveServiceTransactionNotificationRouting(
      input.providerContactEmail,
      SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER,
    );

    expect(message).toEqual(
      expect.objectContaining({
        recipientMode: routing.recipientMode,
        to: routing.recipientEmail,
        subject: "New Pocket Genes service request",
      }),
    );
    expect(message.text).toContain(routing.greeting);
    expect(message.text).toContain("Service: Whole genome interpretation");
    expect(message.text).toContain("Requested by: requester@example.org");
    expect(message.text).toContain(routing.destinationPath);
    expect(message.text).not.toContain("Request ID");
    expect(message.text).not.toContain("Service ID");
    expect(message.text).not.toContain("Provider:");
    expect(message.text).not.toContain("Requested at");
    expect(message.html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(message.html).toContain("background:#2d1b69");
    expect(message.html).toContain(routing.destinationButtonLabel);
    expect(message.html).toContain(routing.destinationPath);
    expect(message.html).not.toContain("Request ID");
    expect(message.html).not.toContain("Service ID");
    expect(message.html).not.toContain("Requested at");
  });

  it("escapes canonical transaction content in the HTML card", async () => {
    const { buildServiceTransactionOwnerNotificationEmail } = await import(
      "../lib/service-transaction-owner-notification-email.js"
    );

    const message = buildServiceTransactionOwnerNotificationEmail({
      ...input,
      transactionName: 'Genome <script>alert("unsafe")</script>',
    });

    expect(message.html).toContain(
      "Genome &lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt;",
    );
    expect(message.html).not.toContain("<script>");
  });

  it("uses an explicit no-reply sender when configured", async () => {
    process.env.SERVICE_TRANSACTION_MAIL_FROM =
      "Pocket Genes <no-reply@pocketgenes.com>";
    const { sendServiceTransactionOwnerNotificationEmail } = await import(
      "../lib/service-transaction-owner-notification-email.js"
    );

    await sendServiceTransactionOwnerNotificationEmail(input);
    const routing = resolveServiceTransactionNotificationRouting(
      input.providerContactEmail,
      SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER,
    );

    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: routing.recipientEmail }),
      expect.objectContaining({
        from: "Pocket Genes <no-reply@pocketgenes.com>",
        boundaryPrefix: "pocket-genes-service-request",
      }),
    );
  });

  it("uses a no-reply display name with the authenticated Gmail mailbox by default", async () => {
    const previousGmailUser = process.env.GMAIL_USER;
    process.env.GMAIL_USER = "mailer@example.org";
    try {
      const { sendServiceTransactionOwnerNotificationEmail } = await import(
        "../lib/service-transaction-owner-notification-email.js"
      );

      await sendServiceTransactionOwnerNotificationEmail(input);

      expect(sendGmailMessageMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          from: "Pocket Genes no-reply <mailer@example.org>",
        }),
      );
    } finally {
      if (previousGmailUser === undefined) {
        delete process.env.GMAIL_USER;
      } else {
        process.env.GMAIL_USER = previousGmailUser;
      }
    }
  });
});

export {};

const sendGmailMessageMock = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

describe("service transaction owner notification email", () => {
  const input = {
    requesterEmail: "requester@example.org",
    transactionName: "Whole genome interpretation",
  };

  beforeEach(() => {
    sendGmailMessageMock.mockReset();
    delete process.env.SERVICE_TRANSACTION_MAIL_FROM;
  });

  it("routes a concise card notification to the temporary operations inbox", async () => {
    const {
      buildServiceTransactionOwnerNotificationEmail,
      SERVICE_TRANSACTION_NOTIFICATION_RECIPIENT_EMAIL,
    } = await import(
      "../lib/service-transaction-owner-notification-email.js"
    );

    const message = buildServiceTransactionOwnerNotificationEmail(input);

    expect(message).toEqual(
      expect.objectContaining({
        to: SERVICE_TRANSACTION_NOTIFICATION_RECIPIENT_EMAIL,
        subject: "New Pocket Genes service request",
      }),
    );
    expect(SERVICE_TRANSACTION_NOTIFICATION_RECIPIENT_EMAIL).toBe(
      "federico@goldencrowvs.com",
    );
    expect(message.text).toContain("Service: Whole genome interpretation");
    expect(message.text).toContain("Requested by: requester@example.org");
    expect(message.text).toContain(
      "/god-mode/service-transactions",
    );
    expect(message.text).not.toContain("Request ID");
    expect(message.text).not.toContain("Service ID");
    expect(message.text).not.toContain("Provider:");
    expect(message.text).not.toContain("Requested at");
    expect(message.html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(message.html).toContain("background:#2d1b69");
    expect(message.html).toContain("Review in backoffice");
    expect(message.html).toContain("/god-mode/service-transactions");
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

    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "federico@goldencrowvs.com" }),
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

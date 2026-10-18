export {};

const sendGmailMessageMock = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

describe("service transaction owner notification email", () => {
  const input = {
    ownerEmail: "owner@example.org",
    ownerName: "Genome Lab",
    requesterEmail: "requester@example.org",
    transactionId: "pgr_ios_0123456789abcdef0123456789abcdef",
    transactionName: "Whole genome interpretation",
    serviceId: "pgs_genome_lab_12345",
    providerName: "Genome Lab",
    requestedAt: "2026-10-18T12:30:00.000Z",
  };

  beforeEach(() => {
    sendGmailMessageMock.mockReset();
    delete process.env.SERVICE_TRANSACTION_MAIL_FROM;
  });

  it("builds a notification with the requester and canonical transaction details", async () => {
    const { buildServiceTransactionOwnerNotificationEmail } = await import(
      "../lib/service-transaction-owner-notification-email.js"
    );

    const message = buildServiceTransactionOwnerNotificationEmail(input);

    expect(message).toEqual(
      expect.objectContaining({
        to: "owner@example.org",
        subject:
          "New Pocket Genes service request: Whole genome interpretation",
      }),
    );
    expect(message.text).toContain(
      "Request ID: pgr_ios_0123456789abcdef0123456789abcdef",
    );
    expect(message.text).toContain("Requested by: requester@example.org");
    expect(message.text).toContain(
      "/publisher-portal/service-transactions/pgr_ios_0123456789abcdef0123456789abcdef",
    );
    expect(message.text).toContain("automated no-reply notification");
  });

  it("uses an explicit no-reply sender when configured", async () => {
    process.env.SERVICE_TRANSACTION_MAIL_FROM =
      "Pocket Genes <no-reply@pocketgenes.com>";
    const { sendServiceTransactionOwnerNotificationEmail } = await import(
      "../lib/service-transaction-owner-notification-email.js"
    );

    await sendServiceTransactionOwnerNotificationEmail(input);

    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.org" }),
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

export {};

const sendGmailMessageMock = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

describe("service transaction provider best-effort email", () => {
  const input = {
    providerContactEmail: "provider@example.org",
    serviceName: "Secuenciación de exoma",
    requestedByUserEmail: "requester@example.org",
  };

  beforeEach(() => {
    sendGmailMessageMock.mockReset();
    delete process.env.SERVICE_TRANSACTION_MAIL_FROM;
  });

  it("builds a Spanish provider notification with only the fixed general hub link", async () => {
    const {
      SERVICE_TRANSACTION_PROVIDER_HUB_URL,
      buildServiceTransactionProviderBestEffortEmail,
    } = await import(
      "../lib/service-transaction-provider-best-effort-email.js"
    );

    const message = buildServiceTransactionProviderBestEffortEmail(input);

    expect(message).toEqual(
      expect.objectContaining({
        to: "provider@example.org",
        subject: "Nueva solicitud de servicio en Pocket Genes",
      }),
    );
    expect(message.text).toContain(
      "Recibiste una nueva solicitud de servicio a través de Pocket Genes.",
    );
    expect(message.text).toContain("Servicio: Secuenciación de exoma");
    expect(message.text).toContain("Solicitado por: requester@example.org");
    expect(message.text).toContain(SERVICE_TRANSACTION_PROVIDER_HUB_URL);
    expect(message.html).toContain("Nueva solicitud de servicio");
    expect(message.html).toContain("Secuenciación de exoma");
    expect(message.html).toContain("requester@example.org");
    expect(message.html.match(/href="[^"]+"/g)).toEqual([
      `href="${SERVICE_TRANSACTION_PROVIDER_HUB_URL}"`,
      `href="${SERVICE_TRANSACTION_PROVIDER_HUB_URL}"`,
    ]);
    expect(message.text).not.toContain("Request ID");
    expect(message.text).not.toContain("Transaction ID");
    expect(message.html).not.toContain("Request ID");
    expect(message.html).not.toContain("Transaction ID");
    expect(message.html).not.toContain("/god-mode/");
  });

  it("escapes client-supplied content in HTML while keeping readable plain text", async () => {
    const { buildServiceTransactionProviderBestEffortEmail } = await import(
      "../lib/service-transaction-provider-best-effort-email.js"
    );

    const message = buildServiceTransactionProviderBestEffortEmail({
      ...input,
      serviceName: 'Exoma <script>alert("x")</script>',
      requestedByUserEmail: "requester&test@example.org <unsafe>",
    });

    expect(message.html).toContain(
      "Exoma &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(message.html).toContain(
      "requester&amp;test@example.org &lt;unsafe&gt;",
    );
    expect(message.html).not.toContain("<script>");
    expect(message.text).toContain('Exoma <script>alert("x")</script>');
    expect(message.text).toContain("requester&test@example.org <unsafe>");
  });

  it.each([
    ["providerContactEmail", { ...input, providerContactEmail: " " }],
    ["serviceName", { ...input, serviceName: " " }],
    ["requestedByUserEmail", { ...input, requestedByUserEmail: " " }],
  ])("rejects a blank %s", async (field, invalidInput) => {
    const { buildServiceTransactionProviderBestEffortEmail } = await import(
      "../lib/service-transaction-provider-best-effort-email.js"
    );

    expect(() =>
      buildServiceTransactionProviderBestEffortEmail(invalidInput),
    ).toThrow(`${field} is required`);
  });

  it("uses the existing Gmail circuit and configured service sender", async () => {
    process.env.SERVICE_TRANSACTION_MAIL_FROM =
      "Pocket Genes <no-reply@pocketgenes.com>";
    const { sendServiceTransactionProviderBestEffortEmail } = await import(
      "../lib/service-transaction-provider-best-effort-email.js"
    );

    await sendServiceTransactionProviderBestEffortEmail(input);

    expect(sendGmailMessageMock).toHaveBeenCalledTimes(1);
    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "provider@example.org",
        subject: "Nueva solicitud de servicio en Pocket Genes",
      }),
      {
        from: "Pocket Genes <no-reply@pocketgenes.com>",
        boundaryPrefix: "pocket-genes-provider-best-effort",
      },
    );
  });

  it("falls back to the authenticated Gmail mailbox with a no-reply display name", async () => {
    const previousGmailUser = process.env.GMAIL_USER;
    process.env.GMAIL_USER = "mailer@example.org";
    try {
      const { sendServiceTransactionProviderBestEffortEmail } = await import(
        "../lib/service-transaction-provider-best-effort-email.js"
      );

      await sendServiceTransactionProviderBestEffortEmail(input);

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

import { createHash } from "node:crypto";

const sendGmailMessageMock = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

describe("service transaction requester confirmation email", () => {
  const input = {
    requesterEmail: "requester@example.org",
    items: [
      {
        serviceName: "Secuenciación de exoma",
        providerName: "Laboratorio Uno",
      },
      {
        serviceName: "Asesoramiento genético",
        providerName: "Centro Dos",
      },
    ],
  };

  beforeEach(() => {
    sendGmailMessageMock.mockReset();
    delete process.env.SERVICE_TRANSACTION_MAIL_FROM;
  });

  it("builds one Spanish summary preserving the supplied service order", async () => {
    const {
      POCKET_GENES_APP_STORE_URL,
      POCKET_GENES_DOWNLOAD_URL,
      buildServiceTransactionRequesterConfirmationEmail,
    } = await import(
      "../lib/service-transaction-requester-confirmation-email.js"
    );

    const message = buildServiceTransactionRequesterConfirmationEmail(input);

    expect(message).toEqual(
      expect.objectContaining({
        to: "requester@example.org",
        subject: "Recibimos tu solicitud de servicios en Pocket Genes",
      }),
    );
    expect(message.text).toContain("Recibimos tu solicitud de 2 servicios");
    expect(message.text).toContain("1. Secuenciación de exoma");
    expect(message.text).toContain("Prestador: Laboratorio Uno");
    expect(message.text).toContain("2. Asesoramiento genético");
    expect(message.text).toContain("Prestador: Centro Dos");
    expect(message.text.indexOf("Secuenciación de exoma")).toBeLessThan(
      message.text.indexOf("Asesoramiento genético"),
    );
    expect(message.text).toContain(
      "iniciá sesión con el mismo email que usaste para hacer la solicitud",
    );
    expect(message.text).toContain(POCKET_GENES_DOWNLOAD_URL);
    expect(message.text).toContain(POCKET_GENES_APP_STORE_URL);

    expect(message.html).toContain("Solicitud recibida");
    expect(message.html).toContain("Secuenciación de exoma");
    expect(message.html).toContain("Laboratorio Uno");
    expect(message.html).toContain("Asesoramiento genético");
    expect(message.html).toContain("Centro Dos");
    expect(message.html).toContain(`href="${POCKET_GENES_DOWNLOAD_URL}"`);
    expect(message.html).toContain(`href="${POCKET_GENES_APP_STORE_URL}"`);
    expect(message.html).toContain(
      'src="cid:pocket-genes-app-store-qr@goldencrowvs.com"',
    );
    expect(message.html.indexOf("Secuenciación de exoma")).toBeLessThan(
      message.html.indexOf("Asesoramiento genético"),
    );

    expect(message.inlineAttachments).toHaveLength(1);
    expect(message.inlineAttachments[0]).toEqual(
      expect.objectContaining({
        contentId: "pocket-genes-app-store-qr@goldencrowvs.com",
        filename: "pocket-genes-app-store-qr.png",
        mimeType: "image/png",
      }),
    );
    const qrBytes = Buffer.from(
      message.inlineAttachments[0]?.contentBase64 ?? "",
      "base64",
    );
    expect(qrBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(qrBytes).toHaveLength(2_022);
    expect(createHash("sha256").update(qrBytes).digest("hex")).toBe(
      "0d30f36884db2676c635fce6304623c0ec5e5e5639b2cc1cce0351da10383651",
    );
  });

  it("uses singular copy for one requested service", async () => {
    const { buildServiceTransactionRequesterConfirmationEmail } = await import(
      "../lib/service-transaction-requester-confirmation-email.js"
    );

    const message = buildServiceTransactionRequesterConfirmationEmail({
      requesterEmail: input.requesterEmail,
      items: [input.items[0]!],
    });

    expect(message.text).toContain("solicitud de 1 servicio");
    expect(message.html).toContain("registramos 1 servicio");
  });

  it("escapes untrusted item values in HTML while retaining readable plain text", async () => {
    const { buildServiceTransactionRequesterConfirmationEmail } = await import(
      "../lib/service-transaction-requester-confirmation-email.js"
    );

    const message = buildServiceTransactionRequesterConfirmationEmail({
      requesterEmail: input.requesterEmail,
      items: [
        {
          serviceName: 'Exoma <script>alert("x")</script>',
          providerName: "Lab & Centro <Uno>",
        },
      ],
    });

    expect(message.html).toContain(
      "Exoma &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(message.html).toContain("Lab &amp; Centro &lt;Uno&gt;");
    expect(message.html).not.toContain("<script>");
    expect(message.text).toContain('Exoma <script>alert("x")</script>');
  });

  it("rejects empty or blank service summaries", async () => {
    const { buildServiceTransactionRequesterConfirmationEmail } = await import(
      "../lib/service-transaction-requester-confirmation-email.js"
    );

    expect(() =>
      buildServiceTransactionRequesterConfirmationEmail({
        requesterEmail: input.requesterEmail,
        items: [],
      }),
    ).toThrow("At least one requested service is required");
    expect(() =>
      buildServiceTransactionRequesterConfirmationEmail({
        requesterEmail: input.requesterEmail,
        items: [{ serviceName: " ", providerName: "Lab" }],
      }),
    ).toThrow("items[0].serviceName is required");
  });

  it("sends through the existing Gmail circuit with the service sender", async () => {
    process.env.SERVICE_TRANSACTION_MAIL_FROM =
      "Pocket Genes <no-reply@pocketgenes.com>";
    const { sendServiceTransactionRequesterConfirmationEmail } = await import(
      "../lib/service-transaction-requester-confirmation-email.js"
    );

    await sendServiceTransactionRequesterConfirmationEmail(input);

    expect(sendGmailMessageMock).toHaveBeenCalledTimes(1);
    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "requester@example.org",
        inlineAttachments: [
          expect.objectContaining({
            contentId: "pocket-genes-app-store-qr@goldencrowvs.com",
            mimeType: "image/png",
          }),
        ],
      }),
      {
        from: "Pocket Genes <no-reply@pocketgenes.com>",
        boundaryPrefix: "pocket-genes-request-confirmation",
      },
    );
  });
});

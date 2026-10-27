import {
  buildRawGmailMessage,
  GmailDeliveryOutcomeUnknownError,
  sendGmailMessage,
} from "../lib/gmail-mailer.js";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

describe("Gmail mailer", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds a plain-text MIME message when html is omitted", () => {
    const raw = buildRawGmailMessage(
      {
        to: "recipient@example.com",
        subject: "Plain CRM note",
        text: "Hola,\n\nMensaje directo.",
      },
      {
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
      },
    );

    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain("Hola,\n\nMensaje directo.");
    expect(decoded).not.toContain("multipart/alternative");
    expect(decoded).not.toContain("text/html");
  });

  it("embeds inline CID images in a multipart related HTML message", () => {
    const contentBase64 = Buffer.from("fixed-png-bytes", "utf8").toString(
      "base64",
    );
    const raw = buildRawGmailMessage(
      {
        to: "recipient@example.com",
        subject: "Pocket Genes request",
        text: "Open the App Store link.",
        html:
          '<p>Scan:</p><img src="cid:app-store-qr@example.com" alt="QR" />',
        inlineAttachments: [
          {
            contentId: "app-store-qr@example.com",
            filename: "app-store-qr.png",
            mimeType: "image/png",
            contentBase64,
          },
        ],
      },
      {
        from: "Pocket Genes <no-reply@pocketgenes.com>",
        boundaryPrefix: "request-confirmation",
      },
    );

    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain(
      'Content-Type: multipart/related; type="multipart/alternative";',
    );
    expect(decoded).toContain("Content-Type: multipart/alternative;");
    expect(decoded).toContain('Content-Type: image/png; name="app-store-qr.png"');
    expect(decoded).toContain("Content-ID: <app-store-qr@example.com>");
    expect(decoded).toContain(
      'Content-Disposition: inline; filename="app-store-qr.png"',
    );
    expect(decoded).toContain('src="cid:app-store-qr@example.com"');
    expect(decoded).toContain(contentBase64);
  });

  it("keeps HTML messages without attachments as multipart alternative", () => {
    const raw = buildRawGmailMessage(
      {
        to: "recipient@example.com",
        subject: "Existing HTML message",
        text: "Plain fallback",
        html: "<p>HTML body</p>",
      },
      {
        from: "Pocket Genes <no-reply@pocketgenes.com>",
        boundaryPrefix: "existing-message",
      },
    );

    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain("Content-Type: multipart/alternative;");
    expect(decoded).not.toContain("multipart/related");
    expect(decoded).toContain("Plain fallback");
    expect(decoded).toContain("<p>HTML body</p>");
  });

  it("rejects inline attachments without HTML or with unsafe MIME metadata", () => {
    const attachment = {
      contentId: "app-store-qr@example.com",
      filename: "app-store-qr.png",
      mimeType: "image/png",
      contentBase64: Buffer.from("png", "utf8").toString("base64"),
    };

    expect(() =>
      buildRawGmailMessage(
        {
          to: "recipient@example.com",
          subject: "No HTML",
          text: "Plain text",
          inlineAttachments: [attachment],
        },
        { from: "Pocket Genes <no-reply@pocketgenes.com>" },
      ),
    ).toThrow("Gmail inline attachments require an HTML message");

    expect(() =>
      buildRawGmailMessage(
        {
          to: "recipient@example.com",
          subject: "Unsafe CID",
          text: "Plain text",
          html: "<p>HTML</p>",
          inlineAttachments: [
            { ...attachment, contentId: "qr>\r\nBcc: unsafe@example.org" },
          ],
        },
        { from: "Pocket Genes <no-reply@pocketgenes.com>" },
      ),
    ).toThrow("Gmail inline attachment contentId is invalid");
  });

  it("appends the Gmail send-as signature to HTML messages before sending", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signature:
              '<div dir="ltr">Federico Bustos Fierro<br>Golden Crow VS</div>',
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "message-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await sendGmailMessage(
      {
        to: "recipient@example.com",
        subject: "CRM note",
        text: "Hola,\n\nMensaje directo.",
        html: "<p>Hola,</p><p>Mensaje directo.</p>",
      },
      {
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        boundaryPrefix: "test-crm",
        appendSendAsSignature: true,
        sendAsEmail: "federico@goldencrowvs.com",
      },
    );

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/federico%40goldencrowvs.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer access-token",
        }),
      }),
    );

    const sendBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[2]?.[1]?.body),
    ) as { raw: string };
    const decoded = decodeBase64Url(sendBody.raw);
    expect(decoded).toContain("<p>Hola,</p><p>Mensaje directo.</p>");
    expect(decoded).toContain("<br><br>");
    expect(decoded).toContain("Federico Bustos Fierro<br>Golden Crow VS");
    expect(decoded).toContain("Hola,\n\nMensaje directo.");
    expect(decoded).toContain("Federico Bustos Fierro\nGolden Crow VS");
  });

  it("uses a fallback signature when Gmail settings cannot read the send-as signature", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "Request had insufficient authentication scopes." },
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "message-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await sendGmailMessage(
      {
        to: "recipient@example.com",
        subject: "CRM note",
        text: "Hola,\n\nMensaje directo.",
        html: "<p>Hola,</p><p>Mensaje directo.</p>",
      },
      {
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        appendSendAsSignature: true,
        sendAsEmail: "federico@goldencrowvs.com",
        fallbackSignatureHtml:
          '<div dir="ltr">Federico Bustos Fierro<br>Golden Crow VS</div>',
      },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "Unable to load Gmail signature for federico@goldencrowvs.com; using fallback signature.",
      expect.any(Error),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    const sendBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[2]?.[1]?.body),
    ) as { raw: string };
    const decoded = decodeBase64Url(sendBody.raw);
    expect(decoded).toContain("<p>Hola,</p><p>Mensaje directo.</p>");
    expect(decoded).toContain("Federico Bustos Fierro<br>Golden Crow VS");
    expect(decoded).toContain("Federico Bustos Fierro\nGolden Crow VS");
  });

  it("uses the canonical fallback without reading a potentially stale Gmail signature", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "message-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await sendGmailMessage(
      {
        to: "recipient@example.com",
        subject: "CRM note",
        text: "Hola.",
        html: "<p>Hola.</p>",
      },
      {
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        appendSendAsSignature: true,
        sendAsEmail: "federico@goldencrowvs.com",
        fallbackSignatureHtml:
          '<div dir="ltr">Federico<br>+54 9 11 2184-6934</div>',
        preferFallbackSignature: true,
      },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/settings/sendAs/"),
      expect.anything(),
    );
    const sendBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[1]?.[1]?.body),
    ) as { raw: string };
    const decoded = decodeBase64Url(sendBody.raw);
    expect(decoded).toContain("+54 9 11 2184-6934");
  });

  it("keeps sending without a signature when Gmail settings fails and no fallback is configured", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "Request had insufficient authentication scopes." },
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "message-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await sendGmailMessage(
      {
        to: "recipient@example.com",
        subject: "CRM note",
        text: "Hola,\n\nMensaje directo.",
        html: "<p>Hola,</p><p>Mensaje directo.</p>",
      },
      {
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        appendSendAsSignature: true,
        sendAsEmail: "federico@goldencrowvs.com",
      },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "Unable to load Gmail signature for federico@goldencrowvs.com; sending without it.",
      expect.any(Error),
    );
    const sendBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[2]?.[1]?.body),
    ) as { raw: string };
    expect(decodeBase64Url(sendBody.raw)).not.toContain("Golden Crow VS");
  });

  it("keeps table-based fallback signatures readable in the plain-text MIME part", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signature: "" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "message-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await sendGmailMessage(
      {
        to: "recipient@example.com",
        subject: "CRM note",
        text: "Hola.",
        html: "<p>Hola.</p>",
      },
      {
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        appendSendAsSignature: true,
        sendAsEmail: "federico@goldencrowvs.com",
        fallbackSignatureHtml:
          "<table><tr><td>Federico Bustos Fierro</td></tr><tr><td>federico@goldencrowvs.com</td></tr></table>",
      },
    );

    const sendBody = JSON.parse(
      String(jest.mocked(fetch).mock.calls[2]?.[1]?.body),
    ) as { raw: string };
    const decoded = decodeBase64Url(sendBody.raw);
    expect(decoded).toContain("Hola.\n\nFederico Bustos Fierro");
    expect(decoded).toContain("federico@goldencrowvs.com");
    expect(decoded).toContain(
      "<table><tr><td>Federico Bustos Fierro</td></tr>",
    );
  });

  it("marks a rejected Gmail send request as an unknown delivery outcome", async () => {
    const transportError = new TypeError("fetch failed");
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(transportError);

    await expect(
      sendGmailMessage(
        {
          to: "recipient@example.com",
          subject: "Pocket Genes request",
          text: "Solicitud recibida.",
        },
        {
          from: "Pocket Genes <no-reply@pocketgenes.com>",
          user: "no-reply@pocketgenes.com",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
        },
      ),
    ).rejects.toMatchObject({
      name: "GmailDeliveryOutcomeUnknownError",
      cause: transportError,
    });
  });

  it("keeps OAuth transport failures as ordinary pre-dispatch errors", async () => {
    const oauthError = new TypeError("OAuth fetch failed");
    jest.mocked(fetch).mockRejectedValueOnce(oauthError);

    try {
      await sendGmailMessage(
        {
          to: "recipient@example.com",
          subject: "Pocket Genes request",
          text: "Solicitud recibida.",
        },
        {
          from: "Pocket Genes <no-reply@pocketgenes.com>",
          user: "no-reply@pocketgenes.com",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
        },
      );
      throw new Error("Expected sendGmailMessage to reject");
    } catch (error) {
      expect(error).toBe(oauthError);
      expect(error).not.toBeInstanceOf(GmailDeliveryOutcomeUnknownError);
    }
  });

  it("keeps explicit Gmail API rejections as confirmed ordinary errors", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Recipient was rejected" } }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    try {
      await sendGmailMessage(
        {
          to: "recipient@example.com",
          subject: "Pocket Genes request",
          text: "Solicitud recibida.",
        },
        {
          from: "Pocket Genes <no-reply@pocketgenes.com>",
          user: "no-reply@pocketgenes.com",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
        },
      );
      throw new Error("Expected sendGmailMessage to reject");
    } catch (error) {
      expect(error).toEqual(new Error("Recipient was rejected"));
      expect(error).not.toBeInstanceOf(GmailDeliveryOutcomeUnknownError);
    }
  });

  it("marks Gmail API server errors as an unknown delivery outcome", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Gmail temporarily unavailable" } }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    try {
      await sendGmailMessage(
        {
          to: "recipient@example.com",
          subject: "Pocket Genes request",
          text: "Solicitud recibida.",
        },
        {
          from: "Pocket Genes <no-reply@pocketgenes.com>",
          user: "no-reply@pocketgenes.com",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
        },
      );
      throw new Error("Expected sendGmailMessage to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(GmailDeliveryOutcomeUnknownError);
      expect((error as Error).cause).toEqual(
        new Error("Gmail temporarily unavailable"),
      );
    }
  });
});

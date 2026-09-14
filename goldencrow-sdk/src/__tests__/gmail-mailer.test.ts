import {
  buildRawGmailMessage,
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
});

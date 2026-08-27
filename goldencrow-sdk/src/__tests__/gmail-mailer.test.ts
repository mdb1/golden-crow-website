import { buildRawGmailMessage } from "../lib/gmail-mailer.js";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

describe("Gmail mailer", () => {
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
});

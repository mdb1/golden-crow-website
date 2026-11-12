jest.mock("../lib/gmail-mailer.js", () => ({
  ...jest.requireActual("../lib/gmail-mailer.js"),
  sendGmailMessage: jest.fn(),
}));

import { buildRawGmailMessage, sendGmailMessage } from "../lib/gmail-mailer.js";
import {
  PARTNER_EMAIL_FROM_EMAIL,
  sendPartnerEmailMessage,
} from "../lib/partner-email-delivery.js";
const mockSendGmailMessage = jest.mocked(sendGmailMessage);

it("always sends the reviewed partner message from Federico using the CRM mailbox credentials", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    MAIL_FROM: "no-reply@example.com",
    GMAIL_USER: "no-reply@example.com",
    CRM_MAIL_FROM: "no-reply@example.com",
    CRM_GMAIL_USER: "no-reply@example.com",
    CRM_GMAIL_CLIENT_ID: "crm-client",
    CRM_GMAIL_CLIENT_SECRET: "crm-secret",
    CRM_GMAIL_REFRESH_TOKEN: "crm-refresh",
    GMAIL_CLIENT_ID: "generic-client",
    GMAIL_CLIENT_SECRET: "generic-secret",
    GMAIL_REFRESH_TOKEN: "generic-refresh",
  });
  try {
    const input = {
      to: "ana@example.com",
      subject: "¡Tu app!",
      text: "Texto revisado",
      html: "<p>Mensaje revisado</p>",
    };
    await sendPartnerEmailMessage(input);
    expect(PARTNER_EMAIL_FROM_EMAIL).toBe("federico@goldencrowvs.com");
    expect(mockSendGmailMessage).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        clientId: "crm-client",
        clientSecret: "crm-secret",
        refreshToken: "crm-refresh",
        appendSendAsSignature: false,
      }),
    );
    const [, options] = mockSendGmailMessage.mock.calls[0]!;
    const mime = Buffer.from(
      buildRawGmailMessage(input, options),
      "base64url",
    ).toString("utf8");
    expect(mime).toContain(
      "From: Federico Bustos Fierro <federico@goldencrowvs.com>\r\n",
    );
    expect(mime).not.toContain("no-reply");
    expect(mime).toContain(input.html);
  } finally {
    for (const name of Object.keys(process.env))
      if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
    mockSendGmailMessage.mockReset();
  }
});

it("uses generic OAuth credentials only as a fallback while keeping the Federico sender and mailbox", async () => {
  const previous = { ...process.env };
  delete process.env.CRM_GMAIL_CLIENT_ID;
  delete process.env.CRM_GMAIL_CLIENT_SECRET;
  delete process.env.CRM_GMAIL_REFRESH_TOKEN;
  Object.assign(process.env, {
    GMAIL_CLIENT_ID: "generic-client",
    GMAIL_CLIENT_SECRET: "generic-secret",
    GMAIL_REFRESH_TOKEN: "generic-refresh",
  });
  try {
    await sendPartnerEmailMessage({
      to: "ana@example.com",
      subject: "App",
      text: "Hello",
    });
    expect(mockSendGmailMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        user: "federico@goldencrowvs.com",
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        clientId: "generic-client",
        clientSecret: "generic-secret",
        refreshToken: "generic-refresh",
      }),
    );
  } finally {
    for (const name of Object.keys(process.env))
      if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
    mockSendGmailMessage.mockReset();
  }
});

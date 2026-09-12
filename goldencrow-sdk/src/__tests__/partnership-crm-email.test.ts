const sendGmailMessageMock = jest.fn();

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

describe("partnership CRM email", () => {
  beforeEach(() => {
    sendGmailMessageMock.mockReset();
  });

  it("builds a plain-text individual outreach message for the Federico sender", async () => {
    const { PARTNERSHIP_CRM_FROM_EMAIL, buildPartnershipCrmEmailMessage } =
      await import("../lib/partnership-crm-email.js");
    const message = buildPartnershipCrmEmailMessage({
      to: "marcelo@medicgen.com",
      subject: "Pocket Genes + MedicGen",
      text: "Hola Marcelo,\n\nPocket Genes < MedicGen.",
    });

    expect(PARTNERSHIP_CRM_FROM_EMAIL).toBe("federico@goldencrowvs.com");
    expect(message).toEqual(
      expect.objectContaining({
        to: "marcelo@medicgen.com",
        subject: "Pocket Genes + MedicGen",
        text: "Hola Marcelo,\n\nPocket Genes < MedicGen.",
      }),
    );
    expect(message).not.toHaveProperty("html");
    expect(JSON.stringify(message)).not.toContain("noreply");
  });

  it("keeps optional CRM email HTML for formatted outreach", async () => {
    const { buildPartnershipCrmEmailMessage } = await import(
      "../lib/partnership-crm-email.js"
    );
    const message = buildPartnershipCrmEmailMessage({
      to: "ada@example.org",
      subject: "Pocket Genes + Ada",
      text: 'Por tu experiencia en "Clinical genetics"',
      html: 'Por tu experiencia en <em>&quot;Clinical genetics&quot;</em>',
    });

    expect(message.html).toBe(
      'Por tu experiencia en <em>&quot;Clinical genetics&quot;</em>',
    );
  });

  it("asks the Gmail mailer to append Federico's send-as signature", async () => {
    const {
      PARTNERSHIP_CRM_FROM_EMAIL,
      PARTNERSHIP_CRM_FROM_HEADER,
      sendPartnershipCrmEmail,
    } = await import("../lib/partnership-crm-email.js");

    await sendPartnershipCrmEmail({
      to: "recipient@example.com",
      subject: "Pocket Genes",
      text: "Hola",
      html: "<p>Hola</p>",
    });

    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      {
        to: "recipient@example.com",
        subject: "Pocket Genes",
        text: "Hola",
        html: "<p>Hola</p>",
      },
      expect.objectContaining({
        from: PARTNERSHIP_CRM_FROM_HEADER,
        user: PARTNERSHIP_CRM_FROM_EMAIL,
        appendSendAsSignature: true,
        sendAsEmail: PARTNERSHIP_CRM_FROM_EMAIL,
      }),
    );
  });
});

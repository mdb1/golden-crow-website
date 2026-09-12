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
      PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML,
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
        fallbackSignatureHtml: PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML,
      }),
    );
  });

  it("uses the rich Golden Crow fallback signature from the signature document", async () => {
    const { PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML } = await import(
      "../lib/partnership-crm-email.js"
    );

    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("Saludos,");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "Golden Crow Venture Studio logo",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "Federico Bustos Fierro",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("Co-founder");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "Golden Crow Venture Studio",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "federico@goldencrowvs.com",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "+54 9 3546 41-8105",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "goldencrowvs.com",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("Pocket Genes");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "Soluciones digitales para gen&oacute;mica y medicina de precisi&oacute;n.",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("#92722e");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("#74389b");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("#ddd6c9");
  });
});

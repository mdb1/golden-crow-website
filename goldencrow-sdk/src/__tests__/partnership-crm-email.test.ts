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

  it("does not let stale signature environment variables override the CRM fallback", async () => {
    const previousGenericSignature = process.env.GMAIL_SIGNATURE_HTML;
    const previousCrmSignature = process.env.CRM_GMAIL_SIGNATURE_HTML;
    process.env.GMAIL_SIGNATURE_HTML = "<div>Wrong generic signature</div>";
    process.env.CRM_GMAIL_SIGNATURE_HTML = "<div>Wrong CRM signature</div>";
    try {
      const {
        PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML,
        sendPartnershipCrmEmail,
      } = await import("../lib/partnership-crm-email.js");

      await sendPartnershipCrmEmail({
        to: "recipient@example.com",
        subject: "Pocket Genes",
        text: "Hola",
      });

      expect(sendGmailMessageMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fallbackSignatureHtml: PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML,
        }),
      );
      expect(sendGmailMessageMock).not.toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fallbackSignatureHtml: "<div>Wrong generic signature</div>",
        }),
      );
      expect(sendGmailMessageMock).not.toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fallbackSignatureHtml: "<div>Wrong CRM signature</div>",
        }),
      );
    } finally {
      if (previousGenericSignature === undefined) {
        delete process.env.GMAIL_SIGNATURE_HTML;
      } else {
        process.env.GMAIL_SIGNATURE_HTML = previousGenericSignature;
      }
      if (previousCrmSignature === undefined) {
        delete process.env.CRM_GMAIL_SIGNATURE_HTML;
      } else {
        process.env.CRM_GMAIL_SIGNATURE_HTML = previousCrmSignature;
      }
    }
  });

  it("uses the rich Golden Crow fallback signature from the signature document", async () => {
    const { PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML } = await import(
      "../lib/partnership-crm-email.js"
    );

    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain("Saludos,");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain(
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
      "+54 9 11 2184-6934",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain(
      "+54 9 3546 41-8105",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "pocketgenes.com",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain(
      ">Pocket Genes<",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "Soluciones digitales para gen&oacute;mica",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "y medicina de precisi&oacute;n.",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("#98712d");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain("#d8c8b3");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "golden-crow-signature-logo.png",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).toContain(
      "golden-crow-signature-email.png",
    );
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain("&#9993;");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain("&#9742;");
    expect(PARTNERSHIP_CRM_FALLBACK_SIGNATURE_HTML).not.toContain("&#9678;");
  });
});

import {
  PARTNERSHIP_CRM_FROM_EMAIL,
  buildPartnershipCrmEmailMessage,
} from "../lib/partnership-crm-email.js";

describe("partnership CRM email", () => {
  it("builds a plain-text individual outreach message for the Federico sender", () => {
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

  it("keeps optional CRM email HTML for formatted outreach", () => {
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
});

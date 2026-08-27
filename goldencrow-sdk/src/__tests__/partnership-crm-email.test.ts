import {
  PARTNERSHIP_CRM_FROM_EMAIL,
  buildPartnershipCrmEmailMessage,
} from "../lib/partnership-crm-email.js";

describe("partnership CRM email", () => {
  it("builds an escaped individual outreach message for the Federico sender", () => {
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
    expect(message.html).toContain("Pocket Genes + MedicGen");
    expect(message.html).toContain("Pocket Genes &lt; MedicGen.");
    expect(message.html).not.toContain("noreply");
  });
});

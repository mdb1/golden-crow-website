import { buildInformedConsentEmailMessage } from "../lib/informed-consent-email.js";

describe("informed consent email", () => {
  it("includes patient credentials and the consent portal link", () => {
    const message = buildInformedConsentEmailMessage(
      {
        id: "PAT-00001",
        email: "patient@example.com",
        fullName: "Paciente Ejemplo",
      },
      "ABCDEFGH",
    );

    expect(message).toEqual(
      expect.objectContaining({
        to: "patient@example.com",
        subject: "Consentimiento informado 2PQ",
      }),
    );
    expect(message.text).toContain("Usuario: patient@example.com");
    expect(message.text).toContain("Contraseña: ABCDEFGH");
    expect(message.text).toContain("/patient-portal/consents");
    expect(message.html).toContain("Usuario: patient@example.com");
    expect(message.html).toContain("Contraseña: ABCDEFGH");
    expect(message.html).toContain("/patient-portal/consents");
  });
});

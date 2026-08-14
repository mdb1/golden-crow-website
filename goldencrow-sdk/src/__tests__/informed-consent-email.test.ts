import { buildInformedConsentEmailMessage } from "../lib/informed-consent-email.js";

describe("informed consent email", () => {
  it("includes the security key and prefilled portal link", () => {
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
    expect(message.text).toContain("Esta es tu clave de seguridad.");
    expect(message.text).toContain("ABCDEFGH");
    expect(message.text).not.toContain("Usuario:");
    expect(message.text).toContain("/patient-portal/login");
    expect(message.text).toContain("email=patient%40example.com");
    expect(message.text).toContain("callbackUrl=%2Fpatient-portal%2Fconsents");
    expect(message.html).toContain("Esta es tu clave de seguridad.");
    expect(message.html).toContain("ABCDEFGH");
    expect(message.html).not.toContain("Usuario:");
    expect(message.html).toContain("/patient-portal/login");
    expect(message.html).toContain("email=patient%40example.com");
    expect(message.html).toContain("callbackUrl=%2Fpatient-portal%2Fconsents");
  });
});

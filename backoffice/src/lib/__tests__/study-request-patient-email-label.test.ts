import { appText } from "@/lib/language";

const WARNING_KEY =
  "Important: credentials to upload the informed consent will be sent to this email address. Verify that it is entered correctly.";

describe("study request patient email wording", () => {
  it("uses the patient email label and exact Spanish consent warning", () => {
    expect(appText("es", "Patient reference email")).toBe(
      "Mail del paciente",
    );
    expect(appText("es", "Patient email")).toBe("Mail del paciente");
    expect(appText("es", WARNING_KEY)).toBe(
      "Importante: a esta dirección de correo se enviarán las credenciales para subir consentimiento informado, verifique que esté correctamente escrito.",
    );
  });
});

import { appText } from "@/lib/language";

const WARNING_KEY =
  "IMPORTANT: THIS MUST BE CORRECT BECAUSE THE CREDENTIALS TO UPLOAD THE INFORMED CONSENT WILL BE SENT TO THIS EMAIL ADDRESS";

describe("study request patient email wording", () => {
  it("uses the patient email label and exact Spanish consent warning", () => {
    expect(appText("es", "Patient reference email")).toBe(
      "Mail del paciente",
    );
    expect(appText("es", "Patient email")).toBe("Mail del paciente");
    expect(appText("es", WARNING_KEY)).toBe(
      "IMPORTANTE: DEBE SER EL CORRECTO YA QUE A ESTA DIRECCION DE CORREO ELECTRONICO SE ENVIARÁN LAS CREDENCIALES PARA SUBIR EL CONSENTIMIENTO INFORMADO",
    );
  });
});

import { buildPublisherPortalInviteEmailMessage } from "../lib/publisher-portal-email.js";

describe("publisher portal email", () => {
  it("includes the access key and prefilled publisher portal link", () => {
    const message = buildPublisherPortalInviteEmailMessage(
      {
        email: "publisher@example.com",
        displayName: "Laboratorio Ejemplo",
      },
      "ABCDEFGH",
    );

    expect(message).toEqual(
      expect.objectContaining({
        to: "publisher@example.com",
        subject:
          "¡Te damos la bienvenida a Pocket Genes! Tu clave de acceso está lista.",
      }),
    );
    expect(message.text).toContain("¡Tu solicitud fue aprobada!");
    expect(message.text).toContain("Te damos la bienvenida a Pocket Genes.");
    expect(message.text).toContain("Tu clave de acceso:");
    expect(message.text).toContain("ABCDEFGH");
    expect(message.text).toContain("/publisher-portal/login");
    expect(message.text).toContain("email=publisher%40example.com");
    expect(message.text).toContain("callbackUrl=%2Fpublisher-portal%2Fhome");
    expect(message.html).toContain("Tu solicitud fue aprobada.");
    expect(message.html).toContain("Clave de acceso");
    expect(message.html).toContain("ABCDEFGH");
    expect(message.html).toContain("/publisher-portal/login");
  });
});

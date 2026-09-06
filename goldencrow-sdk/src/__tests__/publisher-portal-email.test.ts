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
        subject: "Acceso Publisher Portal",
      }),
    );
    expect(message.text).toContain("Esta es tu clave de acceso:");
    expect(message.text).toContain("ABCDEFGH");
    expect(message.text).toContain("/publisher-portal/login");
    expect(message.text).toContain("email=publisher%40example.com");
    expect(message.text).toContain("callbackUrl=%2Fpublisher-portal%2Fhome");
    expect(message.html).toContain("Clave de acceso");
    expect(message.html).toContain("ABCDEFGH");
    expect(message.html).toContain("/publisher-portal/login");
  });
});

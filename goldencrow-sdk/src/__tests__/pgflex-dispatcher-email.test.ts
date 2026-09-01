import {
  buildPGFlexDispatcherInviteEmailMessage,
  buildPGFlexLogisticsAssignmentEmailMessage,
} from "../lib/pgflex-dispatcher-email.js";
import { formatPGFlexReadableDateTime } from "../lib/pgflex-readable-date.js";

describe("PGFlex dispatcher email", () => {
  it("formats PGFlex readable dates with hyphenated date and AM/PM time", () => {
    expect(formatPGFlexReadableDateTime("2026-09-01T02:59:00.000Z")).toBe(
      "01-09-2026-02:59AM",
    );
  });

  it("includes the security key and prefilled PGFlex portal link", () => {
    const message = buildPGFlexDispatcherInviteEmailMessage(
      {
        email: "driver@example.com",
        displayName: "Transportista Ejemplo",
      },
      "ABCDEFGH",
    );

    expect(message).toEqual(
      expect.objectContaining({
        to: "driver@example.com",
        subject: "Acceso PGFlex",
      }),
    );
    expect(message.text).toContain("Esta es tu clave de seguridad:");
    expect(message.text).toContain("ABCDEFGH");
    expect(message.text).toContain("/pgflex/login");
    expect(message.text).toContain("email=driver%40example.com");
    expect(message.text).toContain("callbackUrl=%2Fpgflex%2Flogistics");
    expect(message.html).toContain("Clave de seguridad");
    expect(message.html).toContain("ABCDEFGH");
    expect(message.html).toContain("/pgflex/login");
  });

  it("includes dispatch details and links to the assigned item", () => {
    const message = buildPGFlexLogisticsAssignmentEmailMessage(
      {
        email: "driver@example.com",
        displayName: "Transportista Ejemplo",
      },
      {
        id: "pgflex_123",
        identifier: "ENV-123",
        origin: "Laboratorio",
        destination: "Centro medico",
        timeRequested: "2026-08-31T12:00:00.000Z",
      },
    );

    expect(message).toEqual(
      expect.objectContaining({
        to: "driver@example.com",
        subject: "Nuevo envío PGFlex asignado",
      }),
    );
    expect(message.text).toContain("Identificador: ENV-123");
    expect(message.text).toContain("Origen: Laboratorio");
    expect(message.text).toContain("Destino: Centro medico");
    expect(message.text).toContain("Solicitado: 31-08-2026-12:00PM");
    expect(message.text).not.toContain("Solicitado: 2026-08-31T12:00:00.000Z");
    expect(message.text).toContain("/pgflex/login");
    expect(message.text).toContain(
      "callbackUrl=%2Fpgflex%2Flogistics%2Fpgflex_123",
    );
    expect(message.html).toContain("Nuevo envío asignado");
    expect(message.html).toContain("ENV-123");
    expect(message.html).toContain("31-08-2026-12:00PM");
    expect(message.html).not.toContain("2026-08-31T12:00:00.000Z");
  });
});

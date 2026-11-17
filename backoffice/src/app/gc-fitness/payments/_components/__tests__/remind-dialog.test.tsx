/**
 * @jest-environment jsdom
 */

// remind-dialog.test.tsx
//
// Bug de producción (2026-11-17): la card de Pagos decía «Próximo vencimiento 1 de dic»
// y el recordatorio de WhatsApp «vence el 1 de noviembre». El diálogo armaba el texto una
// sola vez al montar; el padre lo abre con la prop `open` (Radix no llama
// `onOpenChange(true)`), así que después de registrar un pago — que mueve `nextDueCivil`
// y hace `router.refresh()` — el texto seguía con el vencimiento viejo.

import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));

import { RemindDialog } from "../RemindDialog";

function billing(nextDueCivil: string): ClientBillingView {
  return {
    planId: "p1",
    plan: { id: "p1", name: "Hibrido 1", amount: 135000, currency: "ARS", kind: "monthly" },
    nextDueCivil,
  } as unknown as ClientBillingView;
}

function ui(open: boolean, due: string) {
  return (
    <RemindDialog
      clientFirstName="Cami"
      coachName="Ana"
      billing={billing(due)}
      open={open}
      onOpenChange={() => {}}
    />
  );
}

describe("RemindDialog", () => {
  it("usa el vencimiento ACTUAL al abrirse, no el de cuando se montó", () => {
    const { rerender } = render(ui(false, "2026-11-01"));
    // Se registra el pago: el vencimiento pasa a diciembre y la página se refresca.
    rerender(ui(false, "2026-12-01"));
    rerender(ui(true, "2026-12-01"));
    const text = (screen.getByTestId("remind-text") as HTMLTextAreaElement).value;
    expect(text).toContain("vence el 1 de diciembre");
    expect(text).not.toContain("noviembre");
  });

  it("se actualiza si el cobro cambia con el diálogo abierto", () => {
    const { rerender } = render(ui(true, "2026-11-01"));
    expect((screen.getByTestId("remind-text") as HTMLTextAreaElement).value).toContain("1 de noviembre");
    rerender(ui(true, "2026-12-01"));
    expect((screen.getByTestId("remind-text") as HTMLTextAreaElement).value).toContain("1 de diciembre");
  });

  it("vuelve a armar el texto en cada apertura (descarta la edición anterior)", () => {
    const { rerender } = render(ui(true, "2026-12-01"));
    fireEvent.change(screen.getByTestId("remind-text"), { target: { value: "editado a mano" } });
    rerender(ui(false, "2026-12-01"));
    rerender(ui(true, "2026-12-01"));
    // Intl separa «$» del monto con un espacio duro (U+00A0).
    const text = (screen.getByTestId("remind-text") as HTMLTextAreaElement).value.replace(/\u00a0/g, " ");
    expect(text).toBe("Hola Cami! Te recuerdo el pago de $ 135.000 que vence el 1 de diciembre. ¡Gracias! — Ana");
  });
});

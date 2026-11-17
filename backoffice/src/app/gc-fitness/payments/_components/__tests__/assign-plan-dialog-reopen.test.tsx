/**
 * @jest-environment jsdom
 */

// assign-plan-dialog-reopen.test.tsx
//
// Mismo bug que remind-dialog.test.tsx, con consecuencia peor: el formulario de «Cambiar
// plan» se armaba al montar, así que después de «Registrar pago» (que mueve `nextDueCivil`
// al mes siguiente y refresca la página) traía el vencimiento VIEJO — y guardar lo volvía
// a escribir, dejando al alumno «vencido».

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";

import type { ClientBillingView, PaymentPlan } from "@/lib/gc-fitness/payments-model";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/gc-fitness/payments-actions", () => ({
  assignClientPlan: jest.fn(),
  updateClientBilling: jest.fn(),
}));

import { AssignPlanDialog } from "../AssignPlanDialog";

const plan = {
  id: "p1",
  name: "Hibrido 1",
  kind: "monthly",
  amount: 135000,
  currency: "ARS",
  archived: false,
} as unknown as PaymentPlan;

function billing(nextDueCivil: string): ClientBillingView {
  return {
    planId: "p1",
    plan,
    startCivil: "2026-10-01",
    amount: null,
    reminderDaysBefore: 3,
    nextDueCivil,
    classesRemaining: null,
  } as unknown as ClientBillingView;
}

function ui(open: boolean, due: string) {
  return (
    <AssignPlanDialog
      clientId="c1"
      clientName="Cami"
      billing={billing(due)}
      plans={[plan]}
      todayCivil="2026-11-17"
      open={open}
      onOpenChange={() => {}}
    />
  );
}

describe("AssignPlanDialog", () => {
  it("al abrirse trae el vencimiento ACTUAL, no el de cuando se montó", () => {
    const { rerender } = render(ui(false, "2026-11-01"));
    rerender(ui(false, "2026-12-01")); // se registró el pago + router.refresh()
    rerender(ui(true, "2026-12-01"));
    expect(document.getElementById("assign-next-due")).toHaveValue("2026-12-01");
    expect(screen.getByTestId("assign-plan-dialog")).toBeInTheDocument();
  });
});

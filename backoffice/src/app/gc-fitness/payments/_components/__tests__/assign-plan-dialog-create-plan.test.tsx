/**
 * @jest-environment jsdom
 */

// assign-plan-dialog-create-plan.test.tsx — golden-crow-website#535
//
// «Asignar plan» sin planes era un callejón: «Sin plan» + «Todavía no creaste planes.» y un
// botón «Asignar plan» que no hacía nada útil. Ahora el diálogo ofrece crear el plan ahí
// mismo (queda elegido), «+ Nuevo plan» al final de la lista cuando ya hay, y el botón
// principal no puede parecer útil cuando no cambia nada.

import "@testing-library/jest-dom";

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ClientBillingView, PaymentPlan } from "@/lib/gc-fitness/payments-model";
import { chooseFormSelectValue, formSelectValues, openFormSelect, closeFormSelect } from "@/lib/test-utils/form-select";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/gc-fitness/payments-actions", () => ({
  assignClientPlan: jest.fn(),
  updateClientBilling: jest.fn(),
  savePaymentPlan: jest.fn(),
}));

import { assignClientPlan, savePaymentPlan } from "@/lib/gc-fitness/payments-actions";
import { AssignPlanDialog } from "../AssignPlanDialog";

const mockSave = savePaymentPlan as jest.Mock;
const mockAssign = assignClientPlan as jest.Mock;

const plan = {
  id: "p1",
  name: "Hibrido 1",
  kind: "monthly",
  modality: null,
  amount: 135000,
  currency: "ARS",
  periodMonths: 1,
  classCount: null,
  description: null,
  archived: false,
} as PaymentPlan;

function ui(plans: PaymentPlan[], billing: ClientBillingView | null = null) {
  return (
    <AssignPlanDialog
      clientId="c1"
      clientName="Cami"
      billing={billing}
      plans={plans}
      todayCivil="2026-11-17"
      open
      onOpenChange={() => {}}
    />
  );
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockSave.mockReset();
  mockAssign.mockReset();
});

describe("AssignPlanDialog — crear un plan sin salir (#535)", () => {
  it("sin planes: ofrece «Crear plan» y el botón de asignar queda deshabilitado", () => {
    render(ui([]));
    expect(screen.getByTestId("assign-plan-empty")).toHaveTextContent(/haven't created any plans/);
    expect(screen.getByTestId("assign-plan-create")).toHaveTextContent(/^Create plan$/);
    expect(screen.getByTestId("assign-plan-submit")).toBeDisabled();
  });

  it("crear el plan ahí lo deja elegido y asignar manda su id", async () => {
    mockSave.mockResolvedValue({ ok: true, id: "new-plan" });
    mockAssign.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(ui([]));

    await user.click(screen.getByTestId("assign-plan-create"));
    const form = await screen.findByTestId("plan-form-dialog");
    await user.type(within(form).getByLabelText("Plan name"), "Online mensual");
    await user.type(within(form).getByLabelText("Amount"), "50000");
    await user.click(within(form).getByTestId("plan-form-submit"));
    await flush();

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, name: "Online mensual", kind: "monthly", amount: 50000 }),
    );
    // El plan nuevo quedó elegido: aparecen los campos del plan y el botón se habilita.
    expect(document.getElementById("assign-plan")).toHaveAttribute("data-value", "new-plan");
    expect(screen.queryByTestId("assign-plan-empty")).not.toBeInTheDocument();
    const submit = screen.getByTestId("assign-plan-submit");
    expect(submit).toBeEnabled();

    await user.click(submit);
    await flush();
    expect(mockAssign).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1", planId: "new-plan" }));
  });

  it("con planes: «+ Nuevo plan» va al final de la lista y abre el formulario", async () => {
    const user = userEvent.setup();
    render(ui([plan]));
    const trigger = document.getElementById("assign-plan")!;
    const listbox = await openFormSelect(user, trigger);
    expect(formSelectValues(listbox)).toEqual(["", "p1", "__new_plan__"]);
    await closeFormSelect(user);

    await chooseFormSelectValue(user, trigger, "__new_plan__");
    expect(await screen.findByTestId("plan-form-dialog")).toBeInTheDocument();
    // Elegir «+ Nuevo plan» no cambia la selección del cliente.
    expect(trigger).not.toHaveAttribute("data-value", "__new_plan__");
  });

  it("«Sin plan» sobre un cliente que TIENE plan se lee «Quitar plan»", async () => {
    const user = userEvent.setup();
    const billing = { planId: "p1", plan, startCivil: "2026-10-01", amount: null, reminderDaysBefore: 3, nextDueCivil: "2026-12-01", classesRemaining: null } as unknown as ClientBillingView;
    render(ui([plan], billing));
    expect(screen.getByTestId("assign-plan-submit")).toHaveTextContent(/^Change plan$/);
    await chooseFormSelectValue(user, document.getElementById("assign-plan")!, "");
    const submit = screen.getByTestId("assign-plan-submit");
    expect(submit).toHaveTextContent(/^Remove plan$/);
    expect(submit).toBeEnabled();
  });
});

/**
 * @jest-environment jsdom
 */

// payments-ui.test.tsx — gc-fitness #1540, UI del coach para pagos.
//
// Asierta el PAYLOAD que la UI le pasa a las Server Actions (lo que leen las dos apps),
// no los píxeles: el monto/qué-cubre prellenados desde el plan, el void con confirmación,
// y que el tablero ordene y cuente por estado.

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const recordClientPayment = jest.fn().mockResolvedValue({ ok: true, id: "pay-1" });
const voidClientPayment = jest.fn().mockResolvedValue({ ok: true, revertedBilling: true });
const listClientPayments = jest.fn();
const listClientPaymentsForExport = jest.fn().mockResolvedValue([]);
const assignClientPlan = jest.fn().mockResolvedValue({ ok: true });
const routerRefresh = jest.fn();

jest.mock("@/lib/gc-fitness/payments-actions", () => ({
  recordClientPayment: (input: unknown) => recordClientPayment(input),
  voidClientPayment: (input: unknown) => voidClientPayment(input),
  listClientPayments: (input: unknown) => listClientPayments(input),
  listClientPaymentsForExport: (input: unknown) => listClientPaymentsForExport(input),
  assignClientPlan: (input: unknown) => assignClientPlan(input),
  updateClientBilling: jest.fn().mockResolvedValue({ ok: true }),
  consumeClientClass: jest.fn().mockResolvedValue({ ok: true, classesRemaining: 0 }),
  savePaymentPlan: jest.fn().mockResolvedValue({ ok: true, id: "p" }),
  setPaymentPlanArchived: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: routerRefresh }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import type { ClientBillingView, ClientPaymentView, PaymentPlan } from "@/lib/gc-fitness/payments-model";

import { CollectionsTab } from "../_components/CollectionsTab";
import { PaymentHistory } from "../_components/PaymentHistory";
import { RecordPaymentDialog } from "../_components/RecordPaymentDialog";
import type { CollectionRow } from "../_components/types";

const monthly = {
  name: "Mensual online",
  kind: "monthly" as const,
  modality: "online" as const,
  amount: 25000,
  currency: "ARS",
  periodMonths: 1,
  classCount: null,
  description: null,
};

const billing = (over: Partial<ClientBillingView> = {}): ClientBillingView => ({
  clientId: "client-1",
  planId: "plan-1",
  plan: monthly,
  amount: null,
  startCivil: "2026-10-10",
  nextDueCivil: "2026-11-10",
  classesRemaining: null,
  reminderDaysBefore: 3,
  lastPaymentCivil: null,
  lastPaymentAmount: null,
  ...over,
});

const plans: PaymentPlan[] = [{ id: "plan-1", archived: false, ...monthly }];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RecordPaymentDialog", () => {
  it("prellena monto y qué cubre desde el plan: un toque registra 1 mes", async () => {
    render(
      <RecordPaymentDialog
        clientId="client-1"
        clientName="Juan Pérez"
        billing={billing({ amount: 20000 })}
        todayCivil="2026-11-11"
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Amount")).toHaveValue("20000");
    await userEvent.click(screen.getByTestId("payment-method-cash"));
    await userEvent.click(screen.getByTestId("record-payment-submit"));
    await waitFor(() => expect(recordClientPayment).toHaveBeenCalledTimes(1));
    expect(recordClientPayment).toHaveBeenCalledWith({
      clientId: "client-1",
      amount: 20000,
      currency: "ARS",
      paidCivil: "2026-11-11",
      method: "cash",
      methodNote: "",
      covers: { kind: "months", months: 1, classes: null },
      note: "",
      requestId: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/),
    });
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("#487: reintentar tras un error reusa la MISMA clave de idempotencia", async () => {
    (recordClientPayment as jest.Mock)
      .mockResolvedValueOnce({ ok: false, error: "network" })
      .mockResolvedValueOnce({ ok: true, id: "p1" });
    render(
      <RecordPaymentDialog
        clientId="client-1"
        clientName="Juan Pérez"
        billing={billing({ amount: 20000 })}
        todayCivil="2026-11-11"
        open
        onOpenChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByTestId("payment-method-cash"));
    await userEvent.click(screen.getByTestId("record-payment-submit"));
    await waitFor(() => expect(recordClientPayment).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByTestId("record-payment-submit"));
    await waitFor(() => expect(recordClientPayment).toHaveBeenCalledTimes(2));
    const keys = (recordClientPayment as jest.Mock).mock.calls.map(([arg]) => arg.requestId);
    expect(keys[0]).toEqual(expect.any(String));
    expect(keys[1]).toBe(keys[0]);
  });

  it("un pack de clases prellena classCount y acepta «25.000» como veinticinco mil", async () => {
    render(
      <RecordPaymentDialog
        clientId="client-1"
        clientName="Juan"
        billing={billing({
          planId: "plan-pack",
          plan: { ...monthly, kind: "class_pack", periodMonths: null, classCount: 8 },
          nextDueCivil: null,
          classesRemaining: 0,
        })}
        todayCivil="2026-11-11"
        open
        onOpenChange={() => {}}
      />,
    );
    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "25.000");
    await userEvent.click(screen.getByTestId("record-payment-submit"));
    await waitFor(() => expect(recordClientPayment).toHaveBeenCalledTimes(1));
    expect(recordClientPayment.mock.calls[0][0]).toMatchObject({
      amount: 25000,
      covers: { kind: "classes", months: null, classes: 8 },
    });
  });

  it("muestra el error que devuelve la action y no cierra", async () => {
    recordClientPayment.mockResolvedValueOnce({ ok: false, error: "The amount must be greater than zero." });
    const onOpenChange = jest.fn();
    render(
      <RecordPaymentDialog
        clientId="client-1"
        clientName="Juan"
        billing={null}
        todayCivil="2026-11-11"
        open
        onOpenChange={onOpenChange}
      />,
    );
    await userEvent.click(screen.getByTestId("record-payment-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The amount must be greater than zero.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("CollectionsTab", () => {
  const rows: CollectionRow[] = [
    { clientId: "a", name: "Ana", firstName: "Ana", billing: billing({ nextDueCivil: "2026-12-30" }), status: { state: "up_to_date", days: 49 } },
    { clientId: "b", name: "Beto", firstName: "Beto", billing: null, status: { state: "none", days: 0 } },
    { clientId: "c", name: "Caro", firstName: "Caro", billing: billing({ nextDueCivil: "2026-11-07" }), status: { state: "overdue", days: 4 } },
    { clientId: "d", name: "Dani", firstName: "Dani", billing: billing({ nextDueCivil: "2026-11-13" }), status: { state: "due_soon", days: 2 } },
  ];

  it("cuenta por estado, ordena por urgencia y filtra con los contadores", async () => {
    render(
      <CollectionsTab rows={rows} plans={plans} collected={[{ currency: "ARS", amount: 50000 }]} coachName="Ana" todayCivil="2026-11-11" />,
    );
    expect(screen.getByTestId("payments-counter-overdue")).toHaveTextContent("1");
    expect(screen.getByTestId("payments-counter-none")).toHaveTextContent("1");
    const order = screen.getAllByTestId(/^payments-row-/).map((r) => r.getAttribute("data-testid"));
    expect(order).toEqual(["payments-row-c", "payments-row-d", "payments-row-b", "payments-row-a"]);
    expect(within(screen.getByTestId("payments-row-c")).getByTestId("payment-status-chip")).toHaveAttribute(
      "data-state",
      "overdue",
    );
    expect(screen.getByTestId("payments-row-c")).toHaveTextContent("4 days overdue");

    await userEvent.click(screen.getByTestId("payments-counter-due_soon"));
    expect(screen.getAllByTestId(/^payments-row-/)).toHaveLength(1);
    expect(screen.getByTestId("payments-row-d")).toHaveTextContent("Due in 2 days");
  });
});

describe("PaymentHistory", () => {
  const p = (over: Partial<ClientPaymentView>): ClientPaymentView => ({
    id: "p1",
    clientId: "client-1",
    amount: 25000,
    currency: "ARS",
    paidCivil: "2026-11-11",
    method: "transfer",
    methodNote: null,
    covers: { kind: "months", months: 1, classes: null },
    planName: "Mensual online",
    note: null,
    createdAt: null,
    voidedAt: null,
    voidReason: null,
    ...over,
  });

  it("anula con confirmación y deja la fila como «Voided»", async () => {
    render(
      <PaymentHistory
        initialPage={{ payments: [p({ id: "p1" }), p({ id: "p0", voidedAt: "2026-11-01T00:00:00.000Z" })], nextCursor: null }}
        clients={[{ id: "client-1", name: "Juan" }]}
      />,
    );
    expect(within(screen.getByTestId("payment-row-p0")).getByText("Voided")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("void-payment-p1"));
    expect(screen.getByText("Void this payment? It stays in the history as voided.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Reason (optional)"), "duplicado");
    await userEvent.click(screen.getByTestId("void-payment-confirm"));
    await waitFor(() => expect(voidClientPayment).toHaveBeenCalledWith({ paymentId: "p1", reason: "duplicado" }));
    await waitFor(() => expect(within(screen.getByTestId("payment-row-p1")).getByText("Voided")).toBeInTheDocument());
  });

  it("filtrar por medio vuelve a pedir la primera página con el filtro", async () => {
    listClientPayments.mockResolvedValueOnce({ payments: [], nextCursor: null });
    render(<PaymentHistory initialPage={{ payments: [p({})], nextCursor: "2026-11-01" }} clients={[]} fixedClientId="client-1" />);
    await userEvent.selectOptions(screen.getByTestId("payments-method-filter"), "cash");
    await waitFor(() =>
      expect(listClientPayments).toHaveBeenCalledWith({ clientId: "client-1", month: null, method: "cash", cursor: null }),
    );
    expect(await screen.findByTestId("payments-empty")).toHaveTextContent("No payments recorded yet");
  });
});

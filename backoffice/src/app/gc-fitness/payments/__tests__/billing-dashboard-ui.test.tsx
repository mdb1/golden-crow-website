/**
 * @jest-environment jsdom
 */

// billing-dashboard-ui.test.tsx — gc-fitness #1695, pestaña «Tablero» de /payments.
//
// La fixture es el escenario «mezcla» de la tabla gemela (billing-dashboard-vectors.json): el
// tablero que recibe la UI lo calcula el MISMO `computeBillingDashboard` que corren las apps,
// con su `today` fijo (nunca el reloj de la máquina). Se asierta:
//   - que las tarjetas muestran los números del tablero (moneda principal, nunca sumada con
//     otra; la otra va en «Also: …»);
//   - la proyección por horizonte (3 → 12) y su línea de explicación;
//   - los gráficos por sus tablas de lectura (Recharts no monta en jsdom, README);
//   - el PAYLOAD del CSV: lo filtrado por plan, con las columnas de `buildPaymentsCsv`.

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getBillingDashboardData = jest.fn();
jest.mock("@/lib/gc-fitness/billing-dashboard-actions", () => ({
  getBillingDashboardData: () => getBillingDashboardData(),
}));

// #1696 — the Corvo card at the bottom of the tab (its own suite: billing-ai-card.test.tsx).
jest.mock("@/lib/gc-fitness/billing-ai-actions", () => ({
  getBillingAIState: jest.fn(async () => ({ ok: false, error: "generic" })),
  runBillingAI: jest.fn(),
}));

const downloadCsv = jest.fn();
jest.mock("../_components/dashboard-format", () => {
  const actual = jest.requireActual("../_components/dashboard-format");
  return { ...actual, downloadCsv: (csv: string, name: string) => downloadCsv(csv, name) };
});

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { formatBillingAmount, type PaymentCovers, type PaymentMethod } from "@/lib/gc-fitness/billing";
import { computeBillingDashboard, type DashboardBilling } from "@/lib/gc-fitness/billing-dashboard";
import type { BillingDashboardData } from "@/lib/gc-fitness/billing-dashboard-actions";
import vectors from "@/lib/gc-fitness/__tests__/twin-vectors/billing-dashboard-vectors.json";
import type { ClientPaymentView } from "@/lib/gc-fitness/payments-model";
import { chooseFormSelectValue } from "@/lib/test-utils/form-select";

import { DashboardTab } from "../_components/DashboardTab";

interface VPayment {
  id: string;
  clientId: string;
  amount: number;
  currency: string;
  paidCivil: string;
  method: string;
  methodNote: string | null;
  covers: PaymentCovers;
  planName: string | null;
  note: string | null;
  voided: boolean;
}

const scenario = (vectors as unknown as {
  dashboard: { name: string; today: string; payments: VPayment[]; billings: DashboardBilling[] }[];
}).dashboard.find((s) => s.name.startsWith("mezcla"))!;

const payments: ClientPaymentView[] = scenario.payments.map((p) => ({
  id: p.id,
  clientId: p.clientId,
  amount: p.amount,
  currency: p.currency,
  paidCivil: p.paidCivil,
  method: p.method as PaymentMethod,
  methodNote: p.methodNote,
  covers: p.covers,
  planName: p.planName,
  note: p.note,
  createdAt: null,
  voidedAt: p.voided ? "2026-11-11T12:00:00.000Z" : null,
  voidReason: null,
}));

const data: BillingDashboardData = {
  todayCivil: scenario.today,
  dashboard: computeBillingDashboard(payments, scenario.billings, scenario.today),
  payments,
  clients: [
    { id: "ana", name: "Ana Pérez" },
    { id: "eli", name: "Eli" },
    { id: "hugo", name: "Hugo" },
  ],
  truncated: false,
};

// Intl separates the code with a NO-BREAK space; toHaveTextContent collapses it to a space.
const plain = (s: string) => s.replace(/\s/g, " ");
const ars = (n: number) => plain(formatBillingAmount("en", n, "ARS"));

beforeEach(() => {
  jest.clearAllMocks();
  getBillingDashboardData.mockResolvedValue({ ok: true, data });
});

describe("DashboardTab (#1695)", () => {
  it("shows the KPI tiles of the primary currency and the other currency apart", async () => {
    render(<DashboardTab />);
    await screen.findByTestId("billing-dashboard");

    // Nov 2026 of the vector: ARS 120,000 collected (the voided 5,000 does not count) vs 115,000.
    expect(screen.getByTestId("billing-dashboard-collected-value")).toHaveTextContent(ars(120000));
    expect(screen.getByTestId("billing-dashboard-collected-detail")).toHaveTextContent("+4% vs. last month");
    expect(screen.getByTestId("billing-dashboard-mrr-value")).toHaveTextContent(ars(98000));
    expect(screen.getByTestId("billing-dashboard-mrr-detail")).toHaveTextContent("5 clients on an active plan");
    expect(screen.getByTestId("billing-dashboard-paying-value")).toHaveTextContent("5");
    expect(screen.getByTestId("billing-dashboard-paying-detail")).toHaveTextContent("New: 1 · Dropped: 0");
    expect(screen.getByTestId("billing-dashboard-avg-ticket-value")).toHaveTextContent(ars(30000));
    // USD is never added to ARS.
    expect(screen.getByTestId("billing-dashboard-other-currencies")).toHaveTextContent(
      `Also: ${plain(formatBillingAmount("en", 100, "USD"))}`,
    );
    expect(screen.getByTestId("billing-dashboard-status-overdue")).toHaveTextContent("3");
    expect(screen.getByTestId("billing-dashboard-status-due_soon")).toHaveTextContent("1");
    expect(screen.getByTestId("billing-dashboard-status-up_to_date")).toHaveTextContent("6");
  });

  it("switches the projection horizon and explains it in one line", async () => {
    const user = userEvent.setup();
    render(<DashboardTab />);
    await screen.findByTestId("billing-dashboard");

    const ars3 = data.dashboard.projections.find((p) => p.currency === "ARS")!.horizons;
    expect(screen.getByTestId("billing-dashboard-projection-expected")).toHaveTextContent(ars(ars3[0].expected));
    expect(screen.getByTestId("billing-dashboard-projection-range")).toHaveTextContent(
      `Between ${ars(ars3[0].pessimistic)} and ${ars(ars3[0].optimistic)}`,
    );
    await user.click(screen.getByTestId("billing-dashboard-horizon-12"));
    expect(screen.getByTestId("billing-dashboard-horizon-12")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("billing-dashboard-projection-expected")).toHaveTextContent(ars(ars3[2].expected));
    expect(screen.getByTestId("billing-dashboard-projection-explainer")).toHaveTextContent(
      `Based on your active plans (${ars(98000)} a month), losing 7.7% of clients a month`,
    );
  });

  it("feeds both charts from the 12-month series (read through their tables)", async () => {
    render(<DashboardTab />);
    await screen.findByTestId("billing-dashboard");
    const collected = within(screen.getByTestId("billing-dashboard-chart-collected-table")).getAllByRole("row");
    expect(collected).toHaveLength(12);
    expect(collected[11]).toHaveAttribute("data-month", "2026-11");
    expect(collected[11]).toHaveTextContent(ars(120000));
    const clients = screen.getByTestId("billing-dashboard-chart-clients-table");
    const aug = clients.querySelector('tr[data-month="2026-08"]')!;
    // Aug 2026: Eli comes back (new) and Beto drops (30 days past his July due date).
    expect(within(aug as HTMLElement).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "1"]);
  });

  it("exports what the billing filters keep, with the history's CSV columns", async () => {
    const user = userEvent.setup();
    render(<DashboardTab />);
    await screen.findByTestId("billing-ledger");

    await chooseFormSelectValue(user, screen.getByTestId("billing-filter-plan"), "Pack 3");
    expect(screen.getAllByTestId(/^billing-row-/)).toHaveLength(4);
    expect(screen.getByTestId("billing-total")).toHaveTextContent(ars(240000));

    await user.click(screen.getByTestId("billing-export-csv"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [csv, name] = downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("cobros-2026-11-18.csv");
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Client,Amount,Currency,Payment method,Method details,Covers,Plan,Note,Status");
    expect(lines).toHaveLength(5);
    expect(lines.slice(1).map((l) => l.split(",")[0])).toEqual(["2026-10-15", "2026-07-20", "2026-04-14", "2026-01-15"]);
    expect(lines[1]).toContain(",60000,ARS,");
    expect(lines[1]).toContain(",Pack 3,");
  });

  it("filters by method and keeps a voided payment visible but out of the total", async () => {
    const user = userEvent.setup();
    render(<DashboardTab />);
    await screen.findByTestId("billing-ledger");
    await chooseFormSelectValue(user, screen.getByTestId("billing-filter-client"), "ana");
    await chooseFormSelectValue(user, screen.getByTestId("billing-filter-method"), "cash");
    const rows = screen.getAllByTestId(/^billing-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Voided");
    expect(screen.getByTestId("billing-total")).toHaveTextContent("—");
  });

  it("returns its failure instead of throwing, and retries", async () => {
    getBillingDashboardData.mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    const user = userEvent.setup();
    render(<DashboardTab />);
    await screen.findByTestId("billing-dashboard-error");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("billing-dashboard")).toBeInTheDocument());
    expect(getBillingDashboardData).toHaveBeenCalledTimes(2);
  });
});

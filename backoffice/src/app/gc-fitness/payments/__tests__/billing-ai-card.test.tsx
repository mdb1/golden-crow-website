/**
 * @jest-environment jsdom
 */

// billing-ai-card.test.tsx — gc-fitness #1696, «Análisis con Corvo» al pie del Tablero.
//
// Pinned:
//   • the buttons hand `runBillingAI` the right kind and show the quota left («N of M»);
//   • an exhausted quota disables its button; a quota error shows the copy + the server quota;
//   • the analysis renders summary / Risks / What to do;
//   • the «Imagen del mes» MODEL (what the shared share-card renderer rasterizes): Corvo's words,
//     but the NUMBERS from this dashboard (`statValue`), formatted like the apps' card.
// html-to-image cannot rasterize in jsdom (no canvas, README → jsdom gaps): the PNG itself is
// checked by eye, not here. The test reads the model through the preview and the hidden node.

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockState = jest.fn();
const mockRun = jest.fn();
jest.mock("@/lib/gc-fitness/billing-ai-actions", () => ({
  getBillingAIState: () => mockState(),
  runBillingAI: (input: unknown) => mockRun(input),
}));
jest.mock("html-to-image", () => ({ toPng: jest.fn(async () => "data:image/png;base64,AAAA") }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import type { PaymentCovers } from "@/lib/gc-fitness/billing";
import { statValue, type BillingAIQuota } from "@/lib/gc-fitness/billing-ai";
import { computeBillingDashboard, type DashboardBilling, type DashboardPayment } from "@/lib/gc-fitness/billing-dashboard";
import { buildBillingMonthShareModel, formatCardStat, monthTitle } from "@/lib/gc-fitness/billing-month-share";
import vectors from "@/lib/gc-fitness/__tests__/twin-vectors/billing-dashboard-vectors.json";

import { BillingAICard } from "../_components/BillingAICard";

const scenario = (vectors as unknown as {
  dashboard: {
    name: string;
    today: string;
    payments: Array<DashboardPayment & { voided: boolean; covers: PaymentCovers }>;
    billings: DashboardBilling[];
  }[];
}).dashboard.find((s) => s.name.startsWith("mezcla"))!;
const dashboard = computeBillingDashboard(
  scenario.payments.map((p) => ({ ...p, voidedAt: p.voided ? "2026-11-11T00:00:00.000Z" : null })),
  scenario.billings,
  scenario.today,
);

const quota = (a: number, c: number): BillingAIQuota => ({
  month: "2026-11",
  analysis: { limit: 5, used: a, remaining: 5 - a },
  card: { limit: 5, used: c, remaining: 5 - c },
});
const plain = (s: string) => s.replace(/\s/g, " ");

beforeEach(() => {
  jest.clearAllMocks();
  mockState.mockResolvedValue({ ok: true, month: "2026-11", coachName: "Ana Coach", analysis: null, card: null, quota: quota(1, 0) });
});

describe("BillingAICard (#1696)", () => {
  it("shows the disclosure and the quota left, and analyzes on click", async () => {
    mockRun.mockResolvedValue({
      ok: true,
      kind: "analysis",
      month: "2026-11",
      analysis: { summary: "Noviembre viene mejor.", risks: ["3 vencidos"], actions: ["Cobrá a Beto"], generatedAtISO: null },
      card: null,
      quota: quota(2, 0),
    });
    const user = userEvent.setup();
    render(<BillingAICard dashboard={dashboard} />);
    expect(await screen.findByTestId("billing-ai-analysis-remaining")).toHaveTextContent("4 of 5 left this month");
    expect(screen.getByTestId("billing-ai-disclosure")).toHaveTextContent("no client names");

    await user.click(screen.getByTestId("billing-ai-analyze"));
    expect(mockRun).toHaveBeenCalledWith({ kind: "analysis" });
    await screen.findByTestId("billing-ai-analysis");
    expect(screen.getByTestId("billing-ai-analysis")).toHaveTextContent("Noviembre viene mejor.");
    expect(within(screen.getByTestId("billing-ai-risks")).getByText("3 vencidos")).toBeInTheDocument();
    expect(within(screen.getByTestId("billing-ai-actions")).getByText("Cobrá a Beto")).toBeInTheDocument();
    expect(screen.getByTestId("billing-ai-analysis-remaining")).toHaveTextContent("3 of 5 left this month");
  });

  it("disables an exhausted kind and shows the quota error with the server's quota", async () => {
    mockState.mockResolvedValue({ ok: true, month: "2026-11", coachName: "", analysis: null, card: null, quota: quota(5, 4) });
    mockRun.mockResolvedValue({ ok: false, error: "quota", quota: quota(5, 5) });
    const user = userEvent.setup();
    render(<BillingAICard dashboard={dashboard} />);
    expect(await screen.findByTestId("billing-ai-analyze")).toBeDisabled();

    await user.click(screen.getByTestId("billing-ai-card"));
    expect(mockRun).toHaveBeenCalledWith({ kind: "card" });
    expect(await screen.findByTestId("billing-ai-card-error")).toHaveTextContent("used them all this month");
    expect(screen.getByTestId("billing-ai-card-remaining")).toHaveTextContent("0 of 5 left this month");
    expect(screen.getByTestId("billing-ai-card")).toBeDisabled();
  });

  it("draws the stored month card with THIS dashboard's numbers", async () => {
    mockState.mockResolvedValue({
      ok: true,
      month: "2026-11",
      coachName: "Ana Coach",
      analysis: null,
      // Corvo only picks the keys; there is no number in the stored card.
      card: { headline: "Mes firme", stats: ["collected", "collectedDelta", "churned"], recommendation: "Cobrá los 3 vencidos.", generatedAtISO: null },
      quota: quota(0, 1),
    });
    render(<BillingAICard dashboard={dashboard} />);
    const preview = await screen.findByTestId("billing-ai-card-preview");
    expect(preview).toHaveTextContent("My month · November 2026");
    expect(preview).toHaveTextContent("Mes firme");
    const stats = within(preview).getAllByTestId("billing-ai-card-stat").map((s) => plain(s.textContent ?? ""));
    // Nov 2026 of the vector: ARS 120,000, +4 % vs October (115,000), 0 dropped this month.
    expect(stats).toEqual(["ARS 120,000Collected", "+4%vs. last month", "0Dropped"]);
    expect(preview).toHaveTextContent("Corvo's recommendation: Cobrá los 3 vencidos.");
    // The shared renderer's download button is there (same pipeline as the workout card).
    expect(within(preview).getByRole("button", { name: /download image/i })).toBeInTheDocument();
  });

  it("shows the load error as copy, never a raw message", async () => {
    mockState.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<BillingAICard dashboard={dashboard} />);
    expect(await screen.findByTestId("billing-ai-load-error")).toHaveTextContent("Your account can't use this feature.");
  });
});

describe("billing month share model (#1696)", () => {
  it("formats stats like the apps' card", () => {
    expect(plain(formatCardStat({ kind: "money", value: 120000.4, currency: "ARS" }, "es"))).toBe("$ 120.000");
    expect(plain(formatCardStat({ kind: "money", value: 1_234_567, currency: "ARS" }, "es"))).toBe("$ 1,2 M");
    expect(formatCardStat({ kind: "count", value: 7 }, "es")).toBe("7");
    expect(plain(formatCardStat({ kind: "delta", value: -0.052 }, "es"))).toBe("−5%"); // es-AR Intl percent has no space (same as the dashboard tiles)
    expect(formatCardStat({ kind: "delta", value: 0.12 }, "en")).toBe("+12%");
    expect(formatCardStat({ kind: "none" }, "es")).toBe("—");
    expect(monthTitle("2026-11", "es")).toBe("noviembre de 2026");
  });

  it("builds the shared ShareCardModel: Corvo's words, the dashboard's numbers", () => {
    const model = buildBillingMonthShareModel({
      card: { headline: "Mes firme", stats: ["mrr", "paying", "projection3"], recommendation: "Cobrá.", generatedAtISO: null },
      month: "2026-11",
      coachName: "Ana Coach",
      lang: "en",
      values: (key) => statValue(key, dashboard),
      labels: { eyebrow: "My month · November 2026", recommendation: "Corvo's recommendation", stat: (k) => k },
    });
    expect(model).toMatchObject({
      eyebrow: "My month · November 2026",
      title: "Mes firme",
      subLine: "Ana Coach",
      exercises: [],
      rowsCaption: "Corvo's recommendation",
      note: "Cobrá.",
      showCompletionCheck: false,
      progressiveOverloadLabel: null,
      downloadFileName: "corvo-mi-mes-2026-11",
    });
    const p3 = dashboard.projections.find((p) => p.currency === "ARS")!.horizons[0].expected;
    expect(model.stats.map((s) => [s.label, plain(s.value)])).toEqual([
      ["mrr", "ARS 98,000"],
      ["paying", "5"],
      ["projection3", plain(formatCardStat({ kind: "money", value: p3, currency: "ARS" }, "en"))],
    ]);
  });
});

// Keep `waitFor` imported for future async assertions without lint noise.
void waitFor;

/**
 * @jest-environment jsdom
 */

// today-cards.test.tsx — golden-crow-website#535: the Inicio screen's "do this
// today" pair. The list used to know ONE reason (3+ days without activity) and
// sat at the bottom while the KPI tile above counted six; money owed wasn't on
// the screen at all.

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";

import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";

jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async (ns: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${ns}.${key}:${JSON.stringify(values)}` : `${ns}.${key}`,
  ),
}));
// The status chip is the payments module's client component; keep it readable.
jest.mock("@/app/gc-fitness/payments/_components/payment-labels", () => ({
  PaymentStatusChip: ({ state }: { state: string }) => <span data-testid="chip">{state}</span>,
}));

import { AttentionTodayCard } from "../attention-today-card";
import { PaymentsDueCard } from "../payments-due-card";
import { attentionQueue, paymentsDue } from "../today-model";

function row(uid: string, patch: Partial<ClientRosterRow> = {}): ClientRosterRow {
  return {
    uid,
    displayName: uid.toUpperCase(),
    email: `${uid}@x.com`,
    photoURL: null,
    source: "active",
    pendingProvisioning: false,
    needsAttention: false,
    needsAttentionReasons: [],
    lastActivityAt: "2026-08-05T12:00:00.000Z",
    billing: null,
    ...patch,
  } as ClientRosterRow;
}

describe("attentionQueue", () => {
  it("is every flagged ACTIVE client — not only the inactive ones — most urgent first", () => {
    const queue = attentionQueue([
      row("chat", { needsAttention: true, needsAttentionReasons: ["unreadChat"] }),
      row("ok"),
      row("money", { needsAttention: true, needsAttentionReasons: ["overduePayment"] }),
      row("quiet", { needsAttention: true, needsAttentionReasons: ["inactive", "nothingAssigned"] }),
      row("pending", { source: "pending", pendingProvisioning: true, needsAttention: true, needsAttentionReasons: ["inactive"] }),
    ]);
    expect(queue.map((r) => r.uid)).toEqual(["quiet", "money", "chat"]);
  });

  it("same top reason: more reasons first, then the longest silent", () => {
    const queue = attentionQueue([
      row("a", { needsAttention: true, needsAttentionReasons: ["missedWorkouts"], lastActivityAt: "2026-08-05T00:00:00.000Z" }),
      row("b", { needsAttention: true, needsAttentionReasons: ["missedWorkouts"], lastActivityAt: "2026-08-01T00:00:00.000Z" }),
      row("c", { needsAttention: true, needsAttentionReasons: ["missedWorkouts", "unreadChat"] }),
    ]);
    expect(queue.map((r) => r.uid)).toEqual(["c", "b", "a"]);
  });
});

describe("paymentsDue", () => {
  const billing = (state: "overdue" | "due_soon" | "up_to_date", days: number) => ({
    state,
    days,
    classBased: false,
    planName: "Mensual",
    nextDueCivil: null,
  });
  it("overdue (most days late first) and due soon (soonest first); up to date is not listed", () => {
    const due = paymentsDue([
      row("late2", { billing: billing("overdue", 2) }),
      row("late9", { billing: billing("overdue", 9) }),
      row("soon3", { billing: billing("due_soon", 3) }),
      row("soon0", { billing: billing("due_soon", 0) }),
      row("fine", { billing: billing("up_to_date", 20) }),
      row("noplan"),
    ]);
    expect(due.overdue.map((r) => r.uid)).toEqual(["late9", "late2"]);
    expect(due.dueSoon.map((r) => r.uid)).toEqual(["soon0", "soon3"]);
  });
});

describe("AttentionTodayCard", () => {
  it("names each reason and links to the client", async () => {
    const r = row("ana", { needsAttention: true, needsAttentionReasons: ["overduePayment", "unreadChat"] });
    render(await AttentionTodayCard({ rows: [{ row: r, lastActivityLabel: "Último registro: entrenamiento · Hace 2 d" }], total: 1 }));
    const link = screen.getByTestId("attention-today-row");
    expect(link).toHaveAttribute("href", "/gc-fitness/clients/ana");
    expect(within(link).getAllByTestId("attention-today-reason").map((n) => n.textContent)).toEqual([
      "clients.attentionReasons.overduePayment",
      "clients.attentionReasons.unreadChat",
    ]);
    expect(link).toHaveTextContent("Hace 2 d");
    expect(screen.getByText('dashboard.attentionTodayTitle:{"count":1}')).toBeInTheDocument();
  });

  it("nobody flagged → the all-caught-up line and no «see all» link", async () => {
    render(await AttentionTodayCard({ rows: [], total: 0 }));
    expect(screen.getByTestId("attention-today-empty")).toHaveTextContent("dashboard.allCaughtUp");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("PaymentsDueCard", () => {
  it("hidden for a coach without any client on a plan", async () => {
    const out = await PaymentsDueCard({ due: { overdue: [], dueSoon: [] }, anyPlan: false });
    expect(out).toBeNull();
  });

  it("lists overdue then due soon, each to the client's payments page, with the detail", async () => {
    const late = row("late", { billing: { state: "overdue", days: 4, classBased: false, planName: null, nextDueCivil: null } });
    const soon = row("soon", { billing: { state: "due_soon", days: 0, classBased: false, planName: null, nextDueCivil: null } });
    render(await PaymentsDueCard({ due: { overdue: [late], dueSoon: [soon] }, anyPlan: true }));
    const rows = screen.getAllByTestId("payments-due-row");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/gc-fitness/clients/late/pagos", "/gc-fitness/clients/soon/pagos"]);
    expect(rows[0]).toHaveTextContent('payments.overdueDays:{"days":4}');
    expect(rows[1]).toHaveTextContent("payments.dueToday");
    expect(screen.getByText('dashboard.paymentsDueSubtitle:{"overdue":1,"soon":1}')).toBeInTheDocument();
  });

  it("with plans but nothing owed: says so instead of an empty card", async () => {
    render(await PaymentsDueCard({ due: { overdue: [], dueSoon: [] }, anyPlan: true }));
    expect(screen.getByTestId("payments-due-empty")).toHaveTextContent("dashboard.paymentsDueEmpty");
  });
});

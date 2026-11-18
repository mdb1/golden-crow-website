// admin-coach-overview-model.test.ts — golden-crow-website#534: the pure shaping behind the
// admin coach detail. Dates are pinned (no `Date.now()`), so the gate is time-travel safe.

import {
  activityBuckets,
  billingColumns,
  lastMonths,
  pickLastActivity,
  sortClientRows,
  summarizeChecklist,
  summarizeCoachBilling,
  summarizeCorvo,
  summarizeNutrition,
  type CoachClientOverviewRow,
} from "../admin-coach-overview-model";
import type { ClientBillingView, ClientPaymentView, PaymentPlan } from "../payments-model";

const TODAY = "2026-11-18";
const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const DAY = 86_400_000;

const monthly: PaymentPlan = {
  id: "p-month",
  name: "Mensual online",
  kind: "monthly",
  modality: "online",
  amount: 30000,
  currency: "ARS",
  periodMonths: 1,
  classCount: null,
  description: null,
  archived: false,
};
const pack: PaymentPlan = {
  ...monthly,
  id: "p-pack",
  name: "Pack 8 clases",
  kind: "class_pack",
  amount: 40000,
  periodMonths: null,
  classCount: 8,
};
const trimester: PaymentPlan = { ...monthly, id: "p-tri", name: "Trimestral", kind: "months_pack", amount: 81000, periodMonths: 3 };
const old: PaymentPlan = { ...monthly, id: "p-old", name: "Viejo", archived: true };

function billing(clientId: string, plan: PaymentPlan | null, extra: Partial<ClientBillingView> = {}): ClientBillingView {
  return {
    clientId,
    planId: plan?.id ?? null,
    plan: plan
      ? {
          name: plan.name,
          kind: plan.kind,
          modality: plan.modality,
          amount: plan.amount,
          currency: plan.currency,
          periodMonths: plan.periodMonths,
          classCount: plan.classCount,
          description: null,
        }
      : null,
    amount: null,
    startCivil: "2026-01-01",
    nextDueCivil: null,
    classesRemaining: null,
    reminderDaysBefore: 3,
    lastPaymentCivil: null,
    lastPaymentAmount: null,
    ...extra,
  };
}

function payment(id: string, clientId: string, paidCivil: string, amount: number, extra: Partial<ClientPaymentView> = {}): ClientPaymentView {
  return {
    id,
    clientId,
    amount,
    currency: "ARS",
    paidCivil,
    method: "transfer",
    methodNote: null,
    covers: { kind: "months", months: 1, classes: null },
    planName: "Mensual online",
    note: null,
    createdAt: `${paidCivil}T12:00:00.000Z`,
    voidedAt: null,
    voidReason: null,
    ...extra,
  };
}

describe("pickLastActivity", () => {
  it("takes the newest signal and names it", () => {
    expect(
      pickLastActivity({ lastWorkoutAtMs: 100, lastHabitAtMs: 300, lastAppOpenAtMs: 200, corvoLastMessageAtMs: null }),
    ).toEqual({ atMs: 300, kind: "habit" });
  });
  it("a tie prefers the more meaningful signal (workout over app open)", () => {
    expect(pickLastActivity({ lastWorkoutAtMs: 500, lastAppOpenAtMs: 500 })).toEqual({ atMs: 500, kind: "workout" });
  });
  it("nothing at all is null, not zero", () => {
    expect(pickLastActivity({})).toEqual({ atMs: null, kind: null });
  });
});

describe("billingColumns", () => {
  it("overdue monthly client: days overdue and the plan snapshot", () => {
    const cols = billingColumns(
      billing("c1", monthly, { nextDueCivil: "2026-11-10", lastPaymentCivil: "2026-10-10", lastPaymentAmount: 30000 }),
      TODAY,
    );
    expect(cols).toMatchObject({
      billingState: "overdue",
      billingDays: 8,
      planName: "Mensual online",
      amount: 30000,
      currency: "ARS",
      lastPaymentCivil: "2026-10-10",
      nextDueCivil: "2026-11-10",
    });
  });
  it("special price wins over the plan's", () => {
    expect(billingColumns(billing("c1", monthly, { amount: 25000, nextDueCivil: "2026-12-30" }), TODAY)).toMatchObject({
      billingState: "up_to_date",
      amount: 25000,
    });
  });
  it("no billing doc = none", () => {
    expect(billingColumns(null, TODAY).billingState).toBe("none");
  });
});

function row(uid: string, extra: Partial<CoachClientOverviewRow> = {}): CoachClientOverviewRow {
  return {
    uid,
    displayName: uid.toUpperCase(),
    email: `${uid}@x.com`,
    deleted: false,
    signupAtMs: null,
    lastActivityAtMs: null,
    lastActivityKind: null,
    lastWorkoutAtMs: null,
    complianceRatio: null,
    workoutsCompletedThisMonth: null,
    workoutsScheduledThisMonth: null,
    billingState: "none",
    billingDays: 0,
    planName: null,
    planKind: null,
    amount: null,
    currency: null,
    lastPaymentCivil: null,
    lastPaymentAmount: null,
    nextDueCivil: null,
    classesRemaining: null,
    nutritionPlanName: null,
    nutritionPercent7d: null,
    corvoTurnsTotal: 0,
    corvoLastMessageAtMs: null,
    entitlementTier: "free",
    ...extra,
  };
}

describe("sortClientRows", () => {
  const rows = [
    row("ana", { lastActivityAtMs: 300, billingState: "up_to_date", billingDays: 20, complianceRatio: 0.5, nextDueCivil: "2026-12-08" }),
    row("beto", { lastActivityAtMs: null, billingState: "overdue", billingDays: 2, nextDueCivil: "2026-11-16" }),
    row("caro", { lastActivityAtMs: 900, billingState: "overdue", billingDays: 30, complianceRatio: 0.9, nextDueCivil: "2026-10-19" }),
    row("dani", { lastActivityAtMs: 100, billingState: "due_soon", billingDays: 1 }),
    row("eva", { billingState: "none" }),
  ];
  const ids = (r: CoachClientOverviewRow[]) => r.map((x) => x.uid);

  it("last activity desc: newest first, never-active last", () => {
    expect(ids(sortClientRows(rows, "lastActivity", "desc"))).toEqual(["caro", "ana", "dani", "beto", "eva"]);
  });
  it("last activity asc still keeps the empty cells LAST", () => {
    expect(ids(sortClientRows(rows, "lastActivity", "asc"))).toEqual(["dani", "ana", "caro", "beto", "eva"]);
  });
  it("billing asc = most urgent first (most days overdue, then due soon, up to date, no plan)", () => {
    expect(ids(sortClientRows(rows, "billing", "asc"))).toEqual(["caro", "beto", "dani", "ana", "eva"]);
  });
  it("name and compliance", () => {
    expect(ids(sortClientRows(rows, "name", "desc"))).toEqual(["eva", "dani", "caro", "beto", "ana"]);
    expect(ids(sortClientRows(rows, "compliance", "desc")).slice(0, 2)).toEqual(["caro", "ana"]);
  });
  it("next due asc", () => {
    expect(ids(sortClientRows(rows, "nextDue", "asc")).slice(0, 3)).toEqual(["caro", "beto", "ana"]);
  });
});

describe("summarizeCoachBilling", () => {
  const current = new Set(["c1", "c2", "c3", "c4"]);
  const billings = [
    billing("c1", monthly, { nextDueCivil: "2026-11-10" }), // overdue
    billing("c2", monthly, { nextDueCivil: "2026-11-20" }), // due soon (2 days)
    billing("c3", pack, { classesRemaining: 3 }), // up to date (classes)
    billing("gone", trimester, { nextDueCivil: "2026-12-01" }), // former client: not counted
    // c4 has no billing → none
  ];
  const payments = [
    payment("p1", "c1", "2026-11-02", 30000),
    payment("p2", "c2", "2026-10-05", 30000),
    payment("p3", "c3", "2026-10-07", 40000, { covers: { kind: "classes", months: null, classes: 8 } }),
    payment("p4", "gone", "2026-09-01", 81000),
    payment("p5", "c1", "2026-11-01", 30000, { voidedAt: "2026-11-01T13:00:00.000Z" }),
    payment("p6", "c2", "2025-10-01", 99999), // outside the 12-month window
  ];
  const s = summarizeCoachBilling({ plans: [monthly, pack, trimester, old], billings, payments, currentClientIds: current, today: TODAY });

  it("plans: clients per plan, archived last", () => {
    expect(s.plans.map((p) => [p.id, p.clients])).toEqual([
      ["p-month", 2],
      ["p-pack", 1],
      ["p-tri", 0],
      ["p-old", 0],
    ]);
  });
  it("state counts over CURRENT clients only", () => {
    expect(s.stateCounts).toEqual({ overdue: 1, due_soon: 1, up_to_date: 1, none: 1 });
  });
  it("expected monthly income: periodic plans only, packs prorated", () => {
    expect(s.expectedMonthly).toEqual([{ currency: "ARS", amount: 60000 }]);
  });
  it("12 zero-filled months, voided and out-of-window excluded", () => {
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly[0].month).toBe("2025-12");
    expect(s.monthly[11]).toEqual({ month: "2026-11", currency: "ARS", amount: 30000, payments: 1 });
    expect(s.monthly.find((m) => m.month === "2026-10")).toMatchObject({ amount: 70000, payments: 2 });
    expect(s.collectedInWindow).toEqual([{ currency: "ARS", amount: 181000 }]);
    expect(s.collectedThisMonth).toEqual([{ currency: "ARS", amount: 30000 }]);
    expect(s.chartCurrency).toBe("ARS");
  });
  it("counts voided payments and money from former clients", () => {
    expect(s.voidedCount).toBe(1);
    expect(s.paymentsFromFormerClients).toBe(1);
  });
  it("no payments ⇒ no chart currency", () => {
    const empty = summarizeCoachBilling({ plans: [], billings: [], payments: [], currentClientIds: new Set(), today: TODAY });
    expect(empty.chartCurrency).toBeNull();
    expect(empty.monthly).toEqual([]);
  });
});

describe("lastMonths", () => {
  it("crosses the year boundary, oldest first", () => {
    expect(lastMonths("2026-02-28", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("other summaries", () => {
  it("checklist: open / overdue / done and the next items by due date", () => {
    const s = summarizeChecklist(
      [
        { id: "a", title: "Llamar", completed: false, dueAtMs: NOW - DAY },
        { id: "b", title: "Plan", completed: false, dueAtMs: NOW + DAY },
        { id: "c", title: "Hecho", completed: true, dueAtMs: NOW - 2 * DAY },
        { id: "d", title: "Sin fecha", completed: false, dueAtMs: null },
      ],
      NOW,
    );
    expect(s).toMatchObject({ open: 3, overdue: 1, done: 1 });
    expect(s.upcoming.map((i) => [i.id, i.overdue])).toEqual([
      ["a", true],
      ["b", false],
      ["d", false],
    ]);
  });
  it("nutrition: active vs lapsed vs never, average adherence over the asked ones", () => {
    expect(
      summarizeNutrition({
        templates: 2,
        plans: 5,
        summaries: [
          { hasActivePlan: true, neverHadPlan: false, percent7d: 80 },
          { hasActivePlan: false, neverHadPlan: false, percent7d: 40 },
          { hasActivePlan: false, neverHadPlan: true, percent7d: null },
        ],
      }),
    ).toEqual({ templates: 2, plans: 5, clientsWithActivePlan: 1, clientsWithLapsedPlan: 1, avgPercent7d: 60 });
  });
  it("corvo: users, active in 7 days, turns, consent", () => {
    expect(
      summarizeCorvo(
        [
          { turnsTotal: 10, lastMessageAtMs: NOW - DAY, consented: true },
          { turnsTotal: 3, lastMessageAtMs: NOW - 10 * DAY, consented: true },
          { turnsTotal: 0, lastMessageAtMs: null, consented: false },
        ],
        NOW,
      ),
    ).toEqual({ clientsUsing: 2, activeLast7d: 1, turnsTotal: 13, consented: 2, lastMessageAtMs: NOW - DAY });
  });
  it("activity buckets skip deleted clients", () => {
    expect(
      activityBuckets(
        [
          { lastActivityAtMs: NOW - DAY, deleted: false },
          { lastActivityAtMs: NOW - 20 * DAY, deleted: false },
          { lastActivityAtMs: NOW - 40 * DAY, deleted: false },
          { lastActivityAtMs: null, deleted: false },
          { lastActivityAtMs: NOW, deleted: true },
        ],
        NOW,
      ),
    ).toEqual({ last7d: 1, last30d: 1, inactive30d: 1, never: 1 });
  });
});

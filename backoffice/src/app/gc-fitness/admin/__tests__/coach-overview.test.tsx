/**
 * @jest-environment jsdom
 */

// coach-overview.test.tsx — golden-crow-website#534: the expanded admin coach detail,
// rendered from fixtures (no reads). Pinned: the client table's columns + sorting, billing
// (plans with #clients, state counts, monthly totals, payments with voided/former client),
// programs, challenges, checklist, Corvo, social, coach activity and the invite status.
// A prod admin session is needed for real screenshots, so these renders stand in for them.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

// recharts needs a real layout; the chart is covered by its table view.
jest.mock("../coaches/[uid]/_components/CoachCollectedChart", () => ({
  CoachCollectedChart: ({ currency }: { currency: string }) => <div data-testid="coach-collected-chart">{currency}</div>,
}));

import {
  summarizeCoachBilling,
  type CoachClientOverviewRow,
} from "@/lib/gc-fitness/admin-coach-overview-model";
import type { ClientBillingView, ClientPaymentView, PaymentPlan } from "@/lib/gc-fitness/payments-model";

import { CoachClientsTable } from "../coaches/[uid]/_components/CoachClientsTable";
import {
  CoachActivityCard,
  CoachBillingCard,
  CoachChallengesCard,
  CoachEngagementCards,
  CoachOverviewKpis,
  CoachProgramsCard,
  PendingInvitesTable,
} from "../coaches/[uid]/_components/CoachOverviewSections";

const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const DAY = 86_400_000;
const TZ = "America/Argentina/Buenos_Aires";

function row(uid: string, extra: Partial<CoachClientOverviewRow> = {}): CoachClientOverviewRow {
  return {
    uid,
    displayName: uid,
    email: `${uid.toLowerCase()}@x.com`,
    deleted: false,
    signupAtMs: Date.UTC(2026, 0, 10, 15),
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

const rows = [
  row("Ana", {
    lastActivityAtMs: NOW - 2 * DAY,
    lastActivityKind: "workout",
    billingState: "up_to_date",
    billingDays: 20,
    planName: "Mensual",
    planKind: "monthly",
    amount: 30000,
    currency: "ARS",
    nextDueCivil: "2026-12-08",
    lastPaymentCivil: "2026-11-08",
    lastPaymentAmount: 30000,
    complianceRatio: 0.75,
    workoutsCompletedThisMonth: 6,
    workoutsScheduledThisMonth: 8,
    nutritionPlanName: "Definición",
    nutritionPercent7d: 82,
    corvoTurnsTotal: 12,
    corvoLastMessageAtMs: NOW - DAY,
    entitlementTier: "premium",
  }),
  row("Beto", {
    lastActivityAtMs: NOW - 40 * DAY,
    lastActivityKind: "app_open",
    billingState: "overdue",
    billingDays: 8,
    planName: "Mensual",
    planKind: "monthly",
    amount: 30000,
    currency: "ARS",
    nextDueCivil: "2026-11-10",
  }),
  row("Caro"),
  row("Zoe", { deleted: true, lastActivityAtMs: NOW }),
];

const names = () =>
  within(screen.getByTestId("coach-clients-table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.getAttribute("data-testid"));

describe("CoachClientsTable", () => {
  it("shows last activity, billing, compliance, nutrition and Corvo per client", () => {
    render(<CoachClientsTable coachUid="coach1" rows={rows} nowMs={NOW} timezone={TZ} />);
    expect(screen.getByTestId("coach-client-activity-Ana")).toHaveTextContent("2 days ago");
    expect(screen.getByTestId("coach-client-activity-Ana")).toHaveTextContent("workout");
    expect(screen.getByTestId("coach-client-activity-Caro")).toHaveTextContent("Never");
    const ana = screen.getByTestId("coach-client-row-Ana");
    expect(within(screen.getByTestId("coach-client-billing-Ana")).getByText("Up to date")).toBeInTheDocument();
    expect(ana).toHaveTextContent("Mensual");
    expect(ana).toHaveTextContent("75%");
    expect(ana).toHaveTextContent("6/8 workouts this month");
    expect(ana).toHaveTextContent("Definición");
    expect(ana).toHaveTextContent("82% · 7d");
    expect(ana).toHaveTextContent("12 turns");
    expect(ana).toHaveTextContent("premium");
    expect(screen.getByTestId("coach-client-billing-Beto")).toHaveTextContent("Overdue");
    expect(screen.getByTestId("coach-client-billing-Beto")).toHaveTextContent("8 days");
    // Links into the read-only client drill-down.
    expect(within(ana).getByRole("link", { name: "Ana" })).toHaveAttribute(
      "href",
      "/gc-fitness/admin/coaches/coach1/clients/Ana",
    );
  });

  it("defaults to last activity (newest first) and hides deleted clients until asked", () => {
    render(<CoachClientsTable coachUid="c" rows={rows} nowMs={NOW} timezone={TZ} />);
    expect(names()).toEqual(["coach-client-row-Ana", "coach-client-row-Beto", "coach-client-row-Caro"]);
    fireEvent.click(screen.getByTestId("coach-clients-show-deleted"));
    expect(names()[0]).toBe("coach-client-row-Zoe");
  });

  it("sorts by any column and toggles the direction", () => {
    render(<CoachClientsTable coachUid="c" rows={rows} nowMs={NOW} timezone={TZ} />);
    fireEvent.click(screen.getByTestId("coach-clients-sort-billing"));
    expect(names()[0]).toBe("coach-client-row-Beto"); // overdue first
    fireEvent.click(screen.getByTestId("coach-clients-sort-name"));
    expect(names()).toEqual(["coach-client-row-Ana", "coach-client-row-Beto", "coach-client-row-Caro"]);
    fireEvent.click(screen.getByTestId("coach-clients-sort-name"));
    expect(names()).toEqual(["coach-client-row-Caro", "coach-client-row-Beto", "coach-client-row-Ana"]);
    expect(screen.getByTestId("coach-clients-sort-name").closest("th")).toHaveAttribute("aria-sort", "descending");
  });

  it("renders the per-row action nodes the page hands in", () => {
    render(
      <CoachClientsTable coachUid="c" rows={rows} nowMs={NOW} timezone={TZ} actions={{ Ana: <button>do-it</button> }} />,
    );
    expect(within(screen.getByTestId("coach-client-row-Ana")).getByText("do-it")).toBeInTheDocument();
  });
});

// ── Billing ─────────────────────────────────────────────────────────────────────

const plan: PaymentPlan = {
  id: "p1",
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
const billingFor = (clientId: string, nextDueCivil: string): ClientBillingView => ({
  clientId,
  planId: "p1",
  plan: { ...plan, description: null },
  amount: null,
  startCivil: "2026-01-01",
  nextDueCivil,
  classesRemaining: null,
  reminderDaysBefore: 3,
  lastPaymentCivil: null,
  lastPaymentAmount: null,
});
const pay = (id: string, clientId: string, paidCivil: string, extra: Partial<ClientPaymentView> = {}): ClientPaymentView => ({
  id,
  clientId,
  amount: 30000,
  currency: "ARS",
  paidCivil,
  method: "mercadopago",
  methodNote: null,
  covers: { kind: "months", months: 1, classes: null },
  planName: "Mensual online",
  note: null,
  createdAt: null,
  voidedAt: null,
  voidReason: null,
  ...extra,
});
const summary = summarizeCoachBilling({
  plans: [plan],
  billings: [billingFor("ana", "2026-12-08"), billingFor("beto", "2026-11-10")],
  payments: [pay("x1", "ana", "2026-11-08"), pay("x2", "gone", "2026-10-01"), pay("x3", "beto", "2026-10-10", { voidedAt: "v" })],
  currentClientIds: new Set(["ana", "beto"]),
  today: "2026-11-18",
});

describe("CoachBillingCard + KPIs", () => {
  it("plans with price and #clients, states, 12-month total, payments with who/how much/when/method", () => {
    render(<CoachBillingCard billing={summary} clientNames={{ ana: "Ana", beto: "Beto" }} auditHref="/a?coach=x&cat=billing" />);
    const planRow = screen.getByTestId("coach-plan-p1");
    expect(planRow).toHaveTextContent("Mensual online");
    expect(planRow).toHaveTextContent("Monthly");
    expect(planRow).toHaveTextContent("per month");
    expect(planRow).toHaveTextContent(/2$/);
    expect(screen.getByTestId("coach-billing-state-overdue")).toHaveTextContent("Overdue: 1");
    expect(screen.getByTestId("coach-billing-state-up_to_date")).toHaveTextContent("Up to date: 1");
    expect(screen.getByTestId("coach-collected-chart")).toHaveTextContent("ARS");
    expect(screen.getByTestId("coach-billing-total12m")).toHaveTextContent("60,000");
    const p1 = screen.getByTestId("coach-payment-x1");
    expect(p1).toHaveTextContent("Ana");
    expect(p1).toHaveTextContent("Nov 8, 2026");
    expect(p1).toHaveTextContent("Mercado Pago");
    expect(p1).toHaveTextContent("1 month");
    expect(screen.getByTestId("coach-payment-x2")).toHaveTextContent("former client");
    expect(screen.getByTestId("coach-payment-x3")).toHaveTextContent("Voided");
    expect(screen.getByText(/1 voided payment/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in audit" })).toHaveAttribute("href", "/a?coach=x&cat=billing");
    // Monthly table view carries every month.
    expect(within(screen.getByTestId("coach-billing-monthly-table")).getAllByRole("row")).toHaveLength(13);
  });

  it("billing that could not be read says so instead of zeros", () => {
    render(<CoachBillingCard billing={null} clientNames={{}} />);
    expect(screen.getByText("Billing could not be read.")).toBeInTheDocument();
  });

  it("KPI strip", () => {
    render(
      <CoachOverviewKpis activeClients={2} engagement={{ last7d: 1, inactive30d: 1, never: 0 }} billing={summary} />,
    );
    expect(screen.getByTestId("kpi-clients")).toHaveTextContent("2");
    expect(screen.getByTestId("kpi-overdue")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-collected")).toHaveTextContent("30,000");
    expect(screen.getByTestId("kpi-expected")).toHaveTextContent("60,000");
  });
});

describe("Programs, challenges, engagement, activity, invites", () => {
  it("nutrition + habits", () => {
    render(
      <CoachProgramsCard
        nutrition={{ templates: 3, plans: 7, clientsWithActivePlan: 4, clientsWithLapsedPlan: 1, avgPercent7d: 71 }}
        habits={{ active: 9, archived: 2, templates: 5 }}
      />,
    );
    expect(screen.getByTestId("coach-nutrition-templates")).toHaveTextContent("3");
    expect(screen.getByTestId("coach-nutrition-active")).toHaveTextContent("4");
    expect(screen.getByTestId("coach-nutrition-lapsed")).toHaveTextContent("1");
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByTestId("coach-habits-active")).toHaveTextContent("9");
    expect(screen.getByTestId("coach-habits-archived")).toHaveTextContent("2");
  });

  it("challenges with members and leader; empty state", () => {
    const { unmount } = render(
      <CoachChallengesCard
        challenges={[
          {
            id: "ch1",
            name: "Noviembre 12 entrenos",
            kind: "workouts",
            cadence: "total",
            target: 12,
            startsAt: "",
            endsAt: "",
            startDate: "2026-11-01",
            endDate: "2026-11-30",
            timezone: TZ,
            durationDays: 30,
            weekCount: null,
            status: "active",
            hidden: false,
            invitedCount: 10,
            joinedCount: 6,
            pendingCount: 4,
            standings: [{ uid: "a", rank: 1, name: "Ana", progress: 7, weeksTotal: 0, completedAt: null }],
          } as never,
        ]}
      />,
    );
    const r = screen.getByTestId("coach-challenge-ch1");
    expect(r).toHaveTextContent("Noviembre 12 entrenos");
    expect(r).toHaveTextContent("6 / 10");
    expect(r).toHaveTextContent("Ana");
    expect(r).toHaveTextContent("Active");
    unmount();
    render(<CoachChallengesCard challenges={[]} />);
    expect(screen.getByText("No challenges created.")).toBeInTheDocument();
  });

  it("checklist, Corvo and social", () => {
    render(
      <CoachEngagementCards
        checklist={{
          open: 2,
          overdue: 1,
          done: 5,
          upcoming: [{ id: "i1", title: "Llamar a Beto", dueAtISO: new Date(NOW - DAY).toISOString(), overdue: true }],
        }}
        corvo={{ clientsUsing: 3, activeLast7d: 2, turnsTotal: 40, consented: 3, lastMessageAtMs: NOW }}
        social={{ handle: "coachana", visibility: "public", suspended: true, publicRoutines: 4 }}
        timezone={TZ}
      />,
    );
    expect(screen.getByTestId("coach-checklist-summary")).toHaveTextContent("2 open · 1 overdue · 5 done");
    expect(screen.getByText("Llamar a Beto")).toBeInTheDocument();
    expect(screen.getByTestId("coach-corvo-using")).toHaveTextContent("3");
    expect(screen.getByTestId("coach-corvo-turns")).toHaveTextContent("40");
    expect(screen.getByText("@coachana")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("coach activity: last portal action and app version", () => {
    render(
      <CoachActivityCard
        timezone={TZ}
        activity={{
          lastSignInISO: "2026-11-17T12:00:00.000Z",
          lastAppOpenISO: null,
          accountCreatedISO: "2026-01-01T12:00:00.000Z",
          lastCoachActionISO: "2026-11-18T13:00:00.000Z",
          lastCoachActionKind: "payment_recorded",
          devices: [{ platform: "ios", appVersion: "2.3.0", appBuild: "410", registeredAtISO: null }],
          entitlementTier: "free",
          timezone: TZ,
        }}
      />,
    );
    expect(screen.getByTestId("coach-activity-last-action")).toHaveTextContent("payment_recorded");
    expect(screen.getByTestId("coach-activity-app")).toHaveTextContent("iOS 2.3.0 (410)");
  });

  it("pending invites show the invite email status; unknown status reads as not attempted", () => {
    render(
      <PendingInvitesTable
        timezone={TZ}
        invites={[
          { email: "a@x.com", displayName: "A", inviteStatus: "failed", inviteSentAtISO: null, lastAttemptAtISO: null, createdAtISO: null },
          { email: "b@x.com", displayName: "", inviteStatus: "sent", inviteSentAtISO: "2026-11-10T12:00:00.000Z", lastAttemptAtISO: null, createdAtISO: null },
          { email: "c@x.com", displayName: "", inviteStatus: "weird", inviteSentAtISO: null, lastAttemptAtISO: null, createdAtISO: null },
        ]}
        actions={{ "a@x.com": <button>remove</button> }}
      />,
    );
    expect(screen.getByTestId("coach-invite-a@x.com")).toHaveTextContent("Failed");
    expect(screen.getByTestId("coach-invite-a@x.com")).toHaveTextContent("remove");
    expect(screen.getByTestId("coach-invite-b@x.com")).toHaveTextContent("Sent");
    expect(screen.getByTestId("coach-invite-b@x.com")).toHaveTextContent("sent Nov 10, 2026");
    expect(screen.getByTestId("coach-invite-c@x.com")).toHaveTextContent("Not attempted");
  });
});

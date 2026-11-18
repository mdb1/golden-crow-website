/**
 * @jest-environment jsdom
 */

// client-overview.test.tsx — golden-crow-website#534 (PR 2): the extra sections of the admin
// client drill-down, rendered from fixtures. Pinned: activity / compliance / billing tiles,
// account + app version + subscription, billing with this coach (state, plan, payments,
// voided), goals / notes, chat (who owes a reply), Corvo (turns, consent, reports).

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";

import {
  summarizeChat,
  summarizeClientBilling,
  summarizeGoals,
} from "@/lib/gc-fitness/admin-client-overview-model";
import type { ClientAdminOverview } from "@/lib/gc-fitness/admin-client-overview";
import type { ClientBillingView, ClientPaymentView } from "@/lib/gc-fitness/payments-model";

import {
  ClientAccountCard,
  ClientBillingCard,
  ClientOverviewTiles,
  ClientRelationshipCards,
} from "../coaches/[uid]/clients/[clientId]/_components/ClientOverviewCards";

const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const DAY = 86_400_000;
const TZ = "America/Argentina/Buenos_Aires";

const billingDoc: ClientBillingView = {
  clientId: "c1",
  planId: "p1",
  plan: { name: "Mensual", kind: "monthly", modality: null, amount: 30000, currency: "ARS", periodMonths: 1, classCount: null, description: null },
  amount: 25000,
  startCivil: "2026-01-01",
  nextDueCivil: "2026-11-10",
  classesRemaining: null,
  reminderDaysBefore: 3,
  lastPaymentCivil: "2026-10-10",
  lastPaymentAmount: 25000,
};
const pay = (id: string, paidCivil: string, extra: Partial<ClientPaymentView> = {}): ClientPaymentView => ({
  id,
  clientId: "c1",
  amount: 25000,
  currency: "ARS",
  paidCivil,
  method: "cash",
  methodNote: null,
  covers: { kind: "months", months: 1, classes: null },
  planName: "Mensual",
  note: null,
  createdAt: null,
  voidedAt: null,
  voidReason: null,
  ...extra,
});

function overview(extra: Partial<ClientAdminOverview> = {}): ClientAdminOverview {
  return {
    timezone: TZ,
    nowMs: NOW,
    account: {
      email: "c1@x.com",
      createdAtISO: "2026-01-05T12:00:00.000Z",
      lastSignInISO: "2026-11-17T12:00:00.000Z",
      lastAppOpenISO: "2026-11-18T12:00:00.000Z",
      providers: ["google.com"],
      emailVerified: true,
      disabled: false,
      timezone: TZ,
      birthDate: "1990-05-01",
      locale: "es",
      devices: [{ platform: "android", appVersion: "2.2.2", appBuild: "300", registeredAtISO: null }],
      bodyWeightKg: 72.5,
      heightCm: 170,
    },
    entitlement: { tier: "premium", source: "revenuecat", productId: null, expiresAtISO: null, updatedAtISO: null } as never,
    lastActivity: { atMs: NOW - 3 * DAY, kind: "habit" },
    stats: {
      lastWorkoutAtMs: null,
      lastHabitAtMs: null,
      lastPhotoAtMs: null,
      thisWeekComplianceRatio: 0.6,
      prevWeekComplianceRatio: null,
      habitsCompletedThisWeek: 3,
      habitsScheduledThisWeek: 5,
      missedWorkoutsLast7Days: 2,
      missedForAttention: 2,
      hasSomethingAssignedSoon: true,
      workoutsCompletedThisMonth: 4,
      workoutsScheduledThisMonth: 9,
    },
    billing: summarizeClientBilling(
      billingDoc,
      [pay("a", "2026-10-10"), pay("b", "2026-09-10", { voidedAt: "v" }), pay("c", "2026-08-10")],
      "2026-11-18",
    ),
    goals: summarizeGoals([
      { title: "Bajar 3 kg", status: "active", clientOwned: false, updatedAtMs: 2 },
      { title: "Correr 10k", status: "active", clientOwned: true, updatedAtMs: 5 },
      { title: "Viejo", status: "completed", clientOwned: false, updatedAtMs: 1 },
    ]),
    notesCount: 4,
    corvo: { turnsTotal: 33, lastMessageAtISO: "2026-11-16T12:00:00.000Z", consentAtISO: "2026-10-01T12:00:00.000Z", photosConsentAtISO: null, reports: 1 },
    chat: summarizeChat(
      { lastMessageAt: "2026-11-17T10:00:00.000Z", lastMessage: { senderId: "c1" }, unreadCount: { coach1: 3, c1: 0 } },
      "coach1",
      "c1",
    ),
    subscriptionEvents: [],
    social: null,
    ...extra,
  };
}

describe("client admin overview", () => {
  it("tiles: last activity, compliance, missed, billing", () => {
    render(<ClientOverviewTiles overview={overview()} />);
    expect(screen.getByTestId("client-tile-activity")).toHaveTextContent("3 days ago");
    expect(screen.getByTestId("client-tile-activity")).toHaveTextContent("habit");
    expect(screen.getByTestId("client-tile-compliance")).toHaveTextContent("60%");
    expect(screen.getByTestId("client-tile-compliance")).toHaveTextContent("4/9 workouts this month");
    expect(screen.getByTestId("client-tile-missed")).toHaveTextContent("2");
    expect(screen.getByTestId("client-tile-billing")).toHaveTextContent("Overdue");
  });

  it("account: app version, subscription", () => {
    render(<ClientAccountCard overview={overview()} />);
    expect(screen.getByTestId("client-account-app")).toHaveTextContent("Android 2.2.2 (300)");
    expect(screen.getByTestId("client-account-tier")).toHaveTextContent("premium · revenuecat");
    expect(screen.getByText("72.5 kg")).toBeInTheDocument();
  });

  it("billing: special price, state, payments with voided, non-voided total", () => {
    render(<ClientBillingCard overview={overview()} auditHref="/a?client=x" />);
    expect(screen.getByTestId("client-billing-state")).toHaveTextContent("Overdue");
    expect(screen.getByText(/Mensual · \$25,000|Mensual · ARS/)).toBeInTheDocument();
    expect(screen.getByTestId("client-billing-total")).toHaveTextContent("50,000");
    expect(screen.getByTestId("client-payment-b")).toHaveTextContent("Voided");
    expect(screen.getByTestId("client-payment-a")).toHaveTextContent("Cash");
    expect(screen.getByRole("link", { name: "View in audit" })).toHaveAttribute("href", "/a?client=x");
  });

  it("billing is not offered for a coach-less user", () => {
    render(<ClientBillingCard overview={overview({ billing: null })} />);
    expect(screen.getByText("Not available for a coach-less user.")).toBeInTheDocument();
  });

  it("goals, notes, chat and Corvo", () => {
    render(<ClientRelationshipCards overview={overview()} />);
    expect(screen.getByTestId("client-goals-summary")).toHaveTextContent("2 active · 1 achieved · 0 archived");
    // newest active first
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Correr 10k", "Bajar 3 kg"]);
    expect(screen.getByText("1 written by the client")).toBeInTheDocument();
    expect(screen.getByText("4 private coach notes")).toBeInTheDocument();
    expect(screen.getByTestId("client-chat-last-from")).toHaveTextContent("the client");
    expect(screen.getByTestId("client-chat-unread-coach")).toHaveTextContent("3");
    expect(screen.getByTestId("client-corvo-turns")).toHaveTextContent("33");
    expect(screen.getByTestId("client-corvo-reports")).toHaveTextContent("1");
  });

  it("empty relationship states", () => {
    render(<ClientRelationshipCards overview={overview({ goals: summarizeGoals([]), chat: null, corvo: null, notesCount: null })} />);
    expect(screen.getByText("No active goals.")).toBeInTheDocument();
    expect(screen.getByText("No chat yet.")).toBeInTheDocument();
    expect(screen.getByText("Never used Corvo.")).toBeInTheDocument();
  });
});

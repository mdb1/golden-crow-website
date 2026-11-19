/**
 * @jest-environment jsdom
 */

// client-status-strip.test.tsx — golden-crow-website#535: the profile opens with
// last activity, habit compliance + trend, missed workouts and payment state.

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async () => (key: string) => `strip.${key}`),
}));
const mockStatsDoc = jest.fn();
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({
    collection: () => ({ doc: () => ({ get: () => mockStatsDoc() }) }),
  }),
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);
const mockBilling = jest.fn();
jest.mock("@/lib/gc-fitness/payments-actions", () => ({
  getClientBilling: () => mockBilling(),
}));

import { ClientStatusStrip } from "../ClientStatusStrip";

const NOW = Date.now();
function stats(patch: Record<string, unknown> = {}) {
  return {
    exists: true,
    data: () => ({
      v: 2,
      coachId: "coach-a",
      timezone: "UTC",
      civilDate: "2026-11-18",
      computedAt: new Date(NOW),
      lastWorkoutAt: new Date(NOW - 2 * 3600_000),
      thisWeekComplianceRatio: 0.8,
      prevWeekComplianceRatio: 0.5,
      habitsScheduledThisWeek: 7,
      missedForAttention: 2,
      ...patch,
    }),
  };
}

beforeEach(() => {
  mockStatsDoc.mockReset();
  mockBilling.mockReset();
});

async function renderStrip() {
  render(await ClientStatusStrip({ clientId: "c1", coachId: "coach-a", billingTodayCivil: "2026-11-18" }));
}

it("shows last activity, habits with the trend, missed workouts and the overdue payment", async () => {
  mockStatsDoc.mockResolvedValue(stats());
  mockBilling.mockResolvedValue({
    planId: "p",
    plan: { name: "Mensual", kind: "monthly", amount: 1, currency: "ARS", periodMonths: 1 },
    startCivil: "2026-10-01",
    nextDueCivil: "2026-11-10",
    classesRemaining: null,
    reminderDaysBefore: 3,
  });
  await renderStrip();
  expect(screen.getByTestId("roster-last-activity")).toHaveTextContent(/workout$/);
  expect(screen.getByText("80%")).toBeInTheDocument();
  expect(screen.getByTestId("roster-habit-trend")).toHaveAttribute("data-direction", "up");
  expect(screen.getByTestId("client-status-missed")).toHaveTextContent(/^2$/);
  expect(screen.getByTestId("roster-payment")).toHaveAttribute("data-state", "overdue");
  expect(screen.getByTestId("roster-payment")).toHaveTextContent("8 days overdue");
});

it("no cached stats (or another coach's) → em dashes, never another coach's numbers", async () => {
  mockStatsDoc.mockResolvedValue(stats({ coachId: "coach-b" }));
  mockBilling.mockResolvedValue(null);
  await renderStrip();
  expect(screen.queryByText("80%")).not.toBeInTheDocument();
  expect(screen.queryByTestId("client-status-missed")).not.toBeInTheDocument();
  expect(screen.getByTestId("roster-payment")).toHaveAttribute("data-state", "none");
});

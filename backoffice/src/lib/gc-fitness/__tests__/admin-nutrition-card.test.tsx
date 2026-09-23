/**
 * @jest-environment jsdom
 */

// admin-nutrition-card.test.tsx
//
// #1133 — the admin Nutrition card, now shared by the coached-client drill-down
// and the coach-less profile. Pins what an operator reads: whose plan it is,
// whether a phase already ended, and that a failed load isn't shown as "no plan".

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";

import { AdminNutritionCard } from "@/app/gc-fitness/admin/_components/admin-nutrition-card";
import type { AdminClientNutrition } from "@/lib/gc-fitness/admin-actions";

const base: AdminClientNutrition = {
  percent7d: null,
  hasActivePlan: false,
  activePlanName: null,
  activePlanEndsOn: null,
  neverHadPlan: true,
  phases: [],
};

describe("AdminNutritionCard", () => {
  it("shows a coach-less user's own active plan", () => {
    render(
      <AdminNutritionCard
        nutrition={{
          ...base,
          hasActivePlan: true,
          neverHadPlan: false,
          activePlanName: "Mi plan",
          percent7d: 75,
          phases: [
            { id: "s", name: "Mi plan", startsOn: "2026-09-01", endsOn: null, deleted: false, source: "self", ended: false },
            { id: "c", name: "Fase coach", startsOn: "2026-08-01", endsOn: "2026-08-31", deleted: false, source: "coach", ended: true },
          ],
        }}
      />,
    );

    expect(screen.getByText("active phase")).toBeInTheDocument();
    expect(screen.getByText("7-day adherence:", { exact: false })).toHaveTextContent("75%");
    expect(screen.getByText("client (self)")).toBeInTheDocument();
    expect(screen.getByText("coach")).toBeInTheDocument();
    expect(screen.getByText("open-ended")).toBeInTheDocument();
    expect(screen.getByText("ended")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("says 'no plan yet' when there has never been one", () => {
    render(<AdminNutritionCard nutrition={base} />);
    expect(screen.getByText("no plan yet")).toBeInTheDocument();
    expect(screen.getByText("No nutrition phases yet.")).toBeInTheDocument();
  });

  it("doesn't pretend a failed load is 'no plan'", () => {
    render(<AdminNutritionCard nutrition={null} />);
    expect(screen.getByText("Couldn't load nutrition.")).toBeInTheDocument();
    expect(screen.queryByText("no plan yet")).not.toBeInTheDocument();
  });
});

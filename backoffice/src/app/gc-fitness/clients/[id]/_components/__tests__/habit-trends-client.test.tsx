/**
 * @jest-environment jsdom
 */

// habit-trends-client.test.tsx — the per-habit adherence cards on a client
// profile, and specifically WHICH habits the picked range admits.
//
// The FIRST THREE LINES must stay as the `/** @jest-environment jsdom */`
// docblock — the backoffice jest config defaults to `testEnvironment: "node"`.
//
// #341 established that a habit with nothing due in the range must not read as
// 100% (0/0 is not perfect adherence) and gave it a "—" plus an explanatory
// line. That was right about the number and wrong about the row: a client who
// has retired four habits over a year got four cards saying nothing, pushing
// the live ones below the fold. Picking a range is picking a question, and a
// habit that was not due in it is not part of the answer — so the row is now
// dropped, not neutralised.
//
// The empty states have to stay DISTINGUISHABLE. "This client has no habits"
// and "none of this client's habits were due in the last 7 days" call for
// different actions from the coach, and collapsing them into one message is how
// a filter starts looking like missing data.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { HabitTrendsClient, type HabitTrendRow } from "../HabitTrendsClient";

const LABELS = {
  title: "Hábitos",
  empty: "Todavía no hay hábitos asignados.",
  daysCompleted: "días completados",
  noScheduled: "Sin días programados en este rango",
  noneInRange: "Ningún hábito estaba programado en este rango.",
  ranges: { all: "Todo", "90": "90d", "30": "30d", "7": "7d" },
};

/**
 * A row scheduled in the ranges named by `scheduledIn`, and dormant elsewhere.
 * The widget precomputes every range server-side, so this is the real shape.
 */
function row(
  id: string,
  scheduledIn: Array<"all" | "90" | "30" | "7">,
  pct = 80,
): HabitTrendRow {
  const cell = (on: boolean) =>
    on
      ? { pct, completed: Math.round((pct / 100) * 10), scheduled: 10 }
      : { pct: 0, completed: 0, scheduled: 0 };
  return {
    id,
    name: id,
    streak: 0,
    streakTooltip: null,
    byRange: {
      all: cell(scheduledIn.includes("all")),
      "90": cell(scheduledIn.includes("90")),
      "30": cell(scheduledIn.includes("30")),
      "7": cell(scheduledIn.includes("7")),
    },
  };
}

function renderTrends(rows: HabitTrendRow[]) {
  const user = userEvent.setup();
  render(<HabitTrendsClient rows={rows} labels={LABELS} />);
  return { user };
}

describe("HabitTrendsClient — which habits the range admits", () => {
  it("hides a habit with nothing due in the picked range", () => {
    // Default range is 30d.
    renderTrends([
      row("Lectura", ["all", "90", "30", "7"]),
      row("Movilidad retirada", ["all", "90"]),
    ]);

    expect(screen.getByText("Lectura")).toBeInTheDocument();
    expect(screen.queryByText("Movilidad retirada")).not.toBeInTheDocument();
    // The "—" / "not scheduled" treatment is what the row USED to get.
    expect(screen.queryByText(LABELS.noScheduled)).not.toBeInTheDocument();
  });

  it("brings it back when the range widens to cover it", async () => {
    const { user } = renderTrends([
      row("Lectura", ["all", "90", "30", "7"]),
      row("Movilidad retirada", ["all", "90"]),
    ]);

    await user.click(screen.getByRole("tab", { name: "90d" }));

    expect(screen.getByText("Movilidad retirada")).toBeInTheDocument();
  });

  it("drops it again when the range narrows", async () => {
    const { user } = renderTrends([
      row("Lectura", ["all", "90", "30", "7"]),
      row("Meal prep", ["all", "90", "30"]),
    ]);

    expect(screen.getByText("Meal prep")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "7d" }));

    expect(screen.queryByText("Meal prep")).not.toBeInTheDocument();
    expect(screen.getByText("Lectura")).toBeInTheDocument();
  });
});

describe("HabitTrendsClient — the two empty states", () => {
  it("says the client has no habits when it has none", () => {
    renderTrends([]);

    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it("says the RANGE is empty when the habits exist but none were due", () => {
    // Different message on purpose: this coach should widen the range, not go
    // assign a habit.
    renderTrends([row("Movilidad retirada", ["all", "90"])]);

    expect(screen.getByText(LABELS.noneInRange)).toBeInTheDocument();
    expect(screen.queryByText(LABELS.empty)).not.toBeInTheDocument();
  });
});

describe("HabitTrendsClient — ordering", () => {
  it("puts the worst adherence last, per range", () => {
    renderTrends([
      row("Floja", ["all", "90", "30", "7"], 20),
      row("Buena", ["all", "90", "30", "7"], 95),
    ]);

    const text = document.body.textContent ?? "";
    expect(text.indexOf("Buena")).toBeLessThan(text.indexOf("Floja"));
  });
});

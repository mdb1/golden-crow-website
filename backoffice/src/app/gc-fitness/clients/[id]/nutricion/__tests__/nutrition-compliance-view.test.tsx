/**
 * @jest-environment jsdom
 */

// nutrition-compliance-view.test.tsx
//
// The coach's read surface (#919): the weekly grid, the note feed and the phase table.
// The FIRST THREE LINES must stay as the `@jest-environment jsdom` docblock — this
// package's jest config defaults to `testEnvironment: "node"`, and without it RTL crashes
// with `document is not defined`.
//
// What this surface can get wrong in a way nothing else catches:
//
//   • **A cell that only says what it is in colour.** A greyscale screenshot pasted into
//     a chat — how these actually travel — and a colour-blind coach both lose the whole
//     grid. Every cell must carry a glyph and a sentence.
//   • **`missed` drawn like `unmarked`.** One is the client declaring a failure, the other
//     is silence. They cost the same percentage and mean completely different things.
//   • **A week with no plan rendered as 0%.** That reads as a client who is failing, when
//     it is a coach who did not assign a phase — the one thing on this screen a coach with
//     twenty clients most needs to tell apart.
//   • **Actual macros looking like a score.** The moment they read as points, this is the
//     food tracker #908 explicitly asks us not to build.
//
// The percentages here are NOT recomputed by the test: they come from the same twin the
// component's props come from, which is the whole point of the aggregation living in
// `nutrition-compliance.ts`.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { useTranslations } from "@/lib/test-utils/next-intl-stub";

// `next-intl/server` is NOT covered by the `^next-intl$` moduleNameMapper, so the async
// server components need their own bridge onto the same EN catalog the client stub reads.
// Asserting both halves of the screen against ONE catalog is what keeps the grid and the
// table from drifting into two vocabularies for the same states.
jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => useTranslations(namespace),
  getLocale: async () => "en",
}));

import {
  buildNutritionPhaseRows,
  buildNutritionWeekGrid,
  collectNutritionNotes,
} from "@/lib/gc-fitness/nutrition-compliance";
import {
  TODAY,
  YESTERDAY,
  fullyDone,
  log,
  mixed,
  phaseA,
} from "@/lib/gc-fitness/__tests__/nutrition-fixtures";

import { NutritionComplianceGrid } from "../_components/NutritionComplianceGrid";
import { NutritionNotesFeed } from "../_components/NutritionNotesFeed";
import { NutritionPhaseWeightTable } from "../_components/NutritionPhaseWeightTable";
import { NutritionStats } from "../_components/NutritionStats";

const logs = [fullyDone(YESTERDAY), mixed(TODAY)];

function currentWeek() {
  return buildNutritionWeekGrid([phaseA()], logs, TODAY, TODAY);
}

describe("NutritionComplianceGrid", () => {
  it("draws one row per meal, plus the derived day row", () => {
    render(<NutritionComplianceGrid weeks={[currentWeek()]} />);

    expect(screen.getByText("Breakfast")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Dinner")).toBeInTheDocument();

    const dayRow = screen.getByTestId("nutrition-day-row");
    // Monday everything done, Tuesday has a missed dinner — one bad cell fails the day,
    // so no averaged amber hides it.
    expect(within(dayRow).getAllByTestId("nutrition-cell-done")).toHaveLength(1);
    expect(within(dayRow).getAllByTestId("nutrition-cell-missed")).toHaveLength(1);
  });

  it("says what every cell is without relying on colour", () => {
    render(<NutritionComplianceGrid weeks={[currentWeek()]} />);
    // The sentence is what a screen reader announces and what survives a greyscale
    // screenshot; the glyph is what survives colour blindness.
    expect(screen.getByText("Dinner on Aug 18: missed")).toBeInTheDocument();
    expect(screen.getByText("Lunch on Aug 18: ate something different")).toBeInTheDocument();
    expect(screen.getByText("Breakfast on Aug 17: done")).toBeInTheDocument();
  });

  it("keeps silence and a declared miss visually apart", () => {
    const week = buildNutritionWeekGrid(
      [phaseA()],
      [log(TODAY, { m1: { status: "done" } })],
      TODAY,
      TODAY,
    );
    render(<NutritionComplianceGrid weeks={[week]} />);
    expect(screen.getByText("Lunch on Aug 18: not marked")).toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-cell-missed")).not.toBeInTheDocument();
  });

  it("prints the twin's percentage, never its own count of the cells", () => {
    const week = currentWeek();
    render(<NutritionComplianceGrid weeks={[week]} />);
    // 4 done of 6 expected → 67%. Two counts of one fact drift (#173), so the badge reads
    // the breakdown the adherence twin produced.
    expect(week.breakdown.percent).toBe(67);
    // Twice on purpose: the badge in the header and the total on the day row. Both read
    // the same breakdown, so they cannot say different things.
    expect(screen.getAllByText("67%")).toHaveLength(2);
  });

  it("shows an empty week as an empty state, not as 0%", () => {
    const empty = buildNutritionWeekGrid([], [], TODAY, TODAY);
    render(<NutritionComplianceGrid weeks={[empty]} />);
    expect(screen.getByTestId("nutrition-week-empty")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("opens on the current week and pages back without a round-trip", async () => {
    const user = userEvent.setup();
    const previous = buildNutritionWeekGrid([phaseA()], logs, "2026-08-10", TODAY);
    render(<NutritionComplianceGrid weeks={[previous, currentWeek()]} />);

    expect(screen.getByTestId("nutrition-week-label")).toHaveTextContent("This week");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByTestId("nutrition-week-label")).toHaveTextContent("Week of Aug 10");
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
  });
});

describe("NutritionStats", () => {
  it("says 'no phase in force' rather than 0% when nothing was asked", async () => {
    render(
      await NutritionStats({
        last7Days: { done: 0, different: 0, missed: 0, unmarked: 0, expected: 0, ratio: 0, percent: 0, isEmpty: true },
        currentPhase: null,
        streak: 0,
      }),
    );
    expect(screen.getAllByText("No phase in force")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});

describe("NutritionNotesFeed", () => {
  it("shows the client's words with their date and meal", async () => {
    const notes = collectNutritionNotes([mixed(TODAY)]);
    render(await NutritionNotesFeed({ notes, locale: "en" }));

    expect(screen.getByText("Comí afuera — milanesa con puré")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Different")).toBeInTheDocument();
  });

  it("puts the delta next to the note and prints that it does not score", async () => {
    const notes = collectNutritionNotes([
      log(TODAY, {
        m2: {
          status: "different",
          note: "milanesa",
          actualMacros: { kcal: 950, proteinG: 48, carbsG: 95, fatG: 38 },
        },
      }),
    ]);
    render(await NutritionNotesFeed({ notes, locale: "en" }));

    // Target 780 → ate 950 → +170. "Me pasé 170 kcal" is actionable; "no cumpliste" is not.
    expect(screen.getByText("+170")).toBeInTheDocument();
    expect(screen.getByText("-7")).toBeInTheDocument();
    // The rule is on the SCREEN, not only in a comment: a coach has to be able to see that
    // what the client ate never moves the percentage.
    expect(
      screen.getByText("What they ate is shown, never scored: it does not move adherence."),
    ).toBeInTheDocument();
  });

  it("stays empty when there is nothing to read", async () => {
    render(await NutritionNotesFeed({ notes: collectNutritionNotes([fullyDone(TODAY)]), locale: "en" }));
    expect(screen.getByTestId("nutrition-notes-empty")).toBeInTheDocument();
  });
});

describe("NutritionPhaseWeightTable", () => {
  it("puts what was asked, what was followed and what the body did on one line", async () => {
    const rows = buildNutritionPhaseRows(
      [phaseA()],
      logs,
      [
        { date: "2026-08-01", weight: 82.4 },
        { date: "2026-08-15", weight: 81.2 },
      ],
      TODAY,
      "plan-a",
    );
    render(await NutritionPhaseWeightTable({ rows, locale: "en" }));

    const row = screen.getByTestId("nutrition-phase-row");
    expect(within(row).getByText("Maintenance")).toBeInTheDocument();
    expect(within(row).getByText("2400")).toBeInTheDocument();
    expect(within(row).getByText("-1.2 kg")).toBeInTheDocument();
    // 14 days between weigh-ins, not the 18 days of phase-to-date.
    expect(within(row).getByText("-0.6 kg")).toBeInTheDocument();
  });

  it("refuses to invent a delta from a single weigh-in", async () => {
    const rows = buildNutritionPhaseRows(
      [phaseA()],
      logs,
      [{ date: "2026-08-03", weight: 82 }],
      TODAY,
      null,
    );
    render(await NutritionPhaseWeightTable({ rows, locale: "en" }));
    const row = screen.getByTestId("nutrition-phase-row");
    expect(within(row).getByTitle("Needs two weigh-ins")).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */

// coach-pulse.test.tsx
//
// The dashboard's four presentational pieces: the two 7-day charts, the
// podium, and the recent-activity row. Nothing here writes, so the assertions
// go to the SCREEN — same shape as workout-log-detail-view.test.tsx.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The distinction the whole card hangs on is NOTHING SCHEDULED vs SCHEDULED
// AND MISSED. Both are "0" and they mean opposite things: one is a rest day,
// the other is a client who didn't do the work. The component keeps them apart
// three separate times — the empty state, the bar height, and the label — and
// each one can regress on its own:
//
//   • THE EMPTY STATE IS `some`, NOT `every`. A week with a single scheduled
//     day still gets a chart; collapsing to "every day must have data" hides a
//     real week behind "no data yet".
//   • A ZERO-DENOMINATOR DAY IS A ZERO-HEIGHT MUTED BAR. The 4% floor that
//     keeps a missed day visible must NOT apply to it, or a rest day looks
//     exactly like a failed one.
//   • THE LABEL SAYS "nothing scheduled", never "0%".

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import React from "react";

import type { DailyMetric, PerformerRow } from "@/lib/gc-fitness/coach-pulse-actions";

import {
  ActivityRow,
  DailyBars,
  DailyLineChart,
  TopPerformers,
  type ActivityRowData,
} from "../_components/coach-pulse";

function day(overrides: Partial<DailyMetric> = {}): DailyMetric {
  return {
    civilDate: "2026-09-10",
    weekdayLabel: "THU",
    numerator: 3,
    denominator: 4,
    percentage: 75,
    ...overrides,
  };
}

const REST_DAY = day({
  civilDate: "2026-09-08",
  weekdayLabel: "TUE",
  numerator: 0,
  denominator: 0,
  percentage: 0,
});

const MISSED_DAY = day({
  civilDate: "2026-09-09",
  weekdayLabel: "WED",
  numerator: 0,
  denominator: 3,
  percentage: 0,
});

/** The bar/dot buttons, in render order. Their accessible name is the tooltip
 *  text, which is where the "nothing scheduled" wording lives. */
function pointLabels(): string[] {
  return screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
}

describe("DailyBars — a rest day is not a missed day", () => {
  it("renders the chart when even ONE day has something scheduled", () => {
    render(
      <DailyBars data={[REST_DAY, MISSED_DAY]} emptyLabel="No data yet" unitLabel="habits" />,
    );

    expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("falls back to the empty label only when NOTHING was scheduled all week", () => {
    render(
      <DailyBars
        data={[REST_DAY, { ...REST_DAY, civilDate: "2026-09-09" }]}
        emptyLabel="No data yet"
        unitLabel="habits"
      />,
    );

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("says 'nothing scheduled' for a rest day and gives the numbers for the rest", () => {
    render(
      <DailyBars data={[REST_DAY, MISSED_DAY, day()]} emptyLabel="x" unitLabel="habits" />,
    );

    expect(pointLabels()).toEqual([
      "TUE: nothing scheduled",
      "WED: 0 of 3 habits (0%)",
      "THU: 3 of 4 habits (75%)",
    ]);
  });

  it("draws a rest day at zero height and a missed day at the visible floor", () => {
    // Both are "0". Without the 4% floor the missed day disappears; with the
    // floor applied to the rest day too, a rest day grows a bar it should not
    // have.
    render(
      <DailyBars data={[REST_DAY, MISSED_DAY]} emptyLabel="x" unitLabel="habits" />,
    );

    const [rest, missed] = screen.getAllByRole("button").map((b) => b.firstElementChild as HTMLElement);
    expect(rest.style.height).toBe("0%");
    expect(missed.style.height).toBe("4%");
  });

  it("emphasises the LAST day, which is today", () => {
    const { container } = render(
      <DailyBars data={[REST_DAY, MISSED_DAY, day()]} emptyLabel="x" unitLabel="habits" />,
    );

    const labels = Array.from(
      container.querySelectorAll(".mt-2 > span"),
    ) as HTMLElement[];
    expect(labels.map((l) => l.textContent)).toEqual(["TUE", "WED", "THU"]);
    expect(labels.at(-1)?.className).toContain("font-semibold");
    expect(labels[0].className).not.toContain("font-semibold");
  });
});

describe("DailyLineChart — the same data as a line", () => {
  it("shares the bar chart's empty rule and its labels", () => {
    const { unmount } = render(
      <DailyLineChart data={[REST_DAY]} emptyLabel="No data yet" unitLabel="workouts" />,
    );
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    unmount();

    render(
      <DailyLineChart data={[REST_DAY, MISSED_DAY]} emptyLabel="No data yet" unitLabel="workouts" />,
    );
    expect(pointLabels()).toEqual([
      "TUE: nothing scheduled",
      "WED: 0 of 3 workouts (0%)",
    ]);
  });

  it("INVERTS the percentage into the viewBox — 100% sits at the top", () => {
    // y = 100 - percentage. Getting the sign wrong flips the whole chart and
    // it still looks like a plausible line.
    render(
      <DailyLineChart
        data={[day({ percentage: 0 }), day({ percentage: 100 })]}
        emptyLabel="x"
        unitLabel="workouts"
      />,
    );

    const [low, high] = screen.getAllByRole("button") as HTMLElement[];
    expect(low.style.top).toBe("100%");
    expect(high.style.top).toBe("0%");
  });

  it("spaces the points evenly across the width", () => {
    render(
      <DailyLineChart
        data={[day(), day({ civilDate: "2026-09-11" }), day({ civilDate: "2026-09-12" })]}
        emptyLabel="x"
        unitLabel="workouts"
      />,
    );

    expect(
      (screen.getAllByRole("button") as HTMLElement[]).map((b) => b.style.left),
    ).toEqual(["0%", "50%", "100%"]);
  });

  it("centres a lone point instead of dividing by zero", () => {
    render(<DailyLineChart data={[day()]} emptyLabel="x" unitLabel="workouts" />);

    expect((screen.getByRole("button") as HTMLElement).style.left).toBe("50%");
  });
});

describe("TopPerformers", () => {
  function performer(overrides: Partial<PerformerRow> = {}): PerformerRow {
    return {
      uid: "ana",
      name: "Ana Gomez",
      photoURL: null,
      pct: 90,
      numerator: 9,
      denominator: 10,
      ...overrides,
    };
  }

  it("ranks from 1 and links each row to the client", () => {
    render(
      <TopPerformers
        performers={[performer(), performer({ uid: "beto", name: "Beto Diaz", pct: 80 })]}
      />,
    );

    const [first, second] = screen.getAllByRole("link");
    expect(within(first).getByText("1")).toBeInTheDocument();
    expect(first).toHaveAttribute("href", "/gc-fitness/clients/ana");
    expect(within(second).getByText("2")).toBeInTheDocument();
    expect(second).toHaveAttribute("href", "/gc-fitness/clients/beto");
  });

  it("shows the ratio behind the percentage", () => {
    // 90% off 9/10 and 90% off 45/50 are different weeks; the percentage alone
    // hides how much the client was actually asked to do.
    render(<TopPerformers performers={[performer()]} />);

    expect(screen.getByText("9/10")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("uses the caller's empty label, falling back to its own", () => {
    const { unmount } = render(<TopPerformers performers={[]} emptyLabel="Nobody yet" />);
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    unmount();

    render(<TopPerformers performers={[]} />);
    expect(screen.getByText("No habit activity to rank yet.")).toBeInTheDocument();
  });
});

describe("ActivityRow", () => {
  function activity(overrides: Partial<ActivityRowData> = {}): ActivityRowData {
    return {
      uid: "ana",
      name: "Ana Gomez",
      photoURL: null,
      primary: "Completed Upper Body",
      timeLabel: "2h ago",
      ratio: 0.8,
      stale: false,
      ...overrides,
    };
  }

  it("marks an on-track client with the check, a stale one with the clock", () => {
    const { container, unmount } = render(<ActivityRow row={activity()} />);
    expect(container.querySelector(".lucide-circle-check")).not.toBeNull();
    expect(container.querySelector(".lucide-clock")).toBeNull();
    unmount();

    const { container: stale } = render(<ActivityRow row={activity({ stale: true })} />);
    expect(stale.querySelector(".lucide-clock")).not.toBeNull();
    expect(stale.querySelector(".lucide-circle-check")).toBeNull();
  });

  it("prints the server-rendered copy verbatim and links to the client", () => {
    // Both `primary` and `timeLabel` are localized server-side; the row must
    // not re-derive them.
    render(<ActivityRow row={activity()} />);

    expect(screen.getByText("Completed Upper Body")).toBeInTheDocument();
    expect(screen.getByText("2h ago")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/gc-fitness/clients/ana");
  });
});

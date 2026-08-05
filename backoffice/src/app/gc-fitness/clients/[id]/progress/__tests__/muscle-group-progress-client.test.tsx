/**
 * @jest-environment jsdom
 */

// muscle-group-progress-client.test.tsx
//
// Weekly sets + volume per muscle group. As with the per-exercise chart, the
// maths already has pure tests (`muscle-group-weeks`, `muscle-group-display`,
// `muscle-group-preferences`); what nobody covered is the component's own job:
// which weeks land in the window, which groups are drawn, and what the coach's
// saved preferences are allowed to override.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
//   • A STORED SELECTION WINS OUTRIGHT (#578), INCLUDING AN EMPTY ONE. An empty
//     stored array means "the coach unticked everything", not "nothing saved" —
//     falling back to the defaults there re-adds chips the coach removed, every
//     single time they open the page. It is also NOT intersected with the
//     client's available groups: a group this client doesn't train is simply
//     not drawn, and stays in the preference for the next client.
//   • THE ORDER IS CANONICAL, NOT CLICK ORDER. Lines and legend entries have to
//     keep their position when a group is toggled off and back on, or the
//     colours shuffle under the coach mid-comparison.
//   • PROJECTED WEEKS ONLY EXIST WHEN THERE IS A PROJECTION (#568). With no
//     upcoming scheduled work the future weeks must not appear as empty
//     columns — an empty projected week reads as "nothing planned AND nothing
//     done".
//   • THE READOUT SHOWS LOGGED → PROJECTED. On a Monday the logged figure alone
//     says "1 set this week" for a client with four sessions booked.
//
// Recharts renders nothing measurable under jsdom, so the assertions read the
// per-group readout line, which is computed from the same `windowWeeks` slice
// the charts receive.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { MUSCLE_PREFERENCE_KEYS } from "@/lib/gc-fitness/muscle-group-preferences";
import type { MuscleGroupWeekPoint } from "@/lib/gc-fitness/muscle-group-weeks";

import { MuscleGroupProgressClient } from "../MuscleGroupProgressClient";

const CURRENT_WEEK = "2026-08-03"; // a Monday
const RANGE_STARTS = {
  all: "2025-08-04",
  "90": "2026-05-11",
  "30": "2026-07-06",
  "7": "2026-07-27",
};

function week(
  weekStart: string,
  byGroup: Record<string, number>,
  extra: Partial<MuscleGroupWeekPoint> = {},
): MuscleGroupWeekPoint {
  return {
    weekStart,
    byGroup: Object.fromEntries(
      Object.entries(byGroup).map(([g, sets]) => [g, { sets, volume: sets * 100 }]),
    ),
    projected: false,
    ...extra,
  } as MuscleGroupWeekPoint;
}

function renderChart(
  props: Partial<React.ComponentProps<typeof MuscleGroupProgressClient>> = {},
) {
  render(
    <MuscleGroupProgressClient
      availableGroups={["chest", "back", "legs"]}
      weeks={[week(CURRENT_WEEK, { chest: 10, back: 8, legs: 6 })]}
      currentWeekStart={CURRENT_WEEK}
      rangeStarts={RANGE_STARTS}
      {...props}
    />,
  );
  return { user: userEvent.setup() };
}

/** The per-group readout lines, in DOM order: ["Chest", "Back", …]. */
function readoutGroups(): string[] {
  return Array.from(document.querySelectorAll("span.inline-flex"))
    .map((n) => n.querySelector("span.text-foreground")?.textContent ?? "")
    .filter(Boolean);
}

/**
 * A muscle-group chip. They are `role="checkbox"` (an aria-checked toggle),
 * NOT buttons — `getByRole("button", …)` misses every one of them.
 */
function groupChip(_user: unknown, label: string): HTMLElement {
  return screen.getByRole("checkbox", { name: label });
}

/** The readout text for one group, e.g. "10 sets this week → 14 projected". */
function readoutFor(group: string): string {
  const line = Array.from(document.querySelectorAll("span.inline-flex")).find(
    (n) => n.querySelector("span.text-foreground")?.textContent === group,
  );
  return line?.querySelector("span.tabular-nums")?.textContent ?? "";
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("MuscleGroupProgressClient — the saved selection (#578)", () => {
  it("restores the coach's stored chips over the defaults", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["legs"]),
    );

    renderChart();

    await waitFor(() => expect(readoutGroups()).toEqual(["Legs"]));
  });

  it("treats an EMPTY stored selection as a real choice", async () => {
    // The distinction that matters: `[]` is "I unticked everything", not
    // "nothing saved". Falling back to the defaults here re-adds the chips the
    // coach removed, every time they open the page.
    window.localStorage.setItem(MUSCLE_PREFERENCE_KEYS.selected, JSON.stringify([]));

    renderChart();

    await waitFor(() => expect(readoutGroups()).toEqual([]));
    expect(
      screen.getByText("Select muscle groups above to compare them."),
    ).toBeInTheDocument();
  });

  it("keeps a stored group this client doesn't train, without drawing it", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest", "shoulders"]),
    );

    const { user } = renderChart({ availableGroups: ["chest", "back"] });

    // Not drawn — this client has no shoulders data.
    await waitFor(() => expect(readoutGroups()).toEqual(["Chest"]));

    // …but still IN the preference. Intersecting at restore time is invisible
    // on screen (the chip list is already scoped to `availableGroups`) and only
    // shows on the next write: the group would be silently dropped from the
    // coach's saved selection by opening a client who doesn't train it.
    // Verified by mutation — asserting only the readout left the intersection
    // undetectable.
    await user.click(groupChip(user, "Back"));

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(MUSCLE_PREFERENCE_KEYS.selected) ?? "[]",
      );
      expect(stored).toContain("shoulders");
    });
  });

  it("persists a toggle so the next visit starts there", async () => {
    const { user } = renderChart();
    await waitFor(() => expect(readoutGroups().length).toBeGreaterThan(0));

    await user.click(groupChip(user, "Legs"));

    await waitFor(() =>
      expect(
        window.localStorage.getItem(MUSCLE_PREFERENCE_KEYS.selected),
      ).toBeTruthy(),
    );
    const stored = JSON.parse(
      window.localStorage.getItem(MUSCLE_PREFERENCE_KEYS.selected) ?? "[]",
    );
    expect(stored).not.toContain("legs");
  });
});

describe("MuscleGroupProgressClient — the group order", () => {
  it("keeps the canonical order, not the click order", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["legs"]),
    );
    const { user } = renderChart();
    await waitFor(() => expect(readoutGroups()).toEqual(["Legs"]));

    await user.click(groupChip(user, "Chest"));

    // Chest was clicked LAST but comes first: line colours and legend entries
    // must not shuffle under the coach mid-comparison.
    await waitFor(() => expect(readoutGroups()).toEqual(["Chest", "Legs"]));
  });
});

describe("MuscleGroupProgressClient — the week window", () => {
  const WEEKS = [
    week("2026-05-04", { chest: 4 }),
    week("2026-07-13", { chest: 8 }),
    week(CURRENT_WEEK, { chest: 10 }),
  ];

  it("drops weeks older than the selected range", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest"]),
    );
    // Only an OLD week, so narrowing the range empties the window entirely and
    // the readout's fallback has nothing left to fall back to. (With the
    // current week present the filter is invisible here — recharts renders
    // nothing measurable under jsdom, so this fallback is the only window
    // observable the component exposes.)
    // Inside the default 30-day window (starts 2026-07-06) and outside the
    // 7-day one (starts 2026-07-27).
    const { user } = renderChart({
      weeks: [week("2026-07-13", { chest: 4 })],
      currentWeekStart: CURRENT_WEEK,
    });
    await waitFor(() => expect(readoutFor("Chest")).toContain("4"));

    await user.click(screen.getByRole("tab", { name: "7d" }));

    await waitFor(() => expect(readoutFor("Chest")).toContain("0"));
  });

  it("keeps the whole history under the widest range", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest"]),
    );
    const { user } = renderChart({ weeks: WEEKS, currentWeekStart: "2026-09-07" });

    await user.click(screen.getByRole("tab", { name: "All" }));

    // Newest week in the window, since "today" has no point of its own.
    await waitFor(() => expect(readoutFor("Chest")).toContain("10"));
  });

  it("falls back to the last week in the window when 'today' is outside it", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest"]),
    );
    renderChart({
      weeks: [week("2026-07-13", { chest: 8 })],
      currentWeekStart: CURRENT_WEEK, // no week point for it
    });

    // A client who hasn't trained this week still gets a readout — of their
    // most recent week, not a blank.
    await waitFor(() => expect(readoutFor("Chest")).toContain("8"));
  });
});

describe("MuscleGroupProgressClient — the projection (#568)", () => {
  it("shows logged → projected when there is upcoming work", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest"]),
    );
    renderChart({
      weeks: [
        week(CURRENT_WEEK, { chest: 2 }, {
          projectedByGroup: { chest: { sets: 12, volume: 1200 } },
        } as Partial<MuscleGroupWeekPoint>),
      ],
    });

    // On a Monday, "2 sets this week" is technically true and useless.
    await waitFor(() => expect(readoutFor("Chest")).toContain("12"));
  });

  it("shows the plain figure when nothing is scheduled ahead", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest"]),
    );
    renderChart({ weeks: [week(CURRENT_WEEK, { chest: 9 })] });

    const text = readoutFor("Chest");
    await waitFor(() => expect(text).toContain("9"));
    // No arrow, no phantom projection.
    expect(text).not.toContain("→");
  });

  it("hides projected-only weeks when the client has no upcoming work", async () => {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(["chest"]),
    );
    renderChart({
      weeks: [
        week("2026-07-13", { chest: 9 }),
        // A future week carrying no projection: an empty column that reads as
        // "nothing planned AND nothing done".
        week("2026-08-10", {}, { projected: true }),
      ],
      // No week point for "today", so the readout falls back to the LAST week
      // in the window — which is exactly where a stray projected-empty week
      // does its damage, and the only place jsdom can see the filter at all.
      currentWeekStart: CURRENT_WEEK,
    });

    await waitFor(() => expect(readoutFor("Chest")).toContain("9"));
  });
});

describe("MuscleGroupProgressClient — nothing logged", () => {
  it("explains instead of drawing empty axes", () => {
    renderChart({ availableGroups: [], weeks: [] });

    expect(
      screen.getByText("This client hasn't logged any completed sets yet."),
    ).toBeInTheDocument();
  });
});

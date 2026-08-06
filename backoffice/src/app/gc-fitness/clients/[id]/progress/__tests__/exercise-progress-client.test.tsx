/**
 * @jest-environment jsdom
 */

// exercise-progress-client.test.tsx
//
// Per-exercise progress. The maths behind every number here already has pure
// unit tests; what nobody covered is the part that decides WHICH numbers the
// component feeds them — the range window, the metric, and the exercise
// selection.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The window is where this surface has already broken (#526): the evolution
// chart showed roughly one month of history because of a stack of independent
// caps. The rules the component owns:
//
//   • THE RANGE SELECTOR FILTERS THE CHART, NEVER THE SESSION LIST (#574). The
//     list is the exercise's history — "See more" is what keeps it manageable.
//     Leaking the range into it hides sessions the coach came to read, with no
//     indication that a filter is doing it.
//   • A NULL METRIC IS DROPPED, NOT PLOTTED AS ZERO. A bodyweight session has
//     no top set and no estimated 1RM; charting those as 0 draws a cliff into
//     the client's progression that never happened.
//   • THE POINTS ARE RE-SORTED ASCENDING. The server emits sessions
//     newest-first, so "Latest" is the LAST element only after the sort — read
//     off the raw array it is the OLDEST session.
//   • NARROWING THE MUSCLE FILTER RE-SELECTS A VALID EXERCISE. Otherwise the
//     picker shows a list that doesn't contain the exercise being charted.
//
// Recharts renders nothing measurable under jsdom (no layout), so the chart's
// content is asserted through the "Latest: <value> <unit>" line, which is
// computed from exactly the same `chartPoints` array the chart receives.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type {
  ExerciseSessionPoint,
  ExerciseSetSession,
  LoggedExerciseOption,
} from "@/lib/gc-fitness/exercise-progress-actions";

import { ExerciseProgressClient } from "../ExerciseProgressClient";

const TODAY = "2026-08-05";

// Matches the real `rangeStarts` the server computes for each key.
const RANGE_STARTS = {
  all: "2025-08-05",
  "90": "2026-05-07",
  "30": "2026-07-06",
  "7": "2026-07-29",
};

const LABELS = {
  exercisePickerLabel: "Exercise",
  metricTopSet: "Top set",
  metricE1rm: "Est. 1RM",
  metricVolume: "Volume",
  weightUnit: "kg",
  volumeUnit: "kg",
  latestPrefix: "Latest:",
  emptyNoExercises: "This client hasn't logged any weighted exercise yet.",
  emptyNoData: "No data for this exercise in the selected range.",
  tooltipTopSet: "Top set",
  tooltipE1rm: "Est. 1RM",
  tooltipVolume: "Volume",
  ranges: { all: "All", "90": "90d", "30": "30d", "7": "7d" },
};

function option(overrides: Partial<LoggedExerciseOption> = {}): LoggedExerciseOption {
  return {
    exerciseId: "bench",
    name: "Bench Press",
    searchAliases: [],
    sessionCount: 3,
    muscleGroups: ["chest"],
    ...overrides,
  } as LoggedExerciseOption;
}

function point(overrides: Partial<ExerciseSessionPoint> = {}): ExerciseSessionPoint {
  return {
    exerciseId: "bench",
    date: TODAY,
    topSetWeightKg: 80,
    estimatedOneRmKg: 92.5,
    volumeKg: 2400,
    ...overrides,
  };
}

function session(overrides: Partial<ExerciseSetSession> = {}): ExerciseSetSession {
  return {
    exerciseId: "bench",
    date: TODAY,
    logId: `log-${overrides.date ?? TODAY}`,
    sets: [
      { reps: 8, weightKg: 80, setType: "normal", isPR: false } as unknown as ExerciseSetSession["sets"][number],
    ],
    ...overrides,
  } as ExerciseSetSession;
}

function renderProgress(
  props: Partial<React.ComponentProps<typeof ExerciseProgressClient>> = {},
) {
  render(
    <ExerciseProgressClient
      exercises={[option()]}
      points={[point()]}
      setSessions={[session()]}
      truncatedSetHistoryExerciseIds={[]}
      today={TODAY}
      rangeStarts={RANGE_STARTS}
      labels={LABELS}
      {...props}
    />,
  );
  return { user: userEvent.setup() };
}

/**
 * The "Latest: <value> <unit>" figure — the chart's last point, in text.
 *
 * Found by scanning the paragraphs rather than `getByText("Latest:")`: the
 * prefix shares its `<p>` with the value and the session count, and RTL's
 * default string matcher compares the ELEMENT's whole text, so the exact
 * lookup finds nothing.
 */
function latestValue(): string | null {
  const p = Array.from(document.querySelectorAll("p")).find((n) =>
    (n.textContent ?? "").startsWith("Latest:"),
  );
  return p?.querySelector("span")?.textContent?.trim() ?? null;
}

/** How many sessions the set-history list is showing. */
function sessionRows(): HTMLElement[] {
  const heading = screen.queryByText("Logged sets");
  if (!heading) return [];
  const block = heading.closest("div.flex-col")?.parentElement as HTMLElement;
  return Array.from(block.querySelectorAll(":scope > ul > li"));
}

/** The range pills are a `role="tablist"`, not buttons. */
function pickRange(user: ReturnType<typeof userEvent.setup>, label: string) {
  return user.click(screen.getByRole("tab", { name: label }));
}

/** The metric pills are a `role="tablist"` too, same as the range selector. */
function pickMetric(user: ReturnType<typeof userEvent.setup>, label: string) {
  return user.click(screen.getByRole("tab", { name: label }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ExerciseProgressClient — the range window", () => {
  const POINTS = [
    // Server order: newest first.
    point({ date: "2026-08-04", topSetWeightKg: 100 }),
    point({ date: "2026-06-01", topSetWeightKg: 90 }),
    point({ date: "2025-11-15", topSetWeightKg: 70 }),
  ];

  it("charts only the sessions inside the selected window", async () => {
    const { user } = renderProgress({ points: POINTS });

    // Default is 30d: only the August session qualifies.
    expect(latestValue()).toBe("100.0 kg");

    await pickRange(user, "All");

    // "All" is a bounded year — the 2025-11 session is inside it.
    await waitFor(() => expect(latestValue()).toBe("100.0 kg"));
    expect(screen.queryByText(LABELS.emptyNoData)).not.toBeInTheDocument();
  });

  it("says so when the window has no sessions at all", async () => {
    const { user } = renderProgress({
      points: [point({ date: "2026-06-01", topSetWeightKg: 90 })],
    });

    await pickRange(user, "7d");

    // Not an error, and not a zeroed chart: there is simply nothing in the
    // last week.
    expect(await screen.findByText(LABELS.emptyNoData)).toBeInTheDocument();
  });

  it("does NOT let the range touch the session list (#574)", async () => {
    const { user } = renderProgress({
      // Deliberately nothing inside the 7-day window (starts 2026-07-29), so
      // picking "7d" empties the CHART and the list has to survive it.
      points: [
        point({ date: "2026-07-20", topSetWeightKg: 100 }),
        point({ date: "2026-06-01", topSetWeightKg: 90 }),
        point({ date: "2025-11-15", topSetWeightKg: 70 }),
      ],
      setSessions: [
        session({ date: "2026-07-20" }),
        session({ date: "2026-06-01" }),
        session({ date: "2025-11-15" }),
      ],
    });

    expect(sessionRows()).toHaveLength(3);

    await pickRange(user, "7d");

    // The chart is now empty, and the history is still the history. This is the
    // #526 failure mode in miniature: a filter silently eating the sessions the
    // coach opened the page to read.
    expect(await screen.findByText(LABELS.emptyNoData)).toBeInTheDocument();
    expect(sessionRows()).toHaveLength(3);
  });
});

describe("ExerciseProgressClient — the metric", () => {
  it("reads a different field per metric", async () => {
    const { user } = renderProgress({
      points: [point({ topSetWeightKg: 80, estimatedOneRmKg: 92.5, volumeKg: 2400 })],
    });

    expect(latestValue()).toBe("80.0 kg");

    await pickMetric(user, "Est. 1RM");
    await waitFor(() => expect(latestValue()).toBe("92.5 kg"));

    await pickMetric(user, "Volume");
    // Volume is rounded, not one-decimal — it's a much bigger number.
    await waitFor(() => expect(latestValue()).toBe("2400 kg"));
  });

  it("DROPS a session whose metric is null instead of charting a zero", async () => {
    const { user } = renderProgress({
      points: [
        // A bodyweight session: reps logged, no weight, so no top set and no
        // estimated 1RM.
        point({ date: "2026-08-04", topSetWeightKg: null, estimatedOneRmKg: null, volumeKg: 0 }),
        point({ date: "2026-08-01", topSetWeightKg: 60, estimatedOneRmKg: 70, volumeKg: 1200 }),
      ],
    });

    // Latest CHARTED point is the 1st, not the 4th: plotting the null as 0
    // would draw a cliff into the client's progression that never happened.
    expect(latestValue()).toBe("60.0 kg");

    await pickMetric(user, "Est. 1RM");
    await waitFor(() => expect(latestValue()).toBe("70.0 kg"));
  });

  it("shows the empty state when every session lacks the metric", async () => {
    const { user } = renderProgress({
      points: [point({ topSetWeightKg: null, estimatedOneRmKg: null, volumeKg: 500 })],
    });

    expect(screen.getByText(LABELS.emptyNoData)).toBeInTheDocument();

    // …but volume still has data for the same sessions.
    await pickMetric(user, "Volume");
    await waitFor(() => expect(latestValue()).toBe("500 kg"));
  });
});

describe("ExerciseProgressClient — 'Latest' is chronological", () => {
  it("takes the newest session even though the server sends it first", () => {
    renderProgress({
      points: [
        // Newest-first, as the server emits it.
        point({ date: "2026-08-04", topSetWeightKg: 100 }),
        point({ date: "2026-07-20", topSetWeightKg: 85 }),
      ],
    });

    // Read off the raw array, "latest" would be the OLDEST session and the
    // chart would run backwards.
    expect(latestValue()).toBe("100.0 kg");
  });
});

describe("ExerciseProgressClient — the exercise selection", () => {
  const EXERCISES = [
    option({ exerciseId: "bench", name: "Bench Press", muscleGroups: ["chest"] }),
    option({ exerciseId: "row", name: "Barbell Row", muscleGroups: ["back"] }),
  ];
  const POINTS = [
    point({ exerciseId: "bench", topSetWeightKg: 100 }),
    point({ exerciseId: "row", topSetWeightKg: 70 }),
  ];

  it("starts on the first exercise", () => {
    renderProgress({ exercises: EXERCISES, points: POINTS });

    expect(screen.getByRole("combobox", { name: /Exercise/ })).toHaveTextContent(
      "Bench Press",
    );
    expect(latestValue()).toBe("100.0 kg");
  });

  it("re-selects a valid exercise when the muscle filter excludes the current one", async () => {
    const { user } = renderProgress({ exercises: EXERCISES, points: POINTS });

    await user.click(screen.getByRole("combobox", { name: "Muscle group" }));
    await user.click(await screen.findByRole("option", { name: "Back" }));

    // Leaving "Bench Press" selected would chart an exercise that isn't in the
    // (now back-only) picker list.
    await waitFor(() => expect(latestValue()).toBe("70.0 kg"));
    expect(
      screen.getByRole("combobox", { name: /Exercise/ }),
    ).toHaveTextContent("Barbell Row");
  });

  it("charts only the selected exercise's sessions", () => {
    renderProgress({
      exercises: EXERCISES,
      points: [
        point({ exerciseId: "bench", date: "2026-08-04", topSetWeightKg: 100 }),
        // A heavier row on a LATER date must not become the bench's "latest".
        point({ exerciseId: "row", date: "2026-08-05", topSetWeightKg: 140 }),
      ],
    });

    expect(latestValue()).toBe("100.0 kg");
  });
});

describe("ExerciseProgressClient — the session list paging", () => {
  const SESSIONS = Array.from({ length: 7 }, (_, i) =>
    session({ date: `2026-08-0${i + 1}`, logId: `log-${i}` }),
  );

  it("shows one page, then reveals more on demand", async () => {
    const { user } = renderProgress({ setSessions: SESSIONS });

    expect(sessionRows()).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /See more/ }));

    await waitFor(() => expect(sessionRows()).toHaveLength(6));
  });

  it("resets the page size when the coach switches exercise", async () => {
    const { user } = renderProgress({
      exercises: [
        option({ exerciseId: "bench", name: "Bench Press", muscleGroups: ["chest"] }),
        option({ exerciseId: "row", name: "Barbell Row", muscleGroups: ["back"] }),
      ],
      points: [point({ exerciseId: "bench" }), point({ exerciseId: "row" })],
      setSessions: [
        ...SESSIONS,
        ...Array.from({ length: 7 }, (_, i) =>
          session({ exerciseId: "row", date: `2026-08-0${i + 1}`, logId: `rowlog-${i}` }),
        ),
      ],
    });

    await user.click(screen.getByRole("button", { name: /See more/ }));
    expect(sessionRows()).toHaveLength(6);

    await user.click(screen.getByRole("combobox", { name: "Muscle group" }));
    await user.click(await screen.findByRole("option", { name: "Back" }));

    // A new exercise is a new history; carrying the expansion over shows a
    // page size the coach never asked for on this exercise.
    await waitFor(() => expect(sessionRows()).toHaveLength(3));
  });
});

describe("ExerciseProgressClient — nothing logged at all", () => {
  it("explains instead of rendering an empty chart frame", () => {
    renderProgress({ exercises: [], points: [], setSessions: [] });

    expect(screen.getByText(LABELS.emptyNoExercises)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

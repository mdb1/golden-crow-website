/**
 * @jest-environment jsdom
 */

// workout-log-detail-view.test.tsx
//
// The canonical read view of a workout that already happened — rendered both
// on `/workouts/[logId]` and inside the calendar's WorkoutDetailDialog.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// This is the ONE component in this regression net whose assertions are on the
// SCREEN rather than on an outgoing payload — the component is presentational
// and writes nothing. Its output IS the contract: it takes a resolved
// `WorkoutLogDetail` and is the only place a coach ever sees what their client
// actually did. Everything below is derived, and every derivation can be
// wrong in a way that still renders a perfectly convincing table:
//
//   • THE CLIENT'S TIMEZONE, not the host's (#747 sibling). The page is server
//     rendered on Vercel, i.e. in UTC. A workout finished at 23:15 in Buenos
//     Aires is 02:15 the NEXT DAY in UTC — so a dropped `timeZone`/`locale`
//     moves someone's Tuesday session to Wednesday.
//   • THE COMPLETION TIME IS RECONSTRUCTED. iOS writes the authoritative
//     elapsed time as `duration_seconds`; `completedAt` is unreliable and is
//     frequently stamped equal to `startedAt`. When it is, the view derives
//     start + duration instead of showing a workout that took zero minutes.
//   • REST IS A GAP, NOT A FIELD. Nothing on the log stores rest. It is the
//     delta between consecutive sets over the FLAT, completion-ordered list —
//     which is what makes it correct across a superset, where consecutive sets
//     belong to different exercises.
//   • GROUPING IS BY EXERCISE, ORDER IS BY FIRST APPEARANCE. A superset logs
//     A, B, A, B; the view must show two exercise blocks in the order they
//     started, not four blocks and not alphabetical ones.
//
// Fixtures use a fixed timezone + fixed ISO instants on purpose: this is one of
// the few places where a hardcoded date is REQUIRED rather than a smell, since
// the zone conversion is the thing under test.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import React from "react";

import { WorkoutLogDetailView } from "@/components/gc-fitness/workout-log-detail-view";
import type { WorkoutLogDetail } from "@/lib/gc-fitness/recent-logs-actions";

// UTC-3. Every instant below is chosen so the UTC rendering differs visibly.
const TZ = "America/Argentina/Buenos_Aires";

type LoggedSet = WorkoutLogDetail["sets"][number];

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    index: 1,
    setLogId: "set-1",
    exerciseId: "ex-bench",
    exerciseName: "Bench Press",
    metric: "reps",
    reps: 10,
    weight: 60,
    durationSeconds: null,
    completedAt: "2026-08-05T01:00:00.000Z",
    isWarmup: false,
    setType: "normal",
    isPR: false,
    prEstimatedOneRM: null,
    prPrevious: null,
    supersetGroup: null,
    ...overrides,
  } as LoggedSet;
}

function detail(overrides: Partial<WorkoutLogDetail> = {}): WorkoutLogDetail {
  return {
    id: "log-1",
    clientId: "client-1",
    clientName: "Ana Gomez",
    clientTimezone: TZ,
    coachName: "Manu",
    workoutName: "Push Day",
    startedAt: "2026-08-05T01:00:00.000Z",
    completedAt: "2026-08-05T02:15:00.000Z",
    status: "completed",
    setCount: 4,
    completedSetCount: 3,
    exerciseCount: 1,
    durationSeconds: null,
    rpe: null,
    athleteNotes: null,
    source: "client",
    sets: [set()],
    ...overrides,
  } as WorkoutLogDetail;
}

function renderDetail(d: WorkoutLogDetail) {
  render(<WorkoutLogDetailView detail={d} />);
}

/** The exercise block whose heading is `name`. */
function exerciseBlock(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  return heading.closest("div.rounded-2xl") as HTMLElement;
}

/**
 * The rest cell of a set row — the LAST column.
 *
 * Read exactly, not with `toHaveTextContent`: a substring match on "-" is
 * satisfied by "-300s" as happily as by the dash, which is exactly the bug the
 * negative-gap test is supposed to catch (verified by mutation — admitting
 * negative deltas left the loose version green).
 */
function restCell(row: HTMLElement): string {
  const cells = within(row).getAllByRole("cell");
  return cells[cells.length - 1].textContent ?? "";
}

/**
 * Metric tiles are label-over-value pairs; read the value under `label`.
 *
 * Scoped to the LABEL paragraph on purpose: "Completed" is both the label of
 * the completion-time tile and the VALUE of the status tile, so a plain
 * `getByText("Completed")` matches two nodes and throws.
 */
function metricValue(label: string): string {
  const labelNode = Array.from(
    document.querySelectorAll("p.uppercase.tracking-wide"),
  ).find((p) => p.textContent === label);
  if (!labelNode) throw new Error(`metric tile "${label}" not found`);
  return labelNode.parentElement?.querySelector("p:last-child")?.textContent ?? "";
}

describe("WorkoutLogDetailView — grouping", () => {
  it("collapses an interleaved superset into two blocks, in start order", () => {
    // A superset logs A, B, A, B. Four blocks (or alphabetical ones) would
    // misrepresent how the session was actually run.
    renderDetail(
      detail({
        exerciseCount: 2,
        sets: [
          set({ index: 1, setLogId: "s1", exerciseId: "ex-row", exerciseName: "Row", supersetGroup: "A" }),
          set({ index: 1, setLogId: "s2", exerciseId: "ex-bench", exerciseName: "Bench Press", supersetGroup: "A" }),
          set({ index: 2, setLogId: "s3", exerciseId: "ex-row", exerciseName: "Row", supersetGroup: "A" }),
          set({ index: 2, setLogId: "s4", exerciseId: "ex-bench", exerciseName: "Bench Press", supersetGroup: "A" }),
        ],
      }),
    );

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Row", "Bench Press"]);
    // Both of Row's sets are inside Row's block.
    expect(within(exerciseBlock("Row")).getAllByRole("row")).toHaveLength(3); // header + 2
  });

  it("labels the superset block", () => {
    renderDetail(
      detail({
        sets: [set({ supersetGroup: "B" })],
      }),
    );

    expect(screen.getByText(/Superserie B/)).toBeInTheDocument();
  });

  it("says so when nothing was logged", () => {
    renderDetail(detail({ sets: [], completedSetCount: 0 }));

    expect(
      screen.getByText("No sets logged for this workout."),
    ).toBeInTheDocument();
  });
});

describe("WorkoutLogDetailView — reps vs time exercises", () => {
  it("drops the weight column for a time-only exercise", () => {
    renderDetail(
      detail({
        sets: [
          set({
            exerciseId: "ex-plank",
            exerciseName: "Plank",
            metric: "time",
            reps: null,
            weight: null,
            durationSeconds: 45,
          }),
        ],
      }),
    );

    const block = exerciseBlock("Plank");
    // A weight column on a plank is a column of dashes pretending to be data.
    expect(within(block).queryByText("Weight")).not.toBeInTheDocument();
    expect(within(block).getByText("Sec")).toBeInTheDocument();
    expect(within(block).getByText("45s")).toBeInTheDocument();
  });

  it("keeps reps + weight for a reps exercise, dashing a missing weight", () => {
    renderDetail(
      detail({
        sets: [
          set({ index: 1, setLogId: "s1", reps: 10, weight: 60 }),
          set({ index: 2, setLogId: "s2", reps: 8, weight: null }),
        ],
      }),
    );

    const block = exerciseBlock("Bench Press");
    expect(within(block).getByText("Reps")).toBeInTheDocument();
    expect(within(block).getByText("60 kg")).toBeInTheDocument();
    // Bodyweight / unrecorded → dash, never "0 kg" (which is a claim).
    expect(within(block).getAllByText("-").length).toBeGreaterThan(0);
  });

  it("reports the heaviest set of the block", () => {
    renderDetail(
      detail({
        sets: [
          set({ index: 1, setLogId: "s1", weight: 60 }),
          set({ index: 2, setLogId: "s2", weight: 80 }),
          set({ index: 3, setLogId: "s3", weight: 70 }),
        ],
      }),
    );

    expect(screen.getByText("Top: 80 kg")).toBeInTheDocument();
  });
});

describe("WorkoutLogDetailView — rest is derived from the gaps", () => {
  it("has no rest on the first set and the real gap afterwards", () => {
    renderDetail(
      detail({
        sets: [
          set({ index: 1, setLogId: "s1", completedAt: "2026-08-05T01:00:00.000Z" }),
          // +90s
          set({ index: 2, setLogId: "s2", completedAt: "2026-08-05T01:01:30.000Z" }),
          // +45s
          set({ index: 3, setLogId: "s3", completedAt: "2026-08-05T01:02:15.000Z" }),
        ],
      }),
    );

    const rows = within(exerciseBlock("Bench Press")).getAllByRole("row");
    // rows[0] is the header.
    expect(restCell(rows[1])).toBe("-"); // nothing preceded set 1
    expect(restCell(rows[2])).toBe("1m 30s");
    expect(restCell(rows[3])).toBe("45s");
  });

  it("carries the gap ACROSS exercises, which is what a superset needs", () => {
    // The rest before Bench's first set is the gap from Row's set — the two
    // are consecutive in time even though they're in different blocks. Reset
    // the computation per block and every superset transition reads as "-".
    renderDetail(
      detail({
        exerciseCount: 2,
        sets: [
          set({ index: 1, setLogId: "s1", exerciseId: "ex-row", exerciseName: "Row", completedAt: "2026-08-05T01:00:00.000Z" }),
          set({ index: 1, setLogId: "s2", completedAt: "2026-08-05T01:02:00.000Z" }),
        ],
      }),
    );

    const benchRows = within(exerciseBlock("Bench Press")).getAllByRole("row");
    expect(restCell(benchRows[1])).toBe("2m");
  });

  it("omits a non-positive gap instead of printing a negative rest", () => {
    renderDetail(
      detail({
        sets: [
          set({ index: 1, setLogId: "s1", completedAt: "2026-08-05T01:05:00.000Z" }),
          // Logged out of order (offline drain, re-stamped set) — earlier than
          // the one before it.
          set({ index: 2, setLogId: "s2", completedAt: "2026-08-05T01:00:00.000Z" }),
        ],
      }),
    );

    const rows = within(exerciseBlock("Bench Press")).getAllByRole("row");
    expect(restCell(rows[2])).toBe("-");
  });
});

describe("WorkoutLogDetailView — the client's clock, not the server's", () => {
  it("renders set times in the CLIENT timezone", () => {
    // 02:15Z is 23:15 the PREVIOUS day in Buenos Aires.
    renderDetail(
      detail({
        sets: [set({ completedAt: "2026-08-05T02:15:00.000Z" })],
      }),
    );

    const block = exerciseBlock("Bench Press");
    expect(within(block).getByText("11:15 PM")).toBeInTheDocument();
  });

  it("dates the session by the client's day, not UTC's", () => {
    renderDetail(
      detail({
        startedAt: "2026-08-05T01:00:00.000Z",
        completedAt: "2026-08-05T02:15:00.000Z",
        sets: [set()],
      }),
    );

    // In UTC this session is on August 5th. It happened on the 4th.
    expect(screen.getByText(/Tuesday, August 4, 2026/)).toBeInTheDocument();
  });
});

describe("WorkoutLogDetailView — the completion time is reconstructed", () => {
  it("derives start + duration when completedAt equals startedAt", () => {
    // The finalize path frequently stamps both the same; taking it literally
    // shows a 45-minute workout as instantaneous.
    renderDetail(
      detail({
        startedAt: "2026-08-05T01:00:00.000Z",
        completedAt: "2026-08-05T01:00:00.000Z",
        durationSeconds: 45 * 60,
      }),
    );

    expect(metricValue("Started")).toContain("10:00 PM");
    expect(metricValue("Completed")).toContain("10:45 PM");
  });

  it("prefers a real completedAt over the stored duration", () => {
    renderDetail(
      detail({
        startedAt: "2026-08-05T01:00:00.000Z",
        completedAt: "2026-08-05T02:15:00.000Z",
        durationSeconds: 45 * 60,
      }),
    );

    expect(metricValue("Completed")).toContain("11:15 PM");
  });

  it("falls back to startedAt when there is neither", () => {
    renderDetail(
      detail({
        startedAt: "2026-08-05T01:00:00.000Z",
        completedAt: null,
        durationSeconds: null,
      }),
    );

    expect(metricValue("Completed")).toContain("10:00 PM");
  });
});

describe("WorkoutLogDetailView — PRs (#405)", () => {
  it("badges the block and shows the record that was beaten", () => {
    renderDetail(
      detail({
        sets: [
          set({ index: 1, setLogId: "s1" }),
          set({
            index: 2,
            setLogId: "s2",
            weight: 100,
            reps: 5,
            isPR: true,
            prEstimatedOneRM: 116.7,
            prPrevious: {
              weightKg: 95,
              reps: 5,
              estimatedOneRM: 110.8,
              durationSeconds: null,
            },
          }),
        ],
      }),
    );

    // "New PR" means nothing without what it beat.
    expect(screen.getByText(/prev 95 kg × 5/)).toBeInTheDocument();
    expect(screen.getAllByText("PR").length).toBeGreaterThan(0);
  });

  it("shows no PR chrome on a workout without one", () => {
    renderDetail(detail({ sets: [set()] }));

    expect(screen.queryByText("PR")).not.toBeInTheDocument();
    expect(screen.queryByText(/prev /)).not.toBeInTheDocument();
  });

  it("renders a time PR's previous as a duration", () => {
    renderDetail(
      detail({
        sets: [
          set({
            exerciseId: "ex-plank",
            exerciseName: "Plank",
            metric: "time",
            reps: null,
            weight: null,
            durationSeconds: 90,
            isPR: true,
            prEstimatedOneRM: null,
            prPrevious: {
              weightKg: 0,
              reps: 0,
              estimatedOneRM: 0,
              durationSeconds: 75,
            },
          }),
        ],
      }),
    );

    // "0 kg × 0" would be the reps formatting leaking onto a plank.
    expect(screen.getByText(/prev 75s/)).toBeInTheDocument();
  });
});

describe("WorkoutLogDetailView — set types (#403)", () => {
  it("marks a non-normal set with its letter and leaves normals bare", () => {
    renderDetail(
      detail({
        sets: [
          set({ index: 1, setLogId: "s1", setType: "warmup", isWarmup: true }),
          set({ index: 2, setLogId: "s2", setType: "failure" }),
          set({ index: 3, setLogId: "s3" }),
        ],
      }),
    );

    expect(screen.getByLabelText("Calentamiento")).toHaveTextContent("W");
    expect(screen.getByLabelText("Al fallo")).toHaveTextContent("F");
    // Exactly two badges — a "normal" badge would make every row noisy.
    expect(screen.queryByLabelText("Normal")).not.toBeInTheDocument();
  });
});

describe("WorkoutLogDetailView — the header facts", () => {
  it("shows logged vs prescribed set counts", () => {
    renderDetail(detail({ completedSetCount: 3, setCount: 4 }));

    // "3/4" is how a coach sees the client stopped early. A bare "3" hides it.
    expect(metricValue("Sets logged")).toBe("3/4");
  });

  it("distinguishes a coach-run session from a client-run one", () => {
    renderDetail(detail({ source: "coach" }));
    expect(screen.getByText("Coach-run")).toBeInTheDocument();
  });

  it("treats a missing source as client-run", () => {
    renderDetail(detail({ source: undefined }));
    expect(screen.getByText("Client-run")).toBeInTheDocument();
  });

  it("reports RPE, or says it wasn't reported", () => {
    const { unmount } = render(<WorkoutLogDetailView detail={detail({ rpe: null })} />);
    expect(
      screen.getByText("Client did not report effort."),
    ).toBeInTheDocument();
    unmount();

    renderDetail(detail({ rpe: 7 }));
    expect(screen.getByText("7 / 10")).toBeInTheDocument();
  });

  it("shows the client's own notes verbatim", () => {
    renderDetail(detail({ athleteNotes: "Hombro molesto en la 3a" }));
    expect(screen.getByText("Hombro molesto en la 3a")).toBeInTheDocument();
  });
});

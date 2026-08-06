/**
 * @jest-environment jsdom
 */

// client-calendar-peek.test.tsx
//
// The mini calendar on the client-detail page: a 7-day window (anchor ± 3)
// that WRITES — a chip dragged onto another day calls `moveAssignment`, the
// same server action the Agenda's month calendar uses.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// This surface is a TWIN of `month-calendar.tsx`'s drag path (#461 copied the
// semantics deliberately), so the same four branches decide everything, and a
// drift between the two is invisible until a coach drags on the wrong page:
//
//   1. THE FORK. A one-off moves immediately with `scope: "one"`; a recurring
//      one must stop and ask, because `scope: "all"` rewrites every occurrence.
//   2. `recurrenceKind === "single"` COUNTS AS NON-RECURRING even with a
//      `seriesId` present — assignments created one at a time still carry one,
//      so a `seriesId`-only check prompts on every ordinary drag.
//   3. THE SAME-DAY NO-OP. Lifting a chip and dropping it back must not write.
//   4. #449/#461 — a CLIENT-CREATED workout is not draggable at all;
//      `moveAssignment` throws on ownership, so the guard keeps the coach from
//      ever seeing that error.
//
// Two things that are only true HERE (the Agenda gets them for free from
// React Query, this component keeps the week in `useState`):
//
//   • A successful move must RE-FETCH the visible week by hand. Without it the
//     chip stays painted on the day it was dragged off of.
//   • A failed re-fetch must keep the previously loaded week on screen behind
//     the error banner, not blank the grid.
//
// Note on the drag mechanics: `user-event` has no drag-and-drop API (HTML5 DnD
// isn't implemented in jsdom either), so these tests fire the two React
// synthetic events the component listens to — `dragStart` on the row and
// `drop` on the target cell — with a stub `dataTransfer`. That is exactly the
// pair a browser delivers.

import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ClientCalendarPeekPayload } from "@/lib/gc-fitness/client-calendar-peek-actions";
import type {
  MonthHabitChip,
  MonthWorkoutChip,
} from "@/lib/gc-fitness/schedule-month-actions";

// Both action modules import firebase-admin, which explodes on import under
// jsdom. Mocked at the module boundary — the component only ever reaches
// Firestore through these two.
const mockGetClientCalendarPeek = jest.fn();
jest.mock("@/lib/gc-fitness/client-calendar-peek-actions", () => ({
  getClientCalendarPeek: (...args: unknown[]) =>
    mockGetClientCalendarPeek(...args),
}));

const mockMoveAssignment = jest.fn();
jest.mock("@/lib/gc-fitness/schedule-month-actions", () => ({
  moveAssignment: (...args: unknown[]) => mockMoveAssignment(...args),
}));

// The move dialog and the detail dialog are stubbed rather than mounted: what
// this file tests is the SHELL's decision — whether the prompt opens at all,
// with which chip and which target date, and what it does with the scope that
// comes back. Their own contracts are pinned in move-assignment-dialog.test.tsx
// and workout-detail-dialog.test.tsx.
const mockMoveDialogProps = jest.fn();
jest.mock("@/components/gc-fitness/schedule/move-assignment-dialog", () => ({
  MoveAssignmentDialog: (props: {
    chip: { id: string };
    newDate: string;
    onConfirm: (scope: "one" | "future" | "all") => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockMoveDialogProps(props);
    return (
      <div data-testid="move-dialog">
        <span data-testid="move-dialog-chip">{props.chip.id}</span>
        <span data-testid="move-dialog-date">{props.newDate}</span>
        <button type="button" onClick={() => props.onConfirm("all")}>
          scope-all
        </button>
        <button type="button" onClick={() => props.onOpenChange(false)}>
          dismiss-move
        </button>
      </div>
    );
  },
}));

const mockDetailDialogProps = jest.fn();
jest.mock("@/components/gc-fitness/schedule/workout-detail-dialog", () => ({
  WorkoutDetailDialog: (props: {
    assignmentId: string;
    onDeleted: () => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockDetailDialogProps(props);
    return (
      <div data-testid="detail-dialog">
        <span data-testid="detail-dialog-id">{props.assignmentId}</span>
        <button type="button" onClick={() => props.onDeleted()}>
          detail-deleted
        </button>
      </div>
    );
  },
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { ClientCalendarPeek } from "../ClientCalendarPeek";

const CLIENT_ID = "client-1";
// The window is anchor ± 3, so this renders 2026-09-07 … 2026-09-13. Day
// NUMBERS 7..13 each appear exactly once in the grid, which is what the drop
// target is matched on.
const TODAY = "2026-09-10";
const SOURCE_DAY = "2026-09-09";
const TARGET_DAY = "2026-09-12";

function chip(overrides: Partial<MonthWorkoutChip> = {}): MonthWorkoutChip {
  return {
    id: "assign-1",
    clientId: CLIENT_ID,
    scheduledFor: SOURCE_DAY,
    originallyScheduledFor: null,
    templateName: "Push Day",
    templateTag: "push",
    status: "scheduled",
    seriesId: null,
    recurrenceKind: null,
    selfAssigned: false,
    ...overrides,
  };
}

function habit(overrides: Partial<MonthHabitChip> = {}): MonthHabitChip {
  return {
    id: "habit-1",
    clientId: CLIENT_ID,
    civilDate: SOURCE_DAY,
    habitName: "Drink water",
    status: "done",
    clientOwned: false,
    ...overrides,
  };
}

function payload(
  chips: MonthWorkoutChip[],
  habits: MonthHabitChip[] = [],
  anchorCivil = TODAY,
): ClientCalendarPeekPayload {
  const workoutsByDay: Record<string, MonthWorkoutChip[]> = {};
  for (const c of chips) (workoutsByDay[c.scheduledFor] ??= []).push(c);
  const habitsByDay: Record<string, MonthHabitChip[]> = {};
  for (const h of habits) (habitsByDay[h.civilDate] ??= []).push(h);
  return {
    anchorCivil,
    startCivil: addDays(anchorCivil, -3),
    endCivil: addDays(anchorCivil, 3),
    todayCivil: TODAY,
    calendar: {
      monthStart: `${anchorCivil.slice(0, 7)}-01`,
      monthEnd: `${anchorCivil.slice(0, 7)}-30`,
      workoutsByDay,
      habitsByDay,
    },
  };
}

function addDays(civil: string, days: number): string {
  const [y, m, d] = civil.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function renderPeek(initial: ClientCalendarPeekPayload) {
  render(<ClientCalendarPeek clientId={CLIENT_ID} initialPayload={initial} />);
  return { user: userEvent.setup() };
}

/** The workout row, matched on its template name. */
function workoutRow(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

/** The day cell carrying `dayNumber` — the drop event fired on its number
 *  label bubbles into the cell's own `onDrop`. The label is the raw
 *  `"YYYY-MM-DD".slice(8, 10)`, i.e. ZERO-PADDED: the cell for the 9th says
 *  "09", and `getByText("9")` finds nothing. */
function dayCell(dayNumber: number): HTMLElement {
  return screen.getByText(dayLabel(dayNumber));
}

function dayLabel(dayNumber: number): string {
  return String(dayNumber).padStart(2, "0");
}

function dataTransfer() {
  return { effectAllowed: "", setData: jest.fn(), getData: jest.fn() };
}

function dragRowToDay(name: string, dayNumber: number) {
  fireEvent.dragStart(workoutRow(name), { dataTransfer: dataTransfer() });
  fireEvent.drop(dayCell(dayNumber), { dataTransfer: dataTransfer() });
}

/**
 * Let the pending promise chain drain.
 *
 * REQUIRED before any "did NOT write" assertion: `performMove` is async, so
 * asserting `not.toHaveBeenCalled()` right after the drop passes no matter
 * what the component did. Same trap as month-calendar-drag-move.test.tsx,
 * where deleting the same-day guard left every negative test green until the
 * flush was added.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMoveAssignment.mockResolvedValue({ movedCount: 1 });
  mockGetClientCalendarPeek.mockResolvedValue(payload([]));
});

describe("ClientCalendarPeek — dragging a workout onto another day", () => {
  it("moves a ONE-OFF straight away, with scope 'one' and the dropped-on date", async () => {
    renderPeek(payload([chip()]));

    dragRowToDay("Push Day", 12);

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-1",
      newScheduledFor: TARGET_DAY,
      scope: "one",
    });
    // Nothing to reshape → the coach is never asked.
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("treats a seriesId with recurrenceKind 'single' as one-off", async () => {
    // Assignments created one at a time still carry a series id. Prompting on
    // those would put a scope dialog in front of every ordinary drag.
    renderPeek(payload([chip({ seriesId: "series-1", recurrenceKind: "single" })]));

    dragRowToDay("Push Day", 12);

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "one" }),
    );
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("STOPS a recurring one and asks for the scope first", async () => {
    renderPeek(payload([chip({ seriesId: "series-1", recurrenceKind: "weekly" })]));

    dragRowToDay("Push Day", 12);
    await settle();

    // The prompt is the only thing between this drag and a series-wide rewrite.
    expect(mockMoveAssignment).not.toHaveBeenCalled();
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("move-dialog-chip")).toHaveTextContent("assign-1");
    expect(screen.getByTestId("move-dialog-date")).toHaveTextContent(TARGET_DAY);
  });

  it("writes the scope the dialog came back with", async () => {
    const { user } = renderPeek(
      payload([chip({ seriesId: "series-1", recurrenceKind: "weekly" })]),
    );

    dragRowToDay("Push Day", 12);
    await user.click(await screen.findByText("scope-all"));

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-1",
      newScheduledFor: TARGET_DAY,
      scope: "all",
    });
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("writes nothing when the prompt is dismissed", async () => {
    const { user } = renderPeek(
      payload([chip({ seriesId: "series-1", recurrenceKind: "weekly" })]),
    );

    dragRowToDay("Push Day", 12);
    await user.click(await screen.findByText("dismiss-move"));
    await settle();

    expect(mockMoveAssignment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("does NOT write when the chip is dropped back on its own day", async () => {
    renderPeek(payload([chip()]));

    dragRowToDay("Push Day", 9);
    await settle();

    // Without the guard every accidental jiggle costs a write and a toast for
    // a move that didn't happen.
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });

  it("leaves a CLIENT-CREATED workout undraggable, and a drop on it inert", async () => {
    // #449/#461 — moveAssignment throws on ownership for a self-assigned
    // workout, so the guard is what keeps that error off the coach's screen.
    renderPeek(payload([chip({ selfAssigned: true })]));

    const row = workoutRow("Push Day");
    expect(row).toHaveAttribute("draggable", "false");

    dragRowToDay("Push Day", 12);
    await settle();

    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });

  it("keeps an ordinary workout draggable", async () => {
    renderPeek(payload([chip()]));

    expect(workoutRow("Push Day")).toHaveAttribute("draggable", "true");
  });
});

describe("ClientCalendarPeek — what happens after the move", () => {
  it("re-fetches the VISIBLE week so the chip lands on its new day", async () => {
    // The week lives in useState, not React Query: nothing invalidates it for
    // us. Skip the refetch and the chip stays painted where it was dragged from.
    renderPeek(payload([chip()]));

    dragRowToDay("Push Day", 12);

    await waitFor(() =>
      expect(mockGetClientCalendarPeek).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        anchorCivil: TODAY,
      }),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Workout movido");
  });

  it("counts the moved occurrences in the toast for a series", async () => {
    mockMoveAssignment.mockResolvedValue({ movedCount: 4 });
    const { user } = renderPeek(
      payload([chip({ seriesId: "series-1", recurrenceKind: "weekly" })]),
    );

    dragRowToDay("Push Day", 12);
    await user.click(await screen.findByText("scope-all"));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("4 workouts movidos"),
    );
  });

  it("surfaces the server's refusal and does NOT re-fetch", async () => {
    mockMoveAssignment.mockRejectedValue(new Error("Forbidden"));
    renderPeek(payload([chip()]));

    dragRowToDay("Push Day", 12);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Forbidden"));
    expect(mockGetClientCalendarPeek).not.toHaveBeenCalled();
  });
});

describe("ClientCalendarPeek — the week navigation", () => {
  it("steps back a FULL week, so the windows stay contiguous", async () => {
    // The window is anchor ± 3 (7 days); a step of anything but 7 would either
    // repeat days or skip them.
    const { user } = renderPeek(payload([]));

    await user.click(screen.getByRole("button", { name: "Previous week" }));

    await waitFor(() =>
      expect(mockGetClientCalendarPeek).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        anchorCivil: "2026-09-03",
      }),
    );
  });

  it("steps forward a full week", async () => {
    const { user } = renderPeek(payload([]));

    await user.click(screen.getByRole("button", { name: "Next week" }));

    await waitFor(() =>
      expect(mockGetClientCalendarPeek).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        anchorCivil: "2026-09-17",
      }),
    );
  });

  it("steps from the week ON SCREEN, not from the initial one", async () => {
    // Two forward steps must land on +14, not twice on +7 — the anchor has to
    // come from the payload the server echoed back.
    mockGetClientCalendarPeek.mockResolvedValue(payload([], [], "2026-09-17"));
    const { user } = renderPeek(payload([]));

    await user.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(mockGetClientCalendarPeek).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Next week" }));

    await waitFor(() => expect(mockGetClientCalendarPeek).toHaveBeenCalledTimes(2));
    expect(mockGetClientCalendarPeek).toHaveBeenLastCalledWith({
      clientId: CLIENT_ID,
      anchorCivil: "2026-09-24",
    });
  });

  it("disables 'Today' while today's week is the one on screen, and re-enables it after a step", async () => {
    mockGetClientCalendarPeek.mockResolvedValue(payload([], [], "2026-09-17"));
    const { user } = renderPeek(payload([]));

    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next week" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Today" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(mockGetClientCalendarPeek).toHaveBeenLastCalledWith({
      clientId: CLIENT_ID,
      anchorCivil: TODAY,
    });
  });

  it("keeps the loaded week on screen behind the error when a step fails", async () => {
    // Blanking the grid on a failed fetch would read as "this client has
    // nothing scheduled" — the opposite of what happened.
    mockGetClientCalendarPeek.mockRejectedValue(new Error("boom"));
    const { user } = renderPeek(payload([chip()]));

    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(await screen.findByText("Could not load this week.")).toBeInTheDocument();
    expect(workoutRow("Push Day")).toBeInTheDocument();
  });

  it("links to the Agenda on the anchor's MONTH, filtered to this client", async () => {
    renderPeek(payload([]));

    expect(screen.getByRole("link", { name: /Open schedule/ })).toHaveAttribute(
      "href",
      "/gc-fitness/schedule?month=2026-09&clientIds=client-1",
    );
  });
});

describe("ClientCalendarPeek — opening a workout", () => {
  it("opens the detail dialog on the RAW assignment id", async () => {
    // The render key is `workout:<id>`-prefixed; handing that to the dialog
    // would look up an assignment that doesn't exist.
    const { user } = renderPeek(payload([chip()]));

    await user.click(workoutRow("Push Day"));

    // ANCHORED on purpose: `toHaveTextContent` is a SUBSTRING match, and the
    // wrong value here ("workout:assign-1") contains the right one — the
    // unanchored assertion passes with the bug in place (verified by mutation).
    expect(await screen.findByTestId("detail-dialog-id")).toHaveTextContent(
      /^assign-1$/,
    );
  });

  it("re-fetches the visible week after a delete from the dialog", async () => {
    const { user } = renderPeek(payload([chip()]));

    await user.click(workoutRow("Push Day"));
    await user.click(await screen.findByText("detail-deleted"));

    await waitFor(() =>
      expect(mockGetClientCalendarPeek).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        anchorCivil: TODAY,
      }),
    );
    expect(screen.queryByTestId("detail-dialog")).not.toBeInTheDocument();
  });
});

describe("ClientCalendarPeek — what the grid shows", () => {
  it("renders exactly the 7 days of the window", async () => {
    renderPeek(payload([]));

    for (const day of [7, 8, 9, 10, 11, 12, 13]) {
      expect(screen.getByText(dayLabel(day))).toBeInTheDocument();
    }
    expect(screen.queryByText("06")).not.toBeInTheDocument();
    expect(screen.queryByText("14")).not.toBeInTheDocument();
  });

  it("marks the empty days, and only those", async () => {
    renderPeek(payload([chip()], [habit({ civilDate: TARGET_DAY })]));

    // 7 days, one with a workout and one with a habit → 5 empty.
    expect(screen.getAllByText("No workouts or habits")).toHaveLength(5);
  });

  it("shows a habit day as busy even with no workout on it", async () => {
    renderPeek(payload([], [habit({ civilDate: TARGET_DAY })]));

    expect(screen.getAllByText("No workouts or habits")).toHaveLength(6);
    expect(screen.getByTitle(/Drink water/)).toBeInTheDocument();
  });
});

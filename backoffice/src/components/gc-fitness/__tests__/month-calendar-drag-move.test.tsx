/**
 * @jest-environment jsdom
 */

// month-calendar-drag-move.test.tsx
//
// SCOPE: the drag-a-chip → move path of the month calendar, and nothing else.
// `month-calendar.tsx` is 1767 lines and renders eight dialogs, three views and
// a client filter bar; covering it whole is a different (and much more
// expensive) job. The drag path is the one that WRITES — every other
// interaction on this surface either navigates or opens a dialog that already
// has its own regression file.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What `onCellDrop` decides, and why each branch matters:
//
//   1. THE FORK. A one-off workout moves IMMEDIATELY (`scope: "one"`); a
//      recurring one must stop and ask, because `moveAssignment` with
//      `scope: "all"` rewrites every occurrence in the series. Taking the wrong
//      branch does not throw — it either reschedules a whole series when the
//      coach nudged one day, or silently drops the prompt that was the only
//      thing standing between a drag and that rewrite.
//   2. `recurrenceKind === "single"` COUNTS AS NON-RECURRING even when a
//      `seriesId` is present. Assignments created one-at-a-time still carry a
//      series id, so a `seriesId`-only check would prompt on every single drag.
//   3. THE SAME-DAY NO-OP. Picking a chip up and dropping it back must not
//      write. Without the guard, every accidental jiggle costs a Firestore
//      write and a "Workout movido" toast for a move that didn't happen.
//   4. #449 — a CLIENT-CREATED workout is not draggable at all. The server
//      action throws on ownership, so the guard here exists to keep the coach
//      from ever seeing that error: the chip simply doesn't lift.
//
// Note on the drag mechanics: `user-event` has no drag-and-drop API (HTML5 DnD
// isn't implemented in jsdom either), so these tests fire the two React
// synthetic events the component actually listens to — `dragStart` on the chip
// and `drop` on the target cell — with a stub `dataTransfer`. That is exactly
// the pair the browser delivers; nothing about the component is bypassed.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { MonthCalendar } from "@/components/gc-fitness/schedule/month-calendar";
import type {
  MonthCalendarPayload,
  MonthWorkoutChip,
} from "@/lib/gc-fitness/schedule-month-actions";

// The actions module pulls in firebase-admin, which explodes on import under
// jsdom. The query is seeded with `initialData` for the initial month +
// selection, so the chips are on screen from the first render; React Query
// still revalidates in the background, and `listMonthForClients` is wired to
// return the same payload so that refetch is a no-op instead of console noise.
const mockListMonthForClients = jest.fn();
const mockMoveAssignment = jest.fn();
jest.mock("@/lib/gc-fitness/schedule-month-actions", () => ({
  listMonthForClients: (...args: unknown[]) => mockListMonthForClients(...args),
  moveAssignment: (...args: unknown[]) => mockMoveAssignment(...args),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// Every other surface the calendar can open. Stubbed to null so the tree stays
// small — each one has (or will have) its own regression file.
jest.mock("@/components/gc-fitness/schedule/assign-template-modal", () => ({
  AssignTemplateModal: () => null,
}));
jest.mock("@/components/gc-fitness/schedule/new-habit-dialog", () => ({
  NewHabitDialog: () => null,
}));
jest.mock("@/components/gc-fitness/schedule/workout-detail-dialog", () => ({
  WorkoutDetailDialog: () => null,
}));
jest.mock("@/components/gc-fitness/schedule/habit-detail-dialog", () => ({
  HabitDetailDialog: () => null,
}));
jest.mock("@/components/gc-fitness/schedule/bulk-assign-habit-dialog", () => ({
  BulkAssignHabitDialog: () => null,
}));

// The move dialog is stubbed rather than mounted: what this file is testing is
// the SHELL's decision — whether the prompt opens at all, with which chip and
// which target date, and what it does with the scope that comes back. The
// dialog's own three-scope contract is pinned in move-assignment-dialog.test.tsx.
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
        <button type="button" onClick={() => props.onConfirm("one")}>
          scope-one
        </button>
        <button type="button" onClick={() => props.onConfirm("future")}>
          scope-future
        </button>
        <button type="button" onClick={() => props.onConfirm("all")}>
          scope-all
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

// September 2026 as the rendered month. The Mon-first grid runs Aug 31 →
// Oct 11, so day numbers 12..30 appear EXACTLY ONCE in the DOM. Days 1..11 do
// not (they're also the October pad), which is why both the source day (15) and
// the target day (22) are picked from the unique range — `getByText("3")` would
// silently match the wrong cell.
const TODAY = "2026-09-10";
const MONTH_FIRST = "2026-09-01";
const SOURCE_DAY = "2026-09-15";
const TARGET_DAY = "2026-09-22";

const CLIENT = {
  uid: "client-1",
  displayName: "Ana Gomez",
  email: "ana@example.com",
  photoURL: null,
  birthDate: null,
};

function chip(overrides: Partial<MonthWorkoutChip> = {}): MonthWorkoutChip {
  return {
    id: "assign-1",
    clientId: CLIENT.uid,
    scheduledFor: SOURCE_DAY,
    originallyScheduledFor: null,
    templateName: "Push Day",
    templateTag: "push",
    status: "scheduled",
    seriesId: null,
    recurrenceKind: null,
    selfAssigned: false,
    plannedExercises: 3,
    logged: null,
    ...overrides,
  };
}

function payloadWith(chips: MonthWorkoutChip[]): MonthCalendarPayload {
  const workoutsByDay: Record<string, MonthWorkoutChip[]> = {};
  for (const c of chips) {
    (workoutsByDay[c.scheduledFor] ??= []).push(c);
  }
  return {
    monthStart: MONTH_FIRST,
    monthEnd: "2026-09-30",
    workoutsByDay,
    habitsByDay: {},
  };
}

function renderCalendar(chips: MonthWorkoutChip[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const payload = payloadWith(chips);
  mockListMonthForClients.mockResolvedValue(payload);
  render(
    <QueryClientProvider client={client}>
      <MonthCalendar
        clients={[CLIENT]}
        initialMonthFirst={MONTH_FIRST}
        initialClientIds={[CLIENT.uid]}
        initialPayload={payload}
        todayCivil={TODAY}
        trainerUid="trainer-1"
      />
    </QueryClientProvider>,
  );
}

/** The chip button, matched on its template name. */
function chipButton(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

/** The day cell carrying `dayNumber` — its number label, which the drop event
 *  bubbles up from into the cell's own `onDrop`. */
function dayCell(dayNumber: number): HTMLElement {
  return screen.getByText(String(dayNumber));
}

/** Minimal stand-in for the browser's DataTransfer. `onDragStart` writes
 *  `effectAllowed` and calls `setData` before handing the chip to the shell. */
function dataTransfer() {
  return { effectAllowed: "", setData: jest.fn(), getData: jest.fn() };
}

function dragChipToDay(chipName: string, dayNumber: number) {
  fireEvent.dragStart(chipButton(chipName), { dataTransfer: dataTransfer() });
  fireEvent.drop(dayCell(dayNumber), { dataTransfer: dataTransfer() });
}

/**
 * Let React Query's mutation queue drain.
 *
 * REQUIRED before any "did NOT write" assertion. `mutate()` does not call the
 * mutation function synchronously, so asserting `not.toHaveBeenCalled()` right
 * after the drop passes no matter what the component did — verified by
 * mutation: deleting the same-day guard left every negative test GREEN until
 * this flush was added.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMoveAssignment.mockResolvedValue({ movedCount: 1 });
});

describe("MonthCalendar — dragging a ONE-OFF workout writes straight away", () => {
  it("moves it with scope 'one' and the dropped-on date, no prompt", async () => {
    renderCalendar([chip()]);

    dragChipToDay("Push Day", 22);

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-1",
      newScheduledFor: TARGET_DAY,
      scope: "one",
    });
    // No series to reshape → the coach is never asked.
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("treats a seriesId with recurrenceKind 'single' as one-off", async () => {
    // Assignments created one at a time still carry a series id. Prompting on
    // those would put a scope dialog in front of every ordinary drag.
    renderCalendar([chip({ seriesId: "series-1", recurrenceKind: "single" })]);

    dragChipToDay("Push Day", 22);

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "one" }),
    );
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });
});

describe("MonthCalendar — dragging a RECURRING workout asks first", () => {
  const RECURRING = chip({
    id: "assign-recurring",
    seriesId: "series-1",
    recurrenceKind: "weekly",
  });

  it("opens the scope prompt and writes NOTHING yet", async () => {
    renderCalendar([RECURRING]);

    dragChipToDay("Push Day", 22);

    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
    // The whole point of the prompt: no write has happened.
    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });

  it("hands the prompt the dragged chip and the day it landed on", () => {
    renderCalendar([RECURRING]);

    dragChipToDay("Push Day", 22);

    // Passing a stale chip or the source date here would move the wrong
    // occurrence to the wrong day while the dialog copy reads correctly.
    expect(screen.getByTestId("move-dialog-chip")).toHaveTextContent(
      "assign-recurring",
    );
    expect(screen.getByTestId("move-dialog-date")).toHaveTextContent(TARGET_DAY);
  });

  it("forwards the chosen scope verbatim to moveAssignment", async () => {
    renderCalendar([RECURRING]);

    dragChipToDay("Push Day", 22);
    fireEvent.click(screen.getByRole("button", { name: "scope-all" }));

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-recurring",
      newScheduledFor: TARGET_DAY,
      scope: "all",
    });
    // And the prompt closes — leaving it open invites a second write.
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("forwards 'future' just as literally", async () => {
    renderCalendar([RECURRING]);

    dragChipToDay("Push Day", 22);
    fireEvent.click(screen.getByRole("button", { name: "scope-future" }));

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "future" }),
    );
  });
});

describe("MonthCalendar — drags that must NOT write", () => {
  it("ignores a drop back onto the chip's own day", async () => {
    renderCalendar([chip()]);

    dragChipToDay("Push Day", 15); // 2026-09-15 — where it already is

    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("ignores a drop with no chip in hand", async () => {
    renderCalendar([chip()]);

    // A drop that never started as a drag (e.g. a file dragged in from the
    // desktop) reaches the same handler.
    fireEvent.drop(dayCell(22), { dataTransfer: dataTransfer() });

    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });
});

describe("MonthCalendar — #449, a client-created workout can't be dragged", () => {
  it("does not mark the chip draggable", () => {
    renderCalendar([chip({ templateName: "Mi rutina", selfAssigned: true })]);

    // This attribute IS the guard the coach meets: the chip never lifts, so
    // `moveAssignment`'s ownership throw is unreachable from the calendar.
    expect(chipButton("Mi rutina")).toHaveAttribute("draggable", "false");
  });

  it("stays inert even if a dragStart is delivered anyway", async () => {
    renderCalendar([chip({ templateName: "Mi rutina", selfAssigned: true })]);

    dragChipToDay("Mi rutina", 22);

    // `onDragStart` early-returns for self-assigned chips, so nothing was ever
    // put in hand and the drop finds none.
    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
  });

  it("leaves coach-assigned chips draggable", () => {
    renderCalendar([chip()]);

    // The other direction of the same guard: over-hiding it would make the
    // whole calendar unmovable and nothing would error.
    expect(chipButton("Push Day")).toHaveAttribute("draggable", "true");
  });
});

// #785 — "¿qué son esos libres?"
//
// A workout the athlete started EMPTY and built while training (#541) is stored
// with the placeholder name "Entreno libre", so a coach looking at the calendar
// sees two identical chips and no way to tell what either of them was. The chip
// now carries what was actually PERFORMED, which the month query already loads
// to flip each chip's status.
describe("MonthCalendar — a free workout says what was performed (#785)", () => {
  const free = (over: Partial<MonthWorkoutChip> = {}) =>
    chip({
      templateName: "Entreno libre",
      plannedExercises: 0,
      status: "completed",
      logged: { exercises: 4, sets: 12, durationMinutes: 38, volumeKg: 2400 },
      ...over,
    });

  it("shows the exercise count inline, next to the placeholder name", () => {
    renderCalendar([free()]);

    expect(chipButton("Entreno libre")).toHaveTextContent("4 exercises");
  });

  it("puts the whole summary in the tooltip", () => {
    renderCalendar([free()]);

    expect(chipButton("Entreno libre").getAttribute("title")).toContain(
      "4 exercises · 12 sets · 38 min · 2400 kg",
    );
  });

  it("says so when the workout was started and nothing was logged", () => {
    renderCalendar([
      free({ logged: { exercises: 0, sets: 0, durationMinutes: null, volumeKg: null } }),
    ]);

    const button = chipButton("Entreno libre");
    expect(button.getAttribute("title")).toContain("no sets logged");
    // Nothing inline: "· 0 ejercicios" beside the name would be noise on a chip
    // whose tooltip already says it.
    expect(button).not.toHaveTextContent("0 exercises");
  });

  it("leaves a NAMED routine's chip alone", () => {
    // A routine that says what it is does not need "· 4 ejercicios" glued to it;
    // the summary is still in the tooltip for anyone who wants the detail.
    renderCalendar([
      chip({
        templateName: "Push Day",
        plannedExercises: 5,
        status: "completed",
        logged: { exercises: 5, sets: 15, durationMinutes: 42, volumeKg: 3100 },
      }),
    ]);

    const button = chipButton("Push Day");
    expect(button).not.toHaveTextContent("5 exercises");
    expect(button.getAttribute("title")).toContain("5 exercises · 15 sets");
  });

  it("adds nothing to a chip nobody has trained yet", () => {
    renderCalendar([free({ status: "scheduled", logged: null })]);

    const button = chipButton("Entreno libre");
    expect(button).not.toHaveTextContent("exercises");
    expect(button.getAttribute("title")).not.toContain("sets");
  });
});

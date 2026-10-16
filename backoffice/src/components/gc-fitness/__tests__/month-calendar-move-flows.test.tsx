/**
 * @jest-environment jsdom
 */

// month-calendar-move-flows.test.tsx
//
// Companion to month-calendar-drag-move.test.tsx (which pins onCellDrop's
// one-off / recurring / same-day / self-assigned decisions in MONTH view).
// This file covers the rest of the move path:
//
//   • what happens AFTER moveAssignment answers — success toast (singular vs
//     "N movidos"), the schedule refetch, the error toast;
//   • dismissing the scope prompt must not write;
//   • the WEEK view (per-client rows, a different cell component with its own
//     drop wiring) reaches the same moveAssignment contract;
//   • drag state hygiene — a drag that ends without a drop must not leave a
//     chip "in hand" for a later, unrelated drop.
//
// Same mechanics as the sibling file: jsdom has no HTML5 DnD, so we fire the
// React synthetic dragStart / dragEnd / dragOver / drop events the component
// listens to, with a stub dataTransfer.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { MonthCalendar } from "@/components/gc-fitness/schedule/month-calendar";
import type {
  MonthCalendarPayload,
  MonthWorkoutChip,
} from "@/lib/gc-fitness/schedule-month-actions";

const mockListMonthForClients = jest.fn();
const mockMoveAssignment = jest.fn();
jest.mock("@/lib/gc-fitness/schedule-month-actions", () => ({
  listMonthForClients: (...args: unknown[]) => mockListMonthForClients(...args),
  moveAssignment: (...args: unknown[]) => mockMoveAssignment(...args),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

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

jest.mock("@/components/gc-fitness/schedule/move-assignment-dialog", () => ({
  MoveAssignmentDialog: (props: {
    chip: { id: string };
    newDate: string;
    onConfirm: (scope: "one" | "future" | "all") => void;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="move-dialog">
      <span data-testid="move-dialog-date">{props.newDate}</span>
      <button type="button" onClick={() => props.onConfirm("future")}>
        scope-future
      </button>
      <button type="button" onClick={() => props.onOpenChange(false)}>
        dismiss
      </button>
    </div>
  ),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Month: September 2026 (days 12..30 are unique in the Mon-first grid).
// Week view anchors on TODAY → Mon 2026-09-07 … Sun 2026-09-13.
const TODAY = "2026-09-10";
const MONTH_FIRST = "2026-09-01";

const ANA = {
  uid: "client-ana",
  displayName: "Ana Gomez",
  email: "ana@example.com",
  photoURL: null,
  birthDate: null,
};
const BRUNO = {
  uid: "client-bruno",
  displayName: "Bruno Diaz",
  email: "bruno@example.com",
  photoURL: null,
  birthDate: null,
};

function chip(overrides: Partial<MonthWorkoutChip> = {}): MonthWorkoutChip {
  return {
    id: "assign-1",
    clientId: ANA.uid,
    scheduledFor: "2026-09-15",
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
  for (const c of chips) (workoutsByDay[c.scheduledFor] ??= []).push(c);
  return {
    monthStart: MONTH_FIRST,
    monthEnd: "2026-09-30",
    workoutsByDay,
    habitsByDay: {},
  };
}

function renderCalendar(
  chips: MonthWorkoutChip[],
  clients = [ANA],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const payload = payloadWith(chips);
  mockListMonthForClients.mockResolvedValue(payload);
  render(
    <QueryClientProvider client={client}>
      <MonthCalendar
        clients={clients}
        initialMonthFirst={MONTH_FIRST}
        initialClientIds={clients.map((c) => c.uid)}
        initialPayload={payload}
        todayCivil={TODAY}
        trainerUid="trainer-1"
      />
    </QueryClientProvider>,
  );
}

function chipButton(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

function dayCell(dayNumber: number): HTMLElement {
  return screen.getByText(String(dayNumber));
}

function dataTransfer() {
  return { effectAllowed: "", setData: jest.fn(), getData: jest.fn() };
}

function dragChipToDay(chipName: string, dayNumber: number) {
  fireEvent.dragStart(chipButton(chipName), { dataTransfer: dataTransfer() });
  fireEvent.drop(dayCell(dayNumber), { dataTransfer: dataTransfer() });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Week view: the <td> for `client`'s row on weekday column `col` (0 = Mon). */
function weekCell(clientName: string, col: number): HTMLElement {
  const rowHeader = screen.getByTitle(clientName);
  const row = rowHeader.closest("tr")!;
  return row.querySelectorAll("td")[col] as HTMLElement;
}

async function switchToWeek() {
  fireEvent.click(screen.getByRole("button", { name: "Week" }));
  await waitFor(() =>
    expect(mockListMonthForClients).toHaveBeenCalledWith(
      expect.objectContaining({ startCivil: "2026-09-07", endCivil: "2026-09-13" }),
    ),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMoveAssignment.mockResolvedValue({ movedCount: 1 });
});

describe("MonthCalendar move — after the server answers", () => {
  it("one moved → 'Workout movido' and the schedule is refetched", async () => {
    renderCalendar([chip()]);
    await settle();
    const callsBefore = mockListMonthForClients.mock.calls.length;

    dragChipToDay("Push Day", 22);

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Workout movido"));
    await waitFor(() =>
      expect(mockListMonthForClients.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("a series move reports the server's count", async () => {
    mockMoveAssignment.mockResolvedValue({ movedCount: 5 });
    renderCalendar([chip({ seriesId: "s-1", recurrenceKind: "weekly" })]);

    dragChipToDay("Push Day", 22);
    fireEvent.click(screen.getByRole("button", { name: "scope-future" }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("5 workouts movidos"),
    );
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-1",
      newScheduledFor: "2026-09-22",
      scope: "future",
    });
  });

  it("a failed move shows the server's message and no success toast", async () => {
    mockMoveAssignment.mockRejectedValue(new Error("Not your assignment."));
    renderCalendar([chip()]);

    dragChipToDay("Push Day", 22);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Not your assignment."));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("a non-Error rejection falls back to 'No se pudo mover'", async () => {
    mockMoveAssignment.mockRejectedValue("boom");
    renderCalendar([chip()]);
    dragChipToDay("Push Day", 22);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("No se pudo mover"));
  });
});

describe("MonthCalendar move — the scope prompt", () => {
  it("dismissing it closes the prompt and writes nothing", async () => {
    renderCalendar([chip({ seriesId: "s-1", recurrenceKind: "weekly" })]);

    dragChipToDay("Push Day", 22);
    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));

    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });

  it("after a dismiss, the NEXT drop no longer carries the old chip", async () => {
    renderCalendar([chip({ seriesId: "s-1", recurrenceKind: "weekly" })]);
    dragChipToDay("Push Day", 22);
    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));

    // A drop with nothing in hand (e.g. text dragged in from elsewhere).
    fireEvent.drop(dayCell(25), { dataTransfer: dataTransfer() });
    await settle();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });
});

describe("MonthCalendar move — drag highlight", () => {
  it("highlights the hovered cell and clears it on drop", async () => {
    renderCalendar([chip()]);
    const target = dayCell(22);
    fireEvent.dragStart(chipButton("Push Day"), { dataTransfer: dataTransfer() });
    expect(target.closest(".rounded-2xl")).not.toHaveClass("bg-primary/5");
    fireEvent.dragOver(target, { dataTransfer: dataTransfer() });
    const cellRoot = target.closest(".rounded-2xl") as HTMLElement;
    expect(cellRoot).toHaveClass("bg-primary/5");
    fireEvent.drop(target, { dataTransfer: dataTransfer() });
    expect(cellRoot).not.toHaveClass("bg-primary/5");
    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
  });
});

describe("MonthCalendar move — week view (per-client rows)", () => {
  it("dragging within the client's row moves to that column's date with scope 'one'", async () => {
    const c = chip({ scheduledFor: "2026-09-08" });
    renderCalendar([c]);
    mockListMonthForClients.mockResolvedValue(payloadWith([c]));
    await switchToWeek();
    await screen.findByRole("button", { name: /Push Day/ });

    fireEvent.dragStart(chipButton("Push Day"), { dataTransfer: dataTransfer() });
    fireEvent.drop(weekCell("Ana Gomez", 4), { dataTransfer: dataTransfer() }); // Fri 11

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-1",
      newScheduledFor: "2026-09-11",
      scope: "one",
    });
  });

  it("a recurring chip in week view still asks for the scope first", async () => {
    const c = chip({ scheduledFor: "2026-09-08", seriesId: "s-1", recurrenceKind: "daily" });
    renderCalendar([c]);
    mockListMonthForClients.mockResolvedValue(payloadWith([c]));
    await switchToWeek();
    await screen.findByRole("button", { name: /Push Day/ });

    fireEvent.dragStart(chipButton("Push Day"), { dataTransfer: dataTransfer() });
    fireEvent.drop(weekCell("Ana Gomez", 6), { dataTransfer: dataTransfer() });

    expect(screen.getByTestId("move-dialog-date")).toHaveTextContent("2026-09-13");
    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });

  // Pinned as-is (UX trap, not data loss): a drop is keyed on the DATE only.
  // Dropping Ana's chip into Bruno's row moves Ana's workout to that day —
  // it does NOT reassign it to Bruno, and nothing tells the coach so.
  it("a drop into ANOTHER client's row only changes the date", async () => {
    const c = chip({ scheduledFor: "2026-09-08" });
    renderCalendar([c], [ANA, BRUNO]);
    mockListMonthForClients.mockResolvedValue(payloadWith([c]));
    await switchToWeek();
    await screen.findByRole("button", { name: /Push Day/ });

    fireEvent.dragStart(chipButton("Push Day"), { dataTransfer: dataTransfer() });
    fireEvent.drop(weekCell("Bruno Diaz", 2), { dataTransfer: dataTransfer() });

    await waitFor(() => expect(mockMoveAssignment).toHaveBeenCalledTimes(1));
    expect(mockMoveAssignment).toHaveBeenCalledWith({
      id: "assign-1",
      newScheduledFor: "2026-09-09",
      scope: "one",
    });
  });

  it("dropping back on the same day in week view does not write", async () => {
    const c = chip({ scheduledFor: "2026-09-08" });
    renderCalendar([c]);
    mockListMonthForClients.mockResolvedValue(payloadWith([c]));
    await switchToWeek();
    await screen.findByRole("button", { name: /Push Day/ });
    fireEvent.dragStart(chipButton("Push Day"), { dataTransfer: dataTransfer() });
    fireEvent.drop(weekCell("Ana Gomez", 1), { dataTransfer: dataTransfer() });
    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });
});

describe("MonthCalendar move — drag state hygiene", () => {
  // FINDING: there is no onDragEnd anywhere. A drag that is CANCELLED (Esc, or
  // released outside every day cell) leaves the chip "in hand". The next drop
  // on a day cell — even one that carries nothing of ours, like text dragged
  // in from another window — moves that stale workout without the coach
  // having picked it up again.
  it.failing("a drag released outside the grid does not arm a later drop", async () => {
    renderCalendar([chip()]);
    const source = chipButton("Push Day");
    fireEvent.dragStart(source, { dataTransfer: dataTransfer() });
    fireEvent.dragEnd(source, { dataTransfer: dataTransfer() });

    fireEvent.drop(dayCell(22), { dataTransfer: dataTransfer() });
    await settle();
    expect(mockMoveAssignment).not.toHaveBeenCalled();
  });
});

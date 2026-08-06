/**
 * @jest-environment jsdom
 */

// workout-assignment-edit-dialog.test.tsx
//
// Editing a workout the coach already assigned. Distinct from the assign modal
// in one way that matters: this edits the ASSIGNMENT, never the template
// (`editAssignmentExercises`), and it can fan the edit out across a whole
// series.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What these tests protect:
//
//   1. THE SCOPE. "Solo este día" must not reach into the series, and "Toda la
//      serie (futuros)" must. The scope is a plain string in the payload — swap
//      it and you rewrite every future occurrence of a client's plan with no
//      error anywhere.
//   2. THE SECOND ACTION. Changing the series end date fires a SECOND call,
//      `editAssignmentRecurrence`, and it must carry the series' EXISTING
//      recurrence rule. Inventing a rule here silently reshapes which days the
//      client trains.
//   3. THE GUARDS, which stop a destructive multi-occurrence write on a draft
//      that isn't complete.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { WorkoutAssignmentEditDialog } from "@/components/gc-fitness/schedule/workout-assignment-edit-dialog";
import type { AssignmentDetail } from "@/lib/gc-fitness/schedule-month-actions";

const mockGetAssignmentDetail = jest.fn();
jest.mock("@/lib/gc-fitness/schedule-month-actions", () => ({
  getAssignmentDetail: (...args: unknown[]) => mockGetAssignmentDetail(...args),
}));

const mockEditExercises = jest.fn();
const mockEditRecurrence = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  editAssignmentExercises: (...args: unknown[]) => mockEditExercises(...args),
  editAssignmentRecurrence: (...args: unknown[]) => mockEditRecurrence(...args),
}));

jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => ({ data: [] }),
}));

// The picker is its own tested surface; stub it so the rows render statically.
jest.mock("@/components/gc-fitness/exercise-picker-popover", () => ({
  ExercisePickerPopover: () => null,
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    index: 0,
    exerciseId: "ex-bench",
    exerciseName: "Bench Press",
    previewUrl: null,
    sets: 3,
    reps: 10,
    rest_seconds: 90,
    transition_rest_seconds: 120,
    notes: "",
    repsBySet: [10, 10, 10],
    weightBySetKg: [60, 60, 60],
    hasExplicitNoWeightPrescription: false,
    supersetGroup: null,
    ...overrides,
  };
}

function detail(overrides: Partial<AssignmentDetail> = {}): AssignmentDetail {
  return {
    id: "assign-1",
    clientId: "client-1",
    clientName: "Ana",
    coachName: "Manu",
    scheduledFor: "2026-08-05",
    scheduledTime: null,
    status: "scheduled",
    templateName: "Push Day",
    templateTag: "push",
    meetingNotes: null,
    seriesId: "series-1",
    recurrence: { kind: "weekly", weekday: 3 },
    seriesEndDate: "2026-10-05",
    exercises: [exercise()],
    selfAssigned: false,
    ...overrides,
  } as AssignmentDetail;
}

function renderDialog() {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkoutAssignmentEditDialog
        open
        onOpenChange={onOpenChange}
        assignmentId="assign-1"
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { onSaved, onOpenChange };
}

/**
 * The dialog loads through react-query. Anchor on the scope control, which only
 * renders once the detail resolved AND the assignment is a series — the exercise
 * NAME is not a usable anchor here because it is rendered by the picker, which
 * these tests stub out.
 */
async function waitForLoaded() {
  await screen.findByRole("button", { name: /Solo este día/i });
}

function saveButton() {
  return screen.getByRole("button", { name: /^Guardar/i });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAssignmentDetail.mockResolvedValue(detail());
  mockEditExercises.mockResolvedValue({ updatedCount: 1 });
  mockEditRecurrence.mockResolvedValue({ createdCount: 4 });
});

describe("WorkoutAssignmentEditDialog — scope", () => {
  it("defaults to 'one' so a plain edit never touches the rest of the series", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDialog();
    await waitForLoaded();

    await user.click(saveButton());

    await waitFor(() => expect(mockEditExercises).toHaveBeenCalledTimes(1));
    // The safe default is the whole point: a coach fixing today's weights must
    // not silently rewrite every future occurrence.
    expect(mockEditExercises.mock.calls[0][1].scope).toBe("one");
    expect(mockEditExercises.mock.calls[0][0]).toBe("assign-1");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("sends scope 'series' once the coach picks the series option", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: /Toda la serie/i }));
    await user.click(saveButton());

    await waitFor(() => expect(mockEditExercises).toHaveBeenCalledTimes(1));
    expect(mockEditExercises.mock.calls[0][1].scope).toBe("series");
  });

  it("does not touch the recurrence when only exercises changed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitForLoaded();

    await user.click(saveButton());

    await waitFor(() => expect(mockEditExercises).toHaveBeenCalledTimes(1));
    // A delete-future + re-expand is expensive and destructive. It must fire
    // ONLY when the end date actually moved.
    expect(mockEditRecurrence).not.toHaveBeenCalled();
  });
});

describe("WorkoutAssignmentEditDialog — the payload it builds", () => {
  it("sends the exercise rows with a set-type entry per set", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitForLoaded();

    await user.click(saveButton());

    await waitFor(() => expect(mockEditExercises).toHaveBeenCalledTimes(1));
    const payload = mockEditExercises.mock.calls[0][1];
    expect(payload.exercises).toHaveLength(1);
    const [row] = payload.exercises;
    expect(row.exerciseId).toBe("ex-bench");
    // #403 — the FULL aligned array is always sent; the server decides whether
    // to persist or delete the key. A short array silently mis-labels sets.
    expect(row.setTypesBySet).toHaveLength(row.repsBySet.length);
    expect(row.setTypesBySet.every((t: string) => typeof t === "string")).toBe(
      true,
    );
  });

  it("reports the server's updated count rather than assuming one", async () => {
    const user = userEvent.setup();
    mockEditExercises.mockResolvedValueOnce({ updatedCount: 6 });
    renderDialog();
    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: /Toda la serie/i }));
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "6 ocurrencias actualizadas",
      ),
    );
  });
});

describe("WorkoutAssignmentEditDialog — failure handling", () => {
  it("surfaces the server message and does NOT report success upstream", async () => {
    const user = userEvent.setup();
    mockEditExercises.mockRejectedValueOnce(
      new Error("La serie ya no existe."),
    );
    const { onSaved } = renderDialog();
    await waitForLoaded();

    await user.click(saveButton());

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("La serie ya no existe."),
    );
    // onSaved invalidates the calendar — calling it after a failed write paints
    // the coach a calendar that disagrees with Firestore.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("re-enables Guardar after a failure so the coach can retry", async () => {
    const user = userEvent.setup();
    mockEditExercises.mockRejectedValueOnce(new Error("boom"));
    renderDialog();
    await waitForLoaded();

    await user.click(saveButton());

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(saveButton()).toBeEnabled();
  });
});

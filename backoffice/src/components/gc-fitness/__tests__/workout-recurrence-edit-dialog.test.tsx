/**
 * @jest-environment jsdom
 */

// workout-recurrence-edit-dialog.test.tsx
//
// Regression net for "Editar recurrencia" — the coach-portal flow with the worst
// blast radius on the schedule: saving here runs a delete-future + re-expand of
// the whole series from the viewed occurrence onward.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config defaults
// to `testEnvironment: "node"` so without it React Testing Library crashes with
// `ReferenceError: document is not defined`.
//
// What these tests are actually protecting:
//
//   1. THE WIRE SHAPE. Mobile (iOS + Android) reads the recurrence rule this
//      dialog writes. One selected weekday must collapse to `{kind:"weekly",
//      weekday}` and two or more must widen to `{kind:"weekly_days", weekdays}`
//      — SORTED. Emitting `weekly_days` for a single day, or an unsorted array,
//      is a silent cross-surface break that no type checks.
//   2. THE GUARDS. Every early return in `handleSave` exists to stop a
//      destructive re-expand from running on nonsense input. A guard that stops
//      firing doesn't throw — it just quietly reprograms the series wrong.
//   3. THE SEED. The picker is pre-filled from the occurrence's CURRENT rule. If
//      seeding regresses, a coach who opens the dialog to change the end date
//      silently rewrites the coach's weekday pattern too.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { WorkoutRecurrenceEditDialog } from "@/components/gc-fitness/schedule/workout-recurrence-edit-dialog";

// Mock the Server Action so we can assert the exact payload and drive
// success/failure without touching Firestore.
const mockEditRecurrence = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  editAssignmentRecurrence: (...args: unknown[]) => mockEditRecurrence(...args),
}));

// Mock sonner — the dialog reports every guard through a toast, so these
// doubles are how we observe "it refused" vs "it saved".
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// 2026-08-05 is a Wednesday (getDay() === 3) — the fixture leans on that for
// the "unknown recurrence seeds on the occurrence's own weekday" case.
const SCHEDULED_FOR = "2026-08-05";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof WorkoutRecurrenceEditDialog>> = {},
) {
  const onOpenChange = jest.fn();
  const onSaved = jest.fn();
  render(
    <WorkoutRecurrenceEditDialog
      open
      onOpenChange={onOpenChange}
      assignmentId="assign-1"
      scheduledFor={SCHEDULED_FOR}
      recurrence={{ kind: "weekly", weekday: 3 }}
      seriesEndDate="2026-10-05"
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onOpenChange, onSaved };
}

/** The weekday chips are Sunday-first: Dom Lun Mar Mié Jue Vie Sáb. */
function weekdayChip(label: string) {
  return screen.getByRole("button", { name: label });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEditRecurrence.mockResolvedValue({ createdCount: 4 });
});

describe("WorkoutRecurrenceEditDialog — the rule it writes", () => {
  it("collapses a single selected weekday to kind 'weekly'", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockEditRecurrence).toHaveBeenCalledTimes(1));
    expect(mockEditRecurrence).toHaveBeenCalledWith("assign-1", {
      recurrence: { kind: "weekly", weekday: 3 },
      endDate: "2026-10-05",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    // Saving closes the dialog — leaving it open invites a double re-expand.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("widens to 'weekly_days' with a SORTED array once a second day is picked", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Seeded on Wednesday (3). Add Monday (1) — selection order is Wed-then-Mon,
    // so an implementation that emitted insertion order would produce [3, 1].
    await user.click(weekdayChip("Lun"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockEditRecurrence).toHaveBeenCalledTimes(1));
    expect(mockEditRecurrence).toHaveBeenCalledWith("assign-1", {
      recurrence: { kind: "weekly_days", weekdays: [1, 3] },
      endDate: "2026-10-05",
    });
  });

  it("seeds the picker from an existing weekly_days rule instead of resetting it", async () => {
    const user = userEvent.setup();
    renderDialog({ recurrence: { kind: "weekly_days", weekdays: [1, 5] } });

    // Mon + Fri must come back pressed. If seeding regressed, a coach opening
    // this dialog only to push the end date would silently rewrite the pattern.
    expect(weekdayChip("Lun")).toHaveAttribute("aria-pressed", "true");
    expect(weekdayChip("Vie")).toHaveAttribute("aria-pressed", "true");
    expect(weekdayChip("Mié")).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockEditRecurrence).toHaveBeenCalledTimes(1));
    expect(mockEditRecurrence.mock.calls[0][1].recurrence).toEqual({
      kind: "weekly_days",
      weekdays: [1, 5],
    });
  });

  it("falls back to the occurrence's own weekday when the rule is unknown", async () => {
    const user = userEvent.setup();
    // A single (non-recurring) assignment, or a rule kind this build predates.
    renderDialog({ recurrence: { kind: "something_new_from_the_future" } });

    // 2026-08-05 is a Wednesday → Mié.
    expect(weekdayChip("Mié")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockEditRecurrence).toHaveBeenCalledTimes(1));
    expect(mockEditRecurrence.mock.calls[0][1].recurrence).toEqual({
      kind: "weekly",
      weekday: 3,
    });
  });
});

describe("WorkoutRecurrenceEditDialog — the guards that stop a bad re-expand", () => {
  it("refuses to save with zero weekdays selected", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    // Deselect the only seeded day, leaving an empty selection.
    await user.click(weekdayChip("Mié"));
    expect(weekdayChip("Mié")).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // The whole point: the destructive action must NOT run.
    expect(mockEditRecurrence).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "Elegí al menos un día de la semana.",
    );
  });

  it("refuses an end date earlier than the occurrence being edited", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    const endDate = document.getElementById("recur-end-date") as HTMLInputElement;
    await user.clear(endDate);
    await user.type(endDate, "2026-07-01"); // before SCHEDULED_FOR

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockEditRecurrence).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "La fecha de fin debe ser igual o posterior a esta fecha.",
    );
  });

  it("clamps 'every N days' into the 2..30 range the expander accepts", async () => {
    const user = userEvent.setup();
    renderDialog({ recurrence: { kind: "every_n_days", everyN: 3 } });

    const everyN = document.getElementById("recur-every-n") as HTMLInputElement;
    await user.clear(everyN);
    await user.type(everyN, "99");
    await user.tab(); // blur normalizes the draft

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockEditRecurrence).toHaveBeenCalledTimes(1));
    expect(mockEditRecurrence.mock.calls[0][1].recurrence).toEqual({
      kind: "every_n_days",
      everyN: 30,
    });
  });
});

describe("WorkoutRecurrenceEditDialog — failure handling", () => {
  it("surfaces the server's message and keeps the dialog open on failure", async () => {
    const user = userEvent.setup();
    mockEditRecurrence.mockRejectedValueOnce(
      new Error("No se pudo reprogramar la serie."),
    );
    const { onSaved, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "No se pudo reprogramar la serie.",
      ),
    );
    // A failed re-expand must not report success upstream, and must not close —
    // closing would strand the coach with no idea the series is unchanged.
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("re-enables Guardar after a failure so the coach can retry", async () => {
    const user = userEvent.setup();
    mockEditRecurrence.mockRejectedValueOnce(new Error("boom"));
    renderDialog();

    const save = screen.getByRole("button", { name: "Guardar" });
    await user.click(save);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });
});

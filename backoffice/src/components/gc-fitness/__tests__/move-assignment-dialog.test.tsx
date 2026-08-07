/**
 * @jest-environment jsdom
 */

// move-assignment-dialog.test.tsx
//
// The dialog shown when a coach drags a RECURRING workout chip onto a new day.
// It doesn't write anything itself — it emits a scope to the parent, which then
// decides how much of the series to move.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Small component, real contract: the three scope strings are switched on by
// the caller. Mixing up "one" and "all" doesn't throw — it silently reschedules
// an entire series when the coach meant to nudge a single day, which is exactly
// the kind of destructive-but-quiet mistake that reaches a client's phone
// before anyone notices.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { MoveAssignmentDialog } from "@/components/gc-fitness/schedule/move-assignment-dialog";
import type { MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";

const CHIP: MonthWorkoutChip = {
  id: "assign-1",
  clientId: "client-1",
  scheduledFor: "2026-08-05",
  originallyScheduledFor: null,
  templateName: "Push Day",
  templateTag: "push",
  status: "scheduled",
  seriesId: "series-1",
  recurrenceKind: "weekly",
  selfAssigned: false,
  plannedExercises: 3,
  logged: null,
};

function renderDialog() {
  const onConfirm = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <MoveAssignmentDialog
      open
      chip={CHIP}
      newDate="2026-08-07"
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("MoveAssignmentDialog", () => {
  it("emits 'one' for just this occurrence", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(
      screen.getByRole("button", { name: /Solo esta ocurrencia/i }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("one");
  });

  it("emits 'future' for this and every following occurrence", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(
      screen.getByRole("button", { name: /Esta y todas las futuras/i }),
    );

    expect(onConfirm).toHaveBeenCalledWith("future");
  });

  it("emits 'all' for the whole series", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: /Toda la serie/i }));

    expect(onConfirm).toHaveBeenCalledWith("all");
  });

  it("shows the occurrence being moved and the target date", () => {
    renderDialog();

    // The coach is about to reschedule someone's training. Both dates must be
    // on screen — a dialog that says "move this?" without saying from-where and
    // to-where is how the wrong day gets confirmed.
    expect(screen.getByText(/Push Day/)).toBeInTheDocument();
    expect(screen.getByText("2026-08-07")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Solo esta ocurrencia \(2026-08-05\)/i }),
    ).toBeInTheDocument();
  });

  it("cancels without emitting any scope", async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

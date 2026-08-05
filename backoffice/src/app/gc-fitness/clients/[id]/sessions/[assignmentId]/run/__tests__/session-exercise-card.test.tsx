/**
 * @jest-environment jsdom
 */

// session-exercise-card.test.tsx
//
// One exercise inside the coach-run live session: the set rows the coach
// actually taps through while standing next to the client.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The card owns no state — every interaction is a callback with an INDEX. That
// index is the whole risk surface: an off-by-one marks the wrong set done,
// edits the wrong weight, or removes a set the coach meant to keep, and none of
// it errors. So these tests assert the (index, value) pairs that leave the card.
//
// Also pinned: a set already marked done LOCKS its inputs. Without that, a
// stray tap after logging silently rewrites a set the client already performed.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { SessionExerciseCard } from "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/session-exercise-card";

// The card imports a Server Action, which drags `firebase-admin` (and its
// node-only crypto deps) into the jsdom bundle. Stub the module.
jest.mock("@/lib/gc-fitness/live-workout-actions", () => ({
  setClientExerciseNote: jest.fn(),
}));

jest.mock("@/lib/gc-fitness/live-workout-listener", () => ({
  clientExerciseNoteKey: (a: string, b: string) => ["note", a, b],
  useClientExerciseNote: () => ({ data: null, isLoading: false }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/components/gc-fitness/exercise-preview-thumb", () => ({
  ExercisePreviewThumb: () => null,
}));

jest.mock("@/components/gc-fitness/StorageImagePreview", () => ({
  StorageImagePreview: () => null,
}));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "set-1",
    weightKg: 60,
    reps: 10,
    durationSeconds: null,
    isWarmup: false,
    setType: "normal",
    done: false,
    completedAt: null,
    ...overrides,
  };
}

const EXERCISE = {
  exerciseId: "ex-bench",
  name: { en: "Bench Press", es: "Press Banca" },
  previewUrl: null,
  mediaUrl: null,
  videoUrl: null,
  restSeconds: 90,
  transitionRestSeconds: 120,
  notes: "",
  metric: "reps",
  supersetGroup: null,
  setTypesBySet: ["normal", "normal", "normal"],
};

function renderCard(rows: Array<Record<string, unknown>>, overrides = {}) {
  const handlers = {
    onWeight: jest.fn(),
    onReps: jest.fn(),
    onDuration: jest.fn(),
    onToggleDone: jest.fn(),
    onSetType: jest.fn(),
    onAddSet: jest.fn(),
    onRemoveSet: jest.fn(),
    onMove: jest.fn(),
  };
  render(
    <SessionExerciseCard
      clientId="client-1"
      exercise={EXERCISE as never}
      rows={rows as never}
      canMoveUp
      canMoveDown
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

/** The done buttons are titled "Marcar como hecha" / "Desmarcar", in row order. */
function doneButtons() {
  return screen.getAllByRole("button", {
    name: /Marcar como hecha|Desmarcar/,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SessionExerciseCard — which set the tap lands on", () => {
  it("marks the SECOND set done with index 1, not 0 or 2", async () => {
    const user = userEvent.setup();
    const handlers = renderCard([row(), row({ id: "set-2" }), row({ id: "set-3" })]);

    await user.click(doneButtons()[1]);

    // The off-by-one here logs a set the client did not do and leaves the one
    // they did unlogged.
    expect(handlers.onToggleDone).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleDone).toHaveBeenCalledWith(1);
  });

  it("marks the LAST set done with the last index", async () => {
    const user = userEvent.setup();
    const handlers = renderCard([row(), row({ id: "set-2" }), row({ id: "set-3" })]);

    const buttons = doneButtons();
    await user.click(buttons[buttons.length - 1]);

    expect(handlers.onToggleDone).toHaveBeenCalledWith(2);
  });

  it("removes the LAST set, never an arbitrary one", async () => {
    const user = userEvent.setup();
    const handlers = renderCard([row(), row({ id: "set-2" }), row({ id: "set-3" })]);

    await user.click(screen.getByRole("button", { name: /Quitar|Eliminar serie|−|-/ }));

    // The remove affordance is a single "drop the last set" action — passing
    // anything but `rows.length - 1` deletes a set the coach was looking at.
    expect(handlers.onRemoveSet).toHaveBeenCalledWith(2);
  });

  it("adds a set through onAddSet", async () => {
    const user = userEvent.setup();
    const handlers = renderCard([row()]);

    await user.click(screen.getByRole("button", { name: /Agregar serie/i }));

    expect(handlers.onAddSet).toHaveBeenCalledTimes(1);
  });
});

describe("SessionExerciseCard — a logged set is locked", () => {
  it("disables the inputs of a set already marked done", () => {
    renderCard([row({ done: true }), row({ id: "set-2" })]);

    // Queried from the DOM, not by role: the numeric fields are `inputMode`
    // text inputs, so they expose `textbox`, not `spinbutton`.
    const numberInputs = Array.from(
      document.querySelectorAll("input"),
    ) as HTMLInputElement[];

    // The first row's inputs belong to the done set and must be locked; a stray
    // tap otherwise rewrites a set the client already performed.
    expect(numberInputs[0]).toBeDisabled();
    // …and a not-yet-done row stays editable.
    expect(numberInputs.some((el) => !el.disabled)).toBe(true);
  });
});

describe("SessionExerciseCard — reordering", () => {
  it("moves the exercise up with -1 and down with +1", async () => {
    const user = userEvent.setup();
    const handlers = renderCard([row()]);

    await user.click(screen.getByRole("button", { name: "Subir ejercicio" }));
    expect(handlers.onMove).toHaveBeenCalledWith(-1);

    await user.click(screen.getByRole("button", { name: "Bajar ejercicio" }));
    expect(handlers.onMove).toHaveBeenCalledWith(1);
  });
});

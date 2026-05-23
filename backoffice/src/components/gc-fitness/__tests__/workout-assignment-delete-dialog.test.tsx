/**
 * @jest-environment jsdom
 */

// workout-assignment-delete-dialog.test.tsx
//
// 260522-ki7 Task D — covers the shared dialog used by Schedule grid and
// Daily client view.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without this docblock React
// Testing Library crashes with `ReferenceError: document is not defined`.

import "@testing-library/jest-dom";

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "../../../../messages/en.json";

// Mock the Server Action so we can drive success/failure paths.
const mockDeleteAssignment = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  deleteAssignment: (...args: unknown[]) => mockDeleteAssignment(...args),
}));

// Mock sonner toast.
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Stub ResizeObserver — radix RadioGroup uses it under the hood.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverStub;

// Stub element.hasPointerCapture / scrollIntoView — Radix uses these on
// AlertDialogAction button focus management.
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  value: () => false,
  writable: true,
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => undefined,
  writable: true,
});

// Import AFTER mocks so the SUT picks them up.
import { WorkoutAssignmentDeleteDialog } from "@/components/gc-fitness/workout-assignment-delete-dialog";

interface RenderOpts {
  seriesId?: string | null;
  onDeleted?: jest.Mock;
  onOpenChange?: jest.Mock;
}

function renderDialog(opts: RenderOpts = {}) {
  const onDeleted = opts.onDeleted ?? jest.fn();
  const onOpenChange = opts.onOpenChange ?? jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <WorkoutAssignmentDeleteDialog
        open={true}
        onOpenChange={onOpenChange}
        assignmentId="asg-1"
        scheduledFor="2026-06-15"
        templateName="Push Day"
        seriesId={opts.seriesId ?? null}
        onDeleted={onDeleted}
      />
    </NextIntlClientProvider>,
  );
  return { onDeleted, onOpenChange };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WorkoutAssignmentDeleteDialog", () => {
  it("non-recurring path renders simple confirm and calls deleteAssignment(id, undefined)", async () => {
    mockDeleteAssignment.mockResolvedValue({ ok: true, deletedCount: 1 });
    const { onDeleted } = renderDialog({ seriesId: null });

    // No radio elements should be rendered for the simple-confirm path.
    expect(
      screen.queryByRole("radio", { name: /only this occurrence/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /this and all future/i }),
    ).not.toBeInTheDocument();

    // The simple confirm description should be visible.
    expect(screen.getByText(/remove the scheduled workout/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(mockDeleteAssignment).toHaveBeenCalledWith("asg-1", undefined);
    });
    expect(onDeleted).toHaveBeenCalledWith({ ok: true, deletedCount: 1 });
    expect(mockToastSuccess).toHaveBeenCalledWith("Removed 1 workout");
  });

  it("recurring path renders the radio group with two options", () => {
    renderDialog({ seriesId: "ser-1" });

    // Both radio choices should be present.
    expect(
      screen.getByRole("radio", { name: /only this occurrence/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /this and all future occurrences/i }),
    ).toBeInTheDocument();

    // Recurring description should be the one shown.
    expect(
      screen.getByText(/this is a recurring workout/i),
    ).toBeInTheDocument();
  });

  it("selecting 'this and future' passes cascadeFromDate to deleteAssignment", async () => {
    mockDeleteAssignment.mockResolvedValue({ ok: true, deletedCount: 3 });
    const { onDeleted } = renderDialog({ seriesId: "ser-1" });

    // Click the "this and future" radio to switch the mode.
    fireEvent.click(
      screen.getByRole("radio", { name: /this and all future occurrences/i }),
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(mockDeleteAssignment).toHaveBeenCalledWith("asg-1", {
        cascadeFromDate: "2026-06-15",
      });
    });
    expect(onDeleted).toHaveBeenCalledWith({ ok: true, deletedCount: 3 });
    expect(mockToastSuccess).toHaveBeenCalledWith("Removed 3 workouts");
  });

  it("cascade on the last occurrence still routes through deleteAssignment + reports deletedCount=1", async () => {
    // Server returns deletedCount=1 when the cascade query found only the
    // selected doc (no future docs in the series). UI does not need to
    // pre-check hasFutureOccurrences.
    mockDeleteAssignment.mockResolvedValue({ ok: true, deletedCount: 1 });
    const { onDeleted, onOpenChange } = renderDialog({ seriesId: "ser-1" });

    fireEvent.click(
      screen.getByRole("radio", { name: /this and all future occurrences/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith({ ok: true, deletedCount: 1 });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Removed 1 workout");
    // Dialog closes on success.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("error from deleteAssignment surfaces a toast and keeps the dialog open", async () => {
    mockDeleteAssignment.mockRejectedValue(new Error("Server boom"));
    const { onDeleted, onOpenChange } = renderDialog({ seriesId: null });

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Server boom");
    });
    expect(onDeleted).not.toHaveBeenCalled();
    // Dialog stays open — onOpenChange(false) is NOT called on error.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

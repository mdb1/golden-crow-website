/**
 * @jest-environment jsdom
 */

// habit-detail-dialog.test.tsx
//
// The dialog behind a habit chip on the calendar. It offers two destructive
// actions that look almost identical in the UI and are very different in the
// data:
//
//   • "Quitar de este día"       → skipHabitOccurrence — adds ONE date to the
//     habit's skip list. The habit survives.
//   • "Eliminar el hábito"       → deleteHabitRecurrenceFromDate — caps the
//     recurrence so the habit stops from this day ONWARD. Everything after is
//     gone.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Both are behind an inline confirm, and both take the TAPPED DAY as their
// cutoff. Wiring one CTA to the other action, or passing the wrong date, is
// silent: the dialog closes, a success toast appears, and the client quietly
// loses a habit they were supposed to keep.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { HabitDetailDialog } from "@/components/gc-fitness/schedule/habit-detail-dialog";

const mockGetHabit = jest.fn();
const mockSkipOccurrence = jest.fn();
const mockDeleteFromDate = jest.fn();
jest.mock("@/lib/gc-fitness/habit-actions", () => ({
  getHabit: (...args: unknown[]) => mockGetHabit(...args),
  skipHabitOccurrence: (...args: unknown[]) => mockSkipOccurrence(...args),
  deleteHabitRecurrenceFromDate: (...args: unknown[]) =>
    mockDeleteFromDate(...args),
}));

jest.mock("@/components/gc-fitness/StorageImagePreview", () => ({
  StorageImagePreview: () => null,
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const TAPPED_DAY = "2026-09-17";

function habit(overrides: Record<string, unknown> = {}) {
  return {
    id: "habit-1",
    clientId: "client-1",
    name: { en: "Drink water", es: "Tomar agua" },
    description: { en: "", es: "" },
    scheduleType: "recurring",
    scheduleCadence: "daily",
    scheduleWeekdays: [],
    scheduleMonthDays: [],
    startsOn: "2026-08-01",
    endsOn: null,
    skippedDates: [],
    reminderEnabled: false,
    reminderTime: null,
    photoUrl: null,
    youtubeUrl: null,
    ...overrides,
  };
}

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onChanged = jest.fn();
  const onOpenChange = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HabitDetailDialog
        open
        onOpenChange={onOpenChange}
        habitId="habit-1"
        civilDate={TAPPED_DAY}
        clientName="Ana"
        onChanged={onChanged}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onChanged, onOpenChange };
}

async function waitForLoaded() {
  await screen.findByRole("button", { name: /Quitar de este día/i });
}

/** Click a CTA, then its inline confirmation. */
async function confirmAction(
  user: ReturnType<typeof userEvent.setup>,
  ctaPattern: RegExp,
  confirmPattern: RegExp,
) {
  await user.click(screen.getByRole("button", { name: ctaPattern }));
  const confirmButtons = await screen.findAllByRole("button", {
    name: confirmPattern,
  });
  // The inline confirm renders a second button with the same label; the last
  // one on screen is the confirmation, not the CTA that opened it.
  await user.click(confirmButtons[confirmButtons.length - 1]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetHabit.mockResolvedValue(habit());
  mockSkipOccurrence.mockResolvedValue(undefined);
  mockDeleteFromDate.mockResolvedValue(undefined);
});

describe("HabitDetailDialog — skip one day", () => {
  it("calls skipHabitOccurrence with the TAPPED day and nothing else", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDialog();
    await waitForLoaded();

    await confirmAction(user, /^Quitar de este día/, /Quitar de este día/);

    await waitFor(() => expect(mockSkipOccurrence).toHaveBeenCalledTimes(1));
    expect(mockSkipOccurrence).toHaveBeenCalledWith({
      habitId: "habit-1",
      civilDate: TAPPED_DAY,
    });
    // The destructive twin must stay untouched — this action keeps the habit.
    expect(mockDeleteFromDate).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("requires the inline confirm — one click alone writes nothing", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitForLoaded();

    await user.click(
      screen.getByRole("button", { name: /^Quitar de este día/ }),
    );

    expect(mockSkipOccurrence).not.toHaveBeenCalled();
  });
});

describe("HabitDetailDialog — delete from this day onward", () => {
  it("calls deleteHabitRecurrenceFromDate with the tapped day as the cutoff", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDialog();
    await waitForLoaded();

    await confirmAction(user, /^Eliminar el hábito/, /Eliminar el hábito/);

    await waitFor(() => expect(mockDeleteFromDate).toHaveBeenCalledTimes(1));
    // Positional args, and the date is the cutoff — passing anything else caps
    // the habit on the wrong day.
    expect(mockDeleteFromDate).toHaveBeenCalledWith("habit-1", TAPPED_DAY);
    expect(mockSkipOccurrence).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("requires the inline confirm for the destructive action too", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitForLoaded();

    await user.click(
      screen.getByRole("button", { name: /^Eliminar el hábito/ }),
    );

    expect(mockDeleteFromDate).not.toHaveBeenCalled();
  });
});

describe("HabitDetailDialog — failure handling", () => {
  it("surfaces the error and does not tell the parent anything changed", async () => {
    const user = userEvent.setup();
    mockDeleteFromDate.mockRejectedValueOnce(new Error("No se pudo eliminar"));
    const { onChanged } = renderDialog();
    await waitForLoaded();

    await confirmAction(user, /^Eliminar el hábito/, /Eliminar el hábito/);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("No se pudo eliminar"),
    );
    // onChanged invalidates the calendar; firing it after a failed write paints
    // a calendar that disagrees with Firestore.
    expect(onChanged).not.toHaveBeenCalled();
  });
});

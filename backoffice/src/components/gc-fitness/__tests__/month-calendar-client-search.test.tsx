/**
 * @jest-environment jsdom
 */

// month-calendar-client-search.test.tsx — #485: the client chip picker gets a
// search box (filters what is SHOWN; "Select all" still selects everyone).

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

jest.mock("@/components/gc-fitness/schedule/move-assignment-dialog", () => ({
  MoveAssignmentDialog: () => null,
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const CLIENTS = Array.from({ length: 12 }, (_, i) => ({
  uid: `c${i}`,
  displayName: i === 7 ? "José Pérez" : `Cliente ${String(i).padStart(2, "0")}`,
  email: `c${i}@example.com`,
  photoURL: null,
  birthDate: null,
}));
const PAYLOAD: MonthCalendarPayload = {
  monthStart: "2026-09-01",
  monthEnd: "2026-09-30",
  workoutsByDay: {},
  habitsByDay: {},
};

function renderCalendar() {
  mockListMonthForClients.mockResolvedValue(PAYLOAD);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MonthCalendar
        clients={CLIENTS}
        initialMonthFirst="2026-09-01"
        initialClientIds={[]}
        initialPayload={PAYLOAD}
        todayCivil="2026-09-10"
        trainerUid="trainer-1"
      />
    </QueryClientProvider>,
  );
}

const chipNames = () =>
  screen
    .queryAllByRole("button", { pressed: false })
    .map((b) => /(Cliente \d\d|José Pérez)$/.exec(b.textContent ?? "")?.[1])
    .filter((t): t is string => Boolean(t));

describe("MonthCalendar client search (#485)", () => {
  it("filters the chips accent-insensitively and Select all still selects everyone", async () => {
    renderCalendar();
    expect(chipNames()).toHaveLength(12);
    fireEvent.change(screen.getByTestId("calendar-client-search"), { target: { value: "jose" } });
    expect(chipNames()).toEqual(["José Pérez"]);

    fireEvent.change(screen.getByTestId("calendar-client-search"), { target: { value: "zzz" } });
    expect(chipNames()).toEqual([]);
    expect(screen.getByText(/clientSearchEmpty|No clients match/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("calendar-client-search"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /selectAll|Select all/ }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(12),
    );
  });
});

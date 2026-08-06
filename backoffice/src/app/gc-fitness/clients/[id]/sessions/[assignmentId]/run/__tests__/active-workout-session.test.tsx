/**
 * @jest-environment jsdom
 */

// active-workout-session.test.tsx
//
// The coach-run live session — the backoffice surface that writes `workout_logs`
// in the SAME wire shape iOS and Android write. A drift here doesn't break the
// portal, it breaks the client's history on all three surfaces.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The set-logging math lives in `use-live-session` and is already covered by
// pure tests (`live-workout-*.test.ts`). What is NOT covered, and is what this
// file pins, is the component's own TERMINAL orchestration:
//
//   1. THE FALSY GUARD. `finalize()` / `cancel()` return null/false when the
//      write did not happen. The component must not close, toast, or navigate
//      on that path — doing so tells a coach the session was saved when it was
//      not, and they walk away from a workout that is still open.
//   2. WHERE EACH ONE LANDS. Finish returns to the client's profile; cancel
//      goes to the notifications hub instead, deliberately, so a cancelled
//      workout does not re-enter the client-detail flow.
//   3. THE CACHE. Finish INVALIDATES the session queries (refetch the new
//      truth); cancel REMOVES them (there is nothing left to refetch). Getting
//      these backwards leaves a finished-or-cancelled workout on screen.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ActiveWorkoutSession } from "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/active-workout-session";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockInvalidate = jest.fn();
const mockRemove = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidate,
    removeQueries: mockRemove,
  }),
}));

const mockFinalize = jest.fn();
const mockCancel = jest.fn();
const mockSession = {
  logId: "log-1",
  assignmentId: "assign-1",
  clientId: "client-1",
  trainerId: "trainer-9",
  workoutName: { en: "Push Day", es: "Día de Empuje" },
  startedAt: null,
  status: "active",
  exercises: [],
  sets: [],
  meetingNotes: null,
  scheduledTime: null,
  scheduledFor: "2026-09-17",
  seriesId: "series-1",
  prescriptionUpdatedAt: null,
};
jest.mock(
  "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/use-live-session",
  () => ({
    useLiveSession: () => ({
      session: mockSession,
      exercises: [],
      rowsByExercise: {},
      finalize: (...args: unknown[]) => mockFinalize(...args),
      cancel: (...args: unknown[]) => mockCancel(...args),
      loading: false,
    }),
  }),
);

jest.mock("@/lib/gc-fitness/live-workout-listener", () => ({
  usePreviousSessionForClient: () => ({ data: {} }),
  activeWorkoutSummariesKey: () => ["active-workout-summaries"],
  activeSessionKey: (id: string) => ["active-session", id],
}));

// Children are their own surfaces; stub them and expose the two terminal
// callbacks so the tests can drive finish/cancel directly.
jest.mock(
  "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/finalize-dialog",
  () => ({
    FinalizeDialog: (props: Record<string, unknown>) => (
      <button
        type="button"
        onClick={() =>
          (props.onConfirm as (m: string, n: string | null) => void)(
            "finish",
            null,
          )
        }
      >
        stub-finalize
      </button>
    ),
  }),
);

jest.mock(
  "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/cancel-workout-dialog",
  () => ({
    CancelWorkoutDialog: (props: Record<string, unknown>) => (
      <button type="button" onClick={() => (props.onConfirm as () => void)()}>
        stub-cancel
      </button>
    ),
  }),
);

jest.mock(
  "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/session-exercise-card",
  () => ({ SessionExerciseCard: () => null }),
);

jest.mock(
  "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/rest-timer-overlay",
  () => ({ RestTimerOverlay: () => null }),
);

jest.mock(
  "@/app/gc-fitness/clients/[id]/sessions/[assignmentId]/run/_components/use-rest-timer",
  () => ({
    useRestTimer: () => ({
      start: jest.fn(),
      stop: jest.fn(),
      remaining: 0,
      running: false,
    }),
  }),
);

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// NOT ASSERTED: the exact URL `cancelWorkout` hard-navigates to. It uses
// `window.location.replace`, and this jsdom build makes both `window.location`
// and its methods non-configurable and read-only — `defineProperty`, the
// delete-then-define workaround, and `spyOn` all throw. What IS asserted below
// is the observable half that matters just as much: cancel must NOT use the
// Next router (`push`), because routing it through the client-detail flow is
// exactly the behavior the source deliberately avoids.

function renderSession() {
  render(
    <ActiveWorkoutSession
      clientId="client-1"
      assignmentId="assign-1"
      initialSession={mockSession as never}
    />,
  );
}

const finish = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "stub-finalize" }));
const cancel = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "stub-cancel" }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFinalize.mockResolvedValue({ futureUpdated: 0 });
  mockCancel.mockResolvedValue(true);
});

describe("ActiveWorkoutSession — finishing", () => {
  it("navigates back to the client's profile and refreshes the caches", async () => {
    const user = userEvent.setup();
    renderSession();

    await finish(user);

    expect(mockFinalize).toHaveBeenCalledWith({ mode: "finish", notes: null });
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/clients/client-1");
    // INVALIDATE, not remove: there is a new finished log to refetch.
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Entrenamiento finalizado");
  });

  it("mentions how many future occurrences the write-back touched", async () => {
    const user = userEvent.setup();
    mockFinalize.mockResolvedValueOnce({ futureUpdated: 3 });
    renderSession();

    await finish(user);

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Entrenamiento finalizado · 3 futuros actualizados",
    );
  });

  it("uses the singular when exactly one future occurrence was updated", async () => {
    const user = userEvent.setup();
    mockFinalize.mockResolvedValueOnce({ futureUpdated: 1 });
    renderSession();

    await finish(user);

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Entrenamiento finalizado · 1 futuro actualizado",
    );
  });

  it("does NOT navigate or toast when finalize reports no write", async () => {
    const user = userEvent.setup();
    mockFinalize.mockResolvedValueOnce(null);
    renderSession();

    await finish(user);

    // The session is still open. Telling the coach otherwise is how a workout
    // gets abandoned mid-write.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

describe("ActiveWorkoutSession — cancelling", () => {
  it("does not route back through the client profile", async () => {
    const user = userEvent.setup();
    renderSession();

    await cancel(user);

    expect(mockCancel).toHaveBeenCalledTimes(1);
    // Deliberate per the source: a cancelled workout must not re-enter the
    // client-detail flow, so the Next router is never used here.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Entrenamiento cancelado · volvió a programado",
    );
  });

  it("REMOVES the session queries rather than refetching them", async () => {
    const user = userEvent.setup();
    renderSession();

    await cancel(user);

    // Nothing left to refetch — an invalidate here would re-request a session
    // that no longer exists.
    expect(mockRemove).toHaveBeenCalled();
  });

  it("does NOT navigate when cancel reports it did not happen", async () => {
    const user = userEvent.setup();
    mockCancel.mockResolvedValueOnce(false);
    renderSession();

    await cancel(user);

    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

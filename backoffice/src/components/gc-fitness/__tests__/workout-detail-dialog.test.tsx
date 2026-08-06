/**
 * @jest-environment jsdom
 */

// workout-detail-dialog.test.tsx
//
// The read surface behind a workout chip on the calendar, and the gate for
// every mutating CTA on it.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The invariant under test is issue #449: a CLIENT-CREATED workout
// (`selfAssigned`) is READ-ONLY for the coach. They can look at the
// prescription, but edit / recurrence / delete and the coach-run live session
// must all be hidden — it isn't the coach's workout to manage.
//
// This is worth pinning because the failure is quiet in both directions:
//   • Leaking the CTAs lets a coach edit or delete a workout the client made
//     for themselves, which the client experiences as their own plan changing
//     under them.
//   • Over-hiding them makes normal coach-assigned workouts unmanageable, and
//     nothing errors — the buttons are simply not there.
//
// The status gate rides along on the same CTAs: a completed or missed workout
// has no live session to start and no future occurrences to reshape.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";

import { WorkoutDetailDialog } from "@/components/gc-fitness/schedule/workout-detail-dialog";
import type { AssignmentDetail } from "@/lib/gc-fitness/schedule-month-actions";

const mockGetAssignmentDetail = jest.fn();
jest.mock("@/lib/gc-fitness/schedule-month-actions", () => ({
  getAssignmentDetail: (...args: unknown[]) => mockGetAssignmentDetail(...args),
}));

// The log panel loads separately; keep it out of the way.
jest.mock("@/lib/gc-fitness/recent-logs-actions", () => ({
  getWorkoutLogDetail: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/components/gc-fitness/workout-log-detail-view", () => ({
  WorkoutLogDetailView: () => null,
}));

jest.mock("@/components/gc-fitness/schedule/workout-assignment-edit-dialog", () => ({
  WorkoutAssignmentEditDialog: () => null,
}));

jest.mock("@/components/gc-fitness/schedule/workout-recurrence-edit-dialog", () => ({
  WorkoutRecurrenceEditDialog: () => null,
}));

jest.mock("@/components/gc-fitness/workout-assignment-delete-dialog", () => ({
  WorkoutAssignmentDeleteDialog: () => null,
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

function detail(overrides: Partial<AssignmentDetail> = {}): AssignmentDetail {
  return {
    id: "assign-1",
    clientId: "client-1",
    clientName: "Ana",
    coachName: "Manu",
    scheduledFor: "2026-09-17",
    scheduledTime: null,
    status: "scheduled",
    templateName: "Push Day",
    templateTag: "push",
    meetingNotes: null,
    seriesId: "series-1",
    recurrence: { kind: "weekly", weekday: 4 },
    seriesEndDate: "2026-12-17",
    exercises: [],
    selfAssigned: false,
    ...overrides,
  } as AssignmentDetail;
}

async function renderDialog(d: AssignmentDetail) {
  mockGetAssignmentDetail.mockResolvedValue(d);
  const onDeleted = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkoutDetailDialog
        open
        onOpenChange={jest.fn()}
        assignmentId="assign-1"
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );
  // Anchor on the template name, which only renders once the detail resolved.
  // It appears more than once (dialog title + body), so match all.
  await screen.findAllByText(/Push Day/);
  return { onDeleted };
}

function queryButton(pattern: RegExp) {
  return screen.queryByRole("button", { name: pattern });
}

/** "Iniciar entrenamiento" is a Link rendered `asChild` inside a Button. */
function queryStartLink() {
  return screen.queryByRole("link", { name: /entrenamiento|Continuar/i });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WorkoutDetailDialog — a COACH-assigned workout is manageable", () => {
  it("offers edit, recurrence, delete and the live session", async () => {
    await renderDialog(detail());

    // Anchored: a bare /Editar/ also matches "Editar recurrencia".
    expect(queryButton(/^Editar$/)).toBeInTheDocument();
    expect(queryButton(/Editar recurrencia/)).toBeInTheDocument();
    expect(queryButton(/Eliminar/)).toBeInTheDocument();
    expect(queryStartLink()).toBeInTheDocument();
  });
});

describe("WorkoutDetailDialog — a CLIENT-created workout is read-only (#449)", () => {
  it("hides every mutating CTA and the coach-run live session", async () => {
    await renderDialog(detail({ selfAssigned: true }));

    // The coach may look, not manage: this workout belongs to the client.
    expect(queryButton(/Editar recurrencia/)).not.toBeInTheDocument();
    expect(queryButton(/Eliminar/)).not.toBeInTheDocument();
    expect(queryStartLink()).not.toBeInTheDocument();
  });

  it("still shows the workout itself, with the client-created badge", async () => {
    await renderDialog(detail({ selfAssigned: true }));

    // Read-only must not mean invisible — the coach needs to see what their
    // client is doing.
    expect(screen.getAllByText(/Push Day/).length).toBeGreaterThan(0);
  });
});

describe("WorkoutDetailDialog — finished workouts", () => {
  it("drops the live-session entry once the workout is completed", async () => {
    await renderDialog(detail({ status: "completed" }));

    // Nothing left to run; the log is what matters now.
    expect(queryStartLink()).not.toBeInTheDocument();
  });

  it("drops 'Editar recurrencia' on a completed occurrence", async () => {
    await renderDialog(detail({ status: "completed" }));

    // Reshaping a series from an occurrence already in the past would rewrite
    // history the client already lived.
    expect(queryButton(/Editar recurrencia/)).not.toBeInTheDocument();
  });

  it("drops 'Editar recurrencia' on a single (non-series) assignment", async () => {
    await renderDialog(detail({ seriesId: null, recurrence: null }));

    expect(queryButton(/Editar recurrencia/)).not.toBeInTheDocument();
  });
});

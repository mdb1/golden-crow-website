/**
 * @jest-environment jsdom
 */

// coachless-users-table.test.tsx
//
// Issue #606 (search + sort) and #636 (avatars) on the admin "Coach-less users"
// list, at the level the operator actually experiences them.

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { CoachlessUsersTable } from "@/app/gc-fitness/admin/coach-less-users/_components/CoachlessUsersTable";
import type { CoachlessUserRow } from "@/lib/gc-fitness/admin-coachless-actions";

function row(over: Partial<CoachlessUserRow> & { uid: string }): CoachlessUserRow {
  return {
    email: `${over.uid}@x.com`,
    displayName: over.uid,
    photoURL: null,
    createdAtISO: "2026-01-01T00:00:00.000Z",
    entitlement: null,
    stats: { routines: 0, habits: 0, progressPhotos: 0, workoutLogs: 0 },
    ...over,
  } as CoachlessUserRow;
}

const ROWS: CoachlessUserRow[] = [
  row({
    uid: "ana",
    displayName: "Ana Gómez",
    email: "ana@x.com",
    createdAtISO: "2026-06-10T10:00:00.000Z",
    stats: { routines: 3, habits: 1, progressPhotos: 0, workoutLogs: 12 },
  }),
  row({
    uid: "beto",
    displayName: "Beto Ruiz",
    email: "beto@x.com",
    createdAtISO: "2026-07-29T10:00:00.000Z",
    stats: { routines: 1, habits: 5, progressPhotos: 2, workoutLogs: 0 },
  }),
  row({
    // Apple private-relay signup: no display name AND no photo — the pair that
    // rendered an empty grey circle before #636.
    uid: "apple1",
    displayName: "",
    email: "9mgc9g@privaterelay.appleid.com",
    photoURL: null,
    createdAtISO: "2026-07-01T10:00:00.000Z",
    stats: { routines: 0, habits: 0, progressPhotos: 7, workoutLogs: 3 },
  }),
];

const noop = async () => {};

function renderTable() {
  return render(
    <CoachlessUsersTable
      rows={ROWS}
      coaches={[{ uid: "coach1", displayName: "Coach One", email: "coach1@x.com" }]}
      assignCoachAction={noop}
      setTierAction={noop}
      deleteUserAction={noop}
      timezone="America/Argentina/Buenos_Aires"
    />,
  );
}

/** The user column's visible label, row by row, in render order. */
function userColumnOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tbody tr")).map(
    (tr) => tr.querySelector("td")?.textContent ?? "",
  );
}

describe("CoachlessUsersTable", () => {
  it("defaults to newest signups first", () => {
    const { container } = renderTable();
    const order = userColumnOrder(container);
    expect(order[0]).toContain("Beto Ruiz"); // 2026-07-29
    expect(order[1]).toContain("privaterelay"); // 2026-07-01
    expect(order[2]).toContain("Ana Gómez"); // 2026-06-10
  });

  it("sorts by a numeric column and flips direction on a second click", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    await user.click(screen.getByRole("button", { name: "Sort by Logs" }));
    expect(userColumnOrder(container)[0]).toContain("Ana Gómez"); // 12 logs

    await user.click(screen.getByRole("button", { name: "Sort by Logs" }));
    expect(userColumnOrder(container)[0]).toContain("Beto Ruiz"); // 0 logs
  });

  it("searches by name, email or uid and reports the narrowed count", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();
    expect(screen.getByText("3 coach-less users.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search coach-less users"), "privaterelay");
    expect(userColumnOrder(container)).toHaveLength(1);
    expect(screen.getByText("1 of 3 coach-less users.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search coach-less users"));
    await user.type(screen.getByLabelText("Search coach-less users"), "zzz");
    expect(screen.getByText("No coach-less users match that search.")).toBeInTheDocument();
  });

  it("falls back to initials when a user has no photo (#636)", () => {
    renderTable();
    expect(screen.getByText("AG")).toBeInTheDocument(); // Ana Gómez
    // Name-less Apple signup → initials off the email, never a blank circle.
    expect(screen.getByText("9")).toBeInTheDocument();
  });
});

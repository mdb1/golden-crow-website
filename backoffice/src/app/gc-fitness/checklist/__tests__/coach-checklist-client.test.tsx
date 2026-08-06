/**
 * @jest-environment jsdom
 */

// coach-checklist-client.test.tsx
//
// The coach's own reminder list. It writes through three Server Actions and
// then re-renders itself from the server, so the interesting part is not the
// payload alone but the GROUPING: which bucket an item lands in, and in which
// order. A reminder filed under the wrong heading is a reminder the coach does
// not act on.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What is pinned:
//
//   • THE COACH'S TIMEZONE DECIDES THE DAY (#747). Every civil day here is
//     computed in the zone the server resolved, not in the host's. The bug
//     this replaced put an item due at 21:00 in Buenos Aires under TOMORROW
//     until hydration corrected it — visible, wrong, and self-healing, which
//     is the worst combination to debug.
//   • OVERDUE OUTRANKS THE DAY. An item due at 09:00 that it is now 18:00 is
//     "Overdue", not "Today" — grouping it under Today buries it among things
//     that have not happened yet.
//   • UNDATED ITEMS SORT LAST but are not overdue — `MAX_SAFE_INTEGER`, not 0.
//   • COMPLETED ITEMS ARE HIDDEN until asked for, and the active COUNT never
//     includes them.
//
// The clock is PINNED. The component captures `new Date()` at mount and every
// bucket is decided against it, so a suite run at 23:30 local would file
// "later today" fixtures under tomorrow. `setSystemTime` fixes it at
// 2026-09-10T15:00Z = 12:00 in Buenos Aires, which leaves room on both sides
// of the same civil day. user-event is wired to the fake timers via
// `advanceTimers`, which is what makes clicks work while they are installed.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { CoachChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";

const mockCreate = jest.fn();
const mockSetCompleted = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/lib/gc-fitness/coach-checklist-actions", () => ({
  createCoachChecklistItem: (...a: unknown[]) => mockCreate(...a),
  setCoachChecklistItemCompleted: (...a: unknown[]) => mockSetCompleted(...a),
  deleteCoachChecklistItem: (...a: unknown[]) => mockDelete(...a),
}));

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => mockRefresh() }),
}));

// The edit dialog owns its own save path; this file is about the list.
jest.mock("@/components/gc-fitness/ChecklistEditDialog", () => ({
  ChecklistEditDialog: () => null,
}));

import { CoachChecklistClient } from "../CoachChecklistClient";

const TZ = "America/Argentina/Buenos_Aires";

function item(overrides: Partial<CoachChecklistItem> = {}): CoachChecklistItem {
  return {
    id: "i1",
    title: "Call Ana",
    notes: null,
    dueAt: null,
    completed: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    clients: [],
    recurrence: "none",
    recurrenceEndsOn: null,
    recurrenceWeekdays: [],
    recurrenceMonthDays: [],
    ...overrides,
  } as CoachChecklistItem;
}

function renderList(items: CoachChecklistItem[], timezone = TZ) {
  const view = render(
    <CoachChecklistClient
      items={items}
      clients={[{ uid: "ana", displayName: "Ana Gomez", photoURL: null }]}
      timezone={timezone}
    />,
  );
  return {
    ...view,
    user: userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
  };
}

/** The `<section>` under a group heading, matched on the heading text. */
function group(heading: string): HTMLElement {
  const node = screen.getByRole("heading", { name: heading }).closest("section");
  if (!node) throw new Error(`no group section for ${heading}`);
  return node as HTMLElement;
}

/** Every group heading, in the order they are rendered. */
function groupHeadings(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent ?? "");
}

/**
 * The item titles inside a group, in render order.
 *
 * Rows are plain `<div>`s (no list semantics), so they are counted by their
 * checkbox — whose accessible name carries the title, one per row.
 */
function titlesIn(heading: string): string[] {
  return within(group(heading))
    .getAllByRole("checkbox")
    .map((cb) => (cb.getAttribute("aria-label") ?? "").replace(/^Toggle /, ""));
}

// 12:00 in Buenos Aires on a Thursday.
const NOW = "2026-09-10T15:00:00.000Z";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(NOW) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("CoachChecklistClient — which bucket an item lands in", () => {
  it("files a PAST due time as Overdue, not under its own day", async () => {
    const past = "2026-09-10T13:00:00.000Z"; // 10:00 in Buenos Aires — same day, gone
    renderList([item({ dueAt: past, title: "Call Ana" })]);

    expect(titlesIn("Overdue")).toEqual(["Call Ana"]);
    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
  });

  it("files a LATER TODAY due time under Today", async () => {
    // Same civil day, still in the future — the two branches differ only by
    // the comparison against `now`, which is exactly the confusion worth
    // pinning.
    const soon = "2026-09-10T22:00:00.000Z"; // 19:00 in Buenos Aires
    renderList([item({ dueAt: soon, title: "Call Ana" })]);

    expect(titlesIn("Today")).toEqual(["Call Ana"]);
  });

  it("files an item with no due date under its own heading, never Overdue", async () => {
    renderList([item({ dueAt: null, title: "Someday" })]);

    expect(titlesIn("No date")).toEqual(["Someday"]);
    expect(screen.queryByRole("heading", { name: "Overdue" })).not.toBeInTheDocument();
  });

  it("names the day in the COACH's timezone, not in UTC (#747)", async () => {
    // 2026-09-12T02:00Z is Sep 11 at 23:00 in Buenos Aires — TOMORROW for this
    // coach, and Saturday the 12th for a UTC one. Asserting merely that the
    // two renders "differ" is not enough: they also differ with the bug in
    // place (verified by mutation), because a wrong civil day still produces
    // some heading. The exact label is the assertion.
    const dueAt = "2026-09-12T02:00:00.000Z";

    const { unmount } = renderWithTz([item({ dueAt })], TZ);
    expect(groupHeadings()).toEqual(["Tomorrow"]);
    unmount();

    renderWithTz([item({ dueAt })], "UTC");
    expect(groupHeadings()).toEqual(["Saturday, September 12"]);
  });

  it("BUCKETS by the coach's civil day, so one local day is ONE group (#747)", async () => {
    // Both instants are Sep 11 in Buenos Aires (12:00 and 23:00) but land on
    // different UTC days. Keyed in UTC they split into two headings and the
    // coach reads their Friday as two separate days.
    const items = [
      item({ id: "a", title: "Noon", dueAt: "2026-09-11T15:00:00.000Z" }),
      item({ id: "b", title: "Late", dueAt: "2026-09-12T02:00:00.000Z" }),
    ];

    const { unmount } = renderWithTz(items, TZ);
    expect(groupHeadings()).toEqual(["Tomorrow"]);
    expect(titlesIn("Tomorrow")).toEqual(["Noon", "Late"]);
    unmount();

    renderWithTz(items, "UTC");
    expect(groupHeadings()).toHaveLength(2);
  });
});

describe("CoachChecklistClient — the order things appear in", () => {
  it("sorts by due instant, earliest first", async () => {
    renderList([
      item({ id: "b", title: "Later", dueAt: "2026-09-13T20:00:00.000Z" }),
      item({ id: "a", title: "Earlier", dueAt: "2026-09-13T16:00:00.000Z" }),
    ]);

    expect(groupHeadings()).toHaveLength(1);
    expect(titlesIn(groupHeadings()[0])).toEqual(["Earlier", "Later"]);
  });

  it("pushes the UNDATED group to the end", async () => {
    // `MAX_SAFE_INTEGER`, not 0 — a missing date sorted as epoch would put
    // every vague reminder above every dated one.
    renderList([
      item({ id: "a", title: "Someday", dueAt: null }),
      item({ id: "b", title: "Dated", dueAt: "2026-09-13T16:00:00.000Z" }),
    ]);

    expect(groupHeadings().at(-1)).toBe("No date");
  });

  it("breaks a tie on creation order", async () => {
    const same = "2026-09-13T16:00:00.000Z";
    renderList([
      item({ id: "b", title: "Second", dueAt: same, createdAt: "2026-02-02T00:00:00.000Z" }),
      item({ id: "a", title: "First", dueAt: same, createdAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    expect(titlesIn(groupHeadings()[0])).toEqual(["First", "Second"]);
  });
});

describe("CoachChecklistClient — completed items", () => {
  it("hides them, and keeps them out of the active count", async () => {
    renderList([
      item({ id: "a", title: "Open" }),
      item({ id: "b", title: "Done", completed: true }),
    ]);

    expect(screen.queryByText("Done")).not.toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });

  it("reveals them on demand, under their own heading", async () => {
    const { user } = renderList([
      item({ id: "a", title: "Open" }),
      item({ id: "b", title: "Done", completed: true }),
    ]);

    await user.click(screen.getByRole("button", { name: /Show completed/ }));

    expect(titlesIn("Completed")).toEqual(["Done"]);
    // …and still not counted as active.
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });

  it("offers no toggle at all when nothing is completed", async () => {
    renderList([item({ id: "a", title: "Open" })]);

    expect(
      screen.queryByRole("button", { name: /Show completed/ }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes 'nothing at all' from 'nothing active'", async () => {
    const { unmount } = renderList([]);
    expect(screen.getByText("No reminders yet.")).toBeInTheDocument();
    unmount();

    renderList([item({ completed: true })]);
    expect(screen.getByText("No active reminders.")).toBeInTheDocument();
  });
});

describe("CoachChecklistClient — writing", () => {
  it("sends the form fields the action expects, and refreshes", async () => {
    const { user } = renderList([]);

    await user.type(screen.getByLabelText("Title"), "Call Ana");
    await user.type(screen.getByLabelText("Notes"), "about her knee");
    await user.click(screen.getByRole("button", { name: "Add reminder" }));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Call Ana",
        notes: "about her knee",
        clientIds: [],
        recurrence: "none",
      }),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("toggles an item to the OPPOSITE of what it is now", async () => {
    // `!item.completed`, not a hardcoded true — otherwise nothing can ever be
    // un-completed and the toggle is a one-way door.
    const { user } = renderList([item({ id: "a", title: "Open" })]);

    await user.click(screen.getByRole("checkbox", { name: /Toggle Open/ }));

    expect(mockSetCompleted).toHaveBeenCalledWith("a", true);
  });

  it("un-completes a completed item", async () => {
    const { user } = renderList([item({ id: "a", title: "Done", completed: true })]);

    await user.click(screen.getByRole("button", { name: /Show completed/ }));
    await user.click(screen.getByRole("checkbox", { name: /Toggle Done/ }));

    expect(mockSetCompleted).toHaveBeenCalledWith("a", false);
  });

  it("deletes by id", async () => {
    const { user } = renderList([item({ id: "a", title: "Open" })]);

    await user.click(screen.getByRole("button", { name: /Delete Open/ }));

    expect(mockDelete).toHaveBeenCalledWith("a");
    expect(mockRefresh).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

function renderWithTz(items: CoachChecklistItem[], timezone: string) {
  return render(
    <CoachChecklistClient
      items={items}
      clients={[]}
      timezone={timezone}
    />,
  );
}


/**
 * @jest-environment jsdom
 */

// data-hygiene-feed.test.tsx
//
// The admin's delete-from-Firestore surface. Every row is a `<form>` whose
// HIDDEN FIELDS are the entire payload — `purgeDataHygieneItem` reads nothing
// else. That makes this the cheapest possible place for a silent data bug: a
// field that stops being rendered doesn't throw, it just deletes less than the
// operator was told it would (a photo doc without its `storagePath` leaves the
// Storage object orphaned, which is the very anomaly this page exists to find).
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Also pinned: the `window.confirm` gate. It is the only thing between a
// mis-click and an irreversible delete, and `preventDefault` on a submit
// button is easy to break without any visible symptom until the day someone
// cancels the dialog and the record disappears anyway.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type {
  DataHygienePage,
  DataHygieneRow,
} from "@/lib/gc-fitness/data-hygiene-actions";

const mockListPage = jest.fn();
const mockPurge = jest.fn();
jest.mock("@/lib/gc-fitness/data-hygiene-actions", () => ({
  listDataHygienePage: (...args: unknown[]) => mockListPage(...args),
  purgeDataHygieneItem: (...args: unknown[]) => mockPurge(...args),
}));

import { DataHygieneFeed } from "../hygiene/DataHygieneFeed";

const EMPTY_SUMMARY: DataHygienePage["summary"] = {
  user: 0,
  chat: 0,
  photo: 0,
  template: 0,
  assignment: 0,
  log: 0,
  exercise: 0,
};

function row(overrides: Partial<DataHygieneRow> = {}): DataHygieneRow {
  return {
    id: "row-1",
    kind: "photo",
    title: "Progress photo",
    detail: "clients/ana",
    issue: "Storage object with no Firestore doc",
    sortAtISO: "2026-09-10T15:00:00.000Z",
    ...overrides,
  } as DataHygieneRow;
}

function page(overrides: Partial<DataHygienePage> = {}): DataHygienePage {
  return {
    rows: [],
    nextOffset: 20,
    hasMore: true,
    summary: EMPTY_SUMMARY,
    ...overrides,
  } as DataHygienePage;
}

function renderFeed(initial: DataHygienePage, loadError: string | null = null) {
  render(<DataHygieneFeed initialPage={initial} loadError={loadError} />);
  return { user: userEvent.setup() };
}

/** Every hidden input of the row form, as a plain object. */
function hiddenFields(index = 0): Record<string, string> {
  const form = document.querySelectorAll("form")[index];
  return Object.fromEntries(
    Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).map(
      (input) => [input.name, input.value],
    ),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListPage.mockResolvedValue(page({ rows: [], nextOffset: null, hasMore: false }));
});

describe("DataHygieneFeed — what the delete form actually carries", () => {
  it("always sends the kind and the id", () => {
    renderFeed(page({ rows: [row({ kind: "log", id: "log-9" })] }));

    expect(hiddenFields()).toMatchObject({ kind: "log", id: "log-9" });
  });

  it("carries the STORAGE PATH of a photo, so the object goes too", () => {
    // Without it the Firestore doc is deleted and the file stays behind —
    // which is exactly the "orphaned image" anomaly this page reports.
    renderFeed(
      page({
        rows: [
          row({
            kind: "photo",
            id: "photo-1",
            photoId: "photo-1",
            storagePath: "progress_photos/ana/1.jpg",
            userId: "ana",
          }),
        ],
      }),
    );

    expect(hiddenFields()).toEqual({
      kind: "photo",
      id: "photo-1",
      userId: "ana",
      photoId: "photo-1",
      storagePath: "progress_photos/ana/1.jpg",
    });
  });

  it("carries the role alongside a user, and the owner alongside an exercise", () => {
    renderFeed(
      page({
        rows: [
          row({ kind: "user", id: "u1", userId: "u1", userRole: "client" }),
          row({ kind: "exercise", id: "e1", exerciseId: "e1", ownerId: "coach-1", source: "trainer" }),
        ],
      }),
    );

    expect(hiddenFields(0)).toMatchObject({ role: "client", userId: "u1" });
    expect(hiddenFields(1)).toMatchObject({ ownerId: "coach-1", source: "trainer" });
  });

  it("OMITS an absent field rather than sending an empty string", () => {
    // `String(formData.get("storagePath"))` on an empty input is `""`, which is
    // a value: the action would try to delete an object at path "".
    renderFeed(page({ rows: [row({ kind: "photo", id: "photo-1", storagePath: null })] }));

    expect(hiddenFields()).not.toHaveProperty("storagePath");
  });
});

describe("DataHygieneFeed — the confirm gate", () => {
  it("lets the submit through when the operator confirms", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    renderFeed(page({ rows: [row({ kind: "log" })] }));

    const event = fireEvent.click(screen.getByRole("button", { name: "Delete from DB" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Delete this log record from Firestore?",
    );
    expect(event).toBe(true); // not prevented
    confirmSpy.mockRestore();
  });

  it("CANCELS the submit when the operator says no", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    renderFeed(page({ rows: [row()] }));

    const event = fireEvent.click(screen.getByRole("button", { name: "Delete from DB" }));

    expect(event).toBe(false); // preventDefault() ran
    confirmSpy.mockRestore();
  });
});

describe("DataHygieneFeed — the summary and the list", () => {
  it("folds the four workout kinds into one number", () => {
    // template + assignment + log + exercise. A missing addend understates the
    // backlog and the operator stops paging.
    renderFeed(
      page({
        summary: { ...EMPTY_SUMMARY, template: 1, assignment: 2, log: 3, exercise: 4, user: 5 },
      }),
    );

    const workouts = screen.getByText("Workouts").closest("div") as HTMLElement;
    expect(within(workouts).getByText("10")).toBeInTheDocument();
  });

  it("totals every kind, workouts included", () => {
    renderFeed(
      page({
        summary: { ...EMPTY_SUMMARY, user: 5, chat: 1, photo: 1, template: 1 },
      }),
    );

    const total = screen.getByText("Total").closest("div") as HTMLElement;
    expect(within(total).getByText("8")).toBeInTheDocument();
  });

  it("says the scan is clean instead of showing an empty list", () => {
    renderFeed(page({ rows: [], hasMore: false }));

    expect(
      screen.getByText("No anomalies found in the current scan window."),
    ).toBeInTheDocument();
  });

  it("keeps the page usable when the initial scan failed", () => {
    // The scan is best-effort; a failure must not blank the admin page.
    renderFeed(page({ rows: [row()], hasMore: false }), "index missing");

    expect(screen.getByText("Hygiene scan could not load")).toBeInTheDocument();
    expect(screen.getByText("index missing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete from DB" })).toBeInTheDocument();
  });
});

describe("DataHygieneFeed — paging", () => {
  it("asks for the NEXT offset the server handed back", async () => {
    const { user } = renderFeed(page({ rows: [row()], nextOffset: 40, hasMore: true }));

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => expect(mockListPage).toHaveBeenCalledWith(40, 20));
  });

  it("appends and refreshes the summary from the new page", async () => {
    mockListPage.mockResolvedValue(
      page({
        rows: [row({ id: "row-2", title: "Orphaned chat" })],
        nextOffset: null,
        hasMore: false,
        summary: { ...EMPTY_SUMMARY, user: 7 },
      }),
    );
    const { user } = renderFeed(page({ rows: [row({ id: "row-1", title: "Progress photo" })] }));

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => expect(screen.getByText("Orphaned chat")).toBeInTheDocument());
    expect(screen.getByText("Progress photo")).toBeInTheDocument();
    const total = screen.getByText("Total").closest("div") as HTMLElement;
    expect(within(total).getByText("7")).toBeInTheDocument();
  });

  it("does not offer to page when the server says there is nothing left", () => {
    renderFeed(page({ rows: [row()], nextOffset: null, hasMore: false }));

    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });
});

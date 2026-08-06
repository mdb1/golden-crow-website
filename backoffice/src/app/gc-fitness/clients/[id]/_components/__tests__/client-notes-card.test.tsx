/**
 * @jest-environment jsdom
 */

// client-notes-card.test.tsx
//
// The coach's private notes log on a client profile. Nothing here reaches the
// client's phone, which is exactly why it never gets looked at until a note is
// missing.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// THE ENTRIES HAVE NO ID. They are addressed by the `(createdAt, date)` pair —
// in the Server Action call AND in the local list update afterwards. Everything
// interesting follows from that:
//
//   • A LEGACY ENTRY WITH NO `createdAt` CANNOT BE TARGETED, so its edit and
//     delete controls are hidden rather than pointed at a guess. Showing them
//     would let a coach delete a different note than the one they clicked.
//   • THE LOCAL UPDATE MUST MATCH ON BOTH FIELDS. Matching on the date alone
//     rewrites every note of that day; matching on the text alone rewrites
//     every note that happens to say the same thing.
//   • THE NOTE IS FILED UNDER THE PICKED DATE, not today. The whole point of
//     the date picker is back-filling a session the coach didn't write up on
//     the day.
//
// The compose box clears OPTIMISTICALLY and is restored on failure — a coach
// who just lost a paragraph they typed does not type it again.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockUpdateClientNotes = jest.fn();
const mockEditClientNote = jest.fn();
const mockDeleteClientNote = jest.fn();
jest.mock("@/lib/gc-fitness/client-notes-actions", () => ({
  updateClientNotes: (...args: unknown[]) => mockUpdateClientNotes(...args),
  editClientNote: (...args: unknown[]) => mockEditClientNote(...args),
  deleteClientNote: (...args: unknown[]) => mockDeleteClientNote(...args),
}));

import { ClientNotesCard } from "../ClientNotesCard";

const CLIENT = "ana";
const TZ = "America/Argentina/Buenos_Aires";
const TODAY = "2026-08-05";

type Entry = { date: string; notes: string; createdAt: string | null };

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    date: TODAY,
    notes: "Trabajó hombro con molestia",
    createdAt: "2026-08-05T15:00:00.000Z",
    ...overrides,
  };
}

function renderCard(entries: Entry[] = []) {
  render(
    <ClientNotesCard
      clientId={CLIENT}
      timezone={TZ}
      todayCivil={TODAY}
      initialNotes=""
      initialUpdatedAt={null}
      initialEntries={entries}
    />,
  );
  return { user: userEvent.setup() };
}

function composeBox() {
  return screen.getByPlaceholderText("Write a note for this day...");
}

function addButton() {
  return screen.getByRole("button", { name: "Add note" });
}

function dateInput() {
  return screen.getByLabelText("Date");
}

/** The "Notes for <date>" section — the picked day's entries. */
function forDateSection(): HTMLElement {
  const heading = screen.getByText(/^Notes for /);
  return heading.parentElement as HTMLElement;
}

/** The "Previous notes" section. */
function recentSection(): HTMLElement {
  const heading = screen.getByText("Previous notes");
  return heading.parentElement as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateClientNotes.mockResolvedValue({ updatedAt: "2026-08-05T16:00:00.000Z" });
  mockEditClientNote.mockResolvedValue({ ok: true });
  mockDeleteClientNote.mockResolvedValue({ ok: true });
});

describe("ClientNotesCard — adding a note", () => {
  it("files it under the PICKED date, not today", async () => {
    const { user } = renderCard();

    await user.clear(dateInput());
    await user.type(dateInput(), "2026-07-28");
    await user.type(composeBox(), "Sesión de test");
    await user.click(addButton());

    await waitFor(() => expect(mockUpdateClientNotes).toHaveBeenCalled());
    // Back-filling a session the coach didn't write up on the day is the whole
    // reason the date picker exists.
    expect(mockUpdateClientNotes).toHaveBeenCalledWith({
      clientId: CLIENT,
      notes: "Sesión de test",
      date: "2026-07-28",
    });
  });

  it("shows the new note without waiting for a refetch", async () => {
    const { user } = renderCard();

    await user.type(composeBox(), "Nueva observación");
    await user.click(addButton());

    await waitFor(() =>
      expect(within(forDateSection()).getByText("Nueva observación")).toBeInTheDocument(),
    );
    expect(composeBox()).toHaveValue("");
  });

  it("RESTORES the typed text when the save fails", async () => {
    const { user } = renderCard();
    mockUpdateClientNotes.mockRejectedValue(new Error("Sin conexión."));

    await user.type(composeBox(), "Un parrafo largo que no quiero reescribir");
    await user.click(addButton());

    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    // The box is cleared optimistically; leaving it cleared on failure loses
    // what the coach wrote.
    await waitFor(() =>
      expect(composeBox()).toHaveValue("Un parrafo largo que no quiero reescribir"),
    );
  });

  it("keeps Add disabled until there is real text", async () => {
    const { user } = renderCard();

    expect(addButton()).toBeDisabled();

    await user.type(composeBox(), "   ");
    expect(addButton()).toBeDisabled();

    await user.type(composeBox(), "algo");
    expect(addButton()).toBeEnabled();
  });
});

describe("ClientNotesCard — which entries show where", () => {
  it("puts only the picked day's notes in the day section", () => {
    renderCard([
      entry({ date: TODAY, notes: "De hoy" }),
      entry({ date: "2026-08-01", notes: "De la semana pasada", createdAt: "2026-08-01T10:00:00.000Z" }),
    ]);

    const section = forDateSection();
    expect(within(section).getByText("De hoy")).toBeInTheDocument();
    expect(within(section).queryByText("De la semana pasada")).not.toBeInTheDocument();
  });

  it("keeps a FUTURE note out of the previous-notes list", () => {
    renderCard([
      entry({ date: TODAY, notes: "De hoy" }),
      entry({
        date: "2026-09-01",
        notes: "Planificado para septiembre",
        createdAt: "2026-08-05T16:00:00.000Z",
      }),
    ]);

    // "Previous" means `date <= picked`. A note filed ahead of the picked day
    // is not history.
    expect(
      within(recentSection()).queryByText("Planificado para septiembre"),
    ).not.toBeInTheDocument();
  });

  it("orders the day's notes newest first", () => {
    renderCard([
      entry({ notes: "Primera", createdAt: "2026-08-05T09:00:00.000Z" }),
      entry({ notes: "Segunda", createdAt: "2026-08-05T18:00:00.000Z" }),
    ]);

    const text = forDateSection().textContent ?? "";
    expect(text.indexOf("Segunda")).toBeLessThan(text.indexOf("Primera"));
  });

  it("orders the PREVIOUS-notes list newest first too", () => {
    // Two independent sorts, one per section. Verified by mutation: reversing
    // only the `recentEntries` one left the day-section test green.
    renderCard([
      entry({ date: "2026-08-01", notes: "Vieja", createdAt: "2026-08-01T09:00:00.000Z" }),
      entry({ date: "2026-08-04", notes: "Reciente", createdAt: "2026-08-04T09:00:00.000Z" }),
    ]);

    const text = recentSection().textContent ?? "";
    expect(text.indexOf("Reciente")).toBeLessThan(text.indexOf("Vieja"));
  });

  it("caps the previous-notes list at 8", () => {
    renderCard(
      Array.from({ length: 12 }, (_, i) => ({
        date: "2026-08-01",
        notes: `[nota-${i}]`,
        createdAt: `2026-08-01T${String(i + 8).padStart(2, "0")}:00:00.000Z`,
      })),
    );

    // An unbounded log turns the profile page into a wall of history.
    //
    // The marker is bracketed on purpose: `textContent` runs the note straight
    // into the entry's date, so a bare `Nota 11` matches "Nota 112026-08-01".
    const shown = (recentSection().textContent ?? "").match(/\[nota-\d+\]/g) ?? [];
    expect(shown).toHaveLength(8);
    // …and it keeps the NEWEST eight, not the first eight it happened to read.
    expect(shown[0]).toBe("[nota-11]");
  });

  it("says so when the picked day has nothing", async () => {
    const { user } = renderCard([entry({ date: "2026-08-01", createdAt: "2026-08-01T10:00:00.000Z" })]);

    await user.clear(dateInput());
    await user.type(dateInput(), "2026-08-05");

    expect(screen.getByText("No notes for this day.")).toBeInTheDocument();
  });
});

describe("ClientNotesCard — editing an entry", () => {
  it("targets the entry by (createdAt, date)", async () => {
    const { user } = renderCard([entry({ notes: "Original" })]);

    await user.click(within(forDateSection()).getAllByRole("button", { name: "Edit" })[0]);
    const draft = within(forDateSection()).getByRole("textbox");
    await user.clear(draft);
    await user.type(draft, "  Corregido  ");
    await user.click(within(forDateSection()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockEditClientNote).toHaveBeenCalled());
    // Entries have no id: this pair IS the address.
    expect(mockEditClientNote).toHaveBeenCalledWith({
      clientId: CLIENT,
      entryCreatedAt: "2026-08-05T15:00:00.000Z",
      entryDate: TODAY,
      notes: "Corregido",
    });
  });

  it("updates ONLY the edited entry, not its same-day siblings", async () => {
    const { user } = renderCard([
      entry({ notes: "Mañana", createdAt: "2026-08-05T09:00:00.000Z" }),
      entry({ notes: "Tarde", createdAt: "2026-08-05T18:00:00.000Z" }),
    ]);

    // The first Edit button belongs to the newest entry ("Tarde").
    await user.click(within(forDateSection()).getAllByRole("button", { name: "Edit" })[0]);
    const draft = within(forDateSection()).getByRole("textbox");
    await user.clear(draft);
    await user.type(draft, "Tarde corregida");
    await user.click(within(forDateSection()).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(within(forDateSection()).getByText("Tarde corregida")).toBeInTheDocument(),
    );
    // Matching on the date alone would rewrite both notes of that day.
    expect(within(forDateSection()).getByText("Mañana")).toBeInTheDocument();
  });

  it("keeps the row open with an error when the edit fails", async () => {
    const { user } = renderCard([entry({ notes: "Original" })]);
    mockEditClientNote.mockRejectedValue(new Error("No se pudo guardar."));

    await user.click(within(forDateSection()).getAllByRole("button", { name: "Edit" })[0]);
    await user.click(within(forDateSection()).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("No se pudo guardar.")).toBeInTheDocument();
    // Closing the editor on failure would look like it saved.
    expect(within(forDateSection()).getByRole("textbox")).toBeInTheDocument();
  });

  it("cancel restores the original text", async () => {
    const { user } = renderCard([entry({ notes: "Original" })]);

    await user.click(within(forDateSection()).getAllByRole("button", { name: "Edit" })[0]);
    const draft = within(forDateSection()).getByRole("textbox");
    await user.clear(draft);
    await user.type(draft, "descartame");
    await user.click(within(forDateSection()).getByRole("button", { name: "Cancel" }));

    expect(within(forDateSection()).getByText("Original")).toBeInTheDocument();
    expect(mockEditClientNote).not.toHaveBeenCalled();
  });
});

describe("ClientNotesCard — a legacy entry with no createdAt", () => {
  it("hides edit and delete rather than guessing which row it is", () => {
    renderCard([entry({ notes: "Nota vieja sin timestamp", createdAt: null })]);

    // The Server Action addresses an entry by `(createdAt, date)`. With no
    // createdAt there is nothing to target, and a guess deletes a DIFFERENT
    // note than the one the coach clicked.
    const section = forDateSection();
    expect(within(section).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    // The note itself still shows — unreachable is not the same as invisible.
    expect(within(section).getByText("Nota vieja sin timestamp")).toBeInTheDocument();
  });
});

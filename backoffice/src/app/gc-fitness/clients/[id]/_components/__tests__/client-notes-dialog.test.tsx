/**
 * @jest-environment jsdom
 */

// client-notes-dialog.test.tsx — port of client-notes-card.test.tsx, which
// covered the same log when it was a card in the profile grid.
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
//
// WHAT CHANGED WITH THE DIALOG: there is now ONE list, not a "notes for the
// picked date" section plus a "previous notes" one. The date input dates the
// note being WRITTEN; it no longer filters what you can see, because changing
// it to back-fill Tuesday used to hide the rest of the log as a side effect.
// The list pages 5 at a time, locally — every entry already arrived in the
// single client_notes doc, so "See more" costs no read.

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

import { ClientNotesDialog } from "../ClientNotesDialog";

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

/** Renders and OPENS the dialog — everything under test lives inside it. */
async function openDialog(entries: Entry[] = []) {
  const user = userEvent.setup();
  render(
    <ClientNotesDialog
      clientId={CLIENT}
      timezone={TZ}
      todayCivil={TODAY}
      initialEntries={entries}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Notes" }));
  await screen.findByRole("dialog");
  return { user };
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

/** The "Previous notes" list — the only list the dialog has. */
function log(): HTMLElement {
  return screen.getByText("Previous notes").parentElement as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateClientNotes.mockResolvedValue({ updatedAt: "2026-08-05T16:00:00.000Z" });
  mockEditClientNote.mockResolvedValue({ ok: true });
  mockDeleteClientNote.mockResolvedValue({ ok: true });
});

describe("ClientNotesDialog — the trigger", () => {
  it("does not render the composer until the dialog is opened", () => {
    render(
      <ClientNotesDialog
        clientId={CLIENT}
        timezone={TZ}
        todayCivil={TODAY}
        initialEntries={[entry()]}
      />,
    );

    // The whole point of the move: the log stops occupying the profile.
    expect(
      screen.queryByPlaceholderText("Write a note for this day..."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
  });

  it("pre-fills the date with today", async () => {
    await openDialog();

    expect(dateInput()).toHaveValue(TODAY);
  });
});

describe("ClientNotesDialog — adding a note", () => {
  it("files it under the PICKED date, not today", async () => {
    const { user } = await openDialog();

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
    const { user } = await openDialog();

    await user.type(composeBox(), "Nueva observación");
    await user.click(addButton());

    await waitFor(() =>
      expect(within(log()).getByText("Nueva observación")).toBeInTheDocument(),
    );
    expect(composeBox()).toHaveValue("");
  });

  it("RESTORES the typed text when the save fails", async () => {
    const { user } = await openDialog();
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
    const { user } = await openDialog();

    expect(addButton()).toBeDisabled();

    await user.type(composeBox(), "   ");
    expect(addButton()).toBeDisabled();

    await user.type(composeBox(), "algo");
    expect(addButton()).toBeEnabled();
  });
});

describe("ClientNotesDialog — the log", () => {
  it("keeps showing every note when the date is changed to back-fill", async () => {
    const { user } = await openDialog([
      entry({ date: TODAY, notes: "De hoy" }),
      entry({
        date: "2026-08-01",
        notes: "De la semana pasada",
        createdAt: "2026-08-01T10:00:00.000Z",
      }),
    ]);

    await user.clear(dateInput());
    await user.type(dateInput(), "2026-07-28");

    // The old card filtered the log by the picked date, so setting the date to
    // back-fill Tuesday emptied the history the coach was reading.
    expect(within(log()).getByText("De hoy")).toBeInTheDocument();
    expect(within(log()).getByText("De la semana pasada")).toBeInTheDocument();
  });

  it("orders newest first", async () => {
    await openDialog([
      entry({ date: "2026-08-01", notes: "Vieja", createdAt: "2026-08-01T09:00:00.000Z" }),
      entry({ date: "2026-08-04", notes: "Reciente", createdAt: "2026-08-04T09:00:00.000Z" }),
    ]);

    const text = log().textContent ?? "";
    expect(text.indexOf("Reciente")).toBeLessThan(text.indexOf("Vieja"));
  });

  it("shows 5 and reveals the rest 5 at a time", async () => {
    const { user } = await openDialog(
      Array.from({ length: 12 }, (_, i) => ({
        date: "2026-08-01",
        notes: `[nota-${i}]`,
        createdAt: `2026-08-01T${String(i + 8).padStart(2, "0")}:00:00.000Z`,
      })),
    );

    // The marker is bracketed on purpose: `textContent` runs the note straight
    // into the entry's date, so a bare `nota-1` matches "nota-112026-08-01".
    const shown = () => (log().textContent ?? "").match(/\[nota-\d+\]/g) ?? [];

    expect(shown()).toHaveLength(5);
    // …and it is the NEWEST five, not the first five it happened to read.
    expect(shown()[0]).toBe("[nota-11]");

    await user.click(screen.getByRole("button", { name: /See more \(7\)/ }));
    expect(shown()).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: /See more \(2\)/ }));
    expect(shown()).toHaveLength(12);
    // Nothing left to reveal — the button goes away instead of no-op'ing.
    expect(screen.queryByRole("button", { name: /See more/ })).not.toBeInTheDocument();
  });

  it("offers no See-more when everything already fits", async () => {
    await openDialog([entry()]);

    expect(screen.queryByRole("button", { name: /See more/ })).not.toBeInTheDocument();
  });

  it("says so when there are no notes at all", async () => {
    await openDialog();

    expect(screen.getByText("No previous notes.")).toBeInTheDocument();
  });
});

describe("ClientNotesDialog — editing an entry", () => {
  it("targets the entry by (createdAt, date)", async () => {
    const { user } = await openDialog([entry({ notes: "Original" })]);

    await user.click(within(log()).getAllByRole("button", { name: "Edit" })[0]);
    const draft = within(log()).getByRole("textbox");
    await user.clear(draft);
    await user.type(draft, "  Corregido  ");
    await user.click(within(log()).getByRole("button", { name: "Save" }));

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
    const { user } = await openDialog([
      entry({ notes: "Mañana", createdAt: "2026-08-05T09:00:00.000Z" }),
      entry({ notes: "Tarde", createdAt: "2026-08-05T18:00:00.000Z" }),
    ]);

    // The first Edit button belongs to the newest entry ("Tarde").
    await user.click(within(log()).getAllByRole("button", { name: "Edit" })[0]);
    const draft = within(log()).getByRole("textbox");
    await user.clear(draft);
    await user.type(draft, "Tarde corregida");
    await user.click(within(log()).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(within(log()).getByText("Tarde corregida")).toBeInTheDocument(),
    );
    // Matching on the date alone would rewrite both notes of that day.
    expect(within(log()).getByText("Mañana")).toBeInTheDocument();
  });

  it("keeps the row open with an error when the edit fails", async () => {
    const { user } = await openDialog([entry({ notes: "Original" })]);
    mockEditClientNote.mockRejectedValue(new Error("No se pudo guardar."));

    await user.click(within(log()).getAllByRole("button", { name: "Edit" })[0]);
    await user.click(within(log()).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("No se pudo guardar.")).toBeInTheDocument();
    // Closing the editor on failure would look like it saved.
    expect(within(log()).getByRole("textbox")).toBeInTheDocument();
  });

  it("cancel restores the original text", async () => {
    const { user } = await openDialog([entry({ notes: "Original" })]);

    await user.click(within(log()).getAllByRole("button", { name: "Edit" })[0]);
    const draft = within(log()).getByRole("textbox");
    await user.clear(draft);
    await user.type(draft, "descartame");
    await user.click(within(log()).getByRole("button", { name: "Cancel" }));

    expect(within(log()).getByText("Original")).toBeInTheDocument();
    expect(mockEditClientNote).not.toHaveBeenCalled();
  });

  it("deletes the entry it was pointed at", async () => {
    const { user } = await openDialog([
      entry({ notes: "Se queda", createdAt: "2026-08-05T09:00:00.000Z" }),
      entry({ notes: "Se borra", createdAt: "2026-08-05T18:00:00.000Z" }),
    ]);

    await user.click(within(log()).getAllByRole("button", { name: "Delete" })[0]);
    // Scoped to the confirmation panel: every row also has a Delete icon
    // button, so an index into the whole list picks a DIFFERENT note's control.
    const confirmPanel = screen.getByText("Delete this note?")
      .parentElement as HTMLElement;
    await user.click(within(confirmPanel).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mockDeleteClientNote).toHaveBeenCalledWith({
        clientId: CLIENT,
        entryCreatedAt: "2026-08-05T18:00:00.000Z",
        entryDate: TODAY,
      }),
    );
    await waitFor(() =>
      expect(within(log()).queryByText("Se borra")).not.toBeInTheDocument(),
    );
    expect(within(log()).getByText("Se queda")).toBeInTheDocument();
  });
});

describe("ClientNotesDialog — a legacy entry with no createdAt", () => {
  it("hides edit and delete rather than guessing which row it is", async () => {
    await openDialog([entry({ notes: "Nota vieja sin timestamp", createdAt: null })]);

    // The Server Action addresses an entry by `(createdAt, date)`. With no
    // createdAt there is nothing to target, and a guess deletes a DIFFERENT
    // note than the one the coach clicked.
    expect(within(log()).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(log()).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    // The note itself still shows — unreachable is not the same as invisible.
    expect(within(log()).getByText("Nota vieja sin timestamp")).toBeInTheDocument();
  });
});

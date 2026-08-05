/**
 * @jest-environment jsdom
 */

// habit-template-detail-dialog.test.tsx
//
// The detail view of a habit LIBRARY template — the surface where a coach edits
// or removes a reusable habit.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Three things make this dialog worth pinning:
//
//   1. THE SCOPE FORK. A `trainer` template is the coach's own: Edit + Delete.
//      A `global` one is SHARED across every coach on the platform, so it is
//      read-only and can only be HIDDEN from this coach's library (reversible
//      via "show hidden"). The two removals look identical in the UI and are
//      completely different in the data: `hideGlobalHabitTemplate` writes an
//      id into this trainer's private hidden-set, `softDeleteHabitTemplate`
//      flips `deleted` on the shared doc. Wiring the wrong one to the global
//      branch takes a habit away from everybody.
//      (The Server Action refuses a global edit too — but by then the coach
//      has already typed the edit and gets an error toast, so the UI fork is
//      the guard that matters.)
//   2. THE SAVE PAYLOAD. Same rules as the habit form: blank optional fields
//      go out as `undefined` (never ""), the coach's single language is
//      MIRRORED into both, and a reminder time is dropped when the toggle is
//      off — habit reminders are server-side FCM pushes, so a stale time left
//      on the doc is a push nobody asked for.
//   3. THE CASCADE IS OPT-IN. Saving a template edit does NOT push content to
//      the clients who already have the habit assigned. It asks. A silent
//      cascade rewrites live assignments on somebody's phone.
//
// `useLocale()` is stubbed to "en" (see `next-intl-stub.tsx`), so the coach's
// primary language here is English and the mirror fills Spanish.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { HabitTemplateRow } from "@/lib/gc-fitness/habit-actions";

const mockUpdateHabitTemplate = jest.fn();
const mockSoftDeleteHabitTemplate = jest.fn();
const mockHideGlobalHabitTemplate = jest.fn();
const mockPropagate = jest.fn();
const mockListAssignments = jest.fn();
jest.mock("@/lib/gc-fitness/habit-actions", () => ({
  updateHabitTemplate: (...args: unknown[]) => mockUpdateHabitTemplate(...args),
  softDeleteHabitTemplate: (...args: unknown[]) =>
    mockSoftDeleteHabitTemplate(...args),
  hideGlobalHabitTemplate: (...args: unknown[]) =>
    mockHideGlobalHabitTemplate(...args),
  propagateHabitTemplateContent: (...args: unknown[]) => mockPropagate(...args),
  listHabitTemplateAssignments: (...args: unknown[]) =>
    mockListAssignments(...args),
}));

// Uploads to Storage; irrelevant to every assertion here.
jest.mock("../HabitPhotoDropzone", () => ({
  HabitPhotoDropzone: () => null,
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { HabitTemplateDetailDialog } from "../HabitTemplateDetailDialog";

function template(overrides: Partial<HabitTemplateRow> = {}): HabitTemplateRow {
  return {
    id: "tpl-1",
    scope: "trainer",
    trainerId: "trainer-1",
    type: "binary",
    name: { en: "Drink water", es: "" },
    reminderEnabled: false,
    scheduleType: "recurring",
    startsOn: "2026-01-01",
    deleted: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as HabitTemplateRow;
}

function renderDialog(tpl: HabitTemplateRow) {
  const onChanged = jest.fn();
  const onOpenChange = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HabitTemplateDetailDialog
        open
        onOpenChange={onOpenChange}
        template={tpl}
        onChanged={onChanged}
        clientNames={new Map([["client-1", "Ana Gomez"]])}
      />
    </QueryClientProvider>,
  );
  return { onChanged, onOpenChange };
}

function button(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

function queryButton(name: string | RegExp) {
  return screen.queryByRole("button", { name });
}

/** Enter edit mode (trainer-owned templates only). */
async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Edit"));
}

function assignment(clientId: string, habitId: string) {
  return {
    habitId,
    clientId,
    pendingEmail: null,
    scheduleType: "recurring" as const,
    scheduleCadence: "daily" as const,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateHabitTemplate.mockResolvedValue({ ok: true });
  mockSoftDeleteHabitTemplate.mockResolvedValue({ ok: true });
  mockHideGlobalHabitTemplate.mockResolvedValue({ ok: true });
  mockPropagate.mockResolvedValue({ updated: 1 });
  mockListAssignments.mockResolvedValue([]);
});

describe("HabitTemplateDetailDialog — the scope fork", () => {
  it("offers Edit + Delete on the coach's OWN template", () => {
    renderDialog(template({ scope: "trainer" }));

    expect(button("Edit")).toBeInTheDocument();
    expect(button("Delete")).toBeInTheDocument();
    expect(queryButton(/Hide from my library/)).not.toBeInTheDocument();
  });

  it("offers only Hide on a GLOBAL template", () => {
    renderDialog(template({ scope: "global", trainerId: null }));

    // A global template belongs to every coach on the platform. Editing or
    // deleting it from here would reach into all of their libraries.
    expect(queryButton("Edit")).not.toBeInTheDocument();
    expect(queryButton("Delete")).not.toBeInTheDocument();
    expect(button(/Hide from my library/)).toBeInTheDocument();
  });

  it("hides (per-trainer) instead of deleting (shared) on a global", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDialog(
      template({ scope: "global", trainerId: null }),
    );

    await user.click(button(/Hide from my library/));
    await user.click(await screen.findByRole("button", { name: "Hide" }));

    await waitFor(() =>
      expect(mockHideGlobalHabitTemplate).toHaveBeenCalledWith("tpl-1"),
    );
    // The one that must NOT fire: it flips `deleted` on the shared doc.
    expect(mockSoftDeleteHabitTemplate).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("soft-deletes the coach's own template", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDialog(template({ scope: "trainer" }));

    await user.click(button("Delete"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mockSoftDeleteHabitTemplate).toHaveBeenCalledWith("tpl-1"),
    );
    expect(mockHideGlobalHabitTemplate).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("states that deleting the library habit leaves assignments alone", async () => {
    const user = userEvent.setup();
    renderDialog(template({ scope: "trainer" }));

    await user.click(button("Delete"));

    // The confirm is also the only place the coach is told the truth about the
    // blast radius. Silence here reads as "this removes it from my clients".
    expect(
      await screen.findByText(/deleting it only affects your library/i),
    ).toBeInTheDocument();
  });
});

describe("HabitTemplateDetailDialog — the save payload", () => {
  // The "one language means every language" contract has TWO mechanisms, and
  // it took a green mutation to notice: with the translation pane COLLAPSED the
  // primary input already writes both languages on every keystroke, so
  // `mirrorLocalizedBlank` at save time is unreachable on that path — deleting
  // it leaves this first test green. The second test is the one that pins the
  // save-time mirror, by opening the pane (which stops the typing mirror) and
  // blanking the translation by hand. Assertions go to the CONTRACT, so both
  // mechanisms are covered regardless of which one does the work.
  it("mirrors while the coach types, with translations collapsed", async () => {
    const user = userEvent.setup();
    renderDialog(template({ name: { en: "Drink water", es: "" } }));

    await startEditing(user);
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Hydrate");
    await user.click(button("Save changes"));

    await waitFor(() => expect(mockUpdateHabitTemplate).toHaveBeenCalled());
    const [id, payload] = mockUpdateHabitTemplate.mock.calls[0];
    expect(id).toBe("tpl-1");
    // A blank ES on the doc renders as an empty habit name for a Spanish
    // client — the habit is there, nameless.
    expect(payload.name).toEqual({ en: "Hydrate", es: "Hydrate" });
  });

  it("re-fills a translation the coach blanked out, on save", async () => {
    const user = userEvent.setup();
    renderDialog(template({ name: { en: "Drink water", es: "" } }));

    await startEditing(user);
    // Opening the pane switches the primary input OFF the typing mirror, so
    // an emptied Spanish field stays empty until save.
    await user.click(button("Add translation"));
    await user.clear(screen.getByLabelText("Name (Spanish)"));
    await user.click(button("Save changes"));

    await waitFor(() => expect(mockUpdateHabitTemplate).toHaveBeenCalled());
    expect(mockUpdateHabitTemplate.mock.calls[0][1].name).toEqual({
      en: "Drink water",
      es: "Drink water",
    });
  });

  it("sends `undefined`, not '', for the fields left blank", async () => {
    const user = userEvent.setup();
    renderDialog(template());

    await startEditing(user);
    await user.click(button("Save changes"));

    await waitFor(() => expect(mockUpdateHabitTemplate).toHaveBeenCalled());
    const payload = mockUpdateHabitTemplate.mock.calls[0][1];
    // An empty string is a real value on Firestore: it would overwrite a
    // description with blankness rather than leaving the field alone.
    expect(payload.description).toBeUndefined();
    expect(payload.youtubeUrl).toBeUndefined();
    expect(payload.photoUrl).toBeUndefined();
  });

  it("drops the reminder time when the toggle is OFF", async () => {
    const user = userEvent.setup();
    // Habit reminders are SERVER-side FCM pushes keyed off these two fields.
    // A time left behind with the toggle off is a notification the coach
    // believes they turned off.
    renderDialog(template({ reminderEnabled: true, reminderTime: "08:00" }));

    await startEditing(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(button("Save changes"));

    await waitFor(() => expect(mockUpdateHabitTemplate).toHaveBeenCalled());
    const payload = mockUpdateHabitTemplate.mock.calls[0][1];
    expect(payload.reminderEnabled).toBe(false);
    expect(payload.reminderTime).toBeUndefined();
  });

  it("keeps the reminder time when the toggle is ON", async () => {
    const user = userEvent.setup();
    renderDialog(template({ reminderEnabled: true, reminderTime: "08:00" }));

    await startEditing(user);
    await user.click(button("Save changes"));

    await waitFor(() => expect(mockUpdateHabitTemplate).toHaveBeenCalled());
    const payload = mockUpdateHabitTemplate.mock.calls[0][1];
    expect(payload).toMatchObject({ reminderEnabled: true, reminderTime: "08:00" });
  });

  it("seeds BOTH language fields from an English-only template", async () => {
    const user = userEvent.setup();
    renderDialog(
      template({
        name: { en: "Drink water", es: "" },
        description: { en: "Two litres", es: "" },
      }),
    );

    await startEditing(user);
    await user.click(button("Add translation"));

    // Without the load-time mirror the Spanish field opens EMPTY, and saving
    // from there wipes the Spanish copy of a habit that had one.
    expect(screen.getByLabelText("Name (Spanish)")).toHaveValue("Drink water");
  });

  it("disables Save while the name is empty", async () => {
    const user = userEvent.setup();
    renderDialog(template());

    await startEditing(user);
    await user.clear(screen.getByLabelText("Name"));

    // The guard the coach actually meets — there is no "name required" toast
    // path in this dialog, the button simply doesn't fire.
    expect(button("Save changes")).toBeDisabled();
  });
});

describe("HabitTemplateDetailDialog — the cascade is opt-in", () => {
  it("asks before pushing a content edit to assigned clients", async () => {
    const user = userEvent.setup();
    mockListAssignments.mockResolvedValue([assignment("client-1", "h1")]);
    renderDialog(template());

    await startEditing(user);
    await user.click(button("Save changes"));

    // The template is saved…
    await waitFor(() => expect(mockUpdateHabitTemplate).toHaveBeenCalled());
    // …and nothing reached the client's assignment yet.
    expect(await screen.findByText(/¿Actualizar a los clientes\?/)).toBeInTheDocument();
    expect(mockPropagate).not.toHaveBeenCalled();
  });

  it("propagates only when the coach confirms", async () => {
    const user = userEvent.setup();
    mockListAssignments.mockResolvedValue([
      assignment("client-1", "h1"),
      assignment("client-1", "h2"),
    ]);
    renderDialog(template());

    await startEditing(user);
    await user.click(button("Save changes"));
    await screen.findByText(/¿Actualizar a los clientes\?/);
    // Two assignments, ONE client — the count in the CTA is per client, not
    // per assignment.
    await user.click(button(/Actualizar a 1 cliente/));

    await waitFor(() => expect(mockPropagate).toHaveBeenCalledWith("tpl-1"));
  });

  it("dismissing keeps the template saved and touches no assignment", async () => {
    const user = userEvent.setup();
    mockListAssignments.mockResolvedValue([assignment("client-1", "h1")]);
    const { onOpenChange } = renderDialog(template());

    await startEditing(user);
    await user.click(button("Save changes"));
    await screen.findByText(/¿Actualizar a los clientes\?/);
    await user.click(button("No actualizar"));

    expect(mockUpdateHabitTemplate).toHaveBeenCalledTimes(1);
    expect(mockPropagate).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("skips the question entirely when nobody has it assigned", async () => {
    const user = userEvent.setup();
    mockListAssignments.mockResolvedValue([]);
    const { onOpenChange } = renderDialog(template());

    await startEditing(user);
    await user.click(button("Save changes"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/¿Actualizar a los clientes\?/)).not.toBeInTheDocument();
  });
});

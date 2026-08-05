/**
 * @jest-environment jsdom
 */

// habit-form-submit.test.tsx
//
// The shared habit form, from the SUBMIT side: what payload leaves it, and what
// happens after the server answers.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What these tests protect:
//
//   1. NO REMINDER FIELDS ON THE WIRE WHEN THE TOGGLE IS OFF. This is not a
//      cosmetic contract — habit reminders are SERVER-SIDE FCM pushes, so a
//      stale cadence sends a real client a real notification for a habit whose
//      reminder they turned off.
//      MEASURED: the `else` branch in `onSubmit` that assigns `undefined` to
//      the four reminder fields is DEAD CODE — deleting it keeps these tests
//      green. The real guarantee is that `cleaned` is built from an explicit
//      key whitelist, so those keys are only ever ADDED inside the
//      `if (values.reminderEnabled)` branch. The tests pin the CONTRACT (what
//      reaches the server), which is what matters and what survives a refactor
//      of either mechanism.
//   2. THE "NO TRANSLATION" MIRROR. When the coach fills one language only, the
//      text is stored in BOTH — otherwise the habit renders blank for a client
//      whose app is set to the other language.
//      MEASURED: removing the `mirrorLocalizedBlank(cleaned.name)` call also
//      keeps this green, because the collapsed `LocalizedTextField` already
//      mirrors as the coach types. Two mechanisms, one contract; the assertion
//      is on the contract deliberately.
//   3. THE CREATE/EDIT FORK. Create toasts "created" and hands the new id back;
//      edit toasts "saved". And a THROWN submit must not report success upstream.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { HabitForm } from "@/app/gc-fitness/habits/_components/HabitForm";

const mockBack = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// The photo dropzone mints Storage upload URLs; not this file's concern.
jest.mock("@/components/gc-fitness/StorageImagePreview", () => ({
  StorageImagePreview: () => null,
}));

const CLIENTS = [{ uid: "client-1", displayName: "Ana" }];

function baseDefaults(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    name: { en: "Drink water", es: "Tomar agua" },
    description: { en: "", es: "" },
    type: "binary",
    scheduleType: "recurring",
    scheduleCadence: "daily",
    startsOn: "2026-09-17",
    reminderEnabled: false,
    ...overrides,
  };
}

function renderForm(
  props: Partial<React.ComponentProps<typeof HabitForm>> = {},
  defaults: Record<string, unknown> = {},
) {
  const onSubmit = jest.fn().mockResolvedValue({ id: "habit-new" });
  const onAfterSubmit = jest.fn();
  render(
    <HabitForm
      mode="create"
      clientOptions={CLIENTS}
      habitId="habit-draft-1"
      defaultValues={baseDefaults(defaults) as never}
      onSubmit={onSubmit}
      onAfterSubmit={onAfterSubmit}
      {...props}
    />,
  );
  return { onSubmit, onAfterSubmit };
}

function submitButton() {
  return screen.getByRole("button", { name: /Create habit|Save changes|Save/i });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HabitForm — reminder fields", () => {
  it("sends every reminder field as undefined when the toggle is off", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    // Habit reminders are server-side FCM pushes. A stale cadence here sends a
    // real notification for a reminder the coach switched off.
    expect(payload.reminderCadence).toBeUndefined();
    expect(payload.reminderWeekdays).toBeUndefined();
    expect(payload.reminderDayOfMonth).toBeUndefined();
    expect(payload.reminderMonthDays).toBeUndefined();
  });

  it("clears them even when the defaults arrived carrying reminder values", async () => {
    const user = userEvent.setup();
    // The realistic regression: editing a habit that HAD a weekly reminder and
    // switching the reminder off. The stale cadence must not survive.
    const { onSubmit } = renderForm({}, {
      reminderEnabled: false,
      reminderCadence: "weekly",
      reminderWeekdays: [1, 3, 5],
    });

    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.reminderCadence).toBeUndefined();
    expect(payload.reminderWeekdays).toBeUndefined();
  });
});

describe("HabitForm — localized text", () => {
  it("mirrors a single-language name into both languages", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({}, {
      name: { en: "Drink water", es: "" },
    });

    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    // A blank side renders as an empty habit name for any client on that
    // locale — the mirror is what stops that.
    expect(payload.name.en).toBe("Drink water");
    expect(payload.name.es).toBe("Drink water");
  });
});

describe("HabitForm — after the server answers", () => {
  it("reports creation and hands the new id back to the host", async () => {
    const user = userEvent.setup();
    const { onSubmit, onAfterSubmit } = renderForm();

    await user.click(submitButton());

    await waitFor(() => expect(onAfterSubmit).toHaveBeenCalledTimes(1));
    expect(mockToastSuccess).toHaveBeenCalledWith("Habit created.");
    expect(onAfterSubmit).toHaveBeenCalledWith({ id: "habit-new" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // With a host callback present the form must NOT also navigate back.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("reports a save (not a create) in edit mode", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue({ ok: true as const });
    render(
      <HabitForm
        mode="edit"
        clientOptions={CLIENTS}
        habitId="hab-existing"
        defaultValues={baseDefaults() as never}
        onSubmit={onSubmit}
        onAfterSubmit={jest.fn()}
      />,
    );

    await user.click(submitButton());

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith("Habit saved.");
  });

  it("surfaces a failed save and does NOT tell the host it succeeded", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockRejectedValue(new Error("Rules rejected it"));
    const onAfterSubmit = jest.fn();
    render(
      <HabitForm
        mode="create"
        clientOptions={CLIENTS}
        habitId="habit-draft-1"
        defaultValues={baseDefaults() as never}
        onSubmit={onSubmit}
        onAfterSubmit={onAfterSubmit}
      />,
    );

    await user.click(submitButton());

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Rules rejected it"),
    );
    // The host closes its dialog on onAfterSubmit — firing it here would hide
    // a habit that was never written.
    expect(onAfterSubmit).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

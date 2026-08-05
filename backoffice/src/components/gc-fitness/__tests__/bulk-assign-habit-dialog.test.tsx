/**
 * @jest-environment jsdom
 */

// bulk-assign-habit-dialog.test.tsx
//
// Assigning one habit template to MANY clients. Like the workout bulk form,
// every mistake is multiplied by the roster — but this one has a second hazard
// the workout path does not: the payload is assembled with CONDITIONAL SPREADS.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// Why the spreads matter: the backoffice Firestore handle does NOT set
// `ignoreUndefinedProperties`, so writing `scheduleWeekdays: undefined` THROWS
// rather than being ignored. Every cadence-specific key must therefore be
// ABSENT — not undefined — when it does not apply. `toEqual` treats
// `{a: undefined}` and `{}` as equal, so these tests assert key PRESENCE with
// `in` instead.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { BulkAssignHabitDialog } from "@/components/gc-fitness/schedule/bulk-assign-habit-dialog";

const mockAssignHabitTemplate = jest.fn();
const mockListHabitTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/habit-actions", () => ({
  assignHabitTemplate: (...args: unknown[]) => mockAssignHabitTemplate(...args),
  listHabitTemplates: (...args: unknown[]) => mockListHabitTemplates(...args),
}));

// The dialog only needs the template array present on first render, not the
// async query lifecycle.
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: TEMPLATES, isLoading: false }),
}));

jest.mock("@/components/gc-fitness/StorageImagePreview", () => ({
  StorageImagePreview: () => null,
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const TEMPLATES = [
  {
    id: "tpl-water",
    name: { en: "Drink water", es: "Tomar agua" },
    description: { en: "", es: "" },
    type: "binary",
  },
];

const CLIENTS = [
  { uid: "client-1", displayName: "Ana", email: "ana@example.com" },
  { uid: "client-2", displayName: "Beto", email: "beto@example.com" },
];

function renderDialog() {
  const onAssigned = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <BulkAssignHabitDialog
      open
      onOpenChange={onOpenChange}
      clients={CLIENTS as never}
      onAssigned={onAssigned}
    />,
  );
  return { onAssigned, onOpenChange };
}

async function pickTemplate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText("Drink water"));
}

async function selectClient(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const boxes = screen.getAllByRole("checkbox");
  // The checkbox order follows the roster order passed in.
  const idx = CLIENTS.findIndex((c) => c.displayName === name);
  await user.click(boxes[idx]);
}

function submitButton() {
  return screen.getByRole("button", { name: /Asignar|Assign/i });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAssignHabitTemplate.mockResolvedValue({ created: 2 });
});

describe("BulkAssignHabitDialog — the guard", () => {
  it("keeps the submit disabled until at least one client is checked", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickTemplate(user);

    // MEASURED: the `selectedCount === 0` early-return inside `onSubmit` is
    // defense-in-depth — deleting it keeps these tests green, because
    // `canSubmit` already disables the button. The REACHABLE guard is the
    // disabled state, so that is what is asserted; asserting the early return
    // would be asserting a branch the UI never reaches.
    expect(submitButton()).toBeDisabled();

    await user.click(submitButton());
    expect(mockAssignHabitTemplate).not.toHaveBeenCalled();

    await selectClient(user, "Ana");
    expect(submitButton()).toBeEnabled();
  });
});

describe("BulkAssignHabitDialog — the payload", () => {
  it("sends the selected clients and the template id", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickTemplate(user);
    await selectClient(user, "Ana");

    await user.click(submitButton());

    await waitFor(() =>
      expect(mockAssignHabitTemplate).toHaveBeenCalledTimes(1),
    );
    const payload = mockAssignHabitTemplate.mock.calls[0][0];
    expect(payload.templateId).toBe("tpl-water");
    expect(payload.clientIds).toEqual(["client-1"]);
    expect(typeof payload.startsOn).toBe("string");
  });

  it("never sends an explicit undefined for a cadence key that does not apply", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickTemplate(user);
    await selectClient(user, "Ana");

    await user.click(submitButton());

    await waitFor(() =>
      expect(mockAssignHabitTemplate).toHaveBeenCalledTimes(1),
    );
    const payload = mockAssignHabitTemplate.mock.calls[0][0];
    const schedule = payload.schedule;
    if (schedule) {
      // Presence, not value: the Admin SDK handle throws on an explicit
      // `undefined`, and `toEqual` would not catch it.
      if (schedule.scheduleCadence !== "weekly") {
        expect("scheduleWeekdays" in schedule).toBe(false);
      }
      if (schedule.scheduleCadence !== "monthly") {
        expect("scheduleMonthDays" in schedule).toBe(false);
      }
    }
    // Top level too — a bare `schedule: undefined` would throw the same way.
    if (!schedule) {
      expect("schedule" in payload).toBe(false);
    }
  });
});

describe("BulkAssignHabitDialog — after the server answers", () => {
  it("reports the server's created count and tells the parent to refresh", async () => {
    const user = userEvent.setup();
    mockAssignHabitTemplate.mockResolvedValueOnce({ created: 5 });
    const { onAssigned } = renderDialog();
    await pickTemplate(user);
    await selectClient(user, "Ana");
    await selectClient(user, "Beto");

    await user.click(submitButton());

    await waitFor(() => expect(onAssigned).toHaveBeenCalledTimes(1));
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(String(mockToastSuccess.mock.calls[0][0])).toContain("5");
  });

  it("surfaces a failure and does NOT tell the parent anything changed", async () => {
    const user = userEvent.setup();
    mockAssignHabitTemplate.mockRejectedValueOnce(
      new Error("Uno de los clientes ya no existe."),
    );
    const { onAssigned } = renderDialog();
    await pickTemplate(user);
    await selectClient(user, "Ana");

    await user.click(submitButton());

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Uno de los clientes ya no existe.",
      ),
    );
    expect(onAssigned).not.toHaveBeenCalled();
  });
});

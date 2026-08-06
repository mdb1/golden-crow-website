/**
 * @jest-environment jsdom
 */

// assign-generated-modal.test.tsx
//
// The generator's success-screen assign step: pick clients, pick a cadence,
// write N assignments through `bulkAssignTemplate`. It is the THIRD surface
// that builds a recurrence payload (after AssignTemplateModal and
// BulkAssignForm) and the only one a coach reaches straight after generating —
// so a drift here writes a different schedule from the identical-looking form
// two clicks away on the Agenda.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What is pinned, and why each one is a real failure and not a style opinion:
//
//   • ONE weekday → `{kind: "weekly", weekday}`, MORE than one →
//     `{kind: "weekly_days", weekdays}`. Two different shapes out of one UI
//     control; the expansion code reads `kind` and silently expands nothing
//     for a shape it doesn't know.
//   • The weekday list is SORTED. Same trap as `assign-template-modal`, where
//     the `.sort()` turned out to be duplicated in two places and a mutation
//     only hit one of them.
//   • `once` carries NO recurrence and NO endDate.
//   • `monthly` takes its day-of-month from the picked DATE, not from today.
//   • An empty time is `undefined`, never `""` — an empty string would be
//     stored and then read back as a scheduled time by the reminder job.
//   • A failed write keeps the dialog OPEN with the selection intact; closing
//     it loses the client picks, which is the expensive part of the form.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

const mockBulkAssignTemplate = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  bulkAssignTemplate: (...args: unknown[]) => mockBulkAssignTemplate(...args),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// `civilDateToday` reads the wall clock. A fixture that depends on the day the
// suite runs is the trap that already produced an unfailable assertion in this
// project (a `startsOn` seeded with today, asserted against a today-fallback),
// so the clock is pinned here. 2026-09-10 is a THURSDAY = weekday index 4.
jest.mock("@/lib/gc-fitness/civil-date", () => ({
  ...jest.requireActual("@/lib/gc-fitness/civil-date"),
  civilDateToday: () => "2026-09-10",
}));

import { AssignGeneratedModal } from "@/components/gc-fitness/generator/assign-generated-modal";

const TODAY = "2026-09-10";
const TZ = "America/Argentina/Buenos_Aires";

function client(uid: string, name: string): ClientRosterEntry {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    photoURL: null,
    coachNickname: null,
  } as ClientRosterEntry;
}

const CLIENTS = [
  client("ana", "Ana Gomez"),
  client("beto", "Beto Diaz"),
  client("cami", "Cami Ruiz"),
];

function renderModal(clients: ClientRosterEntry[] = CLIENTS) {
  const onOpenChange = jest.fn();
  render(
    <AssignGeneratedModal
      open
      onOpenChange={onOpenChange}
      templateId="tpl-1"
      clients={clients}
      trainerTimezone={TZ}
    />,
  );
  return { user: userEvent.setup(), onOpenChange };
}

function clientButton(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

async function pick(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  for (const name of names) await user.click(clientButton(name));
}

/** The cadence `Select` is a shadcn trigger — its placeholder is not an
 *  accessible name, so it is matched on the option text it currently shows. */
async function setCadence(
  user: ReturnType<typeof userEvent.setup>,
  option: string,
) {
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: option }));
}

/**
 * The date / time / number inputs carry a `<label>` that is NOT associated
 * with them (no `htmlFor`, no wrapping), so `getByLabelText` finds nothing.
 * They are addressed by type — there is exactly one of each on screen per
 * cadence, except the two dates, which are told apart by order (start, end).
 */
function inputByType(type: string, index = 0): HTMLInputElement {
  const nodes = document.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`);
  const node = nodes[index];
  if (!node) throw new Error(`no input[type=${type}] #${index}`);
  return node;
}

function assignButton(): HTMLElement {
  return screen.getByRole("button", { name: "Assign" });
}

function lastPayload() {
  return mockBulkAssignTemplate.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBulkAssignTemplate.mockResolvedValue({ ids: ["a1"] });
});

describe("AssignGeneratedModal — who gets it", () => {
  it("writes ONE call carrying every picked client", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez", "Cami Ruiz");
    await user.click(assignButton());

    expect(mockBulkAssignTemplate).toHaveBeenCalledTimes(1);
    expect(lastPayload()).toMatchObject({
      templateId: "tpl-1",
      clientIds: ["ana", "cami"],
    });
  });

  it("selects everyone with 'Select all', and clears on a second press", async () => {
    const { user } = renderModal();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(assignButton());
    expect(lastPayload().clientIds).toEqual(["ana", "beto", "cami"]);

    await user.click(screen.getByRole("button", { name: "Select all" }));
    // Nothing selected → the CTA is disabled again, so nothing more is written.
    expect(assignButton()).toBeDisabled();
    expect(mockBulkAssignTemplate).toHaveBeenCalledTimes(1);
  });

  it("cannot be submitted with nobody picked", async () => {
    renderModal();

    expect(assignButton()).toBeDisabled();
  });

  it("says so when the roster is empty", () => {
    renderModal([]);

    expect(screen.getByText("No clients yet. Add a client first.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();
  });
});

describe("AssignGeneratedModal — the cadence payload", () => {
  it("'Once' carries NO recurrence and NO end date", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await user.click(assignButton());

    expect(lastPayload()).toMatchObject({
      scheduledFor: TODAY,
      timezone: TZ,
      recurrence: undefined,
      endDate: undefined,
    });
  });

  it("a single weekday is 'weekly', not 'weekly_days'", async () => {
    // The seeded weekday is the one the picked date falls on — Thursday (4).
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Weekly");
    await user.click(assignButton());

    expect(lastPayload().recurrence).toEqual({ kind: "weekly", weekday: 4 });
  });

  it("two or more weekdays switch to 'weekly_days', SORTED", async () => {
    // Clicked out of order on purpose: the expansion walks the array as given.
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Weekly");
    await user.click(screen.getByRole("button", { name: "Sat" })); // 6
    await user.click(screen.getByRole("button", { name: "Mon" })); // 1
    await user.click(assignButton());

    expect(lastPayload().recurrence).toEqual({
      kind: "weekly_days",
      weekdays: [1, 4, 6],
    });
  });

  it("refuses to unselect the LAST weekday", async () => {
    // An empty weekday set would expand to nothing — a recurring assignment
    // that never lands on a day.
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Weekly");
    await user.click(screen.getByRole("button", { name: "Thu" }));
    await user.click(assignButton());

    expect(lastPayload().recurrence).toEqual({ kind: "weekly", weekday: 4 });
  });

  it("'Daily' carries no parameters", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Daily");
    await user.click(assignButton());

    expect(lastPayload().recurrence).toEqual({ kind: "daily" });
  });

  it("'Monthly' takes its day-of-month from the PICKED date", async () => {
    // Not from today: the coach can schedule the first occurrence weeks out,
    // and the recurrence must land on that day of the month.
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Monthly");
    await user.clear(inputByType("date"));
    await user.type(inputByType("date"), "2026-10-23");
    await user.click(assignButton());

    expect(lastPayload()).toMatchObject({
      scheduledFor: "2026-10-23",
      recurrence: { kind: "monthly", dayOfMonth: 23 },
    });
  });

  it("clamps 'every N days' into 2..30", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Every N days");
    const everyN = inputByType("number");
    await user.clear(everyN);
    await user.type(everyN, "99");
    await user.click(assignButton());

    expect(lastPayload().recurrence).toEqual({
      kind: "every_n_days",
      everyN: 30,
    });
  });
});

describe("AssignGeneratedModal — the end date", () => {
  it("defaults to three months out on any recurring cadence", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Daily");
    await user.click(assignButton());

    expect(lastPayload().endDate).toBe("2026-12-10");
  });

  it("is omitted when the coach unticks it", async () => {
    // An open-ended series: the expansion horizon, not a date, decides where
    // it stops. Sending "" or a stale date would cap it silently.
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Daily");
    await user.click(screen.getByRole("checkbox"));
    await user.click(assignButton());

    expect(lastPayload().endDate).toBeUndefined();
  });

  it("is never sent for a one-off, even though the state still holds one", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await setCadence(user, "Daily");
    await setCadence(user, "Once");
    await user.click(assignButton());

    expect(lastPayload().endDate).toBeUndefined();
  });
});

describe("AssignGeneratedModal — the scheduled time", () => {
  it("sends an empty time as undefined, not as an empty string", async () => {
    // `scheduledTime` is what the reminder push keys off; "" is a value and
    // would be read back as a real time.
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await user.click(assignButton());

    expect(lastPayload().scheduledTime).toBeUndefined();
  });

  it("passes a picked time through", async () => {
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await user.type(inputByType("time"), "07:30");
    await user.click(assignButton());

    expect(lastPayload().scheduledTime).toBe("07:30");
  });
});

describe("AssignGeneratedModal — what the coach is told", () => {
  it("reports the number the server actually wrote, not the number picked", async () => {
    // A recurring assign writes one doc per occurrence; the count comes back
    // from the action.
    mockBulkAssignTemplate.mockResolvedValue({ ids: ["a", "b", "c", "d"] });
    const { user, onOpenChange } = renderModal();

    await pick(user, "Ana Gomez");
    await user.click(assignButton());

    expect(mockToastSuccess).toHaveBeenCalledWith("Assigned to 4 client(s).");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog OPEN with the picks intact when the write fails", async () => {
    mockBulkAssignTemplate.mockRejectedValue(new Error("Forbidden"));
    const { user, onOpenChange } = renderModal();

    await pick(user, "Ana Gomez", "Beto Diaz");
    await user.click(assignButton());

    expect(mockToastError).toHaveBeenCalledWith("Forbidden");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // …and the selection survives, so retrying is one click.
    expect(clientButton("Ana Gomez")).toHaveAttribute("aria-pressed", "true");
    expect(assignButton()).toBeEnabled();
  });

  it("re-enables the CTA after a failure", async () => {
    mockBulkAssignTemplate.mockRejectedValue(new Error("boom"));
    const { user } = renderModal();

    await pick(user, "Ana Gomez");
    await user.click(assignButton());

    expect(within(assignButton()).queryByText("Assigning…")).toBeNull();
  });
});

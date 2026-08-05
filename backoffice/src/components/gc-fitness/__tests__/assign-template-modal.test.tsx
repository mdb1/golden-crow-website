/**
 * @jest-environment jsdom
 */

// assign-template-modal.test.tsx
//
// Regression net for the coach portal's single most-used write: assigning a
// workout template to a client. Nothing covered this before — the schema and
// the Server Action each had unit tests, but nobody checked that the MODAL
// builds the payload it hands them.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What these tests protect:
//
//   1. THE TWO-ACTION FORK. "One-time" must call `assignTemplate`; every
//      recurring mode must call `assignTemplateRecurring`. Calling the wrong
//      one doesn't throw — it silently creates one workout where the coach
//      asked for twelve, or twelve where they asked for one.
//   2. THE RECURRENCE RULE, which is the SAME wire shape the recurrence-edit
//      dialog writes and mobile reads: one weekday collapses to
//      `{kind:"weekly", weekday}`, two or more widen to
//      `{kind:"weekly_days", weekdays}` SORTED. These two components must not
//      drift from each other — see workout-recurrence-edit-dialog.test.tsx.
//   3. EMPTY-STRING → UNDEFINED. `scheduledTime` and `meetingNotes` are
//      optional fields; the modal holds them as "" and must send `undefined`,
//      not "". An empty string reaches Firestore as a real value and the
//      `scheduledTime` one silently arms the workout-reminder push.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { AssignTemplateModal } from "@/components/gc-fitness/schedule/assign-template-modal";

// The two Server Actions the modal forks between.
const mockAssignTemplate = jest.fn();
const mockAssignTemplateRecurring = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  assignTemplate: (...args: unknown[]) => mockAssignTemplate(...args),
  assignTemplateRecurring: (...args: unknown[]) =>
    mockAssignTemplateRecurring(...args),
}));

// Per-exercise overrides are a separate surface; stub the fetch so the modal
// renders without one and the payloads stay override-free.
jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  getWorkoutTemplateForAssignment: jest.fn().mockResolvedValue(null),
}));

// The template list normally arrives over a Firestore listener.
const mockUseWorkoutTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => mockUseWorkoutTemplates(),
}));

// Media thumbs would try to resolve Storage URLs.
jest.mock("@/components/gc-fitness/exercise-preview-thumb", () => ({
  ExercisePreviewThumb: () => null,
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// 2026-08-05 is a Wednesday → getDay() === 3.
const DEFAULT_DATE = "2026-08-05";

const TEMPLATES = [
  { id: "tpl-push", name: { en: "Push Day", es: "Día de Empuje" }, tags: ["push"] },
  { id: "tpl-pull", name: { en: "Pull Day", es: "Día de Tirón" }, tags: ["pull"] },
];

function renderModal(
  overrides: Partial<React.ComponentProps<typeof AssignTemplateModal>> = {},
) {
  const onOpenChange = jest.fn();
  const onAssigned = jest.fn();
  render(
    <AssignTemplateModal
      open
      onOpenChange={onOpenChange}
      clientId="client-1"
      defaultDate={DEFAULT_DATE}
      trainerTimezone="America/Argentina/Buenos_Aires"
      onAssigned={onAssigned}
      {...overrides}
    />,
  );
  return { onOpenChange, onAssigned };
}

// Both the template picker and the cadence Select expose `role="combobox"`.
// The picker is the first one and is named by its placeholder; the cadence
// Select is the second. Indexing blind here is how you end up driving the wrong
// control and asserting on a payload nobody built.
function templatePicker() {
  // Matched on text content, not accessible name: the trigger renders its
  // placeholder inside a child <span>, which does not become the button's
  // accessible name, so `getByRole("combobox", { name: ... })` misses it.
  const picker = screen
    .getAllByRole("combobox")
    .find((el) => /Choose a template|Push Day|Pull Day/i.test(el.textContent ?? ""));
  if (!picker) throw new Error("template picker combobox not found");
  return picker;
}

/** Open the template combobox and pick one by its EN name. */
async function pickTemplate(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(templatePicker());
  await user.click(await screen.findByText(name));
}

/** Switch the cadence Select ("One-time" by default) to another mode. */
async function selectMode(
  user: ReturnType<typeof userEvent.setup>,
  optionLabel: string,
) {
  const cadence = screen
    .getAllByRole("combobox")
    .find((el) => el !== templatePicker());
  await user.click(cadence!);
  await user.click(await screen.findByRole("option", { name: optionLabel }));
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Assign" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWorkoutTemplates.mockReturnValue({
    data: TEMPLATES,
    isLoading: false,
  });
  mockAssignTemplate.mockResolvedValue({ id: "assign-1" });
  mockAssignTemplateRecurring.mockResolvedValue({ count: 12 });
});

describe("AssignTemplateModal — the guard", () => {
  it("keeps [Assign] disabled until a template is picked, and enables it after", async () => {
    const user = userEvent.setup();
    const { onAssigned } = renderModal();

    // The reachable guard is the disabled button — `onSubmit`'s
    // `errorPickTemplate` toast is defense-in-depth that the UI never lets you
    // hit. Asserting the toast would be testing dead code.
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(mockAssignTemplate).not.toHaveBeenCalled();
    expect(mockAssignTemplateRecurring).not.toHaveBeenCalled();
    expect(onAssigned).not.toHaveBeenCalled();

    await pickTemplate(user, "Push Day");
    expect(screen.getByRole("button", { name: "Assign" })).toBeEnabled();
  });
});

describe("AssignTemplateModal — one-time", () => {
  it("calls assignTemplate (NOT the recurring action) with the picked date", async () => {
    const user = userEvent.setup();
    const { onAssigned, onOpenChange } = renderModal();

    await pickTemplate(user, "Push Day");
    await submit(user);

    await waitFor(() => expect(mockAssignTemplate).toHaveBeenCalledTimes(1));
    // The fork matters more than the fields: the recurring action here would
    // create a whole series the coach never asked for.
    expect(mockAssignTemplateRecurring).not.toHaveBeenCalled();
    expect(mockAssignTemplate).toHaveBeenCalledWith({
      templateId: "tpl-push",
      clientId: "client-1",
      scheduledFor: DEFAULT_DATE,
      scheduledTime: undefined,
      meetingNotes: undefined,
      timezone: "America/Argentina/Buenos_Aires",
      exerciseOverrides: undefined,
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Template assigned.");
    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends undefined — not '' — for an untouched time and notes", async () => {
    const user = userEvent.setup();
    renderModal();

    await pickTemplate(user, "Push Day");
    await submit(user);

    await waitFor(() => expect(mockAssignTemplate).toHaveBeenCalledTimes(1));
    const payload = mockAssignTemplate.mock.calls[0][0];
    // An empty string is a REAL value in Firestore. `scheduledTime: ""` would
    // also arm the workout-reminder push for a workout with no time set.
    expect(payload.scheduledTime).toBeUndefined();
    expect(payload.meetingNotes).toBeUndefined();
    expect("scheduledTime" in payload).toBe(true); // sent explicitly, as undefined
  });
});

describe("AssignTemplateModal — the recurrence rule it builds", () => {
  it("collapses a single weekday to kind 'weekly', seeded on the picked date", async () => {
    const user = userEvent.setup();
    renderModal();

    await pickTemplate(user, "Push Day");
    await selectMode(user, "Weekly recurring");
    await submit(user);

    await waitFor(() =>
      expect(mockAssignTemplateRecurring).toHaveBeenCalledTimes(1),
    );
    expect(mockAssignTemplate).not.toHaveBeenCalled();
    const payload = mockAssignTemplateRecurring.mock.calls[0][0];
    // 2026-08-05 is a Wednesday.
    expect(payload.recurrence).toEqual({ kind: "weekly", weekday: 3 });
    expect(payload.startDate).toBe(DEFAULT_DATE);
    expect(payload.clientId).toBe("client-1");
  });

  it("widens to 'weekly_days' with a SORTED array on a second weekday", async () => {
    const user = userEvent.setup();
    renderModal();

    await pickTemplate(user, "Push Day");
    await selectMode(user, "Weekly recurring");
    // Seeded on Wed (3); add Mon (1). Insertion order is [3, 1], so an
    // implementation that dropped the sort would emit the array backwards —
    // and mobile reads this verbatim.
    await user.click(screen.getByRole("button", { name: "Mon" }));
    await submit(user);

    await waitFor(() =>
      expect(mockAssignTemplateRecurring).toHaveBeenCalledTimes(1),
    );
    expect(mockAssignTemplateRecurring.mock.calls[0][0].recurrence).toEqual({
      kind: "weekly_days",
      weekdays: [1, 3],
    });
  });

  it("builds a daily rule", async () => {
    const user = userEvent.setup();
    renderModal();

    await pickTemplate(user, "Push Day");
    await selectMode(user, "Daily");
    await submit(user);

    await waitFor(() =>
      expect(mockAssignTemplateRecurring).toHaveBeenCalledTimes(1),
    );
    expect(mockAssignTemplateRecurring.mock.calls[0][0].recurrence).toEqual({
      kind: "daily",
    });
  });

  it("builds a monthly rule anchored on the picked date's day-of-month", async () => {
    const user = userEvent.setup();
    renderModal({ defaultDate: "2026-08-21" });

    await pickTemplate(user, "Push Day");
    await selectMode(user, "Monthly");
    await submit(user);

    await waitFor(() =>
      expect(mockAssignTemplateRecurring).toHaveBeenCalledTimes(1),
    );
    // Must read the day out of the CIVIL date, not out of `new Date()` —
    // a UTC parse here shifts the anchor by one day for half the world.
    expect(mockAssignTemplateRecurring.mock.calls[0][0].recurrence).toEqual({
      kind: "monthly",
      dayOfMonth: 21,
    });
  });

  it("defaults the series to a 3-month end date rather than open-ended", async () => {
    const user = userEvent.setup();
    renderModal();

    await pickTemplate(user, "Push Day");
    await selectMode(user, "Daily");
    await submit(user);

    await waitFor(() =>
      expect(mockAssignTemplateRecurring).toHaveBeenCalledTimes(1),
    );
    // Deliberate: the reset effect turns the end ON at the 3-month preset, so a
    // coach who never touches the end date still gets a bounded series instead
    // of one that expands forever. Pinned because flipping this default would
    // silently start creating unbounded series.
    expect(mockAssignTemplateRecurring.mock.calls[0][0].endDate).toBe(
      "2026-11-05",
    );
  });

  it("reports the created count from the server, not a local guess", async () => {
    const user = userEvent.setup();
    mockAssignTemplateRecurring.mockResolvedValueOnce({ count: 7 });
    renderModal();

    await pickTemplate(user, "Push Day");
    await selectMode(user, "Daily");
    await submit(user);

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Recurring assignment created (7 workouts).",
      ),
    );
  });
});

describe("AssignTemplateModal — failure handling", () => {
  it("surfaces the server's message and keeps the modal open", async () => {
    const user = userEvent.setup();
    mockAssignTemplate.mockRejectedValueOnce(
      new Error("Client no longer has a coach."),
    );
    const { onAssigned, onOpenChange } = renderModal();

    await pickTemplate(user, "Push Day");
    await submit(user);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Client no longer has a coach."),
    );
    // Closing on failure would strand the coach believing the workout landed.
    expect(onAssigned).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("re-enables the submit button after a failure so the coach can retry", async () => {
    const user = userEvent.setup();
    mockAssignTemplate.mockRejectedValueOnce(new Error("boom"));
    renderModal();

    await pickTemplate(user, "Push Day");
    await submit(user);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Assign" })).toBeEnabled();
  });
});

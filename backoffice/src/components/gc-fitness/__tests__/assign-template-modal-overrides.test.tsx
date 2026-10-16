/**
 * @jest-environment jsdom
 */

// assign-template-modal-overrides.test.tsx
//
// Second half of the AssignTemplateModal net (the first half,
// assign-template-modal.test.tsx, covers the once/recurring fork and the
// weekly/daily/monthly rules with the per-exercise panel stubbed out).
//
// This file covers what that one could not:
//   • the remaining recurrence knobs — every-N-days (clamped), the end-date
//     checkbox and its presets, time + trimmed meeting notes;
//   • PER-EXERCISE OVERRIDES — the coach customizes a template for ONE client
//     at assignment time. The modal must emit ONLY what changed (an override
//     that restates the template is noise that freezes the client's
//     prescription), positionally correct, and the SAME overrides must reach
//     the recurring action.
//
// The template detail Server Action is mocked at the module boundary and
// returns a realistic `WorkoutTemplateExerciseDetail[]`.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { WorkoutTemplateExerciseDetail } from "@/lib/gc-fitness/workout-template-actions";
import { AssignTemplateModal } from "@/components/gc-fitness/schedule/assign-template-modal";

const mockAssignTemplate = jest.fn();
const mockAssignTemplateRecurring = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  assignTemplate: (...args: unknown[]) => mockAssignTemplate(...args),
  assignTemplateRecurring: (...args: unknown[]) =>
    mockAssignTemplateRecurring(...args),
}));

const mockGetDetail = jest.fn();
jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  getWorkoutTemplateForAssignment: (...args: unknown[]) => mockGetDetail(...args),
}));

const mockUseWorkoutTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => mockUseWorkoutTemplates(),
}));

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

// 2026-08-05 is a Wednesday.
const DEFAULT_DATE = "2026-08-05";

const TEMPLATES = [
  { id: "tpl-push", name: { en: "Push Day", es: "Día de Empuje" }, tags: ["push"] },
];

function detailExercise(
  overrides: Partial<WorkoutTemplateExerciseDetail> = {},
): WorkoutTemplateExerciseDetail {
  return {
    index: 0,
    exerciseId: "bench",
    exerciseName: "Bench Press",
    sets: 3,
    reps: 10,
    rest_seconds: 90,
    transition_rest_seconds: 60,
    notes: "",
    repsBySet: [10, 10, 10],
    weightBySetKg: [60, 60, 60],
    hasExplicitNoWeightPrescription: false,
    previewUrl: null,
    supersetGroup: null,
    sourceMetric: "reps",
    ...overrides,
  } as WorkoutTemplateExerciseDetail;
}

function detail(exercises: WorkoutTemplateExerciseDetail[]) {
  return { id: "tpl-push", name: { en: "Push Day", es: "Día de Empuje" }, exercises };
}

function renderModal() {
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
    />,
  );
  return { onOpenChange, onAssigned };
}

function templatePicker() {
  const picker = screen
    .getAllByRole("combobox")
    .find((el) => /Choose a template|Push Day/i.test(el.textContent ?? ""));
  if (!picker) throw new Error("template picker combobox not found");
  return picker;
}

async function pickTemplate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(templatePicker());
  await user.click(await screen.findByText("Push Day"));
  // Wait for the per-exercise panel to hydrate from the detail action.
  await waitFor(() =>
    expect(screen.queryByText("Loading template exercise details…")).not.toBeInTheDocument(),
  );
}

async function selectMode(user: ReturnType<typeof userEvent.setup>, optionLabel: string) {
  const cadence = screen.getAllByRole("combobox").find((el) => el !== templatePicker());
  await user.click(cadence!);
  await user.click(await screen.findByRole("option", { name: optionLabel }));
}

async function submitOnce(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Assign" }));
  await waitFor(() => expect(mockAssignTemplate).toHaveBeenCalledTimes(1));
  return mockAssignTemplate.mock.calls[0][0];
}

async function submitRecurring(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Assign" }));
  await waitFor(() => expect(mockAssignTemplateRecurring).toHaveBeenCalledTimes(1));
  return mockAssignTemplateRecurring.mock.calls[0][0];
}

async function replace(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  value: string,
) {
  await user.clear(input);
  if (value !== "") await user.type(input, value);
}

const kgInputs = () => screen.getAllByPlaceholderText("Kg");
const repsInputs = () => screen.getAllByPlaceholderText("Reps");

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWorkoutTemplates.mockReturnValue({ data: TEMPLATES, isLoading: false });
  mockAssignTemplate.mockResolvedValue({ id: "assign-1" });
  mockAssignTemplateRecurring.mockResolvedValue({ count: 12 });
  mockGetDetail.mockResolvedValue(
    detail([
      detailExercise(),
      detailExercise({
        index: 1,
        exerciseId: "row",
        exerciseName: "Barbell Row",
        sets: 2,
        reps: 12,
        repsBySet: [12, 12],
        weightBySetKg: [40, 40],
      }),
    ]),
  );
});

// ---------------------------------------------------------------------------

describe("AssignTemplateModal — recurrence knobs not covered elsewhere", () => {
  it("every-N-days sends kind 'every_n_days' with the typed step", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await selectMode(user, "Every N days");
    await replace(user, screen.getByLabelText("Every (days)"), "3");
    const payload = await submitRecurring(user);
    expect(payload.recurrence).toEqual({ kind: "every_n_days", everyN: 3 });
    expect(payload.startDate).toBe(DEFAULT_DATE);
  });

  it("clamps every-N to the 2..30 range the schema accepts", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await selectMode(user, "Every N days");
    await replace(user, screen.getByLabelText("Every (days)"), "45");
    await user.tab();
    expect(screen.getByLabelText("Every (days)")).toHaveValue(30);
    const payload = await submitRecurring(user);
    expect(payload.recurrence).toEqual({ kind: "every_n_days", everyN: 30 });
  });

  it("unchecking 'Set end date' sends NO endDate (open-ended series)", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await selectMode(user, "Daily");
    await user.click(screen.getByLabelText("Set end date"));
    const payload = await submitRecurring(user);
    expect(payload.endDate).toBeUndefined();
    expect(payload.recurrence).toEqual({ kind: "daily" });
  });

  it("an end-date preset moves the end date that many months out", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await selectMode(user, "Daily");
    await user.click(screen.getByRole("button", { name: "6 months" }));
    const payload = await submitRecurring(user);
    expect(payload.endDate).toBe("2027-02-05");
  });

  it("weekly: un-selecting the only weekday is refused (always ≥ 1)", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await selectMode(user, "Weekly recurring");
    const wed = screen.getByRole("button", { name: "Wed" });
    await user.click(wed);
    expect(wed).toHaveAttribute("aria-pressed", "true");
    const payload = await submitRecurring(user);
    expect(payload.recurrence).toEqual({ kind: "weekly", weekday: 3 });
  });

  it("sends the time and the TRIMMED meeting notes on both actions", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    const time = document.querySelector<HTMLInputElement>('input[type="time"]')!;
    await user.type(time, "18:30");
    await user.type(
      screen.getByPlaceholderText("Zoom / Meet link, instructions, prep notes..."),
      "  meet.google.com/abc  ",
    );
    const payload = await submitOnce(user);
    expect(payload.scheduledTime).toBe("18:30");
    expect(payload.meetingNotes).toBe("meet.google.com/abc");
  });

  it("whitespace-only meeting notes are sent as undefined", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await user.type(
      screen.getByPlaceholderText("Zoom / Meet link, instructions, prep notes..."),
      "   ",
    );
    const payload = await submitOnce(user);
    expect(payload.meetingNotes).toBeUndefined();
  });
});

describe("AssignTemplateModal — per-exercise overrides", () => {
  it("loads the picked template's detail and sends NO overrides when nothing was touched", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    expect(mockGetDetail).toHaveBeenCalledWith("tpl-push");
    expect(kgInputs().map((i) => (i as HTMLInputElement).value)).toEqual([
      "60",
      "60",
      "60",
      "40",
      "40",
    ]);
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toBeUndefined();
  });

  it("one changed kg → one override for THAT exercise, carrying only the weights", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, kgInputs()[1], "62.5");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 0, weightBySetKg: [60, 62.5, 60] },
    ]);
  });

  it("per-set reps: emits repsBySet, and `reps` only when SET 1 changed", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, repsInputs()[2], "8");
    await replace(user, repsInputs()[3], "15");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 0, repsBySet: [10, 10, 8] },
      { index: 1, reps: 15, repsBySet: [15, 12] },
    ]);
  });

  it("Add set copies the last row and bumps the set count", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await user.click(screen.getAllByRole("button", { name: "+ Add set" })[1]);
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 1, sets: 3, repsBySet: [12, 12, 12], weightBySetKg: [40, 40, 40] },
    ]);
  });

  it("Remove set drops THAT row and realigns the set types (#582)", async () => {
    mockGetDetail.mockResolvedValue(
      detail([
        detailExercise({
          reps: 15,
          repsBySet: [15, 10, 8],
          weightBySetKg: [40, 60, 70],
          setTypesBySet: ["warmup", "normal", "failure"],
        }),
      ]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await user.click(screen.getByRole("button", { name: "Remove set 2" }));
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      {
        index: 0,
        sets: 2,
        repsBySet: [15, 8],
        weightBySetKg: [40, 70],
        setTypesBySet: ["warmup", "failure"],
      },
    ]);
  });

  it("'Copy to all' copies set 1's reps + kg but keeps each row's TYPE", async () => {
    mockGetDetail.mockResolvedValue(
      detail([
        detailExercise({
          reps: 15,
          repsBySet: [15, 10, 8],
          weightBySetKg: [40, 60, 70],
          setTypesBySet: ["warmup", "normal", "normal"],
        }),
      ]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await user.click(screen.getByRole("button", { name: "Copy to all" }));
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 0, repsBySet: [15, 15, 15], weightBySetKg: [40, 40, 40] },
    ]);
  });

  it("'No weight' sends the [] sentinel", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await user.click(screen.getAllByRole("button", { name: "No weight" })[0]);
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([{ index: 0, weightBySetKg: [] }]);
  });

  it("a template that is ALREADY 'Sin peso' stays override-free", async () => {
    mockGetDetail.mockResolvedValue(
      detail([
        detailExercise({ weightBySetKg: [], hasExplicitNoWeightPrescription: true }),
      ]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    expect(screen.queryAllByPlaceholderText("Kg")).toHaveLength(0);
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toBeUndefined();
  });

  it("rest and notes overrides (rest clamped to 600, notes trimmed)", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    const rests = screen.getAllByLabelText(/Rest between sets \(sec\)/);
    await replace(user, rests[0], "900");
    await user.type(
      screen.getAllByPlaceholderText("Client-specific notes for this exercise")[1],
      "  knees out  ",
    );
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 0, rest_seconds: 600 },
      { index: 1, notes: "knees out" },
    ]);
  });

  it("flipping an exercise to 'By time' emits metric + durations and NO reps", async () => {
    mockGetDetail.mockResolvedValue(
      detail([detailExercise({ durationSeconds: 45 })]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await user.click(screen.getByRole("button", { name: "By time" }));
    await replace(user, screen.getByLabelText("Duración serie 2 en segundos"), "30");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      {
        index: 0,
        metric: "time",
        durationBySetSeconds: [45, 30, 45],
        durationSeconds: 45,
      },
    ]);
  });

  it("a time-based exercise never writes reps arrays (PATTERNS §17)", async () => {
    mockGetDetail.mockResolvedValue(
      detail([
        detailExercise({
          exerciseName: "Plank",
          sourceMetric: "time",
          reps: 0,
          repsBySet: [],
          weightBySetKg: [],
          hasExplicitNoWeightPrescription: true,
          durationBySetSeconds: [30, 30, 30],
          durationSeconds: 30,
        }),
      ]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, screen.getByLabelText("Duración serie 3 en segundos"), "60");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 0, durationBySetSeconds: [30, 30, 60], durationSeconds: 30 },
    ]);
  });

  it("the SAME overrides reach the recurring action", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, kgInputs()[4], "45");
    await selectMode(user, "Weekly recurring");
    const payload = await submitRecurring(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 1, weightBySetKg: [40, 45] },
    ]);
    expect(mockAssignTemplate).not.toHaveBeenCalled();
  });

  it("a failed detail load shows the error and still lets the coach assign the template as-is", async () => {
    mockGetDetail.mockRejectedValue(new Error("Not your template."));
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    expect(await screen.findByText("Not your template.")).toBeInTheDocument();
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toBeUndefined();
  });

  it("a blanked middle reps cell is sent as 0 and keeps every set", async () => {
    mockGetDetail.mockResolvedValue(
      detail([
        detailExercise({ repsBySet: [10, 8, 6], weightBySetKg: [60, 70, 80] }),
      ]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, repsInputs()[1], "");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([{ index: 0, repsBySet: [10, 0, 6] }]);
  });

  // FINDING: the kg cell is a free-text input parsed with `Number()`. A coach
  // on a Spanish (es-AR) keyboard types the decimal COMMA — "62,5" — which is
  // NaN, and NaN is written as 0 kg. The assignment silently prescribes 0 kg
  // for that set; nothing on screen says the value was rejected.
  // Regression (#451): the kg cell parses with the shared parseDecimalInput.
  it("a decimal-comma weight ('62,5') is not silently written as 0 kg", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, kgInputs()[1], "62,5");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides?.[0]?.weightBySetKg?.[1]).not.toBe(0);
    expect(payload.exerciseOverrides?.[0]?.weightBySetKg?.[1]).toBe(62.5);
  });

  // Regression (#451): an unparseable keystroke is dropped (the cell keeps the
  // last valid text) instead of reaching the payload as 0 kg.
  it("a garbage kg keystroke is dropped, never written as 0 kg", async () => {
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, kgInputs()[1], "62x");
    expect(kgInputs()[1]).toHaveValue("62");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides?.[0]?.weightBySetKg?.[1]).toBe(62);
  });

  // FINDING: a template exercise with NO weight prescription (legacy doc, field
  // absent — `hasExplicitNoWeightPrescription: false`, server normalizes the
  // array to []) renders empty kg cells, and an UNTOUCHED submit emits an
  // override `weightBySetKg: [0, 0, 0]` for it, turning "no weights
  // prescribed" into an explicit 0 kg prescription on the assignment.
  // Regression (#451): blank kg cells seeded from an empty weight array are
  // "still no weights", not a change — no phantom [0, 0, 0] override.
  it("an untouched exercise without weights produces no override", async () => {
    mockGetDetail.mockResolvedValue(
      detail([detailExercise({ weightBySetKg: [], hasExplicitNoWeightPrescription: false })]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toBeUndefined();
  });

  // Regression (#451): the no-phantom rule must not swallow a REAL edit — a kg
  // typed on an exercise that had no weights is still an override.
  it("typing a kg on an exercise without weights still overrides", async () => {
    mockGetDetail.mockResolvedValue(
      detail([detailExercise({ weightBySetKg: [], hasExplicitNoWeightPrescription: false })]),
    );
    const user = userEvent.setup();
    renderModal();
    await pickTemplate(user);
    await replace(user, kgInputs()[0], "20,5");
    const payload = await submitOnce(user);
    expect(payload.exerciseOverrides).toEqual([
      { index: 0, weightBySetKg: [20.5, 0, 0] },
    ]);
  });
});

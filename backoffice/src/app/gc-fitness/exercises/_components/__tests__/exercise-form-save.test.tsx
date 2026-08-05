/**
 * @jest-environment jsdom
 */

// exercise-form-save.test.tsx
//
// The SAVE half of the exercise form. `exercise-form-validation.test.tsx`
// covers the render, the Zod error copy, one create payload and the read-only
// view route; this file covers the parts of the outgoing payload that are
// DERIVED rather than typed in, plus the edit / duplicate / delete branches.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What is derived, and why each one matters downstream:
//
//   • THE PRESCRIPTION TRIPLE (#206 / 26-09). Three chips span TWO orthogonal
//     fields: "Reps × Weight" → `metric:"reps" + tracksWeight:true`,
//     "Reps (no weight)" → `metric:"reps" + tracksWeight:false`, "Time (sec)"
//     → `metric:"time" + tracksWeight:true`. `tracksWeight:false` is not
//     cosmetic: it is what seeds the template editor's "Sin peso" sentinel
//     (`weightBySetKg: []`) when the exercise is dropped into a routine, which
//     iOS and Android already honor. Writing `metric:"time"` while leaving
//     `tracksWeight:false` behind, or forgetting to flip it back, produces an
//     exercise that prescribes the wrong thing on a client's phone.
//   • THE MUSCLE MERGE (#480). `muscleGroups` is REBUILT on submit as
//     `[primary, ...secondaries]` — the primary always first and never
//     duplicated — because the coach's per-muscle-group progress chart weights
//     the primary 1.0 and each secondary 0.5. A primary that isn't in the
//     array is a muscle that scores 0 on every chart; a primary listed twice
//     double-counts it.
//   • AN EMPTY PRIMARY COLLAPSES TO `undefined`. Zod's optional enum rejects
//     `""`, so passing the raw form value through would fail validation on a
//     perfectly legal "no primary picked" exercise.
//   • THE MODE FORK. `create` calls `createExercise`, `edit` calls
//     `updateExercise(id, …)`. Same form, same button, different write.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ExerciseInput } from "@/lib/gc-fitness/exercise-schema";

const mockRouter = { push: jest.fn(), back: jest.fn(), refresh: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  redirect: jest.fn(),
}));

const mockCreateExercise = jest.fn();
const mockUpdateExercise = jest.fn();
const mockSoftDeleteExercise = jest.fn();
const mockDuplicateExercise = jest.fn();
jest.mock("@/lib/gc-fitness/exercise-server-actions", () => ({
  createExercise: (...args: unknown[]) => mockCreateExercise(...args),
  updateExercise: (...args: unknown[]) => mockUpdateExercise(...args),
  softDeleteExercise: (...args: unknown[]) => mockSoftDeleteExercise(...args),
  duplicateExercise: (...args: unknown[]) => mockDuplicateExercise(...args),
  mintExerciseMediaUploadUrl: jest.fn(),
}));

const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// The upload path is out of scope here; keep browser-only Firebase out.
jest.mock("@/lib/firebase/gc-fitness-client", () => ({
  getGCFitnessStorage: () => ({}),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

// ESM-only under ts-jest; the form renders a markdown preview of the notes.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{String(children ?? "")}</div>
  ),
}));

import { ExerciseForm } from "@/app/gc-fitness/exercises/_components/ExerciseForm";

/** A complete, valid exercise so a bare Save submits without validation noise. */
function defaults(overrides: Partial<ExerciseInput> = {}): Partial<ExerciseInput> {
  return {
    name: { en: "Bench Press", es: "Press de Banca" },
    description: { en: "Press the bar.", es: "Empujá la barra." },
    primaryMuscleGroup: "chest",
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    metric: "reps",
    tracksWeight: true,
    ...overrides,
  } as Partial<ExerciseInput>;
}

function renderEdit(overrides: Partial<ExerciseInput> = {}) {
  render(
    <ExerciseForm
      mode="edit"
      exerciseId="ex-1"
      defaultValues={defaults(overrides)}
    />,
  );
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: /^save$/i }));
}

/** The payload handed to `updateExercise` (second arg; the first is the id). */
async function savedPayload(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(mockUpdateExercise).toHaveBeenCalledTimes(1));
  return mockUpdateExercise.mock.calls[0][1] as Record<string, unknown>;
}

function metricChip(name: RegExp) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateExercise.mockResolvedValue({ id: "new-1" });
  mockUpdateExercise.mockResolvedValue({ ok: true });
  mockSoftDeleteExercise.mockResolvedValue({ ok: true });
  mockDuplicateExercise.mockResolvedValue({ id: "copy-1" });
});

describe("ExerciseForm — the prescription triple (#206)", () => {
  it("writes reps + tracksWeight:true for 'Reps × Weight'", async () => {
    const user = userEvent.setup();
    renderEdit({ metric: "time", tracksWeight: false });

    await metricChip(/Reps × Weight/);
    await user.click(metricChip(/Reps × Weight/));
    await save(user);

    const payload = await savedPayload();
    expect(payload).toMatchObject({ metric: "reps", tracksWeight: true });
  });

  it("writes reps + tracksWeight:FALSE for 'Reps (no weight)'", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(metricChip(/Reps \(no weight\)/));
    await save(user);

    const payload = await savedPayload();
    // This flag is the whole feature: it seeds `weightBySetKg: []` when the
    // exercise is added to a template, which is how a bodyweight movement
    // reaches the client without a phantom 0 kg column.
    expect(payload).toMatchObject({ metric: "reps", tracksWeight: false });
  });

  it("flips tracksWeight back to true when switching to Time", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(metricChip(/Reps \(no weight\)/));
    await user.click(metricChip(/Time \(sec\)/));
    await save(user);

    const payload = await savedPayload();
    // A time exercise left on `tracksWeight:false` carries a stale bodyweight
    // flag into every routine that picks it up afterwards.
    expect(payload).toMatchObject({ metric: "time", tracksWeight: true });
  });

  it("marks exactly one chip as pressed", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(metricChip(/Reps \(no weight\)/));

    // Two orthogonal fields, three chips: the chip state is derived, so it can
    // disagree with the payload and show the coach a selection they don't have.
    expect(metricChip(/Reps \(no weight\)/)).toHaveAttribute("aria-pressed", "true");
    expect(metricChip(/Reps × Weight/)).toHaveAttribute("aria-pressed", "false");
    expect(metricChip(/Time \(sec\)/)).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ExerciseForm — the muscle merge (#480)", () => {
  it("puts the primary FIRST in muscleGroups and keeps it there", async () => {
    const user = userEvent.setup();
    renderEdit({
      primaryMuscleGroup: "chest",
      // Defaults arriving from Firestore with the primary missing from the
      // array — the shape the merge exists to repair.
      muscleGroups: ["triceps", "shoulders"],
    });

    await save(user);

    const payload = await savedPayload();
    // The progress chart weights primary 1.0 and each secondary 0.5. A primary
    // that isn't in the array scores ZERO on every chart it should lead.
    expect(payload.muscleGroups).toEqual(["chest", "triceps", "shoulders"]);
    expect(payload.primaryMuscleGroup).toBe("chest");
  });

  it("never lists the primary twice", async () => {
    const user = userEvent.setup();
    renderEdit({
      primaryMuscleGroup: "chest",
      muscleGroups: ["chest", "triceps"],
    });

    await save(user);

    const payload = await savedPayload();
    // A duplicated primary double-counts that muscle in the weekly-sets chart.
    expect(payload.muscleGroups).toEqual(["chest", "triceps"]);
  });

  // The `""` → `undefined` collapse at the top of `onSubmit` is UNREACHABLE
  // through the form. `primaryMuscleGroup` is `z.enum(...).optional()`, which
  // admits `undefined` but not `""`, and `handleSubmit` validates BEFORE it
  // calls the success callback — so a `""` in form state fails the resolver and
  // the normalization never runs. (Verified: seeding `primaryMuscleGroup: ""`
  // through `defaultValues` produces ZERO calls to `updateExercise`.)
  //
  // The guard that actually keeps `""` out is one layer up, in `buildDefaults`:
  // `passed?.primaryMuscleGroup ?? passed?.muscleGroups?.[0] ?? undefined`.
  // That is what this test pins.
  it("seeds a missing primary from the first muscle group", async () => {
    const user = userEvent.setup();
    // The legacy / wger-seeded shape: `muscleGroups` populated, no explicit
    // primary. Saving it as `undefined` drops the exercise to the anatomy
    // heuristic on every progress chart instead of leading with its own
    // first-listed muscle.
    renderEdit({
      primaryMuscleGroup: undefined,
      muscleGroups: ["chest", "triceps"],
    });

    await save(user);

    const payload = await savedPayload();
    expect(payload.primaryMuscleGroup).toBe("chest");
    expect(payload.muscleGroups).toEqual(["chest", "triceps"]);
  });
});

// The "one language means every language" contract has TWO mechanisms here,
// same as `HabitForm` and `HabitTemplateDetailDialog`: `buildDefaults` mirrors
// on LOAD (so an English-only exercise never renders an empty Spanish field)
// and `onSubmit` mirrors again on WRITE. The load-time one makes the save-time
// one unreachable whenever the blank language came from the document — deleting
// the save-time mirror leaves the first test below GREEN. The second test opens
// the translation pane and blanks the field by hand, which is the only path
// where the save-time mirror is the one doing the work.
describe("ExerciseForm — the localized mirror", () => {
  it("stores the coach's single language in both", async () => {
    const user = userEvent.setup();
    renderEdit({
      name: { en: "Bench Press", es: "" },
      description: { en: "Press the bar.", es: "" },
    });

    await save(user);

    const payload = await savedPayload();
    // A blank ES renders as an unnamed exercise for a Spanish client.
    expect(payload.name).toEqual({ en: "Bench Press", es: "Bench Press" });
    expect(payload.description).toEqual({
      en: "Press the bar.",
      es: "Press the bar.",
    });
  });

  it("re-fills a translation the coach blanked out, on save", async () => {
    const user = userEvent.setup();
    // Both fields single-language, so the translation pane starts COLLAPSED —
    // it auto-opens whenever any field already carries a real translation.
    renderEdit({
      name: { en: "Bench Press", es: "" },
      description: { en: "Press the bar.", es: "" },
    });

    // Opening the pane exposes the mirrored Spanish field; emptying it by hand
    // is the one state the load-time mirror can't repair.
    await user.click(screen.getByRole("button", { name: /add translation/i }));
    // The load-time mirror's own job: an English-only exercise must not open
    // its Spanish field EMPTY, or the coach reads it as "no translation yet"
    // and the field they never touch is the one that ships.
    expect(screen.getByLabelText(/name \(spanish\)/i)).toHaveValue("Bench Press");

    await user.clear(screen.getByLabelText(/name \(spanish\)/i));
    await save(user);

    const payload = await savedPayload();
    expect(payload.name).toEqual({ en: "Bench Press", es: "Bench Press" });
  });

  it("leaves a real translation alone", async () => {
    const user = userEvent.setup();
    renderEdit();

    await save(user);

    const payload = await savedPayload();
    expect(payload.name).toEqual({ en: "Bench Press", es: "Press de Banca" });
  });
});

describe("ExerciseForm — the mode fork", () => {
  it("EDIT patches the existing id and never creates", async () => {
    const user = userEvent.setup();
    renderEdit();

    await save(user);

    await waitFor(() => expect(mockUpdateExercise).toHaveBeenCalled());
    expect(mockUpdateExercise.mock.calls[0][0]).toBe("ex-1");
    // Creating from the edit form would leave the original untouched and
    // silently fork the library.
    expect(mockCreateExercise).not.toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/gc-fitness/exercises");
  });

  it("lands the coach on the COPY after duplicating a library exercise", async () => {
    const user = userEvent.setup();
    // Duplicate lives ONLY on the read-only view route — it is the
    // "duplicate to customize" escape hatch for a library exercise the coach
    // can't edit. There is no Duplicate on your own exercise: you just edit it.
    render(
      <ExerciseForm mode="view" exerciseId="ex-1" defaultValues={defaults()} />,
    );

    await user.click(screen.getByRole("button", { name: /duplicate/i }));

    await waitFor(() =>
      expect(mockDuplicateExercise).toHaveBeenCalledWith("ex-1"),
    );
    // Landing back on the read-only original would make the CTA a no-op the
    // coach has to figure out.
    expect(mockRouter.push).toHaveBeenCalledWith("/gc-fitness/exercises/copy-1/edit");
  });

  it("offers no Duplicate on an editable exercise", () => {
    renderEdit();

    expect(
      screen.queryByRole("button", { name: /duplicate/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */

// workout-generator-wizard.test.tsx
//
// SCOPE: the wizard as a SHELL. The engine underneath it
// (`lib/gc-fitness/workout-generator`) is pure and already has its own suite;
// the editor it hands off to (`TemplateForm`) has `template-form-save.test.tsx`.
// What has never been covered is the seam between them — the wizard's real job
// is to build the POOL and translate the engine's output into TemplateForm
// `defaultValues`, and both of those are silent when they go wrong: the coach
// gets a workout, it just contains the wrong exercises or the wrong
// prescription shape.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// So TemplateForm is stubbed and the props crossing that boundary are the
// assertions (the pattern that worked best on the other shells). What that
// pins:
//
//   • THE POOL IS THE CURATED STANDARD LIBRARY ONLY, deduped. Legacy wger/fexd
//     docs and coach customs must not leak in (#296), and the double-seeded
//     `std-*` twins must appear once (#179) — otherwise the generator can emit
//     the same movement twice, or emit one with broken `gs://` media.
//   • THE "SIN PESO" SENTINEL. A no-load exercise ships `weightBySetKg: []`
//     (#159/#206 wire contract); anything loadable must NOT, or the coach
//     loses the weight column on a barbell movement.
//   • A TIME-METRIC exercise ships `reps: 0` + `durationSeconds`, never reps.
//   • REGENERATE REMOUNTS the editor with a different seed — without the `key`
//     bump React keeps the old form state and the "new" workout is the old one.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

// Every module below reaches Firebase at import time (firebase-admin on the
// action, the web SDK on the two hooks) and explodes under jsdom.
const mockUseExercisesQuery = jest.fn();
jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => mockUseExercisesQuery(),
}));

const mockUseFavorites = jest.fn();
jest.mock("@/lib/gc-fitness/use-favorites", () => ({
  useFavorites: () => mockUseFavorites(),
}));

const mockCreateWorkoutTemplate = jest.fn();
jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  createWorkoutTemplate: (...args: unknown[]) => mockCreateWorkoutTemplate(...args),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// The editor. Its own contract (order renumbering, per-set arrays, the
// superset propagation) is pinned in template-form-save.test.tsx; here it is a
// probe that records the props it was handed and exposes the two callbacks the
// wizard depends on.
const mockTemplateFormProps = jest.fn();
const mockTemplateFormMounted = jest.fn();
jest.mock("@/components/gc-fitness/template-form", () => ({
  TemplateForm: (props: Record<string, unknown>) => {
    mockTemplateFormProps(props);
    // `key` never reaches props — React consumes it — so a REMOUNT is observed
    // the only way it can be: by counting mounts.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      mockTemplateFormMounted();
    }, []);
    return (
      <div data-testid="template-form">
        <button
          type="button"
          onClick={() => (props.onCreated as (id: string) => void)("tpl-new")}
        >
          fake-save
        </button>
      </div>
    );
  },
}));

const mockAssignModalProps = jest.fn();
jest.mock("@/components/gc-fitness/generator/assign-generated-modal", () => ({
  AssignGeneratedModal: (props: { open: boolean; templateId: string }) => {
    mockAssignModalProps(props);
    return props.open ? (
      <div data-testid="assign-modal">{props.templateId}</div>
    ) : null;
  },
}));

import { WorkoutGeneratorWizard } from "@/components/gc-fitness/generator/workout-generator-wizard";

const STANDARD_TAG = "standard-library";

function exercise(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: "std-1",
    name: { en: "Barbell Bench Press", es: "Press de banca" },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell", "bench"],
    mediaURL: null,
    thumbnailURL: null,
    youtubeURL: null,
    keywords: [],
    tags: [STANDARD_TAG],
    variations: [],
    source: "wger",
    ownerId: null,
    version: 1,
    updatedAt: null,
    createdAt: null,
    deleted: false,
    ...overrides,
  } as ExerciseRow;
}

function renderWizard(library: ExerciseRow[]) {
  mockUseExercisesQuery.mockReturnValue({ data: library, isLoading: false });
  render(<WorkoutGeneratorWizard clients={[]} trainerTimezone="UTC" />);
  return { user: userEvent.setup() };
}

/**
 * The chip for an equipment / muscle / preset label.
 *
 * Chips are the only buttons carrying `aria-pressed`, which is what tells the
 * "Back" MUSCLE GROUP apart from the "Back" NAV BUTTON sitting on the same
 * screen — `getByRole("button", { name: "Back" })` finds both.
 */
function chip(label: string): HTMLElement {
  const node = screen
    .getAllByRole("button", { name: label })
    .find((el) => el.hasAttribute("aria-pressed"));
  if (!node) throw new Error(`no chip labelled ${label}`);
  return node;
}

/** A wizard nav button ("Next" / "Back" / "Generate workout") — never a chip. */
function nav(label: RegExp): HTMLElement {
  const node = screen
    .getAllByRole("button", { name: label })
    .find((el) => !el.hasAttribute("aria-pressed"));
  if (!node) throw new Error(`no nav button matching ${label}`);
  return node;
}

/**
 * Walk steps 1→4 and generate: pick the equipment and muscles the fixtures
 * need, accept the volume/type defaults, press Generate.
 */
async function generate(
  user: ReturnType<typeof userEvent.setup>,
  opts: { equipment: string[]; muscles: string[] },
) {
  for (const label of opts.equipment) await user.click(chip(label));
  await user.click(nav(/Next/));
  for (const label of opts.muscles) await user.click(chip(label));
  await user.click(nav(/Next/));
  await user.click(nav(/Next/)); // volume defaults
  await user.click(nav(/Generate workout/));
}

/** The `defaultValues` the wizard handed the editor on its last render. */
function lastDefaults(): {
  name: { en: string; es: string };
  tag: string;
  tags: string[];
  exercises: Array<Record<string, unknown>>;
} {
  const props = mockTemplateFormProps.mock.calls.at(-1)?.[0];
  return props.defaultValues;
}

function generatedIds(): string[] {
  return lastDefaults().exercises.map((e) => e.exerciseId as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFavorites.mockReturnValue({ favorites: { exerciseIds: [] } });
  mockCreateWorkoutTemplate.mockResolvedValue("tpl-new");
});

describe("WorkoutGeneratorWizard — the pool it draws from", () => {
  it("uses ONLY the curated standard library", async () => {
    // A coach custom and a legacy catalog doc, both chest+barbell, both
    // otherwise eligible — they must not appear in a generated workout.
    const { user } = renderWizard([
      exercise({ id: "std-bench" }),
      exercise({ id: "coach-custom", tags: [], ownerId: "trainer-1", source: "trainer" }),
      exercise({ id: "legacy-wger", tags: ["wger-import"] }),
    ]);

    await generate(user, { equipment: ["Barbell", "Bench"], muscles: ["Chest"] });

    expect(generatedIds()).toEqual(["std-bench"]);
  });

  it("drops soft-deleted library docs", async () => {
    const { user } = renderWizard([
      exercise({ id: "std-bench" }),
      // A DISTINCT name on purpose: with the same name as the live doc, the
      // display-name dedupe collapses the pair and the test passes with the
      // `deleted` filter deleted (verified by mutation).
      exercise({
        id: "std-gone",
        name: { en: "Incline Bench Press", es: "Press inclinado" },
        deleted: true,
      }),
    ]);

    await generate(user, { equipment: ["Barbell", "Bench"], muscles: ["Chest"] });

    expect(generatedIds()).not.toContain("std-gone");
  });

  it("collapses the double-seeded twins into one exercise (#179)", async () => {
    // Prod carries the same movement twice: the canonical numeric-id doc and a
    // `std-*` twin with broken gs:// media. Without the dedupe the generator
    // can put the SAME movement in the workout twice.
    const { user } = renderWizard([
      exercise({ id: "1234", name: { en: "Barbell Bench Press", es: "Press de banca" } }),
      exercise({ id: "std-1234", name: { en: "Barbell Bench Press", es: "Press de banca" } }),
      exercise({
        id: "5678",
        name: { en: "Push Up", es: "Flexiones" },
        equipment: ["bodyweight"],
      }),
    ]);

    await generate(user, {
      equipment: ["Barbell", "Bench", "Bodyweight"],
      muscles: ["Chest"],
    });

    const ids = generatedIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("std-1234");
  });

  it("refuses an exercise whose equipment is not fully available", async () => {
    // The engine's hard rule: EVERY required piece must be selected. Bench is
    // required by the barbell press and is not on the list.
    const { user } = renderWizard([
      exercise({ id: "std-bench" }),
      exercise({ id: "std-pushup", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });

    expect(generatedIds()).toEqual(["std-pushup"]);
  });
});

describe("WorkoutGeneratorWizard — the prescription shape it hands the editor", () => {
  it("seeds the 'Sin peso' sentinel ONLY on no-load exercises", async () => {
    // `weightBySetKg: []` is the reps-without-weight wire contract (#206). On a
    // barbell movement it would take the weight column away from the coach.
    const { user } = renderWizard([
      exercise({ id: "std-pushup", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
      exercise({ id: "std-pullup", name: { en: "Pull Up", es: "Dominadas" }, equipment: ["pull_up_bar"], muscleGroups: ["back"] }),
      exercise({ id: "std-row", name: { en: "Barbell Row", es: "Remo" }, equipment: ["barbell"], muscleGroups: ["back"] }),
    ]);

    await generate(user, {
      equipment: ["Bodyweight", "Pull-up bar", "Barbell"],
      muscles: ["Chest", "Back"],
    });

    const byId = new Map(
      lastDefaults().exercises.map((e) => [e.exerciseId as string, e]),
    );
    expect(byId.get("std-pushup")).toHaveProperty("weightBySetKg", []);
    expect(byId.get("std-pullup")).toHaveProperty("weightBySetKg", []);
    expect(byId.get("std-row")).not.toHaveProperty("weightBySetKg");
  });

  it("gives a TIME exercise a duration and zero reps", async () => {
    const { user } = renderWizard([
      exercise({
        id: "std-plank",
        name: { en: "Plank", es: "Plancha" },
        equipment: ["bodyweight"],
        muscleGroups: ["abs"],
        metric: "time",
      } as Partial<ExerciseRow>),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Abs"] });

    const [first] = lastDefaults().exercises;
    // NOTE: `reps: 0` here is the ENGINE's doing (engine.ts sets it for a time
    // metric); the wizard repeats the same ternary, so mutating the wizard's
    // copy changes nothing. The assertion is on the shape that reaches the
    // editor, which is what the mobile apps read — whichever layer produces it.
    expect(first).toMatchObject({ metric: "time", reps: 0 });
    expect(first.durationSeconds).toBeGreaterThan(0);
  });

  it("numbers the exercises from 1, in order", async () => {
    const { user } = renderWizard([
      exercise({ id: "a", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
      exercise({ id: "b", name: { en: "Dip", es: "Fondos" }, equipment: ["bodyweight"] }),
      exercise({ id: "c", name: { en: "Fly", es: "Aperturas" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });

    expect(lastDefaults().exercises.map((e) => e.order)).toEqual([1, 2, 3]);
  });

  it("tags the workout with the chosen style, on both the tag and tags fields", async () => {
    // `tag` is the legacy single field the mobile apps still read; `tags` is
    // the array. They must not drift.
    const { user } = renderWizard([
      exercise({ id: "std-pushup", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });

    const { tag, tags } = lastDefaults();
    expect(tags).toEqual([tag]);
    expect(tag).toBeTruthy();
  });

  it("hands the editor the coach's own filters for the swap picker (#361)", async () => {
    const { user } = renderWizard([
      exercise({ id: "std-pushup", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });

    expect(mockTemplateFormProps.mock.calls.at(-1)?.[0]).toMatchObject({
      mode: "create",
      pickerInitialFilters: { muscles: ["chest"], equipment: ["bodyweight"] },
    });
  });
});

describe("WorkoutGeneratorWizard — the steps", () => {
  it("will not advance past step 1 with no equipment picked", async () => {
    const { user } = renderWizard([exercise()]);

    expect(nav(/Next/)).toBeDisabled();

    await user.click(chip("Barbell"));
    expect(nav(/Next/)).toBeEnabled();
  });

  it("will not advance past step 2 with no muscles picked", async () => {
    const { user } = renderWizard([exercise()]);

    await user.click(chip("Barbell"));
    await user.click(nav(/Next/));

    expect(nav(/Next/)).toBeDisabled();
  });

  it("keeps the picks when stepping back", async () => {
    const { user } = renderWizard([exercise()]);

    await user.click(chip("Barbell"));
    await user.click(nav(/Next/));
    await user.click(nav(/Back/));

    expect(chip("Barbell")).toHaveAttribute("aria-pressed", "true");
  });

  it("selects a whole bundle in one press, and clears it on a second", async () => {
    const { user } = renderWizard([exercise()]);

    await user.click(chip("Free weights"));
    expect(chip("Barbell")).toHaveAttribute("aria-pressed", "true");

    await user.click(chip("Free weights"));
    expect(chip("Barbell")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("WorkoutGeneratorWizard — regenerate and save", () => {
  it("REMOUNTS the editor on regenerate so the new workout actually applies", async () => {
    // Same `key` → React reuses the form and its internal state, and the coach
    // keeps editing the previous workout under a new heading.
    const { user } = renderWizard([
      exercise({ id: "a", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
      exercise({ id: "b", name: { en: "Dip", es: "Fondos" }, equipment: ["bodyweight"] }),
      exercise({ id: "c", name: { en: "Fly", es: "Aperturas" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });
    expect(mockTemplateFormMounted).toHaveBeenCalledTimes(1);

    await user.click(nav(/Regenerate/));

    expect(mockTemplateFormMounted).toHaveBeenCalledTimes(2);
  });

  it("lands on the success screen with the SAVED id, and assigns that one", async () => {
    // The assign modal writes against this template id; handing it a stale one
    // assigns a different workout than the coach just made.
    const { user } = renderWizard([
      exercise({ id: "std-pushup", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });
    await user.click(screen.getByRole("button", { name: "fake-save" }));

    expect(screen.queryByTestId("template-form")).not.toBeInTheDocument();
    await user.click(nav(/Assign/));
    expect(screen.getByTestId("assign-modal")).toHaveTextContent("tpl-new");
  });

  it("'Generate another' returns to a blank step 1", async () => {
    const { user } = renderWizard([
      exercise({ id: "std-pushup", name: { en: "Push Up", es: "Flexiones" }, equipment: ["bodyweight"] }),
    ]);

    await generate(user, { equipment: ["Bodyweight"], muscles: ["Chest"] });
    await user.click(screen.getByRole("button", { name: "fake-save" }));
    await user.click(nav(/Generate another/));

    expect(chip("Bodyweight")).toHaveAttribute("aria-pressed", "false");
    expect(nav(/Next/)).toBeDisabled();
  });
});

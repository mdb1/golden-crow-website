/**
 * @jest-environment jsdom
 */

// template-form-editing.test.tsx
//
// The routine editor, driven the way a coach drives it: reorder / remove
// exercises, type per-set reps and weights, change the set count, the rest,
// group a superset — then press Save and assert the EXACT payload handed to
// the Server Action (`onSubmit` prop). Plus the two other ways work can be
// lost: Zod rejecting a save (must say why, must not call the action), and
// the localStorage draft (autosave, restore, discard, clear-on-success).
//
// Siblings: template-form-save.test.tsx (pure normalization rules seeded via
// defaultValues) and template-form-cancel.test.tsx (cancel/discard dialog).
// This file does not repeat those.

import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

const mockBack = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    hasSnapshot: true,
  }),
}));
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => ({ data: [], isLoading: false, error: null }),
}));
jest.mock("../exercise-picker-popover", () => ({
  ExercisePickerPopover: () => null,
}));
jest.mock("../exercise-multi-add-dialog", () => ({
  ExerciseMultiAddDialog: () => null,
}));
jest.mock("../template-tags-picker", () => ({
  TemplateTagsPicker: () => null,
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
    info: (...a: unknown[]) => mockToast.info(...a),
  },
}));

import { TemplateForm } from "../template-form";

type Ex = Partial<WorkoutTemplateInput["exercises"][number]> &
  Record<string, unknown>;

const DRAFT_PREFIX = "gc-fitness:template-draft:";

function exercise(overrides: Ex = {}): Ex {
  return {
    exerciseId: "0025",
    sets: 3,
    reps: 10,
    repsBySet: [10, 10, 10],
    rest_seconds: 90,
    transition_rest_seconds: 60,
    order: 1,
    ...overrides,
  };
}

function defaults(exercises: Ex[], extra: Record<string, unknown> = {}) {
  return {
    name: { en: "Push Day", es: "Push Day" },
    description: { en: "", es: "" },
    tag: "push",
    tags: ["push"],
    exercises,
    ...extra,
  } as Partial<WorkoutTemplateInput>;
}

function renderForm(
  defaultValues: Partial<WorkoutTemplateInput>,
  opts: {
    draftKey?: string;
    mode?: "create" | "edit";
    onSubmit?: jest.Mock;
  } = {},
) {
  const onSubmit =
    opts.onSubmit ?? jest.fn().mockResolvedValue({ ok: true as const });
  const view = render(
    <TemplateForm
      mode={opts.mode ?? "edit"}
      defaultValues={defaultValues}
      draftKey={opts.draftKey}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, ...view };
}

function saveButton() {
  return screen.getByRole("button", { name: /^(Save changes|Create template)$/ });
}

async function save(
  user: ReturnType<typeof userEvent.setup>,
  onSubmit: jest.Mock,
): Promise<WorkoutTemplateInput> {
  await user.click(saveButton());
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  return onSubmit.mock.calls[0][0] as WorkoutTemplateInput;
}

async function goToDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "2. Details" }));
}

/** Replace an input's text and blur it (every numeric field commits on blur). */
async function retype(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  value: string,
) {
  await user.clear(input);
  if (value !== "") await user.type(input, value);
  await user.tab();
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("TemplateForm editing — exercise list (step 2 controls)", () => {
  const three = () =>
    defaults([
      exercise({ exerciseId: "a" }),
      exercise({ exerciseId: "b", reps: 5, repsBySet: [5, 5, 5] }),
      exercise({ exerciseId: "c" }),
    ]);

  it("Move down swaps the exercise with the next and renumbers order", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(three());
    await goToDetails(user);

    await user.click(screen.getAllByRole("button", { name: "Move exercise down" })[0]);
    const payload = await save(user, onSubmit);

    expect(payload.exercises.map((e) => [e.exerciseId, e.order])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
    // The per-set prescription travels WITH its exercise.
    expect(payload.exercises[0].repsBySet).toEqual([5, 5, 5]);
  });

  it("Move up on the last exercise", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(three());
    await goToDetails(user);
    const ups = screen.getAllByRole("button", { name: "Move exercise up" });
    expect(ups[0]).toBeDisabled();
    await user.click(ups[2]);
    const payload = await save(user, onSubmit);
    expect(payload.exercises.map((e) => e.exerciseId)).toEqual(["a", "c", "b"]);
  });

  it("Remove drops exactly that exercise", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(three());
    await goToDetails(user);
    await user.click(screen.getAllByRole("button", { name: "Remove exercise" })[1]);
    const payload = await save(user, onSubmit);
    expect(payload.exercises.map((e) => [e.exerciseId, e.order])).toEqual([
      ["a", 1],
      ["c", 2],
    ]);
  });
});

describe("TemplateForm editing — step 1 gate", () => {
  it("Add exercise appends an UNPICKED row and blocks 'Continue to details'", async () => {
    const user = userEvent.setup();
    renderForm(defaults([exercise({ exerciseId: "a" })]));
    const cont = screen.getByRole("button", { name: "Continue to details" });
    expect(cont).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add exercise" }));
    expect(screen.getByRole("button", { name: "Continue to details" })).toBeDisabled();
  });
});

describe("TemplateForm editing — per-set values", () => {
  it("typing reps and kg per set lands positionally", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]));
    await goToDetails(user);

    await retype(user, screen.getByLabelText("Reps for set 2"), "8");
    await retype(user, screen.getByLabelText("Weight for set 1"), "40");
    await retype(user, screen.getByLabelText("Weight for set 3"), "47.5");

    const ex = (await save(user, onSubmit)).exercises[0];
    expect(ex.repsBySet).toEqual([10, 8, 10]);
    expect(ex.weightBySetKg).toEqual([40, 0, 47.5]);
    expect(ex.sets).toBe(3);
    // Exercise-level reps mirrors set 1.
    expect(ex.reps).toBe(10);
  });

  it("copy-to-all propagates set 1's reps and kg to every set", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]));
    await goToDetails(user);

    await retype(user, screen.getByLabelText("Reps for set 1"), "6");
    await retype(user, screen.getByLabelText("Weight for set 1"), "100");
    await user.click(
      screen.getByRole("button", { name: "Copy reps and weight to all sets" }),
    );

    const ex = (await save(user, onSubmit)).exercises[0];
    expect(ex.repsBySet).toEqual([6, 6, 6]);
    expect(ex.weightBySetKg).toEqual([100, 100, 100]);
    expect(ex.reps).toBe(6);
  });

  it("raising the set count adds rows with the default reps and 0 kg", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([exercise({ weightBySetKg: [50, 55, 60] })]),
    );
    await goToDetails(user);

    const sets = document.querySelector<HTMLInputElement>('[data-field-sets="0"]')!;
    await retype(user, sets, "5");

    const ex = (await save(user, onSubmit)).exercises[0];
    expect(ex.sets).toBe(5);
    expect(ex.repsBySet).toEqual([10, 10, 10, 10, 10]);
    expect(ex.weightBySetKg).toEqual([50, 55, 60, 0, 0]);
  });

  it("lowering the set count truncates every per-set array", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([
        exercise({
          repsBySet: [12, 10, 8],
          weightBySetKg: [50, 55, 60],
          setTypesBySet: ["warmup", "normal", "failure"],
        }),
      ]),
    );
    await goToDetails(user);

    const sets = document.querySelector<HTMLInputElement>('[data-field-sets="0"]')!;
    await retype(user, sets, "2");

    const ex = (await save(user, onSubmit)).exercises[0];
    expect(ex.sets).toBe(2);
    expect(ex.repsBySet).toEqual([12, 10]);
    expect(ex.weightBySetKg).toEqual([50, 55]);
    expect(ex.setTypesBySet).toEqual(["warmup", "normal"]);
  });

  it("the 'No weight' toggle writes the [] sentinel and survives a set-count change", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([exercise({ weightBySetKg: [20, 20, 20] })]),
    );
    await goToDetails(user);
    await user.click(screen.getByRole("button", { name: "No weight" }));
    expect(screen.queryByLabelText("Weight for set 1")).not.toBeInTheDocument();

    const sets = document.querySelector<HTMLInputElement>('[data-field-sets="0"]')!;
    await retype(user, sets, "4");

    const ex = (await save(user, onSubmit)).exercises[0];
    expect(ex.weightBySetKg).toEqual([]);
    expect(ex.sets).toBe(4);
  });

  it("rest between sets commits on blur", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]));
    await goToDetails(user);
    const rest = screen.getByDisplayValue("90");
    await retype(user, rest, "150");
    const ex = (await save(user, onSubmit)).exercises[0];
    expect(ex.rest_seconds).toBe(150);
  });
});

describe("TemplateForm editing — supersets", () => {
  it("tapping pill A on two exercises groups them and aligns the follower's sets to the leader", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([
        exercise({ exerciseId: "a", sets: 4, repsBySet: [8, 8, 8, 8] }),
        exercise({ exerciseId: "b", sets: 2, reps: 12, repsBySet: [12, 12] }),
      ]),
    );
    await goToDetails(user);

    const pillsFor = (card: number) =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          `[data-field-superset][data-exercise-card="${card}"]`,
        ),
      );
    await user.click(pillsFor(0).find((b) => b.textContent === "A")!);
    await user.click(pillsFor(1).find((b) => b.textContent === "A")!);
    expect(pillsFor(1).find((b) => b.textContent === "A")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const payload = await save(user, onSubmit);
    expect(payload.exercises.map((e) => [e.exerciseId, e.supersetGroup, e.sets])).toEqual([
      ["a", "A", 4],
      ["b", "A", 4],
    ]);
    expect(payload.exercises[1].repsBySet).toEqual([12, 12, 12, 12]);
  });

  it("the group's round rest writes through to EVERY member's rest_seconds", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([
        exercise({ exerciseId: "a", supersetGroup: "A", rest_seconds: 60 }),
        exercise({ exerciseId: "b", supersetGroup: "A", rest_seconds: 60 }),
        exercise({ exerciseId: "solo", rest_seconds: 60 }),
      ]),
    );
    await goToDetails(user);

    const label = screen.getByText("Superset rest (s)");
    const input = within(label.closest("div")!.parentElement as HTMLElement)
      .getAllByRole("textbox")[0];
    await retype(user, input, "120");

    const payload = await save(user, onSubmit);
    expect(payload.exercises.map((e) => e.rest_seconds)).toEqual([120, 120, 60]);
  });

  // Pinned as-is: the exercise that stays behind KEEPS its "A" label — a
  // one-member group. Readers treat a lone label as a standalone exercise
  // (membership needs ≥ 2), so nothing breaks; the label is just inert.
  it("un-tapping the active pill removes the exercise from the group", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([
        exercise({ exerciseId: "a", supersetGroup: "A" }),
        exercise({ exerciseId: "b", supersetGroup: "A" }),
      ]),
    );
    await goToDetails(user);
    const pill = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-field-superset][data-exercise-card="1"]',
      ),
    ).find((b) => b.textContent === "A")!;
    await user.click(pill);
    const payload = await save(user, onSubmit);
    expect(payload.exercises.map((e) => e.supersetGroup ?? "")).toEqual(["A", ""]);
  });
});

describe("TemplateForm editing — validation never silently drops the save", () => {
  it("a blank name blocks the save and says why", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([exercise()], { name: { en: "", es: "" } }),
    );
    await user.click(saveButton());
    expect(await screen.findByText("Fix these before saving:")).toBeInTheDocument();
    expect(screen.getAllByText("Enter a name.").length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("an unpicked exercise row blocks the save with a per-exercise message", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]));
    await user.click(screen.getByRole("button", { name: "Add exercise" }));
    await user.click(saveButton());
    expect(
      await screen.findByText("Exercise #2: exerciseId — Pick an exercise before saving."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("an out-of-range rest blocks the save with the schema message", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]));
    await goToDetails(user);
    await retype(user, screen.getByDisplayValue("90"), "900");
    await user.click(saveButton());
    expect(
      await screen.findByText(
        "Exercise #1: rest_seconds — Rest seconds max is 600 (10 min).",
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("an empty template blocks the save", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([]));
    await user.click(saveButton());
    expect(await screen.findByText("Fix these before saving:")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("TemplateForm editing — the localStorage draft", () => {
  const KEY = "edit:tpl-9";
  const STORAGE = `${DRAFT_PREFIX}${KEY}`;

  function stored(): WorkoutTemplateInput | null {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as WorkoutTemplateInput) : null;
  }

  it("autosaves a committed edit after the 500 ms debounce (not before)", async () => {
    const user = userEvent.setup();
    renderForm(defaults([exercise()]), { draftKey: KEY });
    await goToDetails(user);
    expect(stored()).toBeNull();

    await retype(user, screen.getByLabelText("Weight for set 2"), "33");
    // userEvent's own delays are well under the debounce.
    await waitFor(() => expect(stored()).not.toBeNull(), { timeout: 2000 });
    expect(stored()!.exercises[0].weightBySetKg).toEqual([0, 33]);
  });

  it("restores a stored draft on mount, shows the banner, and SAVES the draft's values", async () => {
    window.localStorage.setItem(
      STORAGE,
      JSON.stringify(
        defaults([exercise({ exerciseId: "from-draft", repsBySet: [3, 3, 3], reps: 3 })], {
          name: { en: "Draft name", es: "Draft name" },
        }),
      ),
    );
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]), { draftKey: KEY });

    expect(
      screen.getByText("Restored your unsaved draft. Pick up where you left off."),
    ).toBeInTheDocument();
    const payload = await save(user, onSubmit);
    expect(payload.name.en).toBe("Draft name");
    expect(payload.exercises[0].exerciseId).toBe("from-draft");
    expect(payload.exercises[0].repsBySet).toEqual([3, 3, 3]);
  });

  it("ignores a corrupt draft and renders the server values", async () => {
    window.localStorage.setItem(STORAGE, "{not json");
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise({ exerciseId: "server" })]), {
      draftKey: KEY,
    });
    expect(screen.queryByText(/Restored your unsaved draft/)).not.toBeInTheDocument();
    const payload = await save(user, onSubmit);
    expect(payload.exercises[0].exerciseId).toBe("server");
  });

  it("'Discard draft' clears storage and puts the server values back", async () => {
    window.localStorage.setItem(
      STORAGE,
      JSON.stringify(defaults([exercise({ exerciseId: "from-draft" })])),
    );
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise({ exerciseId: "server" })]), {
      draftKey: KEY,
    });
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.queryByText(/Restored your unsaved draft/)).not.toBeInTheDocument();
    // The discarded draft is gone from disk (the reset may later autosave the
    // SERVER values — harmless — but never the discarded ones).
    expect(window.localStorage.getItem(STORAGE) ?? "").not.toContain("from-draft");
    const payload = await save(user, onSubmit);
    expect(payload.exercises[0].exerciseId).toBe("server");
  });

  it("a successful save clears the draft", async () => {
    window.localStorage.setItem(
      STORAGE,
      JSON.stringify(defaults([exercise({ exerciseId: "from-draft" })])),
    );
    const user = userEvent.setup();
    const { onSubmit } = renderForm(defaults([exercise()]), { draftKey: KEY });
    await save(user, onSubmit);
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(STORAGE)).toBeNull();
    expect(mockToast.success).toHaveBeenCalledWith("Template saved.");
  });

  it("a FAILED save keeps the draft on disk so the work survives a reload", async () => {
    window.localStorage.setItem(
      STORAGE,
      JSON.stringify(defaults([exercise({ exerciseId: "from-draft" })])),
    );
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockRejectedValue(new Error("permission-denied"));
    renderForm(defaults([exercise()]), { draftKey: KEY, onSubmit });
    await user.click(saveButton());
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Couldn't save."));
    expect(JSON.parse(window.localStorage.getItem(STORAGE)!).exercises[0].exerciseId).toBe(
      "from-draft",
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("flushes the pending edit on pagehide (tab close inside the debounce)", async () => {
    const user = userEvent.setup();
    renderForm(defaults([exercise()]), { draftKey: KEY });
    await goToDetails(user);
    jest.useFakeTimers();
    const input = screen.getByLabelText("Weight for set 1");
    fireEvent.change(input, { target: { value: "77" } });
    fireEvent.blur(input);
    expect(stored()).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(stored()!.exercises[0].weightBySetKg).toEqual([77]);
  });

  it("flushes the pending edit on unmount (SPA navigation inside the debounce)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm(defaults([exercise()]), { draftKey: KEY });
    await goToDetails(user);
    jest.useFakeTimers();
    const input = screen.getByLabelText("Reps for set 3");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.blur(input);
    expect(stored()).toBeNull();
    unmount();
    expect(stored()!.exercises[0].repsBySet).toEqual([10, 10, 4]);
  });

  it("create mode: success with an id clears the draft and announces creation", async () => {
    const user = userEvent.setup();
    const KEY2 = "create";
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${KEY2}`,
      JSON.stringify(defaults([exercise({ exerciseId: "x" })])),
    );
    const onSubmit = jest.fn().mockResolvedValue({ ok: true, id: "new-id" });
    renderForm(defaults([]), { draftKey: KEY2, mode: "create", onSubmit });
    await save(user, onSubmit);
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith("Template created."));
    expect(window.localStorage.getItem(`${DRAFT_PREFIX}${KEY2}`)).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

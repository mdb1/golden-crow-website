/**
 * @jest-environment jsdom
 */

// exercise-multi-add-dialog.test.tsx
//
// The batch-add flow used while building a workout template: tick ten
// exercises, confirm once. `ExercisePickerPopover` (its single-select sibling)
// has its own two test files; this one covers what only the batch dialog has —
// selection that must SURVIVE the list changing under it.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// What the batch flow gets wrong when it breaks:
//
//   • SELECTION IS NOT THE VISIBLE LIST. A coach ticks three chest exercises,
//     types "row", ticks two more, and confirms. If the ticked set were derived
//     from what's on screen, the first three would silently not be added —
//     the template comes out short and nothing errors.
//   • QUICK-CREATE MUST NOT END THE FLOW. Creating an exercise from inside the
//     dialog auto-selects it and KEEPS THE DIALOG OPEN. May 2026 onboarding
//     feedback was exactly this regression: one quick-create closed the dialog
//     with only the new exercise selected, dropping every other tick.
//     It also clears the search — the new row would otherwise be hidden by the
//     now-stale needle the coach typed to discover it was missing.
//   • CLOSING RESETS. A dialog that reopens with the previous ticks still set
//     adds exercises the coach didn't pick this time.
//   • THE SAME VISIBILITY + DEDUPE PIPELINE AS THE LIBRARY (#552 / #179).
//     Legacy catalog docs stay unpickable and the double-seeded standard twins
//     collapse to one row here too — a picker that offers the `std-*` twin adds
//     a broken-media exercise to the routine.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

const mockUseExercises = jest.fn();
jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  EXERCISES_QUERY_KEY: ["gc-fitness", "exercises"],
  useExercisesQuery: (...args: unknown[]) => mockUseExercises(...args),
}));

const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// The dialog reuses ChipRow/FilterChip/displayEs from the single-add picker,
// which pulls in `use-favorites` → `favorites-actions` → firebase-admin, and
// firebase-admin's `jose` dependency is ESM-only: importing it fails the whole
// suite with `SyntaxError: Unexpected token 'export'` before a single test runs.
jest.mock("@/lib/gc-fitness/use-favorites", () => ({
  useFavorites: () => ({
    favorites: { exerciseIds: [], workoutTemplateIds: [], habitTemplateIds: [] },
    isFavorite: () => false,
    toggle: jest.fn(),
  }),
}));

jest.mock("@/components/gc-fitness/exercise-preview-thumb", () => ({
  ExercisePreviewThumb: () => null,
}));

// The quick-create panel has its own surface; here it only needs to be able to
// report a creation, which is the event the dialog reacts to.
const mockQuickCreateProps = jest.fn();
jest.mock("@/components/gc-fitness/exercise-quick-create", () => ({
  QuickCreateExercise: (props: {
    searchTerm: string;
    seed: { name: string } | null;
    onCreated: (created: { id: string; name: string }) => void;
  }) => {
    mockQuickCreateProps(props);
    return (
      <div data-testid="quick-create">
        <span data-testid="quick-create-term">{props.searchTerm}</span>
        <span data-testid="quick-create-seed">{props.seed?.name ?? ""}</span>
        <button
          type="button"
          onClick={() => props.onCreated({ id: "new-ex", name: "Brand New" })}
        >
          quick-create-submit
        </button>
      </div>
    );
  },
}));

import { ExerciseMultiAddDialog } from "@/components/gc-fitness/exercise-multi-add-dialog";

function exercise(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: "ex-1",
    name: { en: "Bench Press", es: "" },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    source: "trainer",
    ownerId: "trainer-1",
    tags: [],
    metric: "reps",
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as ExerciseRow;
}

const ROWS = [
  exercise({ id: "bench", name: { en: "Bench Press", es: "" }, muscleGroups: ["chest"] }),
  exercise({ id: "fly", name: { en: "Chest Fly", es: "" }, muscleGroups: ["chest"] }),
  exercise({ id: "row", name: { en: "Barbell Row", es: "" }, muscleGroups: ["back"] }),
];

async function openDialog(rows: ExerciseRow[] = ROWS) {
  mockUseExercises.mockReturnValue({
    data: rows,
    isLoading: false,
    error: null,
    hasSnapshot: true,
  });
  const onConfirm = jest.fn();
  const onQuickCreated = jest.fn();
  const user = userEvent.setup();
  render(
    <ExerciseMultiAddDialog
      onConfirm={onConfirm}
      onQuickCreated={onQuickCreated}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Add multiple" }));
  return { user, onConfirm, onQuickCreated };
}

/** Tick the row whose visible name is `name`. */
async function tick(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = screen.getByText(name).closest("li") as HTMLElement;
  await user.click(within(row).getByRole("checkbox"));
}

function searchBox() {
  return screen.getByPlaceholderText("Search exercises…");
}

function confirmButton() {
  return screen.getByRole("button", { name: /^Add \d+$/ });
}

function visibleRowNames(): string[] {
  return screen
    .getAllByRole("checkbox")
    .map(
      (cb) =>
        (cb.closest("li") as HTMLElement).querySelector("span.font-medium")
          ?.textContent ?? "",
    );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ExerciseMultiAddDialog — the batch", () => {
  it("confirms every ticked id at once", async () => {
    const { user, onConfirm } = await openDialog();

    await tick(user, "Bench Press");
    await tick(user, "Barbell Row");
    await user.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].sort()).toEqual(["bench", "row"]);
  });

  it("KEEPS ticks made before a search narrowed the list", async () => {
    const { user, onConfirm } = await openDialog();

    await tick(user, "Bench Press");
    await user.type(searchBox(), "row");
    await waitFor(() => expect(visibleRowNames()).toEqual(["Barbell Row"]));
    await tick(user, "Barbell Row");

    await user.click(confirmButton());

    // The ticked set is state, not a projection of what's on screen. Losing
    // the off-screen ticks builds a short template and nothing errors.
    expect(onConfirm.mock.calls[0][0].sort()).toEqual(["bench", "row"]);
  });

  it("counts the selection, not the visible rows", async () => {
    const { user } = await openDialog();

    await tick(user, "Bench Press");
    await tick(user, "Chest Fly");
    await user.type(searchBox(), "zzzz");

    await waitFor(() => expect(screen.getByText("No matches.")).toBeInTheDocument());
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("un-ticking removes the id again", async () => {
    const { user, onConfirm } = await openDialog();

    await tick(user, "Bench Press");
    await tick(user, "Chest Fly");
    await tick(user, "Bench Press");
    await user.click(confirmButton());

    expect(onConfirm.mock.calls[0][0]).toEqual(["fly"]);
  });

  // The `if (picked.size === 0) return` at the top of `onSubmit` is a guard the
  // UI never reaches: the confirm button is `disabled` at zero. Asserting the
  // disabled state is asserting the guard that actually runs. (Third instance
  // of this pattern in the coach portal — see #307.)
  it("disables confirm until something is ticked", async () => {
    const { user } = await openDialog();

    expect(confirmButton()).toBeDisabled();

    await tick(user, "Bench Press");

    expect(confirmButton()).toBeEnabled();
  });

  it("forgets the selection after the dialog closes", async () => {
    const { user, onConfirm } = await openDialog();

    await tick(user, "Bench Press");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search exercises…")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Add multiple" }));
    await tick(user, "Chest Fly");
    await user.click(confirmButton());

    // Reopening with stale ticks adds exercises the coach didn't pick.
    expect(onConfirm.mock.calls[0][0]).toEqual(["fly"]);
  });
});

describe("ExerciseMultiAddDialog — quick-create keeps the flow alive", () => {
  it("auto-selects the new exercise WITHOUT closing or confirming", async () => {
    const { user, onConfirm, onQuickCreated } = await openDialog();

    await tick(user, "Bench Press");
    // Quick-create appears once the search matches nothing.
    await user.type(searchBox(), "zzzz");
    await user.click(await screen.findByRole("button", { name: "quick-create-submit" }));

    // The regression this pins: the dialog stayed open, the earlier tick
    // survived, and nothing was confirmed on the coach's behalf.
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Search exercises…")).toBeInTheDocument();
    expect(onQuickCreated).toHaveBeenCalledWith({ id: "new-ex", name: "Brand New" });

    await user.click(confirmButton());
    expect(onConfirm.mock.calls[0][0].sort()).toEqual(["bench", "new-ex"]);
  });

  it("clears the search so the new exercise is actually visible", async () => {
    const { user } = await openDialog();

    await user.type(searchBox(), "zzzz");
    await user.click(await screen.findByRole("button", { name: "quick-create-submit" }));

    // The needle the coach typed to discover the exercise was missing would
    // hide the exercise they just created.
    await waitFor(() => expect(searchBox()).toHaveValue(""));
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("seeds the panel from the row behind 'Create similar'", async () => {
    const { user } = await openDialog();

    const row = screen.getByText("Barbell Row").closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Create similar/ }));

    // One-tweak duplication: seeded from THAT row, not from the search term.
    expect(await screen.findByTestId("quick-create-seed")).toHaveTextContent(
      "Barbell Row",
    );
  });
});

describe("ExerciseMultiAddDialog — the shared pipeline", () => {
  it("never offers a legacy catalog exercise (#552)", async () => {
    await openDialog([
      exercise({ id: "own", name: { en: "My Curl", es: "" } }),
      exercise({
        id: "fexd-legacy",
        name: { en: "Legacy Row", es: "" },
        source: "free-exercise-db",
        ownerId: null,
        tags: [],
      }),
    ]);

    expect(visibleRowNames()).toEqual(["My Curl"]);
  });

  it("collapses the double-seeded standard twins (#179)", async () => {
    await openDialog([
      exercise({
        id: "1259",
        name: { en: "Chest Stretch", es: "" },
        source: "wger",
        ownerId: null,
        tags: ["standard-library"],
        gifUrl: "https://storage.example/1259.gif",
      } as Partial<ExerciseRow>),
      exercise({
        id: "std-chest-stretch",
        name: { en: "Chest Stretch", es: "" },
        source: "wger",
        ownerId: null,
        tags: ["standard-library"],
        gifUrl: "gs://gcfitness/std-chest-stretch.gif",
      } as Partial<ExerciseRow>),
    ]);

    // Offering the twin lets a coach add the broken-media copy to a routine,
    // where it renders as a missing thumbnail on the client's phone.
    expect(visibleRowNames()).toEqual(["Chest Stretch"]);
  });

  it("filters by muscle chip", async () => {
    const { user } = await openDialog();

    await user.click(screen.getByTestId("exercise-multi-add-chip-muscles-back"));

    await waitFor(() => expect(visibleRowNames()).toEqual(["Barbell Row"]));
  });
});

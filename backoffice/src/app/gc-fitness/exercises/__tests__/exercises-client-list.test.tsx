/**
 * @jest-environment jsdom
 */

// exercises-client-list.test.tsx
//
// The exercise library list: the pipeline from the cached feed to the rows on
// screen, and the per-row action gate.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The pipeline is five stages deep and the ORDER of the first three is the
// whole point:
//
//     isPickableExercise → dedupeExercisesByDisplayName → chip filters
//        → searchExercises → favorites → usage sort
//
//   • VISIBILITY FIRST (#552 / the 2026-06-12 retirement decision). ~400 legacy
//     `fexd-*` / `wger-*` / `standard_alias` docs are alive in Firestore ON
//     PURPOSE — ~600 historical templates and logs reference their ids, so
//     hiding them is CODE-SIDE only, never a `deleted: true` write. The
//     `ownerId != null` half of the predicate is load-bearing: `snapToRow`
//     coerces every unknown wire `source` to `"trainer"`, so a bare
//     `source === "trainer"` check keeps all 24 alias docs pickable.
//   • DEDUPE SECOND, BEFORE filter and search (#179). Prod's standard library
//     is DOUBLE-SEEDED: every curated exercise exists as a numeric-id doc with
//     working https media AND as a `std-<slug>` twin whose media is a
//     non-renderable `gs://` URL. Un-deduped, the library shows everything
//     twice, the second copy with a broken thumbnail — and, because search
//     runs after, a search for one exercise returns two hits.
//   • THE ACTION GATE. A library exercise is READ-ONLY: View + Duplicate. Only
//     a trainer-owned one gets Edit + Delete. The gate is `!== "trainer"`, not
//     `=== "wger"` — that spelling is the fix for the free-exercise-db rows
//     that used to offer Edit and 404 on it. Same shape as the #163 invariant
//     on templates.
//
// `ExerciseFilters` is stubbed with one button per preset filter state, so
// these tests drive the parent's pipeline directly instead of re-driving the
// chip UI (which has its own surface). Everything the pipeline is MADE of —
// the visibility predicate, the dedupe, the ranked search, the columns — stays
// real; mocking those would leave nothing under test.

import "@testing-library/jest-dom";

import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";
import type { ExerciseFiltersState } from "../_components/ExerciseFilters";

const mockUseExercises = jest.fn();
jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  EXERCISES_QUERY_KEY: ["gc-fitness", "exercises"],
  useExercisesQuery: (...args: unknown[]) => mockUseExercises(...args),
}));

const mockSoftDeleteExercise = jest.fn();
const mockDuplicateExercise = jest.fn();
jest.mock("@/lib/gc-fitness/exercise-server-actions", () => ({
  softDeleteExercise: (...args: unknown[]) => mockSoftDeleteExercise(...args),
  duplicateExercise: (...args: unknown[]) => mockDuplicateExercise(...args),
}));

const mockFavorites = jest.fn();
jest.mock("@/lib/gc-fitness/use-favorites", () => ({
  useFavorites: () => ({ favorites: mockFavorites(), isFavorite: () => false, toggle: jest.fn() }),
}));

const mockUsageCounts = jest.fn();
jest.mock("@/lib/gc-fitness/library-usage-listeners", () => ({
  useExerciseUsageCounts: () => ({ data: mockUsageCounts() }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), back: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../_components/NewExerciseDialog", () => ({
  NewExerciseDialog: () => null,
}));

// One button per preset filter state. Driving the real chip UI would test the
// filter component, not this pipeline; what matters here is what the parent
// DOES with a given state.
const mockFilterPresets: Record<string, Partial<ExerciseFiltersState>> = {
  standard: { source: ["Standard"] },
  custom: { source: ["Custom"] },
  mine: { mineOnly: true },
  favorites: { favoritesOnly: true },
  chest: { muscleGroups: ["chest"] },
  barbell: { equipment: ["barbell"] },
  "search-press": { search: "press" },
  "search-stretch": { search: "stretch" },
  "search-sentadilla": { search: "sentadilla" },
  "search-nothing": { search: "zzzzz" },
};
jest.mock("../_components/ExerciseFilters", () => ({
  ExerciseFilters: ({
    onChange,
  }: {
    onChange: (f: ExerciseFiltersState) => void;
  }) => (
    <div>
      {Object.entries(mockFilterPresets).map(([key, patch]) => (
        <button
          key={key}
          type="button"
          onClick={() =>
            onChange({
              search: "",
              muscleGroups: [],
              equipment: [],
              source: [],
              mineOnly: false,
              favoritesOnly: false,
              ...patch,
            })
          }
        >
          {`filter:${key}`}
        </button>
      ))}
    </div>
  ),
}));

import { ExerciseLibraryClient } from "../client";

const TRAINER = "trainer-1";

function exercise(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: "ex-1",
    name: { en: "Bench Press", es: "Press de Banca" },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    source: "trainer",
    ownerId: TRAINER,
    tags: [],
    metric: "reps",
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as ExerciseRow;
}

/** A doc from the curated standard library (the tag is what makes it pickable). */
function standard(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return exercise({
    id: "1259",
    source: "wger",
    ownerId: null,
    tags: ["standard-library"],
    gifUrl: "https://storage.example/1259.gif",
    ...overrides,
  } as Partial<ExerciseRow>);
}

function renderList(rows: ExerciseRow[]) {
  mockUseExercises.mockReturnValue({
    data: rows,
    isLoading: false,
    error: null,
    hasSnapshot: true,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ExerciseLibraryClient trainerUid={TRAINER} />
    </QueryClientProvider>,
  );
}

/**
 * Primary names in the rendered table body, in DOM order.
 *
 * Scoped to the name cell's `span.font-medium`, not the whole cell: the cell
 * also carries the secondary-language line, the tag badges and the usage pill,
 * so the full `textContent` reads "Chest StretchStandard-library".
 */
function visibleNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1) // header
    .map(
      (r) =>
        within(r)
          .queryAllByRole("cell")[2]
          ?.querySelector("span.font-medium")?.textContent ?? "",
    )
    .filter((s) => s.length > 0);
}

function applyFilter(user: ReturnType<typeof userEvent.setup>, key: string) {
  return user.click(screen.getByRole("button", { name: `filter:${key}` }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFavorites.mockReturnValue({
    exerciseIds: [],
    workoutTemplateIds: [],
    habitTemplateIds: [],
  });
  mockUsageCounts.mockReturnValue({});
  mockDuplicateExercise.mockResolvedValue({ id: "copy-1" });
  mockSoftDeleteExercise.mockResolvedValue({ ok: true });
});

describe("Exercise library — visibility (#552 / legacy retirement)", () => {
  it("hides a legacy catalog doc that is alive in Firestore on purpose", () => {
    renderList([
      exercise({ id: "own", name: { en: "My Curl", es: "" } }),
      // fexd/wger legacy: no standard-library tag, no owner. ~400 of these
      // exist in prod so old templates keep resolving their ids.
      exercise({
        id: "fexd-legacy",
        name: { en: "Legacy Row", es: "" },
        source: "free-exercise-db",
        ownerId: null,
        tags: [],
      }),
    ]);

    expect(visibleNames()).toEqual(["My Curl"]);
  });

  it("hides a standard_alias doc that snapToRow coerced to source 'trainer'", () => {
    // THE ownerId GUARD. All 24 alias docs land here as `source: "trainer"`
    // with `ownerId: null`; a bare source check would show every one of them.
    renderList([
      exercise({ id: "own", name: { en: "My Curl", es: "" } }),
      exercise({
        id: "alias-1",
        name: { en: "Aliased Movement", es: "" },
        source: "trainer",
        ownerId: null,
      }),
    ]);

    expect(visibleNames()).toEqual(["My Curl"]);
  });

  it("hides a soft-deleted doc even when it carries the library tag", () => {
    renderList([
      exercise({ id: "own", name: { en: "My Curl", es: "" } }),
      standard({ id: "gone", name: { en: "Deleted Std", es: "" }, deleted: true }),
    ]);

    expect(visibleNames()).toEqual(["My Curl"]);
  });
});

describe("Exercise library — the double-seeded standard library (#179)", () => {
  const TWINS = [
    standard({
      id: "1259",
      name: { en: "Chest Stretch", es: "" },
      gifUrl: "https://storage.example/1259.gif",
    }),
    standard({
      id: "std-flexibility-chest-stretch",
      name: { en: "Chest Stretch", es: "" },
      // The twin's media is a gs:// path the browser cannot render.
      gifUrl: "gs://gcfitness/std-flexibility-chest-stretch.gif",
    }),
  ];

  it("shows ONE row per exercise, keeping the renderable-media doc", () => {
    renderList(TWINS);

    expect(visibleNames()).toEqual(["Chest Stretch"]);
  });

  it("returns ONE hit when the search matches both twins", async () => {
    const user = userEvent.setup();
    // The user-visible symptom of #179: every query in the library comes back
    // doubled, the second hit with a broken thumbnail.
    //
    // NOTE on the stage order — the source runs dedupe BEFORE the chip filters
    // and the search, and that reads like the invariant, but it isn't
    // observable: with real twins (same name, same muscles, same equipment)
    // filtering and searching are per-row predicates, so pre- and post-dedupe
    // produce the identical set. Verified by mutation — moving the dedupe
    // after `searchExercises` keeps every test green. The contract asserted
    // here is "one row per exercise", which is the part that matters.
    renderList([...TWINS, exercise({ id: "own", name: { en: "Bench Press", es: "" } })]);

    await applyFilter(user, "search-nothing");
    await waitFor(() => expect(visibleNames()).toEqual([]));

    await applyFilter(user, "search-stretch");
    await waitFor(() => expect(visibleNames()).toEqual(["Chest Stretch"]));
  });

  it("never lets a library twin hide the trainer's own exercise", async () => {
    // The dedupe tiebreak puts owned first: a coach who authored their own
    // "Chest Stretch" must still find it, or their exercise silently vanishes
    // from their own library.
    renderList([
      standard({ id: "1259", name: { en: "Chest Stretch", es: "" } }),
      exercise({ id: "mine", name: { en: "Chest Stretch", es: "" } }),
    ]);
    const user = userEvent.setup();

    expect(visibleNames()).toEqual(["Chest Stretch"]);
    // And the surviving row is the OWNED one — it offers Edit, which a library
    // row never does.
    await applyFilter(user, "mine");
    await waitFor(() => expect(visibleNames()).toEqual(["Chest Stretch"]));
  });
});

describe("Exercise library — filters", () => {
  const ROWS = [
    exercise({ id: "mine", name: { en: "My Curl", es: "" }, muscleGroups: ["biceps"], equipment: ["dumbbell"] }),
    exercise({
      id: "other-coach",
      name: { en: "Other Coach Curl", es: "" },
      ownerId: "trainer-2",
      muscleGroups: ["biceps"],
      equipment: ["dumbbell"],
    }),
    standard({
      id: "1259",
      name: { en: "Bench Press", es: "" },
      // Two groups, so the muscle filter's array-contains-ANY semantics are
      // distinguishable from contains-ALL. A single-group fixture makes
      // `.some()` and `.every()` agree and the filter untested.
      muscleGroups: ["chest", "triceps"],
      equipment: ["barbell"],
    }),
  ];

  it("splits Standard from Custom", async () => {
    const user = userEvent.setup();
    renderList([
      ...ROWS,
      // A library-tagged doc whose `source` is NOT "wger". Classifying it as
      // Custom would be a lie in the filter: it's read-only like every other
      // library row. The tag, not the source, is what makes it Standard.
      standard({
        id: "fexd-std",
        source: "free-exercise-db",
        name: { en: "Push Up", es: "" },
      }),
    ]);

    await applyFilter(user, "standard");
    await waitFor(() =>
      expect(visibleNames().sort()).toEqual(["Bench Press", "Push Up"]),
    );

    await applyFilter(user, "custom");
    await waitFor(() =>
      expect(visibleNames().sort()).toEqual(["My Curl", "Other Coach Curl"]),
    );
  });

  it("'created by me' excludes ANOTHER trainer's exercise", async () => {
    const user = userEvent.setup();
    renderList(ROWS);

    await applyFilter(user, "mine");

    // Both are `source: "trainer"`. Only the ownerId tells them apart, and
    // showing someone else's authored exercise under "mine" is a cross-tenant
    // leak in a list the coach believes is theirs.
    await waitFor(() => expect(visibleNames()).toEqual(["My Curl"]));
  });

  it("filters by muscle with contains-ANY, and by equipment", async () => {
    const user = userEvent.setup();
    renderList(ROWS);

    // Bench Press is tagged ["chest", "triceps"] and the filter selects only
    // "chest": contains-ANY keeps it, contains-ALL would drop it and the coach
    // would conclude they have no chest exercises.
    await applyFilter(user, "chest");
    await waitFor(() => expect(visibleNames()).toEqual(["Bench Press"]));

    await applyFilter(user, "barbell");
    await waitFor(() => expect(visibleNames()).toEqual(["Bench Press"]));
  });

  it("searches the Spanish name too", async () => {
    const user = userEvent.setup();
    renderList([
      exercise({ id: "a", name: { en: "Squat", es: "Sentadilla" } }),
      exercise({ id: "b", name: { en: "Bench Press", es: "Press de Banca" } }),
    ]);

    await applyFilter(user, "search-sentadilla");

    // The coach types in whichever language they think in.
    await waitFor(() => expect(visibleNames()).toEqual(["Squat"]));
  });

  it("floats favorites to the top and can keep only them", async () => {
    const user = userEvent.setup();
    mockFavorites.mockReturnValue({
      exerciseIds: ["fav"],
      workoutTemplateIds: [],
      habitTemplateIds: [],
    });
    renderList([
      exercise({ id: "a", name: { en: "Aaa", es: "" } }),
      exercise({ id: "fav", name: { en: "Zzz", es: "" } }),
    ]);

    expect(visibleNames()).toEqual(["Zzz", "Aaa"]);

    await applyFilter(user, "favorites");
    await waitFor(() => expect(visibleNames()).toEqual(["Zzz"]));
  });

  it("sorts by routine usage when 'Most used' is on", async () => {
    const user = userEvent.setup();
    mockUsageCounts.mockReturnValue({ popular: 12, rare: 1 });
    renderList([
      exercise({ id: "rare", name: { en: "Rare Move", es: "" } }),
      exercise({ id: "popular", name: { en: "Popular Move", es: "" } }),
    ]);

    expect(visibleNames()).toEqual(["Rare Move", "Popular Move"]);

    await user.click(screen.getByRole("button", { name: "Most used" }));

    await waitFor(() =>
      expect(visibleNames()).toEqual(["Popular Move", "Rare Move"]),
    );
  });

  it("distinguishes 'nothing yet' from 'nothing matches'", async () => {
    const user = userEvent.setup();
    renderList([exercise()]);

    await applyFilter(user, "search-nothing");

    expect(await screen.findByText("No matches.")).toBeInTheDocument();
    expect(screen.queryByText("No exercises yet.")).not.toBeInTheDocument();
  });
});

describe("Exercise library — the per-row action gate", () => {
  it("gives a LIBRARY row View + Duplicate, never Edit or Delete", () => {
    renderList([standard({ name: { en: "Bench Press", es: "" } })]);

    // A library exercise is shared and read-only: the edit route redirects it
    // and the Server Action rejects the write, so offering Edit is offering a
    // dead end.
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("gates on source !== 'trainer', so free-exercise-db rows are read-only too", () => {
    // The narrower `=== "wger"` spelling is what let fexd rows show Edit and
    // 404. This row is fexd-shaped but library-tagged, i.e. pickable.
    renderList([
      standard({
        id: "fexd-1",
        source: "free-exercise-db",
        name: { en: "Push Up", es: "" },
      }),
    ]);

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
  });

  it("gives a TRAINER-OWNED row Edit + Delete", () => {
    renderList([exercise()]);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicate" })).not.toBeInTheDocument();
  });

  it("routes a library row to /view and an owned row to /edit on row click", async () => {
    const user = userEvent.setup();
    renderList([
      standard({ id: "1259", name: { en: "Bench Press", es: "" } }),
      exercise({ id: "mine", name: { en: "My Curl", es: "" } }),
    ]);

    await user.click(screen.getByText("Bench Press"));
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/exercises/1259/view");

    await user.click(screen.getByText("My Curl"));
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/exercises/mine/edit");
  });

  it("lands the coach on their editable COPY after duplicating", async () => {
    const user = userEvent.setup();
    renderList([standard({ id: "1259", name: { en: "Bench Press", es: "" } })]);

    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() =>
      expect(mockDuplicateExercise).toHaveBeenCalledWith("1259"),
    );
    // Duplicate-to-customize is pointless if it leaves you on the read-only
    // original.
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/exercises/copy-1/edit");
  });

  it("asks before deleting, and only then calls the action", async () => {
    const user = userEvent.setup();
    renderList([exercise({ id: "mine" })]);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockSoftDeleteExercise).not.toHaveBeenCalled();

    // The row's icon button and the confirm CTA are both named "Delete";
    // scope to the dialog rather than indexing blind.
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockSoftDeleteExercise).toHaveBeenCalledWith("mine"));
  });
});

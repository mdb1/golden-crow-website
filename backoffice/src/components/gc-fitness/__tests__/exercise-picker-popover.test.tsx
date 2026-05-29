/**
 * @jest-environment jsdom
 */

// exercise-picker-popover.test.tsx (Phase 24-06 Task 3)
//
// 5 component smoke tests for the new filter-chip UI added in Plan 24-06:
//   1. Renders 4 chip categories (muscle / equipment / level / mechanic).
//   2. Toggling a muscle chip narrows the visible item list.
//   3. Single-select level chip is exclusive (re-select replaces).
//   4. <Image> elements in CommandItems carry `loading="lazy"` (Pitfall 9).
//   5. Codex MEDIUM render-window cap — 250 rows render only 100 + an
//      indicator row reading "+ 150 more — refine filter".
//
// The picker already has bilingual-search / preview-source-resolution
// tests in `src/lib/gc-fitness/__tests__/exercise-picker-popover.test.tsx`
// (legacy location from 260522-mo2). This file lives next to the SUT in
// `components/gc-fitness/__tests__/` per the Phase 24 plan + the
// `workout-assignment-delete-dialog.test.tsx` analog.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — backoffice jest defaults
// to testEnvironment: node.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

// Mock useExercisesQuery so the component renders synchronously with our
// fixture rows. EXERCISES_QUERY_KEY is also exported now (260529 — the
// picker imports it to invalidate the one-shot feed after quick-create).
const mockUseExercisesQuery = jest.fn();
jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => mockUseExercisesQuery(),
  EXERCISES_QUERY_KEY: ["gc-fitness", "exercises"],
}));

// 260529 — the picker now calls useQueryClient() (to invalidate the
// one-shot exercises feed after quick-create). Stub it so the smoke tests
// don't need a real QueryClientProvider wrapper.
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// next/image expects a Next.js context — stub as plain <img> so we can
// assert on the `loading` attribute.
jest.mock("next/image", () => ({
  __esModule: true,
  default: function ImageStub(props: Record<string, unknown>) {
    const { src, alt = "", loading, ...rest } = props as {
      src: string;
      alt?: string;
      loading?: string;
    };
    return React.createElement("img", { src, alt, loading, ...rest });
  },
}));

import { ExercisePickerPopover } from "@/components/gc-fitness/exercise-picker-popover";
import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

function makeRow(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: overrides.id ?? "fexd-row",
    name: { en: "Test Exercise", es: "Ejercicio", ...(overrides.name ?? {}) },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    mediaURL: null,
    thumbnailURL: null,
    youtubeURL: null,
    source: "free-exercise-db",
    ownerId: null,
    version: 1,
    updatedAt: "2026-05-25T00:00:00.000Z",
    createdAt: "2026-05-25T00:00:00.000Z",
    deleted: false,
    deletedAt: null,
    mergedInto: null,
    imageUrl: null,
    endImageUrl: null,
    gifUrl: "https://example.com/preview.gif",
    instructions: null,
    deletedReason: null,
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    mechanic: "compound",
    level: "intermediate",
    category: "strength",
    force: "push",
    // `metric` became a required ExerciseRow field (Phase 26-02); the fixture
    // predated it. Default to "reps"; `...overrides` can still flip it.
    metric: "reps",
    ...overrides,
  };
}

function openPicker() {
  // The trigger button has role=combobox and an aria-label set from the
  // placeholder (mocked translation returns the dotted key).
  const trigger = screen.getByRole("combobox");
  fireEvent.click(trigger);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Case 1 — Renders the 4 chip categories above the search input.
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover filter chips (Task 3 Case 1)", () => {
  it("renders muscle, equipment, level, and mechanic chip categories", () => {
    mockUseExercisesQuery.mockReturnValue({
      data: [makeRow()],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(<ExercisePickerPopover value="" onChange={() => {}} />);
    openPicker();

    // Category labels — every chip group has a heading. We assert via
    // data-testid attached in the SUT to avoid coupling to translation
    // keys.
    expect(
      screen.getByTestId("exercise-picker-chip-group-muscles"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("exercise-picker-chip-group-equipment"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("exercise-picker-chip-group-level"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("exercise-picker-chip-group-mechanic"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Toggling a muscle chip narrows the visible items.
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover muscle chip filter (Task 3 Case 2)", () => {
  it("clicking a muscle chip narrows the visible item list", () => {
    const benchPress = makeRow({
      id: "bench",
      name: { en: "Bench Press", es: "Press de banca" },
      muscleGroups: ["chest"],
      primaryMuscles: ["chest"],
    });
    const squat = makeRow({
      id: "squat",
      name: { en: "Squat", es: "Sentadilla" },
      muscleGroups: ["legs"],
      primaryMuscles: ["quadriceps"],
    });
    const row3 = makeRow({
      id: "deadlift",
      name: { en: "Deadlift", es: "Peso muerto" },
      muscleGroups: ["back"],
      primaryMuscles: ["hamstrings"],
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [benchPress, squat, row3],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(<ExercisePickerPopover value="" onChange={() => {}} />);
    openPicker();

    // Pre-filter: all 3 rows visible.
    expect(screen.getByTestId("exercise-picker-row-bench")).toBeInTheDocument();
    expect(screen.getByTestId("exercise-picker-row-squat")).toBeInTheDocument();
    expect(
      screen.getByTestId("exercise-picker-row-deadlift"),
    ).toBeInTheDocument();

    // Click the chest chip.
    fireEvent.click(screen.getByTestId("exercise-picker-chip-muscles-chest"));

    // Post-filter: only bench remains.
    expect(screen.getByTestId("exercise-picker-row-bench")).toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-picker-row-squat"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-picker-row-deadlift"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Single-select level chip is exclusive.
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover level chip exclusivity (Task 3 Case 3)", () => {
  it("selecting a second level chip deselects the first", () => {
    const intermediate = makeRow({
      id: "int",
      name: { en: "Intermediate Exercise", es: "Ejercicio Intermedio" },
      level: "intermediate",
    });
    const beginner = makeRow({
      id: "beg",
      name: { en: "Beginner Exercise", es: "Ejercicio Principiante" },
      level: "beginner",
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [intermediate, beginner],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(<ExercisePickerPopover value="" onChange={() => {}} />);
    openPicker();

    // Select intermediate; only intermediate row visible.
    fireEvent.click(
      screen.getByTestId("exercise-picker-chip-level-intermediate"),
    );
    expect(screen.getByTestId("exercise-picker-row-int")).toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-picker-row-beg"),
    ).not.toBeInTheDocument();

    // Switch to beginner; intermediate row hidden, beginner row visible.
    fireEvent.click(
      screen.getByTestId("exercise-picker-chip-level-beginner"),
    );
    expect(screen.getByTestId("exercise-picker-row-beg")).toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-picker-row-int"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Pitfall 9 mitigation: <Image> elements lazy-load.
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover lazy GIFs (Task 3 Case 4)", () => {
  it("every <img> rendered inside the picker carries loading='lazy'", () => {
    const rows = [
      makeRow({ id: "a", gifUrl: "https://example.com/a.gif" }),
      makeRow({ id: "b", gifUrl: "https://example.com/b.gif" }),
      makeRow({ id: "c", gifUrl: "https://example.com/c.gif" }),
    ];
    mockUseExercisesQuery.mockReturnValue({
      data: rows,
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(<ExercisePickerPopover value="" onChange={() => {}} />);
    openPicker();

    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThanOrEqual(3);
    imgs.forEach((img) => {
      expect(img.getAttribute("loading")).toBe("lazy");
    });
  });
});

// ---------------------------------------------------------------------------
// Case 5 — Codex MEDIUM render-window cap. 250 rows -> 100 visible + 1
// indicator row "+ 150 more — refine filter".
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover render-window cap (Task 3 Case 5, Codex MEDIUM)", () => {
  it("renders exactly 100 rows + one '+ N more' indicator when > 100 results", () => {
    const rows: ExerciseRow[] = [];
    for (let i = 0; i < 250; i++) {
      rows.push(
        makeRow({
          id: `row-${i}`,
          name: { en: `Exercise ${i}`, es: `Ejercicio ${i}` },
        }),
      );
    }
    mockUseExercisesQuery.mockReturnValue({
      data: rows,
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(<ExercisePickerPopover value="" onChange={() => {}} />);
    openPicker();

    // The first 100 rows are present.
    expect(screen.getByTestId("exercise-picker-row-row-0")).toBeInTheDocument();
    expect(
      screen.getByTestId("exercise-picker-row-row-99"),
    ).toBeInTheDocument();
    // Row 100 and beyond are NOT rendered.
    expect(
      screen.queryByTestId("exercise-picker-row-row-100"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-picker-row-row-249"),
    ).not.toBeInTheDocument();
    // The overflow indicator IS rendered with the locked text shape.
    const overflow = screen.getByTestId("exercise-picker-overflow-indicator");
    expect(overflow).toBeInTheDocument();
    expect(overflow.textContent).toMatch(/\+\s*150\s*more/i);
    expect(overflow.textContent).toMatch(/refine\s*filter/i);

    // Sanity: total rendered exercise rows (data-testid prefix) is 100.
    const list = within(
      screen.getByTestId("exercise-picker-row-row-0").closest("[cmdk-list]") ||
        document.body,
    );
    void list;
    const allRows = document.querySelectorAll(
      '[data-testid^="exercise-picker-row-row-"]',
    );
    expect(allRows.length).toBe(100);
  });
});

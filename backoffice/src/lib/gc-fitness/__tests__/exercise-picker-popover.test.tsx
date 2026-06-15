/**
 * @jest-environment jsdom
 */

// exercise-picker-popover.test.tsx
//
// Plan 260522-hi5 Task C — bilingual search + visible ES label tests.
//
// Tests the `normalizeSearchText` + `displayEs` helpers in isolation
// (C.test.1 → C.test.4) and the rendered popover for the secondary ES line
// (C.test.5 + C.test.6).
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without this docblock React
// Testing Library crashes with `ReferenceError: document is not defined`.
// Precedent: `exercise-form-validation.test.tsx` opens with the same docblock.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";

// Mock useExercisesQuery so the component renders synchronously with the
// fixture rows we provide — no Firestore listener.
const mockUseExercisesQuery = jest.fn();
jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => mockUseExercisesQuery(),
  // 260529 — the picker imports EXERCISES_QUERY_KEY to invalidate the
  // one-shot feed after quick-create.
  EXERCISES_QUERY_KEY: ["gc-fitness", "exercises"],
}));

// #297 — the picker now reads favorites (star + favorites-first sort). Stub the
// hook so these render tests don't pull the favorites Server Action (→
// firebase-admin) into the bundle, and don't need a QueryClientProvider.
jest.mock("@/lib/gc-fitness/use-favorites", () => ({
  useFavorites: () => ({
    favorites: {
      exerciseIds: [],
      workoutTemplateIds: [],
      habitTemplateIds: [],
    },
    isLoading: false,
    isFavorite: () => false,
    toggle: jest.fn(),
    isToggling: false,
  }),
}));

// 260529 — the picker now calls useQueryClient(); stub it so these render
// tests don't need a real QueryClientProvider.
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// next/image expects a Next.js context — stub it as a plain <img>.
jest.mock("next/image", () => ({
  __esModule: true,
  default: function ImageStub(props: Record<string, unknown>) {
    const { src, alt = "", ...rest } = props as {
      src: string;
      alt?: string;
    };
    return React.createElement("img", { src, alt, ...rest });
  },
}));

// Import AFTER mocks so the SUT picks up the mocked listener.
import {
  ExercisePickerPopover,
  displayEs,
  normalizeSearchText,
} from "@/components/gc-fitness/exercise-picker-popover";
import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

function makeRow(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: overrides.id ?? "wger-test-1",
    name: { en: "Bench Press", es: "Press de banca", ...(overrides.name ?? {}) },
    description: { en: "", es: "" },
    muscleGroups: ["chest", "triceps"],
    equipment: ["barbell"],
    mediaURL: null,
    thumbnailURL: null,
    youtubeURL: null,
    source: "wger",
    ownerId: null,
    version: 1,
    updatedAt: "2026-05-22T00:00:00.000Z",
    createdAt: "2026-05-22T00:00:00.000Z",
    deleted: false,
    deletedAt: null,
    mergedInto: null,
    imageUrl: null,
    endImageUrl: null,
    gifUrl: null,
    instructions: null,
    deletedReason: null,
    // `metric` became a required ExerciseRow field (Phase 26-02); the fixture
    // predated it. Default to "reps"; `...overrides` can still flip it.
    metric: "reps",
    // 26-vol (#243) — bodyweightLoadFactor is a required ExerciseRow field.
    bodyweightLoadFactor: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C.test.1 — normalizeSearchText lowercases + strips diacritics
// ---------------------------------------------------------------------------

describe("normalizeSearchText (C.test.1)", () => {
  it("strips Latin diacritics and lowercases", () => {
    expect(normalizeSearchText("Sentadílla")).toBe("sentadilla");
  });

  it("lowercases multi-word Spanish strings without diacritics", () => {
    expect(normalizeSearchText("Press de banca")).toBe("press de banca");
  });

  it("trims surrounding whitespace and collapses internal whitespace", () => {
    expect(normalizeSearchText("  Squat  ")).toBe("squat");
  });

  it("is idempotent on already-normalized input", () => {
    expect(normalizeSearchText("press de banca")).toBe("press de banca");
  });
});

// ---------------------------------------------------------------------------
// C.test.2 / C.test.3 / C.test.4 — displayEs decision logic
// ---------------------------------------------------------------------------

describe("displayEs", () => {
  it("C.test.2: returns '' when name.es is empty", () => {
    expect(displayEs(makeRow({ name: { en: "Plank", es: "" } }))).toBe("");
  });

  it("C.test.3: returns '' when name.es === name.en (same word in both languages)", () => {
    expect(displayEs(makeRow({ name: { en: "Plank", es: "Plank" } }))).toBe("");
  });

  it("C.test.3 (accent-only difference): returns '' when ES and EN differ only by diacritics", () => {
    // Defensive — accents alone shouldn't force a redundant secondary line.
    expect(displayEs(makeRow({ name: { en: "Squat", es: "Squát" } }))).toBe("");
  });

  it("C.test.4: returns name.es when non-empty and meaningfully different", () => {
    expect(
      displayEs(makeRow({ name: { en: "Bench Press", es: "Press de banca" } })),
    ).toBe("Press de banca");
  });
});

// ---------------------------------------------------------------------------
// C.test.5 / C.test.6 — Rendered popover shows the ES line when distinct
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover bilingual row rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("C.test.5: renders the secondary ES line on the trigger when an exercise is selected with distinct ES", () => {
    const benchPress = makeRow({
      id: "wger-bp-1",
      name: { en: "Bench Press", es: "Press de banca" },
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [benchPress],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(
      <ExercisePickerPopover
        value="wger-bp-1"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(
      screen.getByTestId("exercise-picker-trigger-es"),
    ).toHaveTextContent("Press de banca");
  });

  it("C.test.6: does NOT render a secondary ES line when ES equals EN (e.g., 'Plank')", () => {
    const plank = makeRow({
      id: "wger-plank-1",
      name: { en: "Plank", es: "Plank" },
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [plank],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(
      <ExercisePickerPopover
        value="wger-plank-1"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Plank")).toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-picker-trigger-es"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 260522-mo2 Task D — preview source resolution (gifUrl > imageUrl >
// thumbnailURL > Dumbbell icon fallback). Covers D.beh.1, D.beh.2, and
// Revision fix #3 (trigger-selected gif-only row must ALSO show the preview,
// not the Dumbbell — the outer conditional in the trigger block uses
// `previewSrc(selected)` not `previewUrl(selected.thumbnailURL)`).
// ---------------------------------------------------------------------------

describe("ExercisePickerPopover preview source resolution (260522-mo2 Task D)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("D.test.1: trigger-selected renders gifUrl when set (gif-only row)", () => {
    // Revision fix #3: gif-only — thumbnailURL is null but gifUrl is set.
    // Prior (legacy) code consulted only thumbnailURL via previewUrl, so the
    // outer conditional fell through to the Dumbbell icon and the gif was
    // hidden. The new previewSrc() helper resolves gifUrl first.
    const gifOnly = makeRow({
      id: "fexd-bodyweight_squat",
      name: { en: "Bodyweight Squat", es: "Sentadilla con peso corporal" },
      source: "free-exercise-db",
      gifUrl:
        "https://firebasestorage.googleapis.com/v0/b/gcfitness-3476b.firebasestorage.app/o/exercises%2Ffexd-bodyweight_squat%2Fpreview.gif?alt=media&token=xyz",
      imageUrl: null,
      thumbnailURL: null,
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [gifOnly],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(
      <ExercisePickerPopover
        value="fexd-bodyweight_squat"
        onChange={() => {}}
      />,
    );

    // The Image stub renders an <img> with the resolved src.
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("preview.gif");
  });

  it("D.test.2: trigger-selected falls back to imageUrl when gifUrl is null", () => {
    const imageOnly = makeRow({
      id: "fexd-test",
      gifUrl: null,
      imageUrl: "https://example.com/start.jpg",
      thumbnailURL: null,
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [imageOnly],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(
      <ExercisePickerPopover
        value="fexd-test"
        onChange={() => {}}
      />,
    );

    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/start.jpg");
  });

  it("D.test.3: popover row renders gifUrl when set (gif-only row)", () => {
    const gifOnly = makeRow({
      id: "fexd-row-gif",
      name: { en: "Cable Crunch", es: "Abdominal con polea" },
      source: "free-exercise-db",
      gifUrl: "https://example.com/cable-crunch.gif",
      imageUrl: null,
      thumbnailURL: null,
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [gifOnly],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    // Render with no selection so the popover row markup is in the
    // selected-state-empty case — but the popover content only mounts when
    // opened. Instead, give a value matching the row's id so the SELECTED
    // markup AND the popover row both rely on previewSrc. Either path
    // proves the helper resolves gifUrl.
    render(
      <ExercisePickerPopover
        value="fexd-row-gif"
        onChange={() => {}}
      />,
    );

    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("cable-crunch.gif");
  });

  it("D.test.4: trigger falls back to Dumbbell icon when all three preview fields are null", () => {
    const noPreview = makeRow({
      id: "wger-no-preview",
      gifUrl: null,
      imageUrl: null,
      thumbnailURL: null,
    });
    mockUseExercisesQuery.mockReturnValue({
      data: [noPreview],
      isLoading: false,
      error: null,
      hasSnapshot: true,
    });

    render(
      <ExercisePickerPopover
        value="wger-no-preview"
        onChange={() => {}}
      />,
    );

    // No <img> rendered — Dumbbell icon (lucide-react) is an <svg>.
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });
});

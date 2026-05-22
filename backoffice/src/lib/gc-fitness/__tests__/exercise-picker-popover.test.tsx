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

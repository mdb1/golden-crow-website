/**
 * @jest-environment jsdom
 */

// templates-pending-draft.test.tsx (#1089)
//
// The ticket: "cuando volví a entrar, no estaban los cambios que había hecho".
//
// The autosave was already there — `template-form.tsx` writes the whole form to
// `gc-fitness:template-draft:edit:<id>` and restores it when that editor mounts
// again. What was missing is that NOTHING outside that one editor knew the
// draft existed. Only the `…:new` key was surfaced (as a virtual row); an edit
// draft was invisible, so "I lost my changes" and "my changes are sitting in
// localStorage, one click away" looked exactly the same from the list.
//
// These tests pin the marker on the list row, and pin the two things that
// would quietly break it: the key prefix (it is shared with the form, by
// convention, not by import) and the "only the row that has one" part.
//
// The FIRST THREE LINES must stay the jsdom docblock — backoffice jest
// defaults to testEnvironment: node.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";

import { TemplatesLibraryClient } from "@/app/gc-fitness/templates/client";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseWorkoutTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => mockUseWorkoutTemplates(),
  WORKOUT_TEMPLATES_BASE_KEY: ["workout-templates"],
}));

jest.mock("@/lib/gc-fitness/use-favorites", () => ({
  useFavorites: () => ({ favorites: [], toggle: jest.fn() }),
}));

jest.mock("@/lib/gc-fitness/library-usage-listeners", () => ({
  useTemplateAssignmentCounts: () => ({ data: {} }),
}));

jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  duplicateWorkoutTemplate: jest.fn(),
  softDeleteWorkoutTemplate: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/gc-fitness/favorite-star-button", () => ({
  FavoriteStarButton: () => null,
}));

jest.mock("@/app/gc-fitness/templates/_components/TemplateAssignmentsView", () => ({
  TemplateAssignmentsView: () => null,
}));

const TRAINER = "trainer-9";
// Same string template-form.tsx builds its storage key from. Duplicated here
// on purpose: if the form ever changes its prefix, THIS is the test that goes
// red instead of the badge silently never appearing again.
const DRAFT_PREFIX = "gc-fitness:template-draft:";

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    name: { en: "Full Body A", es: "Cuerpo Completo A" },
    description: { en: "", es: "" },
    trainerId: TRAINER,
    isStandard: false,
    tags: [],
    tag: null,
    exercises: [],
    exerciseCount: 4,
    updatedAt: null,
    ...overrides,
  };
}

function renderLibrary(rows: Array<Record<string, unknown>>) {
  mockUseWorkoutTemplates.mockReturnValue({
    data: rows,
    isLoading: false,
    error: null,
  });
  render(<TemplatesLibraryClient trainerUid={TRAINER} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("Templates library surfaces pending EDIT drafts (#1089)", () => {
  it("marks the row whose editor has unsaved work parked in this browser", async () => {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}edit:mine-1`,
      JSON.stringify({ name: { en: "My Push", es: "Mi Empuje" } }),
    );

    renderLibrary([
      template({ id: "mine-1", name: { en: "My Push", es: "Mi Empuje" } }),
    ]);

    expect(
      await screen.findByTestId("template-pending-draft-mine-1"),
    ).toBeInTheDocument();
  });

  it("marks only the row that has a draft", async () => {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}edit:mine-1`,
      JSON.stringify({ name: { en: "My Push", es: "Mi Empuje" } }),
    );

    renderLibrary([
      template({ id: "mine-1", name: { en: "My Push", es: "Mi Empuje" } }),
      template({ id: "mine-2", name: { en: "My Pull", es: "Mi Tirón" } }),
    ]);

    expect(
      await screen.findByTestId("template-pending-draft-mine-1"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("template-pending-draft-mine-2"),
    ).not.toBeInTheDocument();
  });

  it("shows nothing when there is no draft", async () => {
    renderLibrary([
      template({ id: "mine-1", name: { en: "My Push", es: "Mi Empuje" } }),
    ]);

    expect(await screen.findByText("My Push")).toBeInTheDocument();
    expect(
      screen.queryByTestId("template-pending-draft-mine-1"),
    ).not.toBeInTheDocument();
  });

  it("ignores the `new` draft key when marking existing rows", async () => {
    // The create-surface draft is a different thing entirely — it renders as
    // its own virtual row. A prefix check that forgot the `edit:` segment
    // would tag a template whose id happened to be "new".
    window.localStorage.setItem(
      `${DRAFT_PREFIX}new`,
      JSON.stringify({ name: { en: "", es: "" }, exercises: [] }),
    );

    renderLibrary([
      template({ id: "new", name: { en: "My Push", es: "Mi Empuje" } }),
    ]);

    expect(
      screen.queryByTestId("template-pending-draft-new"),
    ).not.toBeInTheDocument();
  });
});

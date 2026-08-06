/**
 * @jest-environment jsdom
 */

// templates-standard-routing.test.tsx
//
// The #163 invariant, which had no coverage: a STANDARD (shared-library)
// template must open the read-only `/view` page, never `/edit`.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// WHY IT MATTERS, from the source comment on the handler itself: "/edit on a
// non-owned standard template would auto-fork and silently create duplicates."
// The trainer forks explicitly from the view page instead. This shipped as a
// real bug once; the failure mode is invisible at the click — the editor opens
// and looks right, and the library quietly grows a copy every time somebody
// opens a standard template.
//
// There IS a server-side redirect in `/edit/page.tsx` as a second line of
// defense, but relying on it means every mis-route costs a page load and an
// extra Firestore read, and the redirect only covers the not-owned case. The
// list must not send the trainer there in the first place.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const mockDuplicate = jest.fn();
jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  duplicateWorkoutTemplate: (...args: unknown[]) => mockDuplicate(...args),
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
});

describe("Templates library — standard templates never open /edit (#163)", () => {
  it("routes a STANDARD template row to /view", async () => {
    const user = userEvent.setup();
    renderLibrary([
      template({
        id: "std-1",
        name: { en: "Standard Push", es: "Empuje Estándar" },
        isStandard: true,
        trainerId: "__standard__",
      }),
    ]);

    await user.click(await screen.findByText("Standard Push"));

    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/templates/std-1/view");
    // The whole point of #163 — /edit auto-forks and duplicates silently.
    expect(mockPush).not.toHaveBeenCalledWith(
      "/gc-fitness/templates/std-1/edit",
    );
  });

  it("routes a TRAINER-OWNED template row to /edit", async () => {
    const user = userEvent.setup();
    renderLibrary([
      template({ id: "mine-1", name: { en: "My Push", es: "Mi Empuje" } }),
    ]);

    await user.click(await screen.findByText("My Push"));

    // The counter-case matters as much: over-correcting to always-/view would
    // make a trainer's own templates read-only.
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/templates/mine-1/edit");
  });

  it("keeps the two apart when both are on screen together", async () => {
    const user = userEvent.setup();
    renderLibrary([
      template({
        id: "std-1",
        name: { en: "Standard Push", es: "Empuje Estándar" },
        isStandard: true,
        trainerId: "__standard__",
      }),
      template({ id: "mine-1", name: { en: "My Push", es: "Mi Empuje" } }),
    ]);

    await user.click(await screen.findByText("Standard Push"));
    await user.click(await screen.findByText("My Push"));

    expect(mockPush).toHaveBeenNthCalledWith(
      1,
      "/gc-fitness/templates/std-1/view",
    );
    expect(mockPush).toHaveBeenNthCalledWith(
      2,
      "/gc-fitness/templates/mine-1/edit",
    );
  });

  it("routes standard rows to /view on keyboard activation too", async () => {
    const user = userEvent.setup();
    renderLibrary([
      template({
        id: "std-1",
        name: { en: "Standard Push", es: "Empuje Estándar" },
        isStandard: true,
        trainerId: "__standard__",
      }),
    ]);

    // The row is a `role="button"` div with its own onKeyDown branch — a second
    // copy of the same decision, so it can (and did) drift from the click path.
    const row = (await screen.findByText("Standard Push")).closest(
      '[role="button"]',
    ) as HTMLElement;
    row.focus();
    await user.keyboard("{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/templates/std-1/view");
    expect(mockPush).not.toHaveBeenCalledWith(
      "/gc-fitness/templates/std-1/edit",
    );
  });
});

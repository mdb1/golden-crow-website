/**
 * @jest-environment jsdom
 */

// nutrition-library-client.test.tsx
//
// The Biblioteca's Nutrición tab (#918). The FIRST THREE LINES must stay as the
// `@jest-environment jsdom` docblock — the backoffice jest config defaults to
// `testEnvironment: "node"`, and without it RTL crashes with `document is not defined`.
//
// What this surface can get wrong in a way nothing else catches:
//
//   • **A STANDARD row offering "Editar".** The action would refuse it, so the damage is
//     not a bad write — it is a coach who believes they customized something global and
//     finds out weeks later. #163 is the receipt, on standard workout templates.
//   • **The usage pill.** It is the ONLY thing telling a coach that editing this meal will
//     not reach the 9 plans that already carry a copy. A pill that reads 0 when it should
//     read 9 is worse than no pill: it actively reassures.
//   • **The payload the dialog builds.** Per the repo convention: assert the object handed
//     to the action, not the pixels — the screen renders from the same in-memory state that
//     produced the write, so a screen assertion passes with the wire shape wrong.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type {
  NutritionMealRow,
  NutritionTemplateRow,
} from "@/lib/gc-fitness/nutrition-library-model";

const mockListMeals = jest.fn();
const mockListTemplates = jest.fn();
const mockUsage = jest.fn();
const mockCreateMeal = jest.fn().mockResolvedValue({ id: "new" });
const mockUpdateMeal = jest.fn().mockResolvedValue({ ok: true });
const mockDuplicateMeal = jest.fn().mockResolvedValue({ id: "copy" });
const mockSoftDeleteMeal = jest.fn().mockResolvedValue({ ok: true });

jest.mock("@/lib/gc-fitness/nutrition-library-actions", () => ({
  listNutritionMeals: () => mockListMeals(),
  listNutritionTemplates: () => mockListTemplates(),
  countNutritionLibraryUsage: () => mockUsage(),
  createNutritionMeal: (payload: unknown) => mockCreateMeal(payload),
  updateNutritionMeal: (id: string, payload: unknown) => mockUpdateMeal(id, payload),
  duplicateNutritionMeal: (id: string) => mockDuplicateMeal(id),
  softDeleteNutritionMeal: (id: string) => mockSoftDeleteMeal(id),
  createNutritionTemplate: jest.fn(),
  updateNutritionTemplate: jest.fn(),
  duplicateNutritionTemplate: jest.fn(),
  softDeleteNutritionTemplate: jest.fn(),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// The bulk-assign dialog (#927) is mounted from this tab. It is exercised in its own
// suite; here it only has to not reach a Server Action on mount.
jest.mock("@/lib/gc-fitness/nutrition-bulk-actions", () => ({
  listNutritionBulkClients: jest.fn().mockResolvedValue([]),
  previewNutritionBulkAssign: jest.fn().mockResolvedValue({ rows: [], summary: null }),
  assignNutritionTemplateToClients: jest.fn(),
}));

import { NutritionLibraryQueryProvider } from "../_nutrition/providers";
import { NutritionLibraryClient } from "../_nutrition/NutritionLibraryClient";

const OWN_MEAL: NutritionMealRow = {
  id: "meal-own",
  name: { en: "Chicken and rice", es: "Pollo y arroz" },
  moment: "lunch",
  ownerId: "trainer-1",
  targets: { kcal: 780, proteinG: 55 },
  options: [{ id: "opt-1", text: { en: "Hake", es: "Merluza" } }],
  deleted: false,
};

const STANDARD_MEAL: NutritionMealRow = {
  id: "meal-std",
  name: { en: "Oats + eggs", es: "Avena + huevos" },
  moment: "breakfast",
  // `ownerId: null` IS the standard library.
  ownerId: null,
  targets: { kcal: 520 },
  options: [],
  deleted: false,
};

const TEMPLATE: NutritionTemplateRow = {
  id: "tpl-1",
  name: { en: "Cut", es: "Definición" },
  ownerId: "trainer-1",
  targets: { kcal: 2000 },
  meals: [
    {
      mealId: "meal-own",
      name: { en: "Chicken and rice", es: "Pollo y arroz" },
      moment: "lunch",
      targets: { kcal: 780 },
      options: [],
      order: 0,
    },
  ],
  deleted: false,
};

function renderLibrary() {
  return render(
    <NutritionLibraryQueryProvider>
      <NutritionLibraryClient defaultStartsOn="2026-09-01" />
    </NutritionLibraryQueryProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListMeals.mockResolvedValue([OWN_MEAL, STANDARD_MEAL]);
  mockListTemplates.mockResolvedValue([TEMPLATE]);
  mockUsage.mockResolvedValue({
    mealsInTemplates: { "meal-own": 2 },
    mealsInPlans: { "meal-own": 9 },
    templatesInPlans: { "tpl-1": 4 },
  });
});

describe("the meal list", () => {
  it("shows the usage counts — the warning that an edit will NOT reach those plans", async () => {
    renderLibrary();

    const row = await screen.findByTestId("nutrition-meal-row-meal-own");
    // The EN catalog is what the next-intl stub resolves against.
    expect(within(row).getByText("in 2 plans")).toBeInTheDocument();
    expect(within(row).getByText("assigned 9 times")).toBeInTheDocument();
  });

  it("hides a zero count instead of drawing it", async () => {
    // A row full of "0" badges is how a coach learns to stop reading the badges that matter.
    renderLibrary();

    const row = await screen.findByTestId("nutrition-meal-row-meal-std");
    expect(within(row).queryByText(/in 0 plans/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/assigned 0 times/)).not.toBeInTheDocument();
  });

  it("offers a STANDARD row only Duplicar — no edit, no delete", async () => {
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-std");

    expect(screen.queryByTestId("nutrition-meal-meal-std-edit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-meal-meal-std-delete")).not.toBeInTheDocument();
    expect(screen.getByTestId("nutrition-meal-meal-std-duplicate")).toBeInTheDocument();
  });

  it("offers the coach's OWN row all three actions", async () => {
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-own");

    expect(screen.getByTestId("nutrition-meal-meal-own-edit")).toBeInTheDocument();
    expect(screen.getByTestId("nutrition-meal-meal-own-duplicate")).toBeInTheDocument();
    expect(screen.getByTestId("nutrition-meal-meal-own-delete")).toBeInTheDocument();
  });

  it("duplicating a standard meal calls the action with ITS id", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-std");

    await user.click(screen.getByTestId("nutrition-meal-meal-std-duplicate"));

    await waitFor(() => expect(mockDuplicateMeal).toHaveBeenCalledWith("meal-std"));
  });
});

describe("the meal editor", () => {
  it("builds a payload with both language slots filled from ONE typed name", async () => {
    // "No translation" must not mean "blank in English" — that is how a client with an
    // English phone ends up staring at an empty row.
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-own");

    await user.click(screen.getByTestId("nutrition-library-create"));
    await user.type(screen.getByTestId("nutrition-meal-name"), "Merienda");
    await user.type(screen.getByTestId("nutrition-meal-macro-kcal"), "320");
    await user.click(screen.getByTestId("nutrition-meal-save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledTimes(1));
    expect(mockCreateMeal.mock.calls[0]![0]).toMatchObject({
      name: { es: "Merienda", en: "Merienda" },
      targets: { kcal: 320, proteinG: null, carbsG: null, fatG: null },
    });
  });

  it("sends a blank macro as null, never as 0", async () => {
    // A zero target is a statement the coach never made; every surface renders a missing
    // macro as "—".
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-own");

    await user.click(screen.getByTestId("nutrition-library-create"));
    await user.type(screen.getByTestId("nutrition-meal-name"), "Merienda");
    await user.click(screen.getByTestId("nutrition-meal-save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledTimes(1));
    const payload = mockCreateMeal.mock.calls[0]![0] as {
      targets: Record<string, unknown>;
    };
    expect(payload.targets.kcal).toBeNull();
    expect(payload.targets.proteinG).toBeNull();
  });

  it("does not write at all when the name is blank", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-own");

    await user.click(screen.getByTestId("nutrition-library-create"));
    await user.click(screen.getByTestId("nutrition-meal-save"));

    expect(mockCreateMeal).not.toHaveBeenCalled();
    // And the dialog stays open, rather than discarding what was typed.
    expect(screen.getByTestId("nutrition-meal-dialog")).toBeInTheDocument();
  });

  it("editing an existing meal keeps its OPTION ids", async () => {
    // The option is what the ⓘ sheet lists; regenerating ids on every save would make any
    // per-option reference dangling.
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-own");

    await user.click(screen.getByTestId("nutrition-meal-meal-own-edit"));
    await user.click(screen.getByTestId("nutrition-meal-save"));

    await waitFor(() => expect(mockUpdateMeal).toHaveBeenCalledTimes(1));
    const [id, payload] = mockUpdateMeal.mock.calls[0]!;
    expect(id).toBe("meal-own");
    expect((payload as { options: Array<{ id?: string }> }).options[0]!.id).toBe("opt-1");
  });
});

describe("the template list", () => {
  it("counts how many plans came from each template", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("nutrition-meal-row-meal-own");

    await user.click(screen.getByRole("button", { name: /Plans/ }));

    const row = await screen.findByTestId("nutrition-template-row-tpl-1");
    expect(within(row).getByText("assigned 4 times")).toBeInTheDocument();
  });
});

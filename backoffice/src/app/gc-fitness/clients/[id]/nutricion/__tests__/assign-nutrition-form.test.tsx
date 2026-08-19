/**
 * @jest-environment jsdom
 */

// assign-nutrition-form.test.tsx — coach-portal UI test for the nutrition assign screen
// (#914, catalog #306).
//
// Asserts the PAYLOAD the form hands to `assignNutritionPlan`, not the pixels. The screen
// renders from the same in-memory state that produced the write, so a screen assertion can
// pass with the wire shape wrong — and the wire shape is what three apps read.

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const assignNutritionPlan = jest.fn().mockResolvedValue({ id: "nut-1", applied: [] });
const previewNutritionAssign = jest.fn().mockResolvedValue([]);
const routerPush = jest.fn();

jest.mock("@/lib/gc-fitness/nutrition-actions", () => ({
  assignNutritionPlan: (input: unknown) => assignNutritionPlan(input),
  previewNutritionAssign: (input: unknown) => previewNutritionAssign(input),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: jest.fn() }),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { AssignNutritionForm } from "../asignar/AssignNutritionForm";

function renderForm() {
  return render(
    <AssignNutritionForm clientId="client-sofia" defaultStartsOn="2026-09-01" />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  previewNutritionAssign.mockResolvedValue([]);
});

describe("AssignNutritionForm", () => {
  it("submits a phase with an explicit endsOn and the macros the coach typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Phase name"), "Definición");
    await user.type(screen.getByLabelText("To"), "2026-09-30");
    // "Calories" labels a field on the daily-targets card AND on every meal card, so the
    // query has to say which one it means — the same ambiguity a screen reader hits.
    const daily = within(screen.getByTestId("nutrition-daily-targets"));
    await user.type(daily.getByLabelText("Calories"), "2000");
    await user.type(daily.getByLabelText("Protein"), "170");
    await user.type(screen.getByLabelText("Name"), "Desayuno");

    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(assignNutritionPlan).toHaveBeenCalledTimes(1));
    const payload = assignNutritionPlan.mock.calls[0]![0] as Record<string, never>;
    expect(payload).toMatchObject({
      clientId: "client-sofia",
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
      targets: { kcal: 2000, proteinG: 170, carbsG: null, fatG: null },
    });
    // Both languages carry the coach's text while the translation pane is collapsed —
    // "no translation" must not mean "blank in English", because the schema requires both
    // and an English-locale client would see an empty name.
    expect(payload.name).toEqual({ es: "Definición", en: "Definición" });
  });

  it("sends endsOn: null — not an omitted key — when the phase is open-ended", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Phase name"), "Mi plan");
    await user.type(screen.getByLabelText("Name"), "Desayuno");
    await user.click(screen.getByTestId("nutrition-open-ended"));

    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(assignNutritionPlan).toHaveBeenCalledTimes(1));
    const payload = assignNutritionPlan.mock.calls[0]![0] as { endsOn: unknown };
    // #400 in the UI layer: Firestore cannot match a field that is not there, and
    // open-ended is the common case.
    expect(Object.prototype.hasOwnProperty.call(payload, "endsOn")).toBe(true);
    expect(payload.endsOn).toBeNull();
  });

  it("leaves a blank macro as null rather than turning it into a zero target", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Phase name"), "Definición");
    await user.type(screen.getByLabelText("Name"), "Desayuno");
    await user.type(
      within(screen.getByTestId("nutrition-daily-targets")).getByLabelText("Calories"),
      "2000",
    );

    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(assignNutritionPlan).toHaveBeenCalledTimes(1));
    const payload = assignNutritionPlan.mock.calls[0]![0] as {
      targets: Record<string, unknown>;
    };
    // A coach who set only calories did not set a zero protein target. Writing 0 would be
    // the app putting words in their mouth, and the client's screen would show "0 g".
    expect(payload.targets.proteinG).toBeNull();
    expect(payload.targets.kcal).toBe(2000);
  });

  it("shows the overlap warning the save is about to apply", async () => {
    previewNutritionAssign.mockResolvedValue([
      { planId: "plan-a", planName: "Mantenimiento", kind: "trim", date: "2026-08-31" },
    ]);
    renderForm();

    // The warning is a rendering of the planner's own edits, not a sentence written next
    // to it — that is what stops it drifting from what the write does.
    await screen.findByTestId("nutrition-overlap-notice");
    expect(
      screen.getByText(/“Mantenimiento” is trimmed to 2026-08-31/),
    ).toBeInTheDocument();
  });

  it("says so explicitly when nothing overlaps", async () => {
    renderForm();
    // The absence of a warning is ambiguous: it reads the same as a warning that failed to
    // load. So the no-overlap case gets its own sentence.
    await screen.findByTestId("nutrition-overlap-none");
  });

  it("refuses to submit a phase with no meal name and never calls the action", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Phase name"), "Definición");
    await user.click(screen.getByTestId("nutrition-save"));

    await screen.findByTestId("nutrition-form-error");
    expect(assignNutritionPlan).not.toHaveBeenCalled();
  });

  it("adds a meal and keeps both in the payload, in order", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Phase name"), "Definición");
    await user.type(screen.getByLabelText("Name"), "Desayuno");
    await user.click(screen.getByTestId("add-meal"));

    const nameFields = screen.getAllByLabelText("Name");
    await user.type(nameFields[1]!, "Cena");

    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(assignNutritionPlan).toHaveBeenCalledTimes(1));
    const payload = assignNutritionPlan.mock.calls[0]![0] as {
      meals: Array<{ name: { es: string } }>;
    };
    expect(payload.meals.map((meal) => meal.name.es)).toEqual(["Desayuno", "Cena"]);
  });
});

// ── #918 — assigning FROM a library template ──────────────────────────────────────────
//
// The template is a starting point, not a link: the plan takes a COPY and keeps
// `templateId` for provenance (that is the field the library's "assigned N times" pill
// counts). What the coach retouches afterwards is marked by a DIFF against the template,
// not by a dirty flag — typing a value and typing the original back is not a modification.

const TEMPLATE = {
  id: "tpl-cut",
  name: { en: "Cut", es: "Definición" },
  ownerId: "trainer-1",
  targets: { kcal: 2000, proteinG: 170 },
  meals: [
    {
      mealId: "meal-breakfast",
      name: { en: "Breakfast", es: "Desayuno" },
      moment: "breakfast" as const,
      targets: { kcal: 450 },
      options: [{ id: "opt-1", text: { en: "Oats", es: "Avena" } }],
      order: 0,
    },
    {
      mealId: "meal-lunch",
      name: { en: "Lunch", es: "Almuerzo" },
      moment: "lunch" as const,
      targets: { kcal: 700 },
      options: [],
      order: 1,
    },
  ],
  deleted: false,
};

function renderWithTemplate() {
  return render(
    <AssignNutritionForm
      clientId="client-sofia"
      defaultStartsOn="2026-09-01"
      templates={[TEMPLATE]}
    />,
  );
}

describe("AssignNutritionForm — from a template (#918)", () => {
  it("does not offer the picker when the coach has no templates", () => {
    render(
      <AssignNutritionForm clientId="client-sofia" defaultStartsOn="2026-09-01" />,
    );
    expect(screen.queryByTestId("nutrition-template-picker")).not.toBeInTheDocument();
  });

  it("copies the template into the payload and keeps templateId + mealIds", async () => {
    const user = userEvent.setup();
    renderWithTemplate();

    await user.click(screen.getByTestId("nutrition-template-select"));
    await user.click(await screen.findByRole("option", { name: "Definición" }));

    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(assignNutritionPlan).toHaveBeenCalledTimes(1));
    const payload = assignNutritionPlan.mock.calls[0]![0] as {
      templateId: string | null;
      targets: Record<string, unknown>;
      meals: Array<{ mealId?: string; name: { es: string } }>;
    };

    // Provenance — the library's "asignada N veces" pill counts exactly this field.
    expect(payload.templateId).toBe("tpl-cut");
    expect(payload.targets).toMatchObject({ kcal: 2000, proteinG: 170 });
    // ⚠️ The mealIds SURVIVE into the plan: the daily log keys its `meals` map by them, and
    // the meal usage pill counts by them too.
    expect(payload.meals.map((meal) => meal.mealId)).toEqual([
      "meal-breakfast",
      "meal-lunch",
    ]);
    expect(payload.meals.map((meal) => meal.name.es)).toEqual(["Desayuno", "Almuerzo"]);
  });

  it("marks the daily target as retouched only once it actually differs", async () => {
    const user = userEvent.setup();
    renderWithTemplate();

    await user.click(screen.getByTestId("nutrition-template-select"));
    await user.click(await screen.findByRole("option", { name: "Definición" }));

    // Straight from the template: nothing is retouched.
    expect(screen.queryByTestId("nutrition-deviation-daily")).not.toBeInTheDocument();

    const daily = within(screen.getByTestId("nutrition-daily-targets"));
    const kcal = daily.getByLabelText("Calories");
    await user.clear(kcal);
    await user.type(kcal, "1800");

    expect(await screen.findByTestId("nutrition-deviation-daily")).toBeInTheDocument();

    // Typed back to the template's value ⇒ NOT a modification. A dirty flag would keep
    // claiming it was, and the mark would be a lie the coach cannot clear.
    await user.clear(kcal);
    await user.type(kcal, "2000");
    await waitFor(() =>
      expect(screen.queryByTestId("nutrition-deviation-daily")).not.toBeInTheDocument(),
    );
  });

  it("marks the retouched MEAL, and only that one", async () => {
    const user = userEvent.setup();
    renderWithTemplate();

    await user.click(screen.getByTestId("nutrition-template-select"));
    await user.click(await screen.findByRole("option", { name: "Definición" }));

    const meals = within(screen.getByTestId("nutrition-meals"));
    const lunchKcal = meals.getAllByLabelText("Calories")[1]!;
    await user.clear(lunchKcal);
    await user.type(lunchKcal, "650");

    expect(await screen.findByTestId("nutrition-deviation-meal-1")).toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-deviation-meal-0")).not.toBeInTheDocument();
  });
});

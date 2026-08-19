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
const updateNutritionPlan = jest.fn().mockResolvedValue({ applied: [] });
const routerPush = jest.fn();

jest.mock("@/lib/gc-fitness/nutrition-actions", () => ({
  assignNutritionPlan: (input: unknown) => assignNutritionPlan(input),
  previewNutritionAssign: (input: unknown) => previewNutritionAssign(input),
  updateNutritionPlan: (planId: string, input: unknown) =>
    updateNutritionPlan(planId, input),
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
    await user.type(daily.getByLabelText(/^Protein/), "170");
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

// ── #949 — the kcal hint and the phase editor ────────────────────────────────────────

/** A phase in force since the 1st, as the editor receives it. */
function currentPhase() {
  return {
    id: "nut-current",
    clientId: "client-sofia",
    trainerId: "coach-1",
    source: "coach" as const,
    name: { es: "Definición", en: "Cut" },
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    targets: { kcal: 2000, proteinG: 90, carbsG: 280, fatG: 50 },
    meals: [
      {
        mealId: "meal-breakfast",
        name: { es: "Desayuno", en: "Breakfast" },
        moment: "breakfast" as const,
        targets: { kcal: 400, proteinG: 30, carbsG: null, fatG: null },
        options: [
          { id: "opt-a", text: { es: "Una banana", en: "A banana" }, targets: { kcal: 120 } },
        ],
        order: 0,
      },
    ],
  };
}

function renderEditor(overrides: Record<string, unknown> = {}) {
  return render(
    <AssignNutritionForm
      clientId="client-sofia"
      defaultStartsOn="2026-09-15"
      editing={{
        planId: "nut-current",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plan: currentPhase() as any,
        state: "current",
        todayCivil: "2026-09-15",
        ...overrides,
      }}
    />,
  );
}

describe("AssignNutritionForm — macro kcal hint (#949)", () => {
  it("adds up the macros with the 4/4/9 factors and flags a gap against the typed kcal", async () => {
    const user = userEvent.setup();
    renderForm();

    const daily = within(screen.getByTestId("nutrition-daily-targets"));
    await user.type(daily.getByLabelText(/^Protein/), "90");
    await user.type(daily.getByLabelText(/^Carbs/), "280");
    await user.type(daily.getByLabelText(/^Fat/), "100");

    const hint = await screen.findByTestId("nutrition-daily-kcal-hint");
    expect(hint).toHaveTextContent("2380");

    // 2 380 vs a typed 2 000 is 380 kcal apart — worth saying out loud.
    await user.type(daily.getByLabelText("Calories"), "2000");
    expect(
      await screen.findByTestId("nutrition-daily-kcal-hint-mismatch"),
    ).toBeInTheDocument();
  });

  it("says nothing at all until a macro is typed", () => {
    renderForm();
    expect(screen.queryByTestId("nutrition-daily-kcal-hint")).not.toBeInTheDocument();
  });

  it("never flags a mismatch from a PARTIAL set of macros — it is low by construction", async () => {
    const user = userEvent.setup();
    renderForm();

    const daily = within(screen.getByTestId("nutrition-daily-targets"));
    await user.type(daily.getByLabelText(/^Protein/), "90");
    await user.type(daily.getByLabelText("Calories"), "2000");

    expect(await screen.findByTestId("nutrition-daily-kcal-hint")).toBeInTheDocument();
    expect(
      screen.queryByTestId("nutrition-daily-kcal-hint-mismatch"),
    ).not.toBeInTheDocument();
  });
});

describe("AssignNutritionForm — editing a phase (#949)", () => {
  it("prefills from the phase and defaults a RUNNING one to the split branch", async () => {
    renderEditor();

    expect(screen.getByLabelText("Phase name")).toHaveValue("Definición");
    expect(screen.getByTestId("nutrition-edit-scope-from-date")).toBeChecked();
    // The cutoff, not the phase's own start: the split opens a NEW phase from today.
    expect(screen.getByLabelText("From which day")).toHaveValue("2026-09-15");

    // The overlap preview must NOT exclude the phase being split — the trim it causes is
    // the whole point, and the coach has to read it before saving.
    await waitFor(() => expect(previewNutritionAssign).toHaveBeenCalled());
    const last = previewNutritionAssign.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last.excludePlanId).toBeUndefined();
  });

  it("splits into a NEW phase — the original is never rewritten", async () => {
    const user = userEvent.setup();
    renderEditor();

    const daily = within(screen.getByTestId("nutrition-daily-targets"));
    await user.clear(daily.getByLabelText("Calories"));
    await user.type(daily.getByLabelText("Calories"), "2200");
    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(assignNutritionPlan).toHaveBeenCalledTimes(1));
    expect(updateNutritionPlan).not.toHaveBeenCalled();
    const payload = assignNutritionPlan.mock.calls[0]![0] as {
      startsOn: string;
      endsOn: string | null;
      targets: Record<string, unknown>;
      meals: Array<{ mealId?: string; options: Array<{ id?: string }> }>;
    };
    expect(payload.startsOn).toBe("2026-09-15");
    expect(payload.endsOn).toBe("2026-09-30");
    expect(payload.targets).toMatchObject({ kcal: 2200, proteinG: 90 });
    // ⚠️ The mealId and the option id SURVIVE. Minting fresh ones would orphan every mark
    // the client already made — the daily log keys its `meals` map by `mealId`.
    expect(payload.meals[0]!.mealId).toBe("meal-breakfast");
    expect(payload.meals[0]!.options[0]!.id).toBe("opt-a");
  });

  it("rewrites the document in place when the coach picks the whole phase", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByTestId("nutrition-edit-scope-whole"));
    // Switching back to the whole phase restores its own start date.
    expect(screen.getByLabelText("From")).toHaveValue("2026-09-01");

    await user.click(screen.getByTestId("nutrition-save"));

    await waitFor(() => expect(updateNutritionPlan).toHaveBeenCalledTimes(1));
    expect(assignNutritionPlan).not.toHaveBeenCalled();
    expect(updateNutritionPlan.mock.calls[0]![0]).toBe("nut-current");

    // A whole-phase edit must not warn that the phase collides with itself.
    await waitFor(() => {
      const last = previewNutritionAssign.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(last.excludePlanId).toBe("nut-current");
    });
  });

  it("refuses a cutoff on or before the phase's first day instead of erasing it", async () => {
    const user = userEvent.setup();
    renderEditor();

    const cutoff = screen.getByLabelText("From which day");
    await user.clear(cutoff);
    await user.type(cutoff, "2026-09-01");
    await user.click(screen.getByTestId("nutrition-save"));

    expect(await screen.findByTestId("nutrition-form-error")).toBeInTheDocument();
    expect(assignNutritionPlan).not.toHaveBeenCalled();
    expect(updateNutritionPlan).not.toHaveBeenCalled();
  });

  it("offers only the whole-phase branch for a phase that has not started", () => {
    renderEditor({ state: "scheduled", todayCivil: "2026-08-20" });

    expect(screen.queryByTestId("nutrition-edit-scope-from-date")).not.toBeInTheDocument();
    expect(screen.getByTestId("nutrition-edit-scope-whole")).toBeChecked();
  });

  it("hides the template picker while editing", () => {
    render(
      <AssignNutritionForm
        clientId="client-sofia"
        defaultStartsOn="2026-09-15"
        templates={[TEMPLATE]}
        editing={{
          planId: "nut-current",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          plan: currentPhase() as any,
          state: "current",
          todayCivil: "2026-09-15",
        }}
      />,
    );
    expect(screen.queryByTestId("nutrition-template-picker")).not.toBeInTheDocument();
  });
});

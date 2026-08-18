// nutrition-plan-form.test.ts
// The pure half of the coach's assign flow (#914): what a coach is allowed to type, and
// how the phase strip labels what already exists.

import {
  buildNutritionPhaseStrip,
  defaultNutritionStartsOn,
  describeNutritionOverlap,
  nutritionPlanFormSchema,
} from "../nutrition-plan-form";
import { nutritionPlanOverlapEdits } from "../nutrition-plan-resolution";
import { phaseA, phaseB, selfPlan } from "./nutrition-fixtures";

function validForm(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-sofia",
    name: { en: "Cut", es: "Definición" },
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    targets: { kcal: 2000, proteinG: 170 },
    meals: [
      {
        name: { en: "Breakfast", es: "Desayuno" },
        moment: "breakfast",
        targets: { kcal: 450 },
        options: [{ text: { en: "Oats", es: "Avena" }, targets: { kcal: 450 } }],
      },
    ],
    ...overrides,
  };
}

describe("nutritionPlanFormSchema", () => {
  it("accepts a well-formed phase", () => {
    expect(nutritionPlanFormSchema.safeParse(validForm()).success).toBe(true);
  });

  it("accepts an explicit null endsOn — the open-ended phase", () => {
    const parsed = nutritionPlanFormSchema.safeParse(validForm({ endsOn: null }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.endsOn).toBeNull();
  });

  it("rejects an OMITTED endsOn", () => {
    // `endsOn` is nullable but never optional. An omitted key would reach Firestore as an
    // absent field, and Firestore cannot match a field that is not there — open-ended is
    // the common case, so those are exactly the plans that would vanish from every range
    // query. That is #400, in the form layer.
    const { endsOn, ...withoutEndsOn } = validForm();
    expect(nutritionPlanFormSchema.safeParse(withoutEndsOn).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const parsed = nutritionPlanFormSchema.safeParse(
      validForm({ startsOn: "2026-09-30", endsOn: "2026-09-01" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts a single-day phase", () => {
    expect(
      nutritionPlanFormSchema.safeParse(
        validForm({ startsOn: "2026-09-01", endsOn: "2026-09-01" }),
      ).success,
    ).toBe(true);
  });

  it("rejects an unpadded civil date", () => {
    // "2026-9-1" and "2026-09-01" are one day for a human and two strings for every range
    // query and every log doc id.
    expect(nutritionPlanFormSchema.safeParse(validForm({ startsOn: "2026-9-1" })).success).toBe(
      false,
    );
  });

  it("requires at least one meal", () => {
    expect(nutritionPlanFormSchema.safeParse(validForm({ meals: [] })).success).toBe(false);
  });

  it("rejects two meals sharing a mealId", () => {
    // The daily log keys its `meals` map by mealId. Two rows on one key would mean the
    // client marks breakfast and watches dinner change too.
    const parsed = nutritionPlanFormSchema.safeParse(
      validForm({
        meals: [
          {
            mealId: "m1",
            name: { en: "A", es: "A" },
            moment: "breakfast",
            options: [],
          },
          {
            mealId: "m1",
            name: { en: "B", es: "B" },
            moment: "dinner",
            options: [],
          },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("strips a smuggled trainerId instead of trusting it", () => {
    // Identity is stamped from the session AFTER the parse. The schema does not accept the
    // field at all, so a tampered payload cannot carry one through.
    const parsed = nutritionPlanFormSchema.safeParse(
      validForm({ trainerId: "someone-else", source: "self" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("trainerId" in parsed.data).toBe(false);
      expect("source" in parsed.data).toBe(false);
    }
  });

  it("lets a coach set calories only, without inventing macros", () => {
    const parsed = nutritionPlanFormSchema.safeParse(validForm({ targets: { kcal: 2000 } }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.targets.proteinG ?? null).toBeNull();
  });

  it("rejects an absurd macro — the fat-finger rail", () => {
    expect(
      nutritionPlanFormSchema.safeParse(validForm({ targets: { kcal: 240000 } })).success,
    ).toBe(false);
  });
});

describe("buildNutritionPhaseStrip", () => {
  it("classifies past / current / scheduled against the client's today", () => {
    const strip = buildNutritionPhaseStrip([selfPlan(), phaseA(), phaseB()], "2026-08-18");
    expect(strip.map((phase) => [phase.plan.id, phase.state])).toEqual([
      ["plan-self", "past"],
      ["plan-a", "current"],
      ["plan-b", "scheduled"],
    ]);
    expect(strip.filter((phase) => phase.isActive)).toHaveLength(1);
  });

  it("uses the same resolver the apps use, so the strip cannot disagree with the phone", () => {
    // Two open-ended phases starting the same day: the resolver's tie-break (coach over
    // self) decides, and the strip must highlight whichever the client's app is reading.
    const coachPlan = { ...phaseA(), endsOn: null, startsOn: "2026-08-01" };
    const clientPlan = { ...selfPlan(), startsOn: "2026-08-01" };
    const strip = buildNutritionPhaseStrip([clientPlan, coachPlan], "2026-08-18");
    const current = strip.find((phase) => phase.isActive);
    expect(current?.plan.id).toBe("plan-a");
  });

  it("drops soft-deleted phases — a superseded phase is history nobody lived", () => {
    const strip = buildNutritionPhaseStrip(
      [{ ...phaseA(), deleted: true }, phaseB()],
      "2026-08-18",
    );
    expect(strip.map((phase) => phase.plan.id)).toEqual(["plan-b"]);
  });

  it("reports no current phase when nothing is in force today", () => {
    // The empty state the coach has to notice: it is NOT 0% adherence, it is "nobody
    // assigned anything".
    const strip = buildNutritionPhaseStrip([phaseB()], "2026-08-18");
    expect(strip.some((phase) => phase.isActive)).toBe(false);
    expect(strip[0]!.state).toBe("scheduled");
  });

  it("is empty when the client has no plans at all", () => {
    expect(buildNutritionPhaseStrip([], "2026-08-18")).toEqual([]);
  });
});

describe("defaultNutritionStartsOn", () => {
  it("uses the CLIENT's timezone, not UTC", () => {
    // 2026-08-19T01:30Z is still the 18th in Buenos Aires. Defaulting off UTC would open
    // the form on tomorrow for every evening assign.
    const instant = new Date("2026-08-19T01:30:00Z");
    expect(defaultNutritionStartsOn("America/Argentina/Buenos_Aires", instant)).toBe(
      "2026-08-18",
    );
    expect(defaultNutritionStartsOn("UTC", instant)).toBe("2026-08-19");
  });
});

describe("describeNutritionOverlap", () => {
  it("names the affected phase and the date it moves to", () => {
    const existing = [{ ...selfPlan(), endsOn: null }];
    const edits = nutritionPlanOverlapEdits(existing, "2026-09-01", "2026-09-30");
    const notices = describeNutritionOverlap(edits, existing);
    expect(notices).toEqual([
      { planId: "plan-self", planName: "Mi plan", kind: "trim", date: "2026-08-31" },
    ]);
  });

  it("reads the same edits the save applies — no second computation", () => {
    // The whole point: the warning is a rendering of `nutritionPlanOverlapEdits`, not a
    // sentence written alongside it. A hand-written warning drifts the first time the
    // trimming rules change.
    const existing = [phaseB()];
    const edits = nutritionPlanOverlapEdits(existing, "2026-09-01", "2026-09-15");
    const notices = describeNutritionOverlap(edits, existing);
    expect(notices).toHaveLength(edits.length);
    expect(notices[0]!.kind).toBe("deferStart");
    expect(notices[0]!.date).toBe("2026-09-16");
  });

  it("falls back to the plan id when the plan is not in the list", () => {
    const notices = describeNutritionOverlap(
      [{ planId: "ghost", action: { kind: "supersede" } }],
      [],
    );
    expect(notices[0]!.planName).toBe("ghost");
  });

  it("returns nothing when nothing overlaps", () => {
    expect(describeNutritionOverlap([], [phaseA()])).toEqual([]);
  });
});

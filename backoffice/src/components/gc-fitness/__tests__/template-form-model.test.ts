// template-form-model.test.ts
//
// #507 — the pure half of <TemplateForm>, moved out of the component. The
// form suites (template-form-save / -editing / -cancel) still drive it end to
// end through the DOM; these pin the model directly.

import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

import {
  buildDefaults,
  clearDraft,
  collectTemplateTagSuggestions,
  normalizeTemplateSubmission,
  readDraft,
  withTransitionRestDefault,
  writeDraft,
} from "../template-form/template-form-model";

type Exercise = WorkoutTemplateInput["exercises"][number];

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    exerciseId: "ex1",
    sets: 3,
    reps: 10,
    rest_seconds: 60,
    transition_rest_seconds: 60,
    notes: "",
    order: 99,
    ...overrides,
  } as Exercise;
}

function values(overrides: Partial<WorkoutTemplateInput> = {}): WorkoutTemplateInput {
  return {
    name: { en: "", es: "Empuje" },
    description: { en: "", es: "" },
    tag: "custom",
    tags: [],
    exercises: [exercise()],
    ...overrides,
  } as WorkoutTemplateInput;
}

describe("buildDefaults", () => {
  it("starts blank on create", () => {
    expect(buildDefaults(undefined, "create")).toEqual({
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      tag: "custom",
      tags: [],
      exercises: [],
    });
  });

  it("migrates the legacy single tag and mirrors a one-language name", () => {
    const out = buildDefaults({ name: { en: "Push", es: "" }, tag: "fuerza" }, "edit");
    expect(out.tags).toEqual(["fuerza"]);
    expect(out.tag).toBe("fuerza");
    expect(out.name).toEqual({ en: "Push", es: "Push" });
  });
});

describe("withTransitionRestDefault", () => {
  it("defaults the transition rest to 60 and drops all-normal / invalid set types", () => {
    const [a, b, c] = withTransitionRestDefault([
      { exerciseId: "a" },
      { exerciseId: "b", transition_rest_seconds: 0, setTypesBySet: ["normal", "bogus"] } as Partial<Exercise>,
      { exerciseId: "c", setTypesBySet: ["warmup", "bogus", "failure"] } as Partial<Exercise>,
    ]);
    expect(a.transition_rest_seconds).toBe(60);
    expect(b.transition_rest_seconds).toBe(0);
    expect(b).not.toHaveProperty("setTypesBySet");
    // POSITIONAL coercion — never filter.
    expect(c.setTypesBySet).toEqual(["warmup", "normal", "failure"]);
  });
});

describe("normalizeTemplateSubmission", () => {
  it("renumbers order, mirrors tags[0] onto tag and blank translations", () => {
    const out = normalizeTemplateSubmission(
      values({
        tags: ["fuerza", "pierna"],
        exercises: [exercise({ order: 7 }), exercise({ exerciseId: "ex2", order: 3 })],
      }),
    );
    expect(out.tag).toBe("fuerza");
    expect(out.name).toEqual({ en: "Empuje", es: "Empuje" });
    expect(out.exercises.map((e) => e.order)).toEqual([1, 2]);
  });

  it("falls back to the legacy tag (or custom) when there are no tags", () => {
    expect(normalizeTemplateSubmission(values({ tag: "cardio" })).tags).toEqual(["cardio"]);
    expect(normalizeTemplateSubmission(values({ tag: "" })).tags).toEqual(["custom"]);
  });

  it("aligns every per-set array to one canonical length", () => {
    const [ex] = normalizeTemplateSubmission(
      values({
        exercises: [exercise({ sets: 1, repsBySet: [8], weightBySetKg: [24, 24, 23] })],
      }),
    ).exercises;
    expect(ex.sets).toBe(3);
    expect(ex.repsBySet).toEqual([8, 10, 10]);
    expect(ex.weightBySetKg).toEqual([24, 24, 23]);
    expect(ex).not.toHaveProperty("durationBySetSeconds");
  });

  it("keeps the explicit Sin peso sentinel and zero-fills untouched weights", () => {
    const [noWeight, blank] = normalizeTemplateSubmission(
      values({
        exercises: [exercise({ weightBySetKg: [] }), exercise({ exerciseId: "ex2", sets: 2 })],
      }),
    ).exercises;
    expect(noWeight.weightBySetKg).toEqual([]);
    expect(blank.weightBySetKg).toEqual([0, 0]);
  });

  it("pads durations with the exercise fallback", () => {
    const [ex] = normalizeTemplateSubmission(
      values({
        exercises: [exercise({ metric: "time", sets: 3, durationBySetSeconds: [30], durationSeconds: 45 } as Partial<Exercise>)],
      }),
    ).exercises;
    expect(ex.durationBySetSeconds).toEqual([30, 45, 45]);
  });

  it("emits set types only when some set is non-normal (and never as undefined)", () => {
    const [withTypes, allNormal] = normalizeTemplateSubmission(
      values({
        exercises: [
          exercise({ setTypesBySet: ["warmup"] } as Partial<Exercise>),
          exercise({ exerciseId: "ex2", setTypesBySet: ["normal", "normal"] } as Partial<Exercise>),
        ],
      }),
    ).exercises;
    expect(withTypes.setTypesBySet).toEqual(["warmup", "normal", "normal"]);
    expect("setTypesBySet" in allNormal).toBe(false);
  });

  it("defaults a missing transition rest to 60", () => {
    const [ex] = normalizeTemplateSubmission(
      values({ exercises: [exercise({ transition_rest_seconds: undefined } as Partial<Exercise>)] }),
    ).exercises;
    expect(ex.transition_rest_seconds).toBe(60);
  });
});

describe("collectTemplateTagSuggestions", () => {
  it("dedupes tags and legacy tags, trimming blanks", () => {
    expect(collectTemplateTagSuggestions(undefined)).toEqual([]);
    expect(
      collectTemplateTagSuggestions([
        { tags: [" fuerza ", "", null], tag: "fuerza" },
        { tag: "cardio " },
        { tags: "not-an-array", tag: 3 },
      ]),
    ).toEqual(["fuerza", "cardio"]);
  });
});

describe("draft storage", () => {
  it("is a no-op without a window (SSR)", () => {
    expect(readDraft("new")).toBeNull();
    expect(() => writeDraft("new", values())).not.toThrow();
    expect(() => clearDraft("new")).not.toThrow();
  });
});

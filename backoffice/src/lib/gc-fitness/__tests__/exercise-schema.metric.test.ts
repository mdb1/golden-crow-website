// __tests__/exercise-schema.metric.test.ts
//
// Phase 26-01 — Tests for the additive `metric` field on `exerciseSchema`.
// The metric enum is the trainer-authored prescription kind for an
// exercise; defaults to "reps" so every existing wger/fexd seed +
// trainer-authored doc deserializes unchanged.
//
// Same-source-of-truth contract (Pitfall-7) with the iOS Swift
// `ExerciseMetric` enum in
// `gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Exercise.swift`:
// the literal raw values ("reps", "time") MUST stay aligned.

import { exerciseSchema } from "../exercise-schema";

const VALID_INPUT = {
  name: { en: "Plank", es: "Plancha" },
  description: {
    en: "Hold a forearm plank with hips level.",
    es: "Sostén una plancha con los antebrazos.",
  },
  muscleGroups: ["core"],
  equipment: ["bodyweight"],
  mediaURL: null,
  thumbnailURL: null,
  source: "trainer" as const,
  ownerId: "trainer-uid-1",
  version: 1,
};

describe("exerciseSchema.metric (26-01 time-based-exercises seam)", () => {
  // T1: default — metric absent → "reps"
  it('defaults metric to "reps" when absent so legacy docs parse unchanged', () => {
    const parsed = exerciseSchema.parse(VALID_INPUT);
    expect(parsed.metric).toBe("reps");
  });

  // T2: explicit "time"
  it('parses metric: "time" without modification', () => {
    const parsed = exerciseSchema.parse({ ...VALID_INPUT, metric: "time" });
    expect(parsed.metric).toBe("time");
  });

  // T3: unknown value REJECTED on the write path
  //
  // The FORGIVING fallback (unknown → .reps) lives on the iOS read path
  // only. On the Zod write path Zod enums are strict by design: an
  // unknown metric string is a coding bug or a typo at authoring time and
  // we want a hard ZodError so the trainer-form / Server Action surfaces
  // a useful validation error. PATTERNS.md §12 locks this asymmetry.
  it('rejects an unknown metric value with a ZodError', () => {
    const result = exerciseSchema.safeParse({ ...VALID_INPUT, metric: "garbage" });
    expect(result.success).toBe(false);
  });

  // T4: explicit "reps" preserved
  it('parses metric: "reps" without modification', () => {
    const parsed = exerciseSchema.parse({ ...VALID_INPUT, metric: "reps" });
    expect(parsed.metric).toBe("reps");
  });
});

describe("exerciseSchema.tracksWeight (26-09 reps-without-weight authoring)", () => {
  // Default true so every legacy doc keeps showing the weight column.
  it("defaults tracksWeight to true when absent", () => {
    const parsed = exerciseSchema.parse(VALID_INPUT);
    expect(parsed.tracksWeight).toBe(true);
  });

  // false = "reps without weight": the template builder seeds weightBySetKg:[].
  it("parses tracksWeight: false (bodyweight) without modification", () => {
    const parsed = exerciseSchema.parse({ ...VALID_INPUT, tracksWeight: false });
    expect(parsed.tracksWeight).toBe(false);
  });

  it("parses tracksWeight: true without modification", () => {
    const parsed = exerciseSchema.parse({ ...VALID_INPUT, tracksWeight: true });
    expect(parsed.tracksWeight).toBe(true);
  });
});

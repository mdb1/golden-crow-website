// __tests__/workout-template-schema.duration.test.ts
//
// Phase 26-01 — Tests for the three additive optional fields on
// `exerciseRefSchema`:
//   - metric: "reps" | "time" (optional override; nil = "fall back to
//     the source exercise's metric")
//   - durationBySetSeconds: number[]  (per-set duration prescription)
//   - durationSeconds: number          (exercise-level duration fallback)
//
// Plus the cross-field superRefine: when metric === "time", REQUIRE
// either a positive durationSeconds OR a non-empty durationBySetSeconds.
// PATTERNS.md §13 + PLAN.md §4.2.

import {
  workoutTemplateSchema,
  exerciseRefSchema,
} from "../workout-template-schema";

const BASE_REF = {
  exerciseId: "wger-plank-1",
  sets: 3,
  reps: 0,
  rest_seconds: 60,
  order: 1,
};

describe("exerciseRefSchema — 26-01 metric + duration fields", () => {
  // T1: legacy decode — no new fields
  it("accepts a legacy ExerciseRef without any of the three new fields", () => {
    const parsed = exerciseRefSchema.parse({
      ...BASE_REF,
      reps: 10,
    });
    expect(parsed.metric).toBeUndefined();
    expect(parsed.durationBySetSeconds).toBeUndefined();
    expect(parsed.durationSeconds).toBeUndefined();
  });

  // T2: metric "time" + scalar duration → OK
  it("accepts metric: time with a scalar durationSeconds", () => {
    const parsed = exerciseRefSchema.parse({
      ...BASE_REF,
      metric: "time",
      durationSeconds: 60,
    });
    expect(parsed.metric).toBe("time");
    expect(parsed.durationSeconds).toBe(60);
  });

  // T3: metric "time" + per-set array → OK
  it("accepts metric: time with a non-empty durationBySetSeconds array", () => {
    const parsed = exerciseRefSchema.parse({
      ...BASE_REF,
      metric: "time",
      durationBySetSeconds: [60, 45, 30],
    });
    expect(parsed.metric).toBe("time");
    expect(parsed.durationBySetSeconds).toEqual([60, 45, 30]);
  });

  // T4: metric "time" without ANY duration → REJECTED
  //
  // PATTERNS.md §13 superRefine: emit a ZodIssue at path
  // ["durationSeconds"] so the trainer-form's <FormMessage /> renders
  // the error against the duration field, not at the form root.
  it("rejects metric: time when both durationSeconds and durationBySetSeconds are missing", () => {
    const result = exerciseRefSchema.safeParse({
      ...BASE_REF,
      metric: "time",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.path).toEqual(["durationSeconds"]);
      expect(issue.message).toMatch(/duration/i);
    }
  });

  // T5: range guard low — durationBySetSeconds entry below 5 → REJECTED
  it("rejects a durationBySetSeconds entry below the 5s floor", () => {
    const result = exerciseRefSchema.safeParse({
      ...BASE_REF,
      metric: "time",
      durationBySetSeconds: [3],
    });
    expect(result.success).toBe(false);
  });

  // T6: range guard high — durationSeconds above 1800 → REJECTED
  it("rejects a durationSeconds above the 1800s ceiling", () => {
    const result = exerciseRefSchema.safeParse({
      ...BASE_REF,
      metric: "time",
      durationSeconds: 2000,
    });
    expect(result.success).toBe(false);
  });

  // T7: missing metric + duration present → still OK (cascade to source)
  it("accepts a duration without an explicit metric (cascade resolves at render)", () => {
    const parsed = exerciseRefSchema.parse({
      ...BASE_REF,
      durationSeconds: 60,
    });
    expect(parsed.metric).toBeUndefined();
    expect(parsed.durationSeconds).toBe(60);
  });
});

// Sanity: the new exerciseRefSchema slot in cleanly inside the full
// workoutTemplateSchema (no other top-level changes were intended).
describe("workoutTemplateSchema — duration-bearing exercise round-trip", () => {
  it("accepts a template whose single exercise is a 3 × 60s plank", () => {
    const parsed = workoutTemplateSchema.parse({
      name: { en: "Core Day", es: "Día de Core" },
      tag: "core",
      exercises: [
        {
          exerciseId: "wger-plank-1",
          sets: 3,
          reps: 0,
          rest_seconds: 60,
          order: 1,
          metric: "time",
          durationBySetSeconds: [60, 60, 60],
        },
      ],
    });
    expect(parsed.exercises[0].metric).toBe("time");
    expect(parsed.exercises[0].durationBySetSeconds).toEqual([60, 60, 60]);
  });
});

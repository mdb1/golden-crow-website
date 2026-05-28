// __tests__/workout-assignment-schema.duration.test.ts
//
// Phase 26-01 — Tests for the three additive optional fields on
// `assignmentExerciseOverrideSchema` (the per-client override slot inside
// assignTemplate / assignTemplateRecurring): metric, durationBySetSeconds,
// durationSeconds. PATTERNS.md §14 + PLAN.md §4.2.
//
// The override schema is permissive by design — a trainer assigning a
// plank to a single client may set ANY subset of the override fields, so
// these tests verify the additive fields parse cleanly without imposing
// any cross-field requirement (the template-level superRefine catches
// "metric: time without duration"; per-client overrides may legitimately
// adjust only the duration array without touching metric).

import { assignTemplateSchema } from "../workout-assignment-schema";

const BASE_INPUT = {
  templateId: "tpl-plank-1",
  clientId: "client-uid-1",
  scheduledFor: "2026-06-01",
};

describe("assignmentExerciseOverrideSchema — 26-01 duration fields", () => {
  // T1: override accepts metric + per-set duration array
  it("accepts an override with metric and durationBySetSeconds", () => {
    const parsed = assignTemplateSchema.parse({
      ...BASE_INPUT,
      exerciseOverrides: [
        { index: 0, metric: "time", durationBySetSeconds: [60] },
      ],
    });
    expect(parsed.exerciseOverrides?.[0].metric).toBe("time");
    expect(parsed.exerciseOverrides?.[0].durationBySetSeconds).toEqual([60]);
  });

  // T2: override accepts a scalar durationSeconds
  it("accepts an override with a scalar durationSeconds", () => {
    const parsed = assignTemplateSchema.parse({
      ...BASE_INPUT,
      exerciseOverrides: [
        { index: 0, durationSeconds: 45 },
      ],
    });
    expect(parsed.exerciseOverrides?.[0].durationSeconds).toBe(45);
  });

  // T3: range guard low on per-set array
  it("rejects an override with a durationBySetSeconds entry below 5s", () => {
    const result = assignTemplateSchema.safeParse({
      ...BASE_INPUT,
      exerciseOverrides: [{ index: 0, durationBySetSeconds: [3] }],
    });
    expect(result.success).toBe(false);
  });

  // T4: range guard high on scalar
  it("rejects an override with a durationSeconds above 1800", () => {
    const result = assignTemplateSchema.safeParse({
      ...BASE_INPUT,
      exerciseOverrides: [{ index: 0, durationSeconds: 2000 }],
    });
    expect(result.success).toBe(false);
  });

  // T5: missing all three new fields — override is still valid
  // (existing reps/weight-only overrides must keep parsing)
  it("accepts a legacy reps-only override (no new fields)", () => {
    const parsed = assignTemplateSchema.parse({
      ...BASE_INPUT,
      exerciseOverrides: [{ index: 0, reps: 12 }],
    });
    expect(parsed.exerciseOverrides?.[0].metric).toBeUndefined();
    expect(parsed.exerciseOverrides?.[0].durationSeconds).toBeUndefined();
    expect(parsed.exerciseOverrides?.[0].durationBySetSeconds).toBeUndefined();
  });
});

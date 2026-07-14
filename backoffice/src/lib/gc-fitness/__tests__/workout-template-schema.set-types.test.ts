// workout-template-schema.set-types.test.ts
//
// quick-260714-m57 (issue #403) — Zod boundary for the per-set type
// prescription `setTypesBySet` on template exercises (threat T-m57-02:
// the server-action boundary is the guard for trainer-authored templates,
// which bypass Firestore rules via the Admin SDK).

import { exerciseRefSchema } from "../workout-template-schema";

const baseExercise = {
  exerciseId: "wger-bench-press",
  sets: 3,
  reps: 10,
  rest_seconds: 90,
  order: 1,
};

describe("exerciseRefSchema.setTypesBySet (quick-260714-m57 #403)", () => {
  it("accepts a valid setTypesBySet array and preserves it", () => {
    const parsed = exerciseRefSchema.parse({
      ...baseExercise,
      setTypesBySet: ["warmup", "normal", "failure", "dropset"],
    });
    expect(parsed.setTypesBySet).toEqual([
      "warmup",
      "normal",
      "failure",
      "dropset",
    ]);
  });

  it("is optional — absent field parses to undefined (legacy docs)", () => {
    const parsed = exerciseRefSchema.parse(baseExercise);
    expect(parsed.setTypesBySet).toBeUndefined();
  });

  it("rejects unknown set-type strings (T-m57-02)", () => {
    const result = exerciseRefSchema.safeParse({
      ...baseExercise,
      setTypesBySet: ["warmup", "xyz"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 entries", () => {
    const result = exerciseRefSchema.safeParse({
      ...baseExercise,
      setTypesBySet: Array(11).fill("normal"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string entries", () => {
    const result = exerciseRefSchema.safeParse({
      ...baseExercise,
      setTypesBySet: [1, 2],
    });
    expect(result.success).toBe(false);
  });
});

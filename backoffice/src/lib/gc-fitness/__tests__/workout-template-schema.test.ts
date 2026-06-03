// __tests__/workout-template-schema.test.ts
//
// Round-trip + validation tests for the Zod schema that mirrors
// `GCFitnessCore/Sources/GCFitnessCore/Schema/WorkoutTemplate.swift` and
// `ExerciseRef.swift`.
//
// Plan 04-04 contract:
//  - Field shape mirrors WorkoutTemplate verbatim — same field names,
//    free-text `tag`, same `rest_seconds` snake_case wire key.
//  - `reps` is strict-int v1 (Pitfall 10): integers in `1..50` only. Strings
//    like "AMRAP" or "8-12" are REJECTED until v2 widens the type.
//  - `sets` 1..10, `rest_seconds` 0..600 (10-min cap), `notes` ≤ 500 chars.
//  - `exercises` array MUST contain 1..30 entries.
//  - `trainerId` is NEVER on the input — it's set server-side from the
//    session in `workout-template-actions.ts`. The schema MUST NOT accept it.
//
// These tests run before the implementation file exists (TDD RED).

import {
  workoutTemplateSchema,
  workoutTemplateUpdateSchema,
} from "../workout-template-schema";

const VALID_EXERCISE = {
  exerciseId: "wger-abc123",
  sets: 3,
  reps: 10,
  rest_seconds: 90,
  transition_rest_seconds: 60,
  notes: "Keep elbows in.",
  order: 1,
};

const VALID_TEMPLATE = {
  name: { en: "Push Day", es: "Día de empuje" },
  description: { en: "Chest, shoulders, triceps.", es: "Pecho, hombros, tríceps." },
  tag: "push" as const,
  exercises: [VALID_EXERCISE],
};

function firstError(input: unknown): string {
  const result = workoutTemplateSchema.safeParse(input);
  if (result.success) {
    throw new Error("Expected schema to fail but it parsed successfully.");
  }
  return result.error.issues[0].message;
}

describe("workoutTemplateSchema — top-level fields", () => {
  // T1: happy path
  it("accepts a valid trainer-authored template", () => {
    const parsed = workoutTemplateSchema.parse(VALID_TEMPLATE);
    expect(parsed.name.en).toBe("Push Day");
    expect(parsed.tag).toBe("push");
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.exercises[0].rest_seconds).toBe(90);
    expect(parsed.exercises[0].transition_rest_seconds).toBe(60);
  });

  // T2: name.en empty → rejected
  it("rejects empty name.en", () => {
    expect(firstError({ ...VALID_TEMPLATE, name: { en: "", es: "x" } })).toMatch(
      /name.*english.*required/i,
    );
  });

  // T3: name.en over 80 chars → rejected
  it("rejects name.en longer than 80 characters", () => {
    const tooLong = "a".repeat(81);
    expect(
      firstError({ ...VALID_TEMPLATE, name: { en: tooLong, es: "ok" } }),
    ).toMatch(/80 characters/i);
  });

  // T4: name.es over 80 chars → rejected
  it("rejects name.es longer than 80 characters", () => {
    const tooLong = "á".repeat(81);
    expect(
      firstError({ ...VALID_TEMPLATE, name: { en: "ok", es: tooLong } }),
    ).toMatch(/80 characters/i);
  });

  // T5: description optional — undefined OK
  it("accepts a template without a description", () => {
    const { description: _omit, ...withoutDesc } = VALID_TEMPLATE;
    const parsed = workoutTemplateSchema.parse(withoutDesc);
    expect(parsed.description).toBeUndefined();
  });

  // T5b: endsOn is optional but valid when present
  it("accepts an optional endsOn field", () => {
    const parsed = workoutTemplateSchema.parse({
      ...VALID_TEMPLATE,
      endsOn: "2026-09-01",
    });
    expect(parsed.endsOn).toBe("2026-09-01");
  });

  // T6: tag must be non-empty
  it("rejects an empty tag", () => {
    const result = workoutTemplateSchema.safeParse({
      ...VALID_TEMPLATE,
      tag: " ",
    });
    expect(result.success).toBe(false);
  });

  // T7: custom tags are allowed
  it("accepts a custom tag", () => {
    const result = workoutTemplateSchema.safeParse({
      ...VALID_TEMPLATE,
      tag: "rehab",
    });
    expect(result.success).toBe(true);
  });

  // T8: exercises empty array → rejected
  it("rejects an empty exercises array", () => {
    expect(firstError({ ...VALID_TEMPLATE, exercises: [] })).toMatch(
      /at least one exercise/i,
    );
  });

  // T9: exercises array > 30 → rejected
  it("rejects more than 30 exercises", () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      ...VALID_EXERCISE,
      order: i + 1,
    }));
    const result = workoutTemplateSchema.safeParse({
      ...VALID_TEMPLATE,
      exercises: tooMany,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === "too_big")).toBe(true);
    }
  });

  // T10: schema must NOT echo back a client-provided trainerId on parse
  // (the field is server-side only — set from session, never trusted from input)
  it("does not echo back a client-provided trainerId on parse", () => {
    const inputWithTrainerId = {
      ...VALID_TEMPLATE,
      trainerId: "victim-trainer-uid",
    } as unknown;
    const parsed = workoutTemplateSchema.parse(inputWithTrainerId);
    expect((parsed as Record<string, unknown>).trainerId).toBeUndefined();
  });

  // T11: schema must NOT echo back a client-provided version on parse
  it("does not echo back a client-provided version on parse", () => {
    const inputWithVersion = {
      ...VALID_TEMPLATE,
      version: 999,
    } as unknown;
    const parsed = workoutTemplateSchema.parse(inputWithVersion);
    expect((parsed as Record<string, unknown>).version).toBeUndefined();
  });
});

describe("workoutTemplateSchema — exercise constraints", () => {
  // T12: sets = 0 rejected
  it("rejects sets=0", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, sets: 0 }],
      }),
    ).toMatch(/sets/i);
  });

  // T13: sets = 11 rejected
  it("rejects sets=11 (above 1..10 cap)", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, sets: 11 }],
      }),
    ).toMatch(/sets/i);
  });

  // T14: reps as string "8-12" rejected (Pitfall 10: strict-int v1)
  it("rejects reps as a string (strict-int v1)", () => {
    const result = workoutTemplateSchema.safeParse({
      ...VALID_TEMPLATE,
      exercises: [{ ...VALID_EXERCISE, reps: "8-12" }],
    });
    expect(result.success).toBe(false);
  });

  // T15: reps = 0 is ACCEPTED — it's the deliberate "no fixed count" / open
  // prescription for warmup / mobility / duration-based work (schema uses
  // min(0); see workout-template-schema.ts reps field comment). The lower
  // bound is now negative-reps, which is still rejected.
  it("accepts reps=0 (open / no-fixed-count prescription)", () => {
    const parsed = workoutTemplateSchema.parse({
      ...VALID_TEMPLATE,
      exercises: [{ ...VALID_EXERCISE, reps: 0 }],
    });
    expect(parsed.exercises[0].reps).toBe(0);
  });

  // T15b: negative reps is still rejected (min lower bound).
  it("rejects reps=-1 (negative)", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, reps: -1 }],
      }),
    ).toMatch(/reps/i);
  });

  // T16: reps = 51 rejected
  it("rejects reps=51 (above 1..50 cap)", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, reps: 51 }],
      }),
    ).toMatch(/reps/i);
  });

  // T17: rest_seconds = 601 rejected
  it("rejects rest_seconds=601 (above 0..600 cap)", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, rest_seconds: 601 }],
      }),
    ).toMatch(/rest/i);
  });

  // T18: rest_seconds = 0 accepted (no-rest superset)
  it("accepts rest_seconds=0 (no-rest valid)", () => {
    const parsed = workoutTemplateSchema.parse({
      ...VALID_TEMPLATE,
      exercises: [{ ...VALID_EXERCISE, rest_seconds: 0 }],
    });
    expect(parsed.exercises[0].rest_seconds).toBe(0);
  });

  // T19: notes > 500 chars rejected
  it("rejects notes longer than 500 characters", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, notes: "a".repeat(501) }],
      }),
    ).toMatch(/500/i);
  });

  // T20: notes omitted is fine (optional)
  it("accepts an exercise without notes", () => {
    const { notes: _omit, ...noNotes } = VALID_EXERCISE;
    const parsed = workoutTemplateSchema.parse({
      ...VALID_TEMPLATE,
      exercises: [noNotes],
    });
    expect(parsed.exercises[0].notes).toBeUndefined();
  });

  // T21: empty exerciseId rejected
  it("rejects empty exerciseId", () => {
    expect(
      firstError({
        ...VALID_TEMPLATE,
        exercises: [{ ...VALID_EXERCISE, exerciseId: "" }],
      }),
    ).toMatch(/exercise/i);
  });
});

describe("workoutTemplateUpdateSchema", () => {
  // T22: partial update accepts just a name change
  it("accepts a partial update with only a name field", () => {
    const parsed = workoutTemplateUpdateSchema.parse({
      name: { en: "Updated", es: "Actualizado" },
    });
    expect(parsed.name?.en).toBe("Updated");
    expect(parsed.tag).toBeUndefined();
  });

  // T22b: partial update can carry an endsOn change
  it("accepts a partial update with only endsOn", () => {
    const parsed = workoutTemplateUpdateSchema.parse({
      endsOn: "2026-12-31",
    });
    expect(parsed.endsOn).toBe("2026-12-31");
  });

  // T23: partial update of just exercises still applies array-length cap
  it("rejects a partial update with empty exercises array", () => {
    const result = workoutTemplateUpdateSchema.safeParse({ exercises: [] });
    expect(result.success).toBe(false);
  });
});

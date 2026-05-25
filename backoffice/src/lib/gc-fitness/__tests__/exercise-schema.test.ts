// __tests__/exercise-schema.test.ts
// Round-trip + validation tests for the Zod schema that mirrors
// `GCFitnessCore/Sources/GCFitnessCore/Schema/Exercise.swift`.
//
// Plan 03-05 contract:
// - Copy strings are LOCKED to the UI-SPEC "Zod validation copy" table
//   (03-UI-SPEC.md §"Validation copy"). Drift fails the test build —
//   same pattern as P02-10 DeleteAccountFlowTests.
// - Vocabulary enums (muscleGroups, equipment) are sourced from
//   `exercise-vocabulary.ts` (the TS twin of `Vocabulary.swift`, committed
//   in 03-02). Adding a value to the vocab automatically widens the schema.

import { exerciseSchema } from "../exercise-schema";

const VALID_INPUT = {
  name: { en: "Barbell Bench Press", es: "Press de Banca con Barra" },
  description: {
    en: "Lie on a flat bench and press the bar straight up.",
    es: "Acuéstate en un banco plano y empuja la barra hacia arriba.",
  },
  muscleGroups: ["chest"],
  equipment: ["barbell", "bench"],
  mediaURL: null,
  thumbnailURL: null,
  source: "trainer" as const,
  ownerId: "trainer-uid-1",
  version: 1,
};

function firstError(input: unknown): string {
  const result = exerciseSchema.safeParse(input);
  if (result.success) {
    throw new Error("Expected schema to fail but it parsed successfully.");
  }
  return result.error.issues[0].message;
}

describe("exerciseSchema", () => {
  // T1: happy path
  it("accepts a valid trainer-authored exercise", () => {
    const parsed = exerciseSchema.parse(VALID_INPUT);
    expect(parsed.name.en).toBe("Barbell Bench Press");
    expect(parsed.muscleGroups).toEqual(["chest"]);
    expect(parsed.source).toBe("trainer");
  });

  // T2: nameEn empty → verbatim UI-SPEC copy
  it("rejects empty name.en with the exact UI-SPEC copy", () => {
    expect(firstError({ ...VALID_INPUT, name: { en: "", es: "x" } })).toBe(
      "Name in English is required.",
    );
  });

  // T3: nameEn over 120 chars → verbatim UI-SPEC copy
  it("rejects name.en longer than 120 chars with the exact UI-SPEC copy", () => {
    const tooLong = "a".repeat(121);
    expect(
      firstError({ ...VALID_INPUT, name: { en: tooLong, es: "ok" } }),
    ).toBe("Keep the name under 120 characters.");
  });

  // T4: descriptionEn empty → verbatim UI-SPEC copy
  it("rejects empty description.en with the exact UI-SPEC copy", () => {
    expect(
      firstError({
        ...VALID_INPUT,
        description: { en: "", es: "x" },
      }),
    ).toBe("Add a short description so clients know what to do.");
  });

  // T5: muscleGroups: [] → verbatim UI-SPEC copy
  it("rejects empty muscleGroups with the exact UI-SPEC copy", () => {
    expect(firstError({ ...VALID_INPUT, muscleGroups: [] })).toBe(
      "Pick at least one muscle group.",
    );
  });

  // T6: muscleGroups contains an unknown value → verbatim UI-SPEC copy
  it("rejects an unknown muscle group with the exact UI-SPEC copy", () => {
    expect(
      firstError({ ...VALID_INPUT, muscleGroups: ["not_a_real_muscle"] }),
    ).toBe("Unknown muscle group. Refresh and try again.");
  });

  // T7: muscleGroups length > 8 → defensive cap
  it("rejects more than 8 muscle groups", () => {
    // All 9 values are valid vocab entries — the cap is defensive, not the enum.
    const tooMany = [
      "abs",
      "arms",
      "back",
      "biceps",
      "calves",
      "cardio",
      "chest",
      "core",
      "flexibility",
    ];
    const result = exerciseSchema.safeParse({
      ...VALID_INPUT,
      muscleGroups: tooMany,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // We don't UI-spec this string (defensive cap, never shown in normal
      // flow), so we just assert there's a max-length issue.
      const codes = result.error.issues.map((i) => i.code);
      // Zod 4 uses `too_big` for array `max(N)` violations.
      expect(codes.includes("too_big")).toBe(true);
    }
  });

  // T8: equipment contains an unknown value → verbatim UI-SPEC copy
  it("rejects unknown equipment with the exact UI-SPEC copy", () => {
    expect(
      firstError({ ...VALID_INPUT, equipment: ["not_real_equipment"] }),
    ).toBe("Unknown equipment. Refresh and try again.");
  });

  // T9: mediaURL invalid (non-gs:// scheme) → verbatim UI-SPEC copy
  it("rejects an https mediaURL (must be gs:// or null) with the exact UI-SPEC copy", () => {
    expect(
      firstError({
        ...VALID_INPUT,
        mediaURL: "https://wger.de/foo.mp4",
      }),
    ).toBe("Media couldn't be uploaded. Try again.");
  });

  // T10: source enum closed (Phase 24-06 — widened to 3-way to mirror the
  // ExerciseRow union + the iOS Source enum, see exercises-listener.ts:80
  // and Exercise.swift Source enum). The enum is STILL closed — values
  // outside {wger, trainer, free-exercise-db} still reject.
  it("rejects a source value outside {wger, trainer, free-exercise-db}", () => {
    const result = exerciseSchema.safeParse({
      ...VALID_INPUT,
      source: "other",
    });
    expect(result.success).toBe(false);
  });

  // T10b (Phase 24-06): wger continues to validate (no regression).
  it("accepts source: 'wger' (regression guard)", () => {
    const parsed = exerciseSchema.parse({ ...VALID_INPUT, source: "wger" });
    expect(parsed.source).toBe("wger");
  });

  // T10c (Phase 24-06): the new free-exercise-db source now validates.
  // Trainer-form ingress writing a fexd-* doc id with source:"free-exercise-db"
  // must round-trip — prior to 24-06 the 2-way enum rejected this value.
  it("accepts source: 'free-exercise-db' (Phase 24-06)", () => {
    const parsed = exerciseSchema.parse({
      ...VALID_INPUT,
      source: "free-exercise-db",
    });
    expect(parsed.source).toBe("free-exercise-db");
  });

  // Bonus: equipment empty → verbatim UI-SPEC copy with curly quotes
  it("rejects empty equipment with the exact UI-SPEC copy", () => {
    expect(firstError({ ...VALID_INPUT, equipment: [] })).toBe(
      "Pick at least one equipment item, or “bodyweight.”",
    );
  });
});

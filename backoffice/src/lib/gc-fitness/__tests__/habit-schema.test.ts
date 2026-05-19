// __tests__/habit-schema.test.ts
//
// Validation tests for the Zod schema that mirrors
// `GCFitnessCore/Sources/GCFitnessCore/Schema/Habit.swift` +
// `HabitType.swift` and the canonical schema doc `.planning/schemas/habits.md`.
//
// Plan 06-05 contract:
//  - 4 habit types: "binary" | "multi-choice" | "numeric" | "weight".
//  - Type-conditional refinements (4 rules from `habits.md`):
//      1. multi-choice ⇒ options has ≥ 2 entries
//      2. !multi-choice ⇒ options must be absent
//      3. weight ⇒ targetValue must be absent
//      4. reminderEnabled === true ⇒ reminderTime required
//  - Server-side fields (trainerId, seedSource, createdAt, updatedAt,
//    deleted, id) are NEVER on the input — `.parse()` strips them silently.

import {
  habitCreateSchema,
  habitUpdateSchemaForType,
} from "../habit-schema";

const BINARY_VALID = {
  clientId: "uid-client-abc",
  type: "binary" as const,
  name: { en: "Stretch", es: "Estirar" },
  reminderEnabled: false,
};

const MULTI_CHOICE_VALID = {
  clientId: "uid-client-abc",
  type: "multi-choice" as const,
  name: { en: "Mood check", es: "Estado de ánimo" },
  options: ["great", "ok", "tired", "stressed"],
  reminderEnabled: false,
};

const NUMERIC_VALID = {
  clientId: "uid-client-abc",
  type: "numeric" as const,
  name: { en: "Drink water", es: "Beber agua" },
  targetValue: 8,
  unit: "glasses",
  reminderEnabled: false,
};

const WEIGHT_VALID = {
  clientId: "uid-client-abc",
  type: "weight" as const,
  name: { en: "Body weight", es: "Peso corporal" },
  unit: "kg",
  reminderEnabled: false,
};

describe("habit-schema", () => {
  // T01 — binary happy path
  it("T01 — accepts a valid binary habit", () => {
    const result = habitCreateSchema.safeParse(BINARY_VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("binary");
      expect(result.data.reminderEnabled).toBe(false);
    }
  });

  // T02 — multi-choice happy path with 2+ options
  it("T02 — accepts a multi-choice habit with 2 options", () => {
    const result = habitCreateSchema.safeParse({
      ...MULTI_CHOICE_VALID,
      options: ["yes", "no"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toEqual(["yes", "no"]);
    }
  });

  // T03 — multi-choice with 0 options → fail with path=["options"]
  it("T03 — rejects multi-choice with zero options", () => {
    const result = habitCreateSchema.safeParse({
      ...MULTI_CHOICE_VALID,
      options: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "options")).toBe(
        true,
      );
    }
  });

  // T04 — multi-choice with exactly 1 option → still fails (need ≥ 2)
  it("T04 — rejects multi-choice with only 1 option", () => {
    const result = habitCreateSchema.safeParse({
      ...MULTI_CHOICE_VALID,
      options: ["solo"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "options")).toBe(
        true,
      );
    }
  });

  // T05 — numeric with negative targetValue → positive constraint fails
  it("T05 — rejects numeric habit with negative targetValue", () => {
    const result = habitCreateSchema.safeParse({
      ...NUMERIC_VALID,
      targetValue: -5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "targetValue"),
      ).toBe(true);
    }
  });

  // T06 — invalid reminderTime format
  it("T06 — rejects malformed reminderTime '9:5'", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      reminderEnabled: true,
      reminderTime: "9:5",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "reminderTime"),
      ).toBe(true);
    }
  });

  // T07 — reminderEnabled true without reminderTime → custom refinement fails
  it("T07 — rejects reminderEnabled=true without reminderTime", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      reminderEnabled: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "reminderTime"),
      ).toBe(true);
    }
  });

  // T08 — numeric habit with options array → options-only-for-multi-choice fails
  it("T08 — rejects numeric habit that carries an options array", () => {
    const result = habitCreateSchema.safeParse({
      ...NUMERIC_VALID,
      options: ["a", "b"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "options")).toBe(
        true,
      );
    }
  });

  // T09 — weight habit with targetValue → fails per schema doc rule 3
  it("T09 — rejects weight habit with a targetValue", () => {
    const result = habitCreateSchema.safeParse({
      ...WEIGHT_VALID,
      targetValue: 80,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "targetValue"),
      ).toBe(true);
    }
  });

  // T10 — name.en over 80 chars → fails
  it("T10 — rejects name.en longer than 80 characters", () => {
    const tooLong = "a".repeat(81);
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      name: { en: tooLong, es: "ok" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "name")).toBe(
        true,
      );
    }
  });

  // T11 — reminderEnabled=true WITH reminderTime → happy path
  it("T11 — accepts reminderEnabled=true with a valid reminderTime", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      reminderEnabled: true,
      reminderTime: "09:00",
    });
    expect(result.success).toBe(true);
  });

  // T12 — server-side fields stripped on parse (T-06-05-01 EoP defense)
  it("T12 — strips a client-provided trainerId on parse (Zod default)", () => {
    const tampered = {
      ...BINARY_VALID,
      trainerId: "victim-trainer-uid",
    } as unknown;
    const result = habitCreateSchema.safeParse(tampered);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).trainerId,
      ).toBeUndefined();
    }
  });

  // T13 — server-side fields stripped on parse (seedSource attempt)
  it("T13 — strips a client-provided seedSource on parse", () => {
    const tampered = {
      ...BINARY_VALID,
      seedSource: "welcome-water",
    } as unknown;
    const result = habitCreateSchema.safeParse(tampered);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).seedSource,
      ).toBeUndefined();
    }
  });

  // T14 — unknown habit type rejected
  it("T14 — rejects an unknown habit type", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      type: "streak" as unknown as "binary",
    });
    expect(result.success).toBe(false);
  });
});

describe("habit-schema — habitUpdateSchemaForType", () => {
  // U01 — update with new name only (closure-captured type=binary, no refinement triggered)
  it("U01 — accepts a binary update with name change only", () => {
    const schema = habitUpdateSchemaForType("binary");
    const result = schema.safeParse({
      name: { en: "New name", es: "Nuevo nombre" },
      reminderEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  // U02 — update on multi-choice: still must have ≥ 2 options when options are supplied
  it("U02 — rejects multi-choice update with 1 option", () => {
    const schema = habitUpdateSchemaForType("multi-choice");
    const result = schema.safeParse({
      name: { en: "Mood", es: "Humor" },
      options: ["solo"],
      reminderEnabled: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "options")).toBe(
        true,
      );
    }
  });

  // U03 — update strips a client-attempted `type` override (omit'd from base)
  it("U03 — silently strips an attempted type-override on update", () => {
    const schema = habitUpdateSchemaForType("binary");
    const tampered = {
      name: { en: "ok", es: "ok" },
      reminderEnabled: false,
      type: "weight",
    } as unknown;
    const result = schema.safeParse(tampered);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).type).toBeUndefined();
    }
  });

  // U04 — update enforces reminderEnabled⇒reminderTime
  it("U04 — rejects reminderEnabled=true without reminderTime on update", () => {
    const schema = habitUpdateSchemaForType("numeric");
    const result = schema.safeParse({
      name: { en: "Water", es: "Agua" },
      targetValue: 8,
      unit: "glasses",
      reminderEnabled: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "reminderTime"),
      ).toBe(true);
    }
  });
});

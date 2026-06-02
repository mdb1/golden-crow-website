// __tests__/habit-schema.test.ts
//
// Validation tests for the Zod schema that mirrors
// `GCFitnessCore/Sources/GCFitnessCore/Schema/Habit.swift` +
// `HabitType.swift` and the canonical schema doc `.planning/schemas/habits.md`.
//
// Habits are BINARY-ONLY (yes/no) now. The schema accepts only `type: "binary"`,
// and the only cross-field rule is `reminderEnabled === true ⇒ reminderTime`.
// Server-side fields (trainerId, seedSource, createdAt, updatedAt, deleted, id)
// are NEVER on the input — `.parse()` strips them silently.

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

  // T15 — a non-binary (legacy) habit type is rejected now
  it("T15 — rejects a non-binary habit type ('numeric')", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      type: "numeric" as unknown as "binary",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "type")).toBe(true);
    }
  });
});

describe("habit-schema — habitUpdateSchemaForType", () => {
  // U01 — update with new name only (no refinement triggered)
  it("U01 — accepts a binary update with name change only", () => {
    const schema = habitUpdateSchemaForType("binary");
    const result = schema.safeParse({
      name: { en: "New name", es: "Nuevo nombre" },
      reminderEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  // U03 — update strips a client-attempted `type` override (omit'd from base)
  it("U03 — silently strips an attempted type-override on update", () => {
    const schema = habitUpdateSchemaForType("binary");
    const tampered = {
      name: { en: "ok", es: "ok" },
      reminderEnabled: false,
      type: "binary",
    } as unknown;
    const result = schema.safeParse(tampered);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).type).toBeUndefined();
    }
  });

  // U04 — update enforces reminderEnabled⇒reminderTime
  it("U04 — rejects reminderEnabled=true without reminderTime on update", () => {
    const schema = habitUpdateSchemaForType("binary");
    const result = schema.safeParse({
      name: { en: "Water", es: "Agua" },
      reminderEnabled: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "reminderTime"),
      ).toBe(true);
    }
  });

  // ── photoUrl + youtubeUrl (260602-moz) ────────────────────────────────────

  // P01 — habit valid WITHOUT photoUrl/youtubeUrl (both omittable)
  it("P01 — accepts a habit without photoUrl or youtubeUrl", () => {
    const result = habitCreateSchema.safeParse(BINARY_VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photoUrl).toBeUndefined();
      expect(result.data.youtubeUrl).toBeUndefined();
    }
  });

  // P02 — valid https photoUrl accepted
  it("P02 — accepts an https photoUrl", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      photoUrl: "https://cdn.example.com/habits/photo.jpg",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photoUrl).toBe(
        "https://cdn.example.com/habits/photo.jpg",
      );
    }
  });

  // P03 — valid gs:// photoUrl accepted (dropzone output)
  it("P03 — accepts a gs:// photoUrl", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      photoUrl: "gs://gcfitness-3476b.firebasestorage.app/habits/hab-x/photo.png",
    });
    expect(result.success).toBe(true);
  });

  // P04 — malformed photoUrl scheme rejected
  it("P04 — rejects a photoUrl that is neither https nor gs", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      photoUrl: "ftp://evil.example.com/x.jpg",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "photoUrl"),
      ).toBe(true);
    }
  });

  // P05 — youtu.be short link accepted
  it("P05 — accepts a youtu.be youtubeUrl", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
  });

  // P06 — youtube.com/watch?v= accepted
  it("P06 — accepts a youtube.com/watch?v= youtubeUrl", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
  });

  // P07 — non-youtube URL rejected
  it("P07 — rejects a non-youtube youtubeUrl (vimeo)", () => {
    const result = habitCreateSchema.safeParse({
      ...BINARY_VALID,
      youtubeUrl: "https://vimeo.com/123456",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "youtubeUrl"),
      ).toBe(true);
    }
  });

  // P08 — update schema also carries photoUrl/youtubeUrl
  it("P08 — update schema accepts photoUrl + youtubeUrl", () => {
    const schema = habitUpdateSchemaForType("binary");
    const result = schema.safeParse({
      name: { en: "Stretch", es: "Estirar" },
      reminderEnabled: false,
      photoUrl: "https://cdn.example.com/p.webp",
      youtubeUrl: "https://youtu.be/abc123",
    });
    expect(result.success).toBe(true);
  });
});

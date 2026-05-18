// workout-template-schema.ts
// Zod schema mirroring `GCFitnessCore/Sources/GCFitnessCore/Schema/WorkoutTemplate.swift`
// + `ExerciseRef.swift`.
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7):
//   Any rename or constraint change MUST be matched in:
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/WorkoutTemplate.swift
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/ExerciseRef.swift
//     .planning/schemas/workout-templates.md
//     firestore.rules (planned P04-02 keys() guard)
//   in the SAME commit. Drift between the surfaces is a Pitfall 7 contract
//   break — the JSON-substring tests on the Swift side + this schema's
//   `safeParse` round-trip on the TS side both lock the literal field names.
//
// WIRE-FORMAT NOTE:
//   `rest_seconds` is snake_case to match the Firestore rule-layer guard and
//   the Swift `ExerciseRef.CodingKeys.restSeconds = "rest_seconds"` bridge.
//   Do NOT camelCase here — every other camelCase field uses its Swift name
//   verbatim, but `rest_seconds` is the documented snake_case exception
//   inside `exercises[]`.
//
// SERVER-SIDE FIELDS — NOT IN THIS SCHEMA:
//   `trainerId`, `version`, `createdAt`, `updatedAt`, `deleted`, `id` are
//   ALL set by `workout-template-actions.ts` from the session / Admin SDK.
//   They are NEVER trusted from client input. The strip happens by virtue
//   of `z.object({...}).strict()`-equivalent behavior here: Zod's default
//   `.parse()` drops unknown keys, so `trainerId: "victim-uid"` in the
//   input never makes it into the output. Tests T10 + T11 lock this.

import { z } from "zod";

// The 7-case tag enum mirrors `WorkoutTemplate.Tag` raw values from
// `WorkoutTemplate.swift` verbatim. The hyphenated `"full-body"` raw value
// matches the schema doc (`workout-templates.md` line 63) — Swift's
// `fullBody = "full-body"` case raw and this TS literal must agree.
export const workoutTagSchema = z.enum([
  "push",
  "pull",
  "legs",
  "full-body",
  "upper",
  "lower",
  "custom",
]);

export type WorkoutTag = z.infer<typeof workoutTagSchema>;

// LocalizedString — same {en, es} shape used by the Exercise schema. EN is
// REQUIRED; ES may be empty (UI falls back to EN). Both share the 80-char
// ceiling appropriate for a template name (an exercise name is 120 chars;
// a template is a higher-level grouping with tighter naming).
const localizedStringSchema = z.object({
  en: z
    .string()
    .min(1, "Name in English is required.")
    .max(80, "Keep the name under 80 characters."),
  es: z
    .string()
    .max(80, "Keep the name under 80 characters.")
    .default(""),
});

// Description is optional — trainers can ship a template with just a name +
// exercises. When present, both EN and ES are optional + bounded.
const localizedDescriptionSchema = z.object({
  en: z.string().max(2000, "Description must be under 2,000 characters.").default(""),
  es: z.string().max(2000, "Description must be under 2,000 characters.").default(""),
});

// Per-exercise prescription. Wire format mirrors `ExerciseRef.swift` —
// snake_case `rest_seconds` is intentional (rule contract, P04-02).
//
// Reps stays STRICT-INT v1 (Pitfall 10). A future v2 may widen to
// `z.union([z.number().int(), z.string().regex(...)])` once the iOS Codable
// + rule layers can accept either; for v1, accepting a string here would
// produce a Pitfall-7 mismatch with the Swift `var reps: Int` declaration.
export const exerciseRefSchema = z.object({
  exerciseId: z
    .string()
    .min(1, "Pick an exercise before saving."),
  sets: z
    .number()
    .int()
    .min(1, "Sets must be at least 1.")
    .max(10, "Sets max is 10."),
  reps: z
    .number()
    .int()
    .min(1, "Reps must be at least 1.")
    .max(50, "Reps max is 50."),
  rest_seconds: z
    .number()
    .int()
    .min(0, "Rest seconds cannot be negative.")
    .max(600, "Rest seconds max is 600 (10 min)."),
  notes: z
    .string()
    .max(500, "Keep coaching notes under 500 characters.")
    .optional(),
  order: z.number().int().min(0),
});

export type ExerciseRefInput = z.infer<typeof exerciseRefSchema>;

// Top-level template. Server-side fields (trainerId, version, createdAt,
// updatedAt, deleted, id) are explicitly excluded — they live in the
// Server Action, never on input. Zod's default behavior on extra keys is
// to STRIP them silently; tests T10 + T11 verify this lock.
export const workoutTemplateSchema = z.object({
  name: localizedStringSchema,
  description: localizedDescriptionSchema.optional(),
  tag: workoutTagSchema,
  exercises: z
    .array(exerciseRefSchema)
    .min(1, "Add at least one exercise to the template.")
    .max(30, "Maximum 30 exercises per template."),
});

export type WorkoutTemplateInput = z.infer<typeof workoutTemplateSchema>;

// Partial — used by `updateWorkoutTemplate` which patches subsets of the
// shape. We still apply the per-array bound (min(1)) on `exercises` when
// the field IS present — a partial update that includes an empty array
// is treated as a malformed payload.
export const workoutTemplateUpdateSchema = z.object({
  name: localizedStringSchema.optional(),
  description: localizedDescriptionSchema.optional(),
  tag: workoutTagSchema.optional(),
  exercises: z
    .array(exerciseRefSchema)
    .min(1, "Add at least one exercise to the template.")
    .max(30, "Maximum 30 exercises per template.")
    .optional(),
});

export type WorkoutTemplateUpdateInput = z.infer<
  typeof workoutTemplateUpdateSchema
>;

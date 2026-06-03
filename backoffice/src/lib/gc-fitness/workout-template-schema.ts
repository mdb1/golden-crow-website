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
//   `rest_seconds` and `transition_rest_seconds` are snake_case to match the
//   Firestore rule-layer guard and the Swift
//   `ExerciseRef.CodingKeys.restSeconds = "rest_seconds"` /
//   `transitionRestSeconds = "transition_rest_seconds"` bridge.
//   Do NOT camelCase here — every other camelCase field uses its Swift name
//   verbatim, but the rest fields are the documented snake_case exceptions
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

// Tags are trainer-defined free text in v1. We still keep the canonical
// defaults in the UI, but the schema no longer hard-codes a closed enum.
export const workoutTagSchema = z
  .string()
  .trim()
  .min(1, "Add a training tag.")
  .max(40, "Keep the tag under 40 characters.");

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
export const exerciseRefSchema = z
  .object({
    exerciseId: z
      .string()
      .min(1, "Pick an exercise before saving."),
    sets: z
      .number()
      .int()
      .min(1, "Sets must be at least 1.")
      .max(10, "Sets max is 10."),
    // reps=0 is a deliberate "no fixed count" prescription — used for warmup
    // / mobility / preparation work where the client is told to move for a
    // duration or to feel rather than a target number. Both the backoffice UI
    // and the iOS workout view should treat 0 as "—" / "open" (display polish
    // handled at the view layer, not via schema constraint).
    reps: z
      .number()
      .int()
      .min(0, "Reps cannot be negative.")
      .max(50, "Reps max is 50."),
    rest_seconds: z
      .number()
      .int()
      .min(0, "Rest seconds cannot be negative.")
      .max(600, "Rest seconds max is 600 (10 min)."),
    transition_rest_seconds: z
      .number()
      .int()
      .min(0, "Transition rest seconds cannot be negative.")
      .max(600, "Transition rest seconds max is 600 (10 min).")
      .default(60),
    notes: z
      .string()
      .max(500, "Keep coaching notes under 500 characters.")
      .optional(),
    // Per-set reps mirror the exercise-level reps: 0 is the deliberate
    // "open / no fixed count" signal (warmup / mobility set).
    repsBySet: z
      .array(
        z.number().int().min(0, "Reps per set cannot be negative.").max(50, "Reps per set max is 50."),
      )
      .max(10, "Maximum 10 rep entries.")
      .optional(),
    weightBySetKg: z
      .array(
        z.number().min(0, "Weight per set cannot be negative.").max(500, "Weight per set max is 500kg."),
      )
      .max(10, "Maximum 10 weight entries.")
      .optional(),
    supersetGroup: z
      .string()
      .trim()
      .max(20, "Superset label max is 20 characters.")
      .optional(),
    order: z.number().int().min(0),

    // 26-01 — Per-template metric override. Optional: nil means "fall
    // back to the source exercise's `metric` (Exercise.metric, defaulted
    // to 'reps')". When the trainer flips a plank from the default reps
    // prescription to a hold prescription, this carries "time" on the
    // template doc. PATTERNS.md §13 + PLAN.md §4.2. Mirror enum literals
    // MUST stay aligned with the iOS ExerciseMetric raw values (Pitfall-7
    // contract surfaces).
    metric: z.enum(["reps", "time"]).optional(),

    // 26-01 — Per-set duration prescription in seconds (analog of
    // repsBySet). Each entry is the prescribed hold for that specific
    // set. Bounds 5..1800 (5 s – 30 min) match the iOS forgiving range
    // guard on SetLog.durationSeconds. Optional even when metric:
    // "time" — an empty array means "all sets share durationSeconds".
    durationBySetSeconds: z
      .array(
        z
          .number()
          .int()
          .min(5, "Duration must be at least 5 seconds.")
          .max(1800, "Duration max is 1800 seconds (30 min)."),
      )
      .max(10, "Maximum 10 duration entries.")
      .optional(),

    // 26-01 — Exercise-level duration fallback (analog of reps). Used
    // when durationBySetSeconds is absent / empty / shorter than `sets`.
    durationSeconds: z
      .number()
      .int()
      .min(5, "Duration must be at least 5 seconds.")
      .max(1800, "Duration max is 1800 seconds (30 min).")
      .optional(),
  })
  .superRefine((data, ctx) => {
    // 26-01 — When the trainer prescribes a time-based exercise, the
    // template MUST carry at least one usable duration (a scalar
    // fallback OR a non-empty per-set array). PLAN.md §4.2: "metric
    // === 'time' requires either durationSeconds > 0 OR a non-empty
    // durationBySetSeconds". The iOS active-workout VM otherwise has
    // nothing to count down on (zero would mean "infinite hold");
    // failing fast at Zod catches the misconfiguration at trainer-
    // authoring time, not at the moment the client taps Play. Path
    // surfaces under ["durationSeconds"] so the trainer-form's
    // <FormMessage /> renders next to the duration field, matching
    // PATTERNS.md §13.
    if (data.metric === "time") {
      const hasScalar =
        typeof data.durationSeconds === "number" && data.durationSeconds > 0;
      const hasArray =
        Array.isArray(data.durationBySetSeconds) &&
        data.durationBySetSeconds.length > 0;
      if (!hasScalar && !hasArray) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["durationSeconds"],
          message: "Time-based exercises require a duration.",
        });
      }
    }
  });

export type ExerciseRefInput = z.infer<typeof exerciseRefSchema>;

// Multi-tag list. A trainer can tag a workout with several muscle groups
// or motifs (Legs, Back, "manu", etc.) and the list view filters by any-
// of substring match. v1 caps at 8 entries to keep the row visualisation
// sane and to prevent abuse. Each entry inherits the same bounds as the
// legacy single tag.
export const workoutTagsSchema = z
  .array(workoutTagSchema)
  .max(8, "Maximum 8 tags per workout.")
  .default([]);

// Top-level template. Server-side fields (trainerId, version, createdAt,
// updatedAt, deleted, id) are explicitly excluded — they live in the
// Server Action, never on input. Zod's default behavior on extra keys is
// to STRIP them silently; tests T10 + T11 verify this lock.
//
// `tag` (singular) is kept for backwards compat — iOS clients + already-
// persisted Firestore docs read it. The Server Action writes both fields
// on every create / update so the read paths can migrate independently:
//   - new fields:  tags = [...]
//   - legacy mirror: tag = tags[0] ?? "custom"
export const workoutTemplateSchema = z.object({
  name: localizedStringSchema,
  description: localizedDescriptionSchema.optional(),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD.")
    .optional(),
  tag: workoutTagSchema,
  tags: workoutTagsSchema,
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
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD.")
    .optional(),
  tag: workoutTagSchema.optional(),
  tags: workoutTagsSchema.optional(),
  exercises: z
    .array(exerciseRefSchema)
    .min(1, "Add at least one exercise to the template.")
    .max(30, "Maximum 30 exercises per template.")
    .optional(),
});

export type WorkoutTemplateUpdateInput = z.infer<
  typeof workoutTemplateUpdateSchema
>;

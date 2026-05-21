// habit-schema.ts
// Zod schema mirroring `GCFitnessCore/Sources/GCFitnessCore/Schema/Habit.swift`
// and the canonical schema doc `.planning/schemas/habits.md`.
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7):
//   Any rename or constraint change MUST be matched in:
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Habit.swift
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/HabitType.swift
//     .planning/schemas/habits.md
//     gc-fitness/firestore.rules `/habits/{habitId}` block (P06-03)
//   in the SAME commit. Drift between surfaces is a Pitfall 7 contract break.
//
// WIRE-FORMAT NOTE (camelCase end-to-end):
//   Per P06-02 post-fix-`4482452` and the P06-03 rule layer, wire keys are
//   camelCase across every surface — `targetValue`, `reminderTime`,
//   `reminderEnabled`, `seedSource`. The 06-05 PLAN.md `<action>` text
//   originally called for snake_case bridges; that text predates the P06-02
//   cross-surface review that landed the camelCase decision. We mirror the
//   schema doc + the parallel-shipped rules (single source of truth).
//   The Swift `Habit.descriptionText → "description"` bridge is iOS-only
//   (CustomStringConvertible clash); the Zod schema sees the wire key
//   `description` directly.
//
// SERVER-SIDE FIELDS — NOT IN THIS SCHEMA:
//   `trainerId`, `seedSource`, `createdAt`, `updatedAt`, `deleted`, `id` are
//   ALL set by `habit-actions.ts` from the session / Admin SDK. They are
//   NEVER trusted from client input. The strip happens by virtue of Zod's
//   default `.parse()` behavior: unknown keys are dropped silently, so
//   `trainerId: "victim-uid"` in the input never survives. Tests T-strip-*
//   lock this defense-in-depth (mirrors T-04-14 + T-04-15 from P04-04).
//
// TYPE-CONDITIONAL VALIDATION:
//   The `superRefine` block enforces the four cross-field rules from the
//   schema doc (lines 59-65 of `habits.md`):
//     1. type === "multi-choice"  ⇒ options has ≥ 2 entries
//     2. type !== "multi-choice"  ⇒ options must be absent
//     3. type === "weight"        ⇒ targetValue must be absent
//     4. reminderEnabled === true ⇒ reminderTime must be present
//
//   `habitUpdateSchemaForType(existingType)` re-applies the same rules using
//   a closure-captured `existingType` because the immutable `type` field is
//   stripped from the update input (clients cannot mutate `type` — rule
//   layer P06-03 + this schema both enforce that immutability).

import { z } from "zod";

// HabitType enum — wire raw values mirror the Swift `HabitType` enum
// (incl. the hyphenated `"multi-choice"`). Locked in `habits.md`.
export const HABIT_TYPES = [
  "binary",
  "multi-choice",
  "numeric",
  "weight",
] as const;

export const habitTypeSchema = z.enum(HABIT_TYPES);

export type HabitType = z.infer<typeof habitTypeSchema>;

// LocalizedString — same {en, es} shape used by Exercise + WorkoutTemplate
// schemas. Habit names are bounded at 80 chars (template-style ceiling, not
// the 120 char exercise ceiling). EN required; ES is also required for v1
// per `habits.md` (the schema doc lists both as required string fields, no
// fallback).
const localizedStringSchema = z
  .object({
    en: z
      .string()
      .trim()
      .min(1, "Name in English is required.")
      .max(80, "Keep the name under 80 characters."),
    es: z
      .string()
      .trim()
      .min(1, "Name in Spanish is required.")
      .max(80, "Keep the name under 80 characters."),
  })
  .strict();

// Optional description — both EN and ES bounded, both required if
// `description` is supplied at all (matching the wire shape declared in
// `habits.md`). The schema doc keeps `description` optional at the
// document layer.
const localizedDescriptionSchema = z
  .object({
    en: z
      .string()
      .trim()
      .min(1, "Description in English is required when supplied.")
      .max(500, "Keep descriptions under 500 characters."),
    es: z
      .string()
      .trim()
      .min(1, "Description in Spanish is required when supplied.")
      .max(500, "Keep descriptions under 500 characters."),
  })
  .strict();

// Base shape — every field on a habit input EXCEPT `type` and `clientId`.
// `habitUpdateSchemaForType` reuses this shape via `.omit({type, clientId})`
// (immutable post-create — rule layer P06-03 also enforces).
const habitBaseShape = z.object({
  clientId: z.string().trim().min(1, "Pick a client to assign the habit to."),
  type: habitTypeSchema,
  name: localizedStringSchema,
  description: localizedDescriptionSchema.optional(),
  // multi-choice only — array of human-friendly option labels. Max 8 keeps
  // the iOS Menu picker readable on a 6.1" screen.
  options: z
    .array(z.string().trim().min(1).max(40))
    .max(8, "Maximum 8 options.")
    .optional(),
  // numeric only — target value (e.g. 8 glasses of water). Positive finite
  // float; the streak math reads this when set (≥ targetValue counts).
  targetValue: z.number().positive().finite().optional(),
  // numeric + weight — human unit string. Free-form to keep v1 simple.
  unit: z
    .string()
    .trim()
    .min(1)
    .max(20, "Keep the unit under 20 characters.")
    .optional(),
  // HH:mm 24-hour local-time string. Regex matches the schema doc spec.
  // iOS schedules a daily UNCalendarNotificationTrigger at this hour-minute.
  reminderTime: z
    .string()
    .regex(
      /^[0-2][0-9]:[0-5][0-9]$/,
      "Reminder time must be HH:mm 24-hour format.",
    )
    .optional(),
  reminderEnabled: z.boolean(),
  reminderCadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  reminderWeekdays: z
    .array(z.number().int().min(1).max(7))
    .max(7, "Pick up to 7 weekdays.")
    .optional(),
  reminderDayOfMonth: z.number().int().min(1).max(31).optional(),
});

// Shared superRefine logic — applied by both create and update schemas. The
// `existingType` argument lets the update path enforce the same conditional
// rules using the immutable parent doc's `type` (since the update input no
// longer carries `type` itself).
function applyTypeConditionalRules(
  data: {
    options?: string[];
    targetValue?: number;
    reminderTime?: string;
    reminderEnabled: boolean;
    reminderCadence?: "daily" | "weekly" | "monthly";
    reminderWeekdays?: number[];
    reminderDayOfMonth?: number;
  },
  effectiveType: HabitType,
  ctx: z.RefinementCtx,
): void {
  // Rule 1 + 2: options ↔ multi-choice mutual exclusivity.
  if (effectiveType === "multi-choice") {
    if (!data.options || data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Multi-choice habits need at least 2 options.",
      });
    }
  } else {
    if (data.options !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Options are only allowed on multi-choice habits.",
      });
    }
  }

  // Rule 3: weight habits never carry a targetValue (the value is recorded
  // per-log; a "target weight" makes no sense at the habit definition layer
  // — that lives on the future Goals collection, V2).
  if (effectiveType === "weight" && data.targetValue !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetValue"],
      message:
        "targetValue is not used for weight habits — record per-log value instead.",
    });
  }

  // Rule 4: reminderEnabled === true ⇒ reminderTime must be present.
  // Defense in depth: the iOS UI gates the reminderTime control behind the
  // reminderEnabled toggle, but a hand-crafted Server Action input could
  // try to enable reminders without a time.
  if (data.reminderEnabled === true && !data.reminderTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reminderTime"],
      message:
        "reminderTime is required when reminderEnabled is true.",
    });
  }

  if (data.reminderEnabled === true) {
    const cadence = data.reminderCadence ?? "daily";
    if (cadence === "weekly" && (!data.reminderWeekdays || data.reminderWeekdays.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reminderWeekdays"],
        message: "Weekly reminders need at least one weekday.",
      });
    }
    if (cadence === "monthly" && data.reminderDayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reminderDayOfMonth"],
        message: "Monthly reminders need a day of month.",
      });
    }
  }
}

// Create schema — the full payload a trainer submits to author a new habit.
// Server-side fields (trainerId, seedSource, createdAt, updatedAt, deleted,
// id) are NOT modeled here; Zod silently strips them on parse, so a
// `trainerId: "victim-uid"` in the input never makes it into the output.
// `habit-actions.ts` adds `trainerId` from the session AFTER parse.
export const habitCreateSchema = habitBaseShape.superRefine((data, ctx) => {
  applyTypeConditionalRules(data, data.type, ctx);
});

export type HabitCreateInput = z.input<typeof habitCreateSchema>;

export const habitTemplateCreateSchema = habitBaseShape
  .omit({ clientId: true })
  .superRefine((data, ctx) => {
    applyTypeConditionalRules(data, data.type, ctx);
  });

export type HabitTemplateCreateInput = z.input<
  typeof habitTemplateCreateSchema
>;

// Update schema — produced by a per-call factory that captures the existing
// habit's immutable `type`. The update input cannot carry `clientId` (FK,
// immutable) or `type` (immutable — changing type would invalidate every
// log's value-variant interpretation per P06-02 doc).
export function habitUpdateSchemaForType(existingType: HabitType) {
  return habitBaseShape
    .omit({ clientId: true, type: true })
    .superRefine((data, ctx) => {
      applyTypeConditionalRules(data, existingType, ctx);
    });
}

export type HabitUpdateInput = z.input<
  ReturnType<typeof habitUpdateSchemaForType>
>;

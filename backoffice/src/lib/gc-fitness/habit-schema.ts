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
//   Habits are BINARY-ONLY (yes/no). The only cross-field rule that remains is:
//     reminderEnabled === true ⇒ reminderTime must be present
//   The legacy multi-choice/numeric/weight conditional rules were removed when
//   the product collapsed to binary-only habits (TS↔Swift parity: the Swift
//   `HabitType` enum + `firestore.rules` were collapsed in the same change).
//
//   `habitUpdateSchemaForType(existingType)` re-applies the same rule using
//   a closure-captured `existingType` because the immutable `type` field is
//   stripped from the update input (clients cannot mutate `type` — rule
//   layer P06-03 + this schema both enforce that immutability).

import { z } from "zod";

// HabitType enum — binary-only. Mirrors the now-collapsed Swift `HabitType`
// enum. Locked in `habits.md`.
export const HABIT_TYPES = ["binary"] as const;

export const habitTypeSchema = z.enum(HABIT_TYPES);

export type HabitType = z.infer<typeof habitTypeSchema>;
export const HABIT_SCHEDULE_TYPES = ["one-time", "recurring"] as const;
export type HabitScheduleType = (typeof HABIT_SCHEDULE_TYPES)[number];

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
    en: z.string().trim().max(500, "Keep descriptions under 500 characters.").optional(),
    es: z.string().trim().max(500, "Keep descriptions under 500 characters.").optional(),
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
  // Optional reference photo — either an `https://` URL (manual link) or a
  // `gs://` Storage path (the HabitPhotoDropzone returns the gs:// path after
  // uploading to Firebase Storage). Both schemes accepted; habits without a
  // photo are the common case. TS↔Swift parity: `Habit.photoUrl: String?`.
  photoUrl: z
    .string()
    .trim()
    .regex(
      /^(https:\/\/|gs:\/\/)\S+$/,
      "Photo URL must be an https:// link or a gs:// Storage path.",
    )
    .optional(),
  // Optional YouTube demo link — youtube.com/watch?v=… or youtu.be/… only.
  // TS↔Swift parity: `Habit.youtubeUrl: String?`.
  youtubeUrl: z
    .string()
    .trim()
    .regex(
      /^https:\/\/(www\.)?(youtube\.com\/watch\?(\S*&)?v=[\w-]+(\S*)?|youtu\.be\/[\w-]+(\S*)?)$/,
      "Must be a youtube.com/watch?v=… or youtu.be/… URL.",
    )
    .optional(),
  // Optional back-link to the /habit_templates doc this assignment was created
  // from. Set when assigning a template (Library "assign" action OR the agenda
  // assign-existing flow). Lets `updateHabitTemplate` cascade content-field
  // edits (description/photo/youtube) onto its linked assignments. Internal —
  // never rendered in the form. Habits created blank have no source template.
  sourceTemplateId: z.string().trim().min(1).optional(),
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
  reminderMonthDays: z
    .array(z.number().int().min(1).max(31))
    .min(1, "Pick at least one day of month.")
    .max(31, "Pick up to 31 days.")
    .optional(),
  scheduleType: z.enum(HABIT_SCHEDULE_TYPES).default("recurring"),
  startsOn: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Start date must be YYYY-MM-DD.",
      )
      .optional(),
  ),
  endsOn: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "End date must be YYYY-MM-DD.",
      )
      .optional(),
  ),
  scheduleCadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  scheduleWeekdays: z
    .array(z.number().int().min(1).max(7))
    .max(7, "Pick up to 7 weekdays.")
    .optional(),
  scheduleDayOfMonth: z.number().int().min(1).max(31).optional(),
  scheduleMonthDays: z
    .array(z.number().int().min(1).max(31))
    .min(1, "Pick at least one day of month.")
    .max(31, "Pick up to 31 days.")
    .optional(),
});

// Shared superRefine logic — applied by both create and update schemas.
// Habits are binary-only, so the only cross-field rules left are the
// reminder/schedule cadence ones.
function applyTypeConditionalRules(
  data: {
    reminderTime?: string;
    reminderEnabled: boolean;
    reminderCadence?: "daily" | "weekly" | "monthly";
    reminderWeekdays?: number[];
    reminderDayOfMonth?: number;
    reminderMonthDays?: number[];
    scheduleType?: HabitScheduleType;
    startsOn?: string;
    endsOn?: string;
    scheduleCadence?: "daily" | "weekly" | "monthly";
    scheduleWeekdays?: number[];
    scheduleDayOfMonth?: number;
    scheduleMonthDays?: number[];
  },
  ctx: z.RefinementCtx,
): void {
  // Rule: reminderEnabled === true ⇒ reminderTime must be present.
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
      if (!data.reminderMonthDays || data.reminderMonthDays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reminderMonthDays"],
          message: "Monthly reminders need at least one day of month.",
        });
      }
    }
  }

  const startsOn = data.startsOn;
  if (data.endsOn && startsOn && data.endsOn < startsOn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsOn"],
      message: "End date must be on or after start date.",
    });
  }

  if (data.scheduleType === "one-time") {
    if (data.endsOn && startsOn && data.endsOn !== startsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "One-time habits must end on the same date as start date.",
      });
    }
    if (data.scheduleCadence !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduleCadence"],
        message: "One-time habits cannot define cadence.",
      });
    }
    if (data.scheduleWeekdays !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduleWeekdays"],
        message: "One-time habits cannot define weekdays.",
      });
    }
    if (data.scheduleDayOfMonth !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduleDayOfMonth"],
        message: "One-time habits cannot define day of month.",
      });
    }
    return;
  }

  const scheduleCadence = data.scheduleCadence ?? "daily";
  if (scheduleCadence === "weekly") {
    if (!data.scheduleWeekdays || data.scheduleWeekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduleWeekdays"],
        message: "Weekly habits need at least one weekday.",
      });
    }
  } else if (data.scheduleWeekdays !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduleWeekdays"],
      message: "Weekdays are only valid for weekly cadence.",
    });
  }

  if (scheduleCadence === "monthly") {
    if (
      data.scheduleDayOfMonth === undefined &&
      (!data.scheduleMonthDays || data.scheduleMonthDays.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduleMonthDays"],
        message: "Monthly habits need at least one day of month.",
      });
    }
  } else if (data.scheduleDayOfMonth !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduleDayOfMonth"],
      message: "Day of month is only valid for monthly cadence.",
    });
  } else if (data.scheduleMonthDays !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduleMonthDays"],
      message: "Days of month are only valid for monthly cadence.",
    });
  }

  if (data.reminderEnabled === true && (data.reminderCadence ?? "daily") !== "monthly" && data.reminderMonthDays !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reminderMonthDays"],
      message: "Days of month are only valid for monthly reminders.",
    });
  }
}

// Create schema — the full payload a trainer submits to author a new habit.
// Server-side fields (trainerId, seedSource, createdAt, updatedAt, deleted,
// id) are NOT modeled here; Zod silently strips them on parse, so a
// `trainerId: "victim-uid"` in the input never makes it into the output.
// `habit-actions.ts` adds `trainerId` from the session AFTER parse.
export const habitCreateSchema = habitBaseShape.superRefine((data, ctx) => {
  applyTypeConditionalRules(data, ctx);
});

export type HabitCreateInput = z.input<typeof habitCreateSchema>;

export const habitTemplateCreateSchema = habitBaseShape
  .omit({ clientId: true })
  .superRefine((data, ctx) => {
    applyTypeConditionalRules(data, ctx);
  });

export type HabitTemplateCreateInput = z.input<
  typeof habitTemplateCreateSchema
>;

// Update schema — produced by a per-call factory that captures the existing
// habit's immutable `type`. The update input cannot carry `clientId` (FK,
// immutable) or `type` (immutable — changing type would invalidate every
// log's value-variant interpretation per P06-02 doc).
export function habitUpdateSchemaForType(_existingType: HabitType) {
  return habitBaseShape
    .omit({ clientId: true, type: true })
    .superRefine((data, ctx) => {
      applyTypeConditionalRules(data, ctx);
    });
}

export type HabitUpdateInput = z.input<
  ReturnType<typeof habitUpdateSchemaForType>
>;

// Template update — the trainer-editable subset of a reusable habit template
// (library). `type` and `scope`/`trainerId` are immutable; recurrence is a
// per-assignment concern (not shown in the library), so it's excluded too.
// Only the intrinsic fields surfaced in the library detail are editable.
// `photoUrl`/`youtubeUrl` are intrinsic habit context (not per-assignment), so
// they ARE editable here and propagate to the per-client doc on assignment.
export const habitTemplateUpdateSchema = habitBaseShape.pick({
  name: true,
  description: true,
  photoUrl: true,
  youtubeUrl: true,
  reminderEnabled: true,
  reminderTime: true,
});

export type HabitTemplateUpdateInput = z.input<
  typeof habitTemplateUpdateSchema
>;

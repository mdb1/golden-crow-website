// workout-assignment-schema.ts
// Zod schemas for the workout-assignment Server Actions in 04-05.
//
// Mirrors the Swift Codable contract in:
//   gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/WorkoutAssignment.swift
// and the canonical schema doc:
//   gc-fitness/.planning/schemas/workout-assignments.md
//
// Pitfall 1 (UTC drift): `scheduledFor` is a "YYYY-MM-DD" CIVIL DATE STRING,
//   NEVER a Timestamp. The 10-char regex below is a defense-in-depth guard
//   on top of the rule-layer regex from 04-02 — if a caller hands a malformed
//   string, Zod rejects it before it reaches Firestore.
//
// WTPL-06 bulk cap (Pitfall 5): the bulk-assign Server Action writes via a
//   single Firestore `WriteBatch`. Firestore caps batches at 500 ops; each
//   assignment write costs 3 ops (1 set + 2 serverTimestamp transforms), so
//   the hard cap is `floor(500 / 3) = 166` clients per submit. The Zod
//   max(166) below is the FIRST safety net; the Server Action re-asserts it.

import { z } from "zod";

/** Rule-layer civil-date regex from 04-02 (`matches('^\\d{4}-\\d{2}-\\d{2}$')`). */
export const CIVIL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Firestore WriteBatch op budget (Firestore platform invariant). */
export const MAX_OPS_PER_BATCH = 500;

/** Ops per assignment write: 1 `set` + 2 `serverTimestamp` transforms. */
export const OPS_PER_ASSIGNMENT = 3;

/** Hard cap on clients per bulk-assign call: `floor(500 / 3) = 166`. */
export const MAX_CLIENTS_PER_BATCH = Math.floor(
  MAX_OPS_PER_BATCH / OPS_PER_ASSIGNMENT,
);

// IANA timezone strings are intentionally loose — `Intl.DateTimeFormat`
// already falls back gracefully on unknown ids (see civil-date.ts), and we
// don't want to ship a hardcoded vocabulary that drifts from tzdata.
const ianaTimezoneSchema = z
  .string()
  .min(1, "Timezone identifier is required.")
  .max(128, "Timezone identifier is too long.")
  .optional();

const civilDateSchema = z
  .string()
  .regex(
    CIVIL_DATE_REGEX,
    "scheduledFor must be a 'YYYY-MM-DD' civil-date string.",
  );

const scheduledTimeSchema = z
  .string()
  .regex(/^[0-2][0-9]:[0-5][0-9]$/, "scheduledTime must be HH:mm.")
  .optional();

const meetingNotesSchema = z
  .string()
  .trim()
  .min(1, "meetingNotes cannot be empty.")
  .max(1000, "meetingNotes is too long.")
  .optional();

const assignmentExerciseOverrideSchema = z.object({
  index: z.number().int().min(0),
  sets: z.number().int().min(1).max(10).optional(),
  reps: z.number().int().min(1).max(50).optional(),
  rest_seconds: z.number().int().min(0).max(600).optional(),
  transition_rest_seconds: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(500).optional(),
  weightBySetKg: z.array(z.number().min(0).max(500)).max(10).optional(),
  repsBySet: z.array(z.number().int().min(1).max(50)).max(10).optional(),
  // 26-01 — Per-client override mirrors of the template-side metric +
  // duration fields. Optional and permissive: a trainer assigning a
  // plank to a single client may tweak ONLY the per-set duration array
  // without restating the metric, so we do not impose the template-side
  // "metric: time requires duration" superRefine here. PATTERNS.md §14.
  metric: z.enum(["reps", "time"]).optional(),
  durationBySetSeconds: z
    .array(z.number().int().min(5).max(1800))
    .max(10)
    .optional(),
  durationSeconds: z.number().int().min(5).max(1800).optional(),
});

/**
 * `assignTemplate(input)` — single-client assignment.
 *
 * `trainerId` is INTENTIONALLY ABSENT from this schema — it is set by the
 * Server Action from `getCurrentTrainer().uid`, never from caller input. A
 * caller that attaches a `trainerId` field will see it silently ignored.
 */
export const assignTemplateSchema = z.object({
  templateId: z.string().min(1, "templateId is required."),
  clientId: z.string().min(1, "clientId is required."),
  scheduledFor: civilDateSchema,
  scheduledTime: scheduledTimeSchema,
  meetingNotes: meetingNotesSchema,
  timezone: ianaTimezoneSchema,
  exerciseOverrides: z.array(assignmentExerciseOverrideSchema).max(50).optional(),
});

export type AssignTemplateInput = z.infer<typeof assignTemplateSchema>;

/**
 * `bulkAssignTemplate(input)` — fan-out to N clients in a single atomic
 * WriteBatch. Cap is `MAX_CLIENTS_PER_BATCH` (166) per Pitfall 5; the
 * Server Action re-asserts the cap defensively after parse.
 */
export const bulkAssignSchema = z.object({
  templateId: z.string().min(1, "templateId is required."),
  clientIds: z
    .array(z.string().min(1, "clientId entries cannot be empty strings."))
    .min(1, "Pick at least one client.")
    .max(
      MAX_CLIENTS_PER_BATCH,
      `Bulk-assign supports at most ${MAX_CLIENTS_PER_BATCH} clients per submit.`,
  ),
  scheduledFor: civilDateSchema,
  scheduledTime: scheduledTimeSchema,
  meetingNotes: meetingNotesSchema,
  timezone: ianaTimezoneSchema,
});

export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;

/**
 * `assignTemplateRecurring(input)` — single-client recurrence.
 *
 * `endDate` is optional. When omitted, the server applies a rolling horizon
 * cap to avoid unbounded writes.
 *
 * Accepts THREE alternative input shapes (Server Action normalizes to a
 * canonical RecurrenceRule before date expansion):
 *   1. legacy `weekday: 0..6` (single weekday — pre-21-04 callers)
 *   2. `weekdays: [0..6]` array (Plan 21-04 multi-weekday)
 *   3. `recurrence: RecurrenceRule` (Plan 21-04b — full canonical shape
 *      including `daily` and `every_n_days`)
 *
 * Exactly ONE of the three must be present. superRefine enforces this.
 */
export const assignTemplateRecurringSchema = z
  .object({
    templateId: z.string().min(1, "templateId is required."),
    clientId: z.string().min(1, "clientId is required."),
    startDate: civilDateSchema,
    weekday: z.number().int().min(0).max(6).optional(), // legacy single
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Pick at least one weekday.")
      .max(7)
      .optional(),
    recurrence: z.lazy(() => recurrenceSchema).optional(),
    endDate: civilDateSchema.optional(),
    scheduledTime: scheduledTimeSchema,
    meetingNotes: meetingNotesSchema,
    timezone: ianaTimezoneSchema,
    exerciseOverrides: z.array(assignmentExerciseOverrideSchema).max(50).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasOne = data.weekday !== undefined;
    const hasMany = data.weekdays !== undefined && data.weekdays.length > 0;
    const hasCanonical = data.recurrence !== undefined;
    const inputCount = [hasOne, hasMany, hasCanonical].filter(Boolean).length;
    if (inputCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrence"],
        message: "Pick a recurrence (weekday, weekdays, or recurrence).",
      });
    }
    if (inputCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrence"],
        message: "Provide exactly one of `weekday`, `weekdays`, or `recurrence`.",
      });
    }
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be on or after startDate.",
      });
    }
  });

export type AssignTemplateRecurringInput = z.infer<
  typeof assignTemplateRecurringSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Canonical recurrence shape on workout_assignments docs (Plan 21-03)
// ─────────────────────────────────────────────────────────────────────────────
//
// Mirrors the Swift WorkoutRecurrence enum on iOS. Discriminated by `kind`.
// Backward-compat: the LEGACY `{ kind: "weekly", weekday: 0..6 }` shape
// written by `assignTemplateRecurring` is included verbatim so existing PROD
// docs decode as-is. New recurrence types (`weekly_days`, `every_n_days`,
// `daily`, `single`) land here for editor + iOS consumer plans 21-04/05.
//
// iOS forgiving decoder maps any unknown `kind` to `.single` so an older app
// reading a newer doc never crashes — Pattern B 5th reuse (forgiving decode).

export const recurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("single"),
  }),
  z.object({
    kind: z.literal("daily"),
  }),
  z.object({
    // Legacy weekly shape — currently written by assignTemplateRecurring.
    // Single ISO weekday (0=Sun..6=Sat) per JS Date.getDay() convention.
    kind: z.literal("weekly"),
    weekday: z.number().int().min(0).max(6),
  }),
  z.object({
    kind: z.literal("weekly_days"),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, "At least one weekday is required.")
      .max(7),
  }),
  z.object({
    kind: z.literal("every_n_days"),
    everyN: z.number().int().min(2).max(30),
  }),
  z.object({
    // Monthly on the same day-of-month as startDate. When a target month
    // doesn't have that day (e.g., dayOfMonth=31 in February), the matcher
    // clamps to the last day of that month.
    kind: z.literal("monthly"),
    dayOfMonth: z.number().int().min(1).max(31),
  }),
]);

export type RecurrenceRule = z.infer<typeof recurrenceSchema>;

/**
 * `editAssignmentScheduledFor(id, input)` — the ONLY edit path on an
 * existing assignment (per supplemental decision 1 in 04-05-PLAN.md). The
 * rule layer (04-02) enforces `affectedKeys().hasOnly(['scheduledFor',
 * 'updatedAt'])`, so any caller that sends additional fields here will fail
 * at the rule layer even if Zod were widened — keeping Zod strict matches
 * the rule layer truth.
 *
 * Uses `.strict()` so unknown keys are REJECTED (not silently dropped) —
 * a caller probing the API by sending `{ scheduledFor, templateSnapshot }`
 * should see a clear validation error, not a partial success.
 */
export const editAssignmentSchema = z
  .object({
    scheduledFor: civilDateSchema,
    scheduledTime: scheduledTimeSchema,
    meetingNotes: meetingNotesSchema,
  })
  .strict();

export type EditAssignmentInput = z.infer<typeof editAssignmentSchema>;

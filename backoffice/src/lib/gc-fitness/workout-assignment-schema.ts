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
 * `assignTemplateRecurring(input)` — single-client weekly recurrence.
 *
 * `endDate` is optional. When omitted, the server applies a rolling horizon
 * cap to avoid unbounded writes.
 *
 * Plan 21-04: accepts either the legacy single `weekday: 0..6` shape OR the
 * new `weekdays: [0..6]` array (1-7 entries). Exactly one must be present.
 * The Server Action normalizes both to a canonical `weekdays: number[]`
 * before date expansion, so a Mon/Wed/Fri schedule is one call instead of
 * three.
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
    endDate: civilDateSchema.optional(),
    scheduledTime: scheduledTimeSchema,
    meetingNotes: meetingNotesSchema,
    timezone: ianaTimezoneSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasOne = data.weekday !== undefined;
    const hasMany = data.weekdays !== undefined && data.weekdays.length > 0;
    if (!hasOne && !hasMany) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Pick at least one weekday (weekday or weekdays).",
      });
    }
    if (hasOne && hasMany) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Provide either `weekday` or `weekdays`, not both.",
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

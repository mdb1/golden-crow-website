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
  timezone: ianaTimezoneSchema,
});

export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;

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
  })
  .strict();

export type EditAssignmentInput = z.infer<typeof editAssignmentSchema>;

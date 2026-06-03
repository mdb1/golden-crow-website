// live-workout-schema.ts
//
// Zod schemas for the live-workout (coach-run session) Server Actions.
// trainerId / clientId-of-record are NEVER taken from these inputs for
// authorization — the Server Action sources the trainer from
// getCurrentTrainer() and reads clientId off the assignment/log doc.

import { z } from "zod";

/** Lowercased UUID-ish id; loose on format, strict on emptiness. */
const idSchema = z.string().min(1).max(128);

const isoDateSchema = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO-8601 instant");

/** One logged set as sent from the live-session UI (camelCase). */
export const sessionSetLogSchema = z.object({
  id: idSchema,
  exerciseId: idSchema,
  setIndex: z.number().int().min(0).max(99),
  weightKg: z.number().min(0).max(2000),
  reps: z.number().int().min(0).max(100),
  completedAt: isoDateSchema,
  isWarmup: z.boolean(),
  clientLoggedAt: isoDateSchema,
  durationSeconds: z.number().int().min(1).max(86_400).nullish(),
});

export const startSessionSchema = z.object({
  assignmentId: idSchema,
});
export type StartSessionInput = z.infer<typeof startSessionSchema>;

/** Persist the in-progress sets (resilience / reload-resume). */
export const syncSessionSchema = z.object({
  logId: idSchema,
  sets: z.array(sessionSetLogSchema).max(500),
});
export type SyncSessionInput = z.infer<typeof syncSessionSchema>;

/**
 * One exercise of the (possibly coach-edited) snapshot to persist on
 * finalize / future-recurrence propagation. Mirrors the templateSnapshot
 * exercise shape; permissive so a coach can add/modify exercises live.
 */
export const sessionExerciseSnapshotSchema = z.object({
  exerciseId: idSchema,
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(0).max(100),
  restSeconds: z.number().int().min(0).max(3600),
  notes: z.string().max(1000).nullish(),
  order: z.number().int().min(1).max(100),
  supersetGroup: z.string().max(8).nullish(),
  repsBySet: z.array(z.number().int().min(0).max(100)).max(20).nullish(),
  weightBySetKg: z.array(z.number().min(0).max(2000)).max(20).nullish(),
  metric: z.enum(["reps", "time"]).nullish(),
  durationBySetSeconds: z.array(z.number().int().min(1).max(86_400)).max(20).nullish(),
  durationSeconds: z.number().int().min(1).max(86_400).nullish(),
});

export const finalizeSessionSchema = z.object({
  logId: idSchema,
  sets: z.array(sessionSetLogSchema).max(500),
  rpe: z.number().int().min(1).max(10).nullish(),
  notes: z.string().max(2000).nullish(),
  /**
   * Persistence scope of any STRUCTURAL edits the coach made this session.
   *   - "session": only this session's log is written (completed).
   *   - "session_and_future": ALSO rewrite the templateSnapshot of this
   *     client's future-dated assignments in the same seriesId so they match
   *     what was just performed. Those stay `scheduled` (never completed).
   */
  mode: z.enum(["session", "session_and_future"]).default("session"),
  /**
   * The edited exercise structure to propagate when mode is
   * "session_and_future". Required (non-empty) for that mode; ignored for
   * "session". Validated in the Server Action.
   */
  editedExercises: z.array(sessionExerciseSnapshotSchema).max(100).optional(),
});
export type FinalizeSessionInput = z.infer<typeof finalizeSessionSchema>;

/** Coach per-client per-exercise note read/write (#7). */
export const getClientExerciseNoteSchema = z.object({
  clientId: idSchema,
  exerciseId: idSchema,
});
export type GetClientExerciseNoteInput = z.infer<
  typeof getClientExerciseNoteSchema
>;

export const setClientExerciseNoteSchema = z.object({
  clientId: idSchema,
  exerciseId: idSchema,
  /** Empty string clears the note (the action deletes the doc). */
  note: z.string().max(1000),
});
export type SetClientExerciseNoteInput = z.infer<
  typeof setClientExerciseNoteSchema
>;

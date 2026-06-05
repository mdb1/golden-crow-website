// live-workout-types.ts
//
// Shared types for the backoffice live-workout (coach-run session) surface.
// Kept in a plain module (NOT a "use server" file) so both Server Actions
// and client components can import them — a "use server" file may only
// export async functions.
//
// Wire-contract note: these are the CAMELCASE backoffice-facing shapes. The
// Server Actions (live-workout-actions.ts) bridge them to the snake_case
// Firestore wire keys for `workout_logs` (`set_index`, `weight_kg`,
// `completed_at`, `is_warmup`, `client_logged_at`, `duration_seconds`,
// `assignment_id`, `total_volume_kg`) so the wire shape stays byte-identical
// to what the iOS app writes (SetLog.swift / WorkoutLog.swift CodingKeys).

import type { ExerciseMetric } from "./live-workout-supersets";

/** A localized string as stored on exercise/template docs. */
export interface LocalizedString {
  en: string;
  es?: string;
}

/**
 * One logged set, camelCase. The coach builds these in-memory during a live
 * session; the full array is persisted on sync/finalize. Mirrors SetLog.swift.
 */
export interface SessionSetLog {
  /** Lowercased UUID — the arrayUnion dedup key on the iOS side. */
  id: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  /** ISO-8601. */
  completedAt: string;
  isWarmup: boolean;
  /** ISO-8601 forensic client clock. */
  clientLoggedAt: string;
  /** Seconds, time-based sets only (plank/wall-sit/dead-hang). */
  durationSeconds?: number | null;
}

/**
 * A single exercise within the active session, enriched with media for the
 * UI. Built by the Server Action from the assignment's `templateSnapshot`
 * joined with the `exercises` library docs.
 */
export interface SessionExercise {
  exerciseId: string;
  name: LocalizedString;
  /** Planned set count. */
  sets: number;
  /** Per-set reps (fallback when repsBySet absent). */
  reps: number;
  /** Rest between sets, seconds. */
  restSeconds: number;
  /** Rest between exercises / transition fallback, seconds. */
  transitionRestSeconds?: number | null;
  /** Coach's template note (frozen on the snapshot), if any. */
  notes?: string | null;
  /** 1-based order. */
  order: number;
  /** Superset group label ("A", "B", …) or null for standalone. */
  supersetGroup?: string | null;
  /** Per-set reps override (ladder/pyramid). */
  repsBySet?: number[] | null;
  /** Per-set weight pre-fill, kg. */
  weightBySetKg?: number[] | null;
  /** reps | time. Defaults to reps when absent. */
  metric?: ExerciseMetric | null;
  /** Per-set durations (time exercises), seconds. */
  durationBySetSeconds?: number[] | null;
  /** Fallback duration (time exercises), seconds. */
  durationSeconds?: number | null;
  /** Video URL (gs:// or https) from the exercise library — resolved in UI. */
  mediaURL?: string | null;
  /** Preview/thumbnail (often the animated GIF). */
  thumbnailURL?: string | null;
}

/** The active session payload returned by start/get Server Actions. */
export interface ActiveSession {
  logId: string;
  assignmentId: string;
  clientId: string;
  trainerId: string;
  workoutName: LocalizedString;
  /** ISO-8601 — session start (server-stamped, may be null on the very first read). */
  startedAt: string | null;
  status: "active" | "completed" | "abandoned";
  /** Ordered exercises with media, from the (possibly edited) snapshot. */
  exercises: SessionExercise[];
  /** Sets logged so far (rehydrates a reload mid-session). */
  sets: SessionSetLog[];
  /** Meeting/reunion link or note from the assignment (#6). */
  meetingNotes?: string | null;
  /** "HH:mm" scheduled time, if any. */
  scheduledTime?: string | null;
  /** "YYYY-MM-DD". */
  scheduledFor: string;
  /** Shared id across a recurring series (drives the finalize "future" option). */
  seriesId?: string | null;
  /**
   * ISO-8601 of when the coach last set/changed this assignment's prescription
   * (`prescriptionUpdatedAt ?? createdAt`). Feeds the shared weight-prefill
   * rule so a coach plan change shows the routine once before reverting to the
   * client's remembered weights. Null only on the rare doc with neither stamp.
   */
  prescriptionUpdatedAt?: string | null;
}

/** Compact summary for notifications/sidebar surfaces. */
export interface ActiveWorkoutSummary {
  logId: string;
  assignmentId: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  startedAt: string | null;
  elapsedSeconds: number;
  currentExerciseName: string;
  currentSet: number;
  totalSets: number;
  completedSets: number;
  progress: number;
}

/** Per-exercise previous-session summary for the "ANTERIOR" column. */
export interface PreviousSetSummary {
  weightKg: number;
  reps: number;
  durationSeconds?: number | null;
  /**
   * ISO-8601 `completedAt` of the client's most recent COMPLETED log of this
   * exercise — the `lastLoggedAt` input to the shared weight-prefill rule
   * (resolveSetPrefill / WeightPrefillResolver). Null/absent when the exercise
   * was never logged. Additive: existing "ANTERIOR" column consumers ignore it.
   */
  lastLoggedAt?: string | null;
}

/** exerciseId → most-recent completed performance. */
export type PreviousSessionMap = Record<string, PreviousSetSummary>;

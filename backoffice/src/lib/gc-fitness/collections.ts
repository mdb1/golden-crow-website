// collections.ts
// TypeScript twin of GCFitnessCore Collections.swift.
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7 from 04-RESEARCH.md):
//   Any rename here MUST be matched in:
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Collections.swift
//   in the SAME commit. SchemaTests (Swift) + collections.test.ts (TS)
//   both lock the literal string values so neither side can drift silently.
//
// Naming convention: TypeScript keys are camelCase, but the string values
// themselves are snake_case to match the Firestore document path conventions
// locked in research/ARCHITECTURE.md section D. Do NOT change a value without
// renaming the underlying Firestore collection (which requires a data
// migration).
//
// Scope (as of P05-01):
//   `exercises`              — carried over from P03-02
//   `workoutTemplates`       — added in P04-01
//   `workoutAssignments`     — added in P04-01
//   `workoutLogs`            — NEW, this plan (P05-01)
//
// Future entries (`habits`, `habitLogs`, `chats`, `messages`, `fcmTokens`,
// etc.) live in the Swift source today and will be added here when the
// corresponding backoffice / Server-Action surfaces ship. The `workoutLogs`
// entry lands now even though the backoffice has no P5 read-side yet (P11
// territory) so the P04-01 same-commit invariant stays unbroken.

/**
 * Locked Firestore collection-name constants for the backoffice surface.
 *
 * Always reach for these constants rather than typing a literal string —
 * a typo on either the Swift or the TS side would silently split writes
 * and reads across phantom collections (Pitfall 7).
 *
 * Example:
 * ```ts
 * import { FirestoreCollections } from "@/lib/gc-fitness/collections";
 * const ref = db.collection(FirestoreCollections.workoutTemplates);
 * ```
 */
export const FirestoreCollections = {
  /** Top-level users collection. Documents are keyed by Firebase Auth UID. */
  users: "users",

  /** Exercise library — name, muscle groups, GIF URL, equipment. */
  exercises: "exercises",

  /** Workout templates authored by trainers (push/pull/legs style, reusable). */
  workoutTemplates: "workout_templates",

  /** A workout template assigned to a specific client with a schedule. */
  workoutAssignments: "workout_assignments",

  /**
   * Per-workout-session log written by the client iOS surface. Carries the
   * flat `sets[]` array + denormalized templateSnapshot at start-time.
   * Schema doc: `.planning/schemas/workout-logs.md`. Iframe / backoffice
   * read-side ships in P11; the iOS surface is the sole writer in P5.
   */
  workoutLogs: "workout_logs",
} as const;

/**
 * Type alias for the literal string-union of collection values.
 * Useful when a function needs to take "any collection name" without
 * widening to `string`.
 */
export type FirestoreCollectionName =
  (typeof FirestoreCollections)[keyof typeof FirestoreCollections];

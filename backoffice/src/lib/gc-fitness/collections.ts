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
// Scope (as of P08-04):
//   `exercises`              — carried over from P03-02
//   `workoutTemplates`       — added in P04-01
//   `workoutAssignments`     — added in P04-01
//   `workoutLogs`            — added in P05-01
//   `habits`                 — added in P06-01
//   `habitLogs`              — added in P06-01
//   `chats`                  — NEW, this plan (P08-04 — paired with Swift twin shipped P01-01)
//   `messages`               — NEW, this plan (P08-04 — paired with Swift twin shipped P01-01)
//   `progressPhotos`         — client progress-photo metadata
//   `clientNotes`            — trainer-private notes per client
//
// Future entries (`fcmTokens`, etc.) live in the Swift source today and will
// be added here when the corresponding backoffice / Server-Action surfaces
// ship. Same-commit invariant (Pitfall 7 — 9th reuse): chats + messages
// constants land alongside `chat-schema.ts` + `chat-server-actions.ts` in
// P08-04.

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

  /** Pre-created client placeholders keyed by lowercased email. */
  userMirror: "user_mirror",

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

  /**
   * Trainer-authored habit assignments. One doc per (client, habit) pair.
   * Schema doc: `.planning/schemas/habits.md`. Lands in P06-01.
   */
  habits: "habits",

  /**
   * Reusable habit definitions. Global templates are seeded/read-only;
   * trainer templates are copied into /habits when assigned to clients.
   */
  habitTemplates: "habit_templates",

  /**
   * Per-client-per-day habit check-in log. Composite doc ID
   * `${habitId}_${civilDate}` for idempotent re-tap.
   * Schema doc: `.planning/schemas/habit-logs.md`. Lands in P06-01.
   */
  habitLogs: "habit_logs",

  /**
   * Coach-authored short/medium/long-term goals visible to clients.
   */
  clientGoals: "client_goals",

  /**
   * 1:1 coach↔client chat metadata. Doc id = clientId (deterministic).
   * Reads / messages-subcollection writes governed by P08-01 rules;
   * parent-doc writes forbidden client-side (Cloud Function onMessageCreated
   * owns denorm — Pitfall 22). Added in P08-04 (paired with the Swift
   * twin which has shipped since P01-01).
   */
  chats: "chats",

  /**
   * Subcollection name for chat messages — accessed via
   * `chats/{chatId}/messages/{messageId}`. Added in P08-04.
   */
  messages: "messages",

  /**
   * Client-uploaded progress photo metadata. Binary objects live in Cloud
   * Storage under `progress_photos/{clientId}/...`; Firestore stores the
   * coach/client linkage plus caption/timestamp metadata for dashboard views.
   */
  progressPhotos: "progress_photos",

  /**
   * Trainer-private per-client notes. Clients cannot read this collection;
   * the deterministic doc id is `${coachId}_${clientId}`.
   */
  clientNotes: "client_notes",

  /**
   * GC Fitness coach allowlist managed from the admin backoffice.
   * Doc id: normalized lowercase email.
   */
  coachAllowlist: "coach_allowlist",
} as const;

/**
 * Type alias for the literal string-union of collection values.
 * Useful when a function needs to take "any collection name" without
 * widening to `string`.
 */
export type FirestoreCollectionName =
  (typeof FirestoreCollections)[keyof typeof FirestoreCollections];

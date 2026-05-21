// nudge-schema.ts
//
// Zod input schema for the `sendTrainerNudge` Server Action (P10-08).
// This is the WIRE-SHAPE mirror of the server-side validation living in
// the Cloud Function at `functions/src/push/sendTrainerNudge.ts` (P10-07):
//   - `NUDGE_MESSAGE_MAX = 200` (chars)
//   - `DOC_ID_MAX = 64` (Firestore doc-id max — the recipient `clientId`)
//   - `sanitizeMessage` — C0/C1 control-character strip (preserves `\n`)
//     + trim + non-empty after strip + length cap.
//
// Pitfall 7 (17th reuse — same-source-of-truth contract):
//   Drift between THIS schema and the 10-07 Cloud Function is a CONTRACT
//   BREAK. Symptom: the form accepts a 250-char message; the Server
//   Action's callable round-trips a confusing "invalid-argument" error.
//   Defense in depth — the form rejects first, the Server Action mirrors
//   the parse, the callable rejects last. All three caps live in one
//   number (200) and one helper (control-char strip).
//
// Prior Pitfall 7 reuses (chronological):
//    1. P03-02 ExerciseSchema  ↔ Exercise.swift
//    2. P04-01 WorkoutTemplate ↔ WorkoutTemplate.swift
//    3. P04-01 WorkoutAssignment ↔ WorkoutAssignment.swift
//    4. P05-01 WorkoutLog      ↔ WorkoutLog.swift
//    5. P05-01 SetLog          ↔ SetLog.swift
//    6. P06-01 Habit           ↔ Habit.swift + HabitType.swift
//    7. P06-01 HabitLog        ↔ HabitLog.swift + HabitLogValue.swift
//    8. P02-05 GCUser          ↔ GCUser.swift
//    9. P08-04 Chat + Message  ↔ Chat.swift + Message.swift + MessageKind.swift
//   10. P10-07 categories      ↔ types.ts PUSH_CATEGORIES (16th reuse)
//   11. P10-08 nudge input     ↔ sendTrainerNudge.ts (NUDGE_MESSAGE_MAX,
//                                 DOC_ID_MAX, sanitizeMessage)         ← THIS
//
// CONTROL-CHARACTER SEMANTIC:
//   - The 10-07 `sanitizeMessage` strips C0 (0x00-0x09, 0x0B-0x1F) + C1
//     (0x7F-0x9F) and TRIMS whitespace. It PRESERVES `\n` (0x0A) so
//     trainers can hard-wrap a multi-line nudge.
//   - This client-side schema mirrors the strip + trim and then re-validates
//     length post-strip. If a message is empty after strip (e.g., only
//     control chars + whitespace), the second `.min(1)` rejects with a
//     dedicated error message.

import { z } from "zod";

/** Max message length (chars) — MIRROR of `NUDGE_MESSAGE_MAX = 200` in 10-07. */
export const NUDGE_MESSAGE_MAX_LENGTH = 200;

/** Max clientId length — MIRROR of `DOC_ID_MAX = 64` (Firestore doc-id max) in 10-07. */
export const NUDGE_CLIENT_ID_MAX_LENGTH = 64;

/**
 * C0 (0x00-0x09, 0x0B-0x1F) + C1 (0x7F-0x9F) — same character class as
 * the 10-07 server-side sanitizer. `\n` (0x0A) is preserved.
 */
const CONTROL_CHAR_REGEX = /[\x00-\x09\x0B-\x1F\x7F-\x9F]/g;

/**
 * Zod input schema for `sendTrainerNudge` Server Action. Strict mode
 * (no unknown keys) defends against caller-supplied payload tampering
 * (T-10-08-INJECTION mitigation).
 *
 * Pipeline:
 *   1. Base shape: `clientId` (1..64 chars), `message` (1..200 chars).
 *   2. Transform: strip control chars + trim.
 *   3. Post-transform validation: ensure message is still 1..200 chars
 *      after the strip (mirrors the server-side "non-empty after strip"
 *      guard from 10-07's `sanitizeMessage`).
 */
export const nudgeInputSchema = z
  .object({
    clientId: z
      .string()
      .min(1, "clientId required")
      .max(
        NUDGE_CLIENT_ID_MAX_LENGTH,
        `clientId cannot exceed ${NUDGE_CLIENT_ID_MAX_LENGTH} characters`,
      ),
    message: z
      .string()
      .min(1, "Message cannot be empty")
      .max(
        NUDGE_MESSAGE_MAX_LENGTH,
        `Message cannot exceed ${NUDGE_MESSAGE_MAX_LENGTH} characters`,
      )
      // Strip C0/C1 control chars (preserving \n) and trim whitespace —
      // mirrors 10-07 `sanitizeMessage`. Client-side strip gives the
      // trainer immediate feedback (rendered char counter) and matches
      // what the server will record.
      .transform((s) => s.replace(CONTROL_CHAR_REGEX, "").trim())
      .pipe(
        z
          .string()
          .min(1, "Message cannot be empty after sanitization")
          .max(NUDGE_MESSAGE_MAX_LENGTH),
      ),
  })
  .strict(); // reject unknown keys (T-10-08-INJECTION)

export type NudgeInput = z.infer<typeof nudgeInputSchema>;

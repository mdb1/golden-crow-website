// chat-schema.ts
// Zod schema mirroring `GCFitnessCore/Sources/GCFitnessCore/Schema/Message.swift`
// + `MessageKind.swift` + `Chat.swift`, and the canonical schema doc
// `.planning/schemas/chats.md`.
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7 — 9th reuse):
//   Any rename or constraint change MUST be matched in:
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Message.swift
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/MessageKind.swift
//     gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Chat.swift
//     gc-fitness/firestore.rules `/chats/{chatId}/messages/{messageId}` block (P08-01)
//     .planning/schemas/chats.md
//   in the SAME commit. Drift between any surface is a Pitfall 7 contract break.
//
//   Prior reuses (chronological):
//     1. P03-02 ExerciseSchema  ↔ Exercise.swift
//     2. P04-01 WorkoutTemplate ↔ WorkoutTemplate.swift
//     3. P04-01 WorkoutAssignment ↔ WorkoutAssignment.swift
//     4. P05-01 WorkoutLog      ↔ WorkoutLog.swift
//     5. P05-01 SetLog          ↔ SetLog.swift
//     6. P06-01 Habit           ↔ Habit.swift + HabitType.swift
//     7. P06-01 HabitLog        ↔ HabitLog.swift + HabitLogValue.swift
//     8. P02-05 GCUser          ↔ GCUser.swift (preferences etc.)
//     9. P08-04 Chat + Message  ↔ Chat.swift + Message.swift + MessageKind.swift  ← THIS FILE
//
// WIRE-FORMAT NOTE (camelCase end-to-end):
//   Per Message.swift line 54-59 + Chat.swift line 55-58, every wire key is
//   camelCase verbatim — no snake_case bridges. Mirrors the P06-02 HabitLog
//   convention (after the late-phase Rule 1 fix that aligned the entire
//   chain to camelCase end-to-end). Snake_case in input is intentionally
//   REJECTED at parse time (the schema's `kind` discriminator + the
//   variant-payload field names ARE the contract).
//
// SERVER-SIDE FIELDS — NOT IN sendMessageInputSchema:
//   `senderId`, `createdAt`, `reactions`, `readBy`, `id` are ALL set by
//   `chat-server-actions.ts` from the session / Admin SDK. They are NEVER
//   trusted from client input. The strip happens by virtue of Zod's default
//   `.parse()` behavior: unknown keys are dropped silently, so
//   `senderId: "victim-uid"` in the input never survives. The Server
//   Action layer is the SOLE writer surface for trainer-side chat
//   (Admin SDK bypasses Firestore rules — the gate is `getCurrentTrainer()` +
//   ownership precondition).
//
// VARIANT-BY-DISCRIMINATOR VALIDATION (mirrors Message.swift §
// "VARIANT-BY-DISCRIMINATOR DECODING STRATEGY"):
//   The `kind` field is the discriminator; the 4 variant-payload fields
//   (text / imagePath + imageWidth + imageHeight / voicePath +
//   voiceDurationMs) are ALL OPTIONAL at the Zod base layer. The
//   `superRefine` block enforces the cross-field "kind == X implies field Y
//   present" rules at parse time — defense-in-depth above the rule layer
//   (which doesn't apply to Admin SDK writes anyway).
//
//   The Swift struct deliberately does NOT enforce variant-required fields
//   at decode time (asymmetric decode robustness invariant — P06-02 reuse),
//   so a malformed cross-version message will compactMap-skip at the
//   repository. The Zod schema, by contrast, IS the validation gate for
//   trainer-side writes — it MUST enforce the cross-field rules because the
//   Server Action is the SOLE writer surface for backoffice paths.
//
// VOICE CLAMP (60_000 ms == 60s):
//   Mirrors firestore.rules clamp `voiceDurationMs <= 60000` (P08-01) +
//   AVAudioRecorder UI clamp in P08-09 (iOS edge). 60s ceiling shipped in
//   `chats.md` § voice-note format. Defense-in-depth: client-side UI + Zod
//   + rule layer all enforce the same value.

import { z } from "zod";

// ── MessageKind ────────────────────────────────────────────────────────
// Mirrors MessageKind.swift verbatim. Raw strings "text" | "image" | "voice"
// are LOCKED across:
//   * MessageKind.swift case raw values
//   * firestore.rules `kind in ['text', 'image', 'voice']` validator
//   * Chat.LastMessage.kind denorm field
//   * MessageRow.swift (P08-08) render switch
//   * this schema
// The all-lowercase shape is load-bearing.
export const messageKindSchema = z.enum(["text", "image", "voice"]);
export type MessageKind = z.infer<typeof messageKindSchema>;

// ── SendMessageInput — Server Action input for sendTrainerMessage ──────
// Variant-by-discriminator. The Server Action layer is the type guard
// (the iOS rule layer at P08-01 is the cross-cutting defense-in-depth).
//
// Wire-key alignment: camelCase across all surfaces (Pitfall 7 — 9th
// reuse). Snake_case is intentionally REJECTED at parse time.
//
// `senderId` is INTENTIONALLY ABSENT from the input shape — it is set
// by the Server Action from `session.uid` AFTER `.parse()`. A tampered
// `senderId` in the caller's payload is silently stripped.
// (Mitigates T-08-04-02 — defense in depth above the rule layer.)
export const sendMessageInputSchema = z
  .object({
    /**
     * Target chat doc id — equals the clientId per the doc-id strategy
     * locked in 08-CONTEXT.md + Chat.swift line 36-41.
     */
    chatId: z.string().trim().min(1).max(128),

    /**
     * Variant discriminator — `text` | `image` | `voice`.
     */
    kind: messageKindSchema,

    /**
     * Text body. Required when `kind === "text"`; allowed (as caption)
     * when `kind === "image"`; absent for `kind === "voice"`. Rule layer
     * caps size at < 4000 chars (Message.swift line 146-148 — defense in
     * depth).
     */
    text: z.string().max(4000).optional(),

    /**
     * Storage path `images/{chatId}/{messageId}.jpg` (P08-09). Required
     * when `kind === "image"`. Wire value is the path string, NOT a
     * signed URL — readers resolve via FirebaseStorage SDK at read-time.
     */
    imagePath: z.string().max(2048).optional(),

    /**
     * Pixel width stamped at upload time. Optional — readers fall
     * back to AsyncImage / NukeUI default aspect when absent.
     */
    imageWidth: z.number().int().positive().optional(),

    /**
     * Pixel height — companion to `imageWidth`.
     */
    imageHeight: z.number().int().positive().optional(),

    /**
     * Storage path `voices/{chatId}/{messageId}.m4a` (P08-09). Required
     * when `kind === "voice"`.
     */
    voicePath: z.string().max(2048).optional(),

    /**
     * Voice-note duration in milliseconds. Required when
     * `kind === "voice"`. CLAMPED to <= 60_000 (60s) — mirrors the rule
     * layer's `voiceDurationMs <= 60000` validator (P08-01) +
     * AVAudioRecorder UI clamp (P08-09). The 60s ceiling lives in
     * chats.md § voice-note format.
     */
    voiceDurationMs: z.number().int().min(0).max(60000).optional(),
  })
  .superRefine((data, ctx) => {
    // T-08-04-VARIANT — enforce variant-required fields at the parse
    // layer (defense in depth above the Firestore rule layer).
    switch (data.kind) {
      case "text":
        if (!data.text || data.text.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["text"],
            message: "text message requires a non-empty text body",
          });
        }
        break;
      case "image":
        if (!data.imagePath || data.imagePath.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["imagePath"],
            message: "image message requires imagePath",
          });
        }
        break;
      case "voice":
        if (!data.voicePath || data.voicePath.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["voicePath"],
            message: "voice message requires voicePath",
          });
        }
        if (data.voiceDurationMs === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["voiceDurationMs"],
            message: "voice message requires voiceDurationMs",
          });
        }
        break;
    }
  });

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

// ── MessageRow — READ shape after Admin SDK fetch + ISO conversion ─────
// Timestamps converted to ISO strings so React-Query cache + Server
// Component → Client Component pass stay serializable across the
// boundary. Mirrors `HabitRow` shape from `habit-actions.ts`.
//
// Field set mirrors Message.swift 1:1:
//   id, kind, senderId, createdAt
//   variant payload: text, imagePath, imageWidth, imageHeight, voicePath, voiceDurationMs
//   reactions (uid → emoji string)
//   readBy (uid → ISO timestamp string — Firestore Timestamps converted)
export interface MessageRow {
  /** Firestore document ID — populated post-fetch from `snapshot.id`. */
  id: string;

  /** Variant discriminator. */
  kind: MessageKind;

  /** Sender's Firebase Auth UID. Rule-enforced equality to request.auth.uid on create. */
  senderId: string;

  /** ISO 8601 string. `null` only during optimistic pending-write before the server stamps. */
  createdAt: string | null;

  /** Text body — required when kind === "text"; optional caption when kind === "image". */
  text?: string;

  /** Storage path `images/{chatId}/{messageId}.jpg` — required when kind === "image". */
  imagePath?: string;

  /** Pixel width stamped at upload time. */
  imageWidth?: number;

  /** Pixel height — companion to imageWidth. */
  imageHeight?: number;

  /** Storage path `voices/{chatId}/{messageId}.m4a` — required when kind === "voice". */
  voicePath?: string;

  /** Voice-note duration in milliseconds (clamped <= 60000 at the rule layer). */
  voiceDurationMs?: number;

  /** uid → single-emoji string. Self-writable at the rule layer for caller's OWN uid slot only. */
  reactions?: Record<string, string>;

  /**
   * uid → ISO timestamp string (Firestore Timestamps converted at the
   * Server Action boundary — same convention as the rest of the gc-fitness
   * Server Actions). Self-writable at the rule layer for caller's OWN uid
   * slot only.
   */
  readBy?: Record<string, string>;
}

// ── ChatRow — READ shape for the trainer inbox (P08-11 consumes this) ──
// Mirrors Chat.swift 1:1 with timestamps converted to ISO strings. The
// `lastMessage` nested shape mirrors Chat.LastMessage.
//
// Field ownership reminder (from Chat.swift line 61-71):
//   Every field below is OWNED by the Cloud Function `onMessageCreated`
//   (P08-06). NONE are client-writable. The backoffice Server Actions
//   in 08-04 DO NOT expose any parent-doc writer — Pitfall 22 reuse.
export interface ChatRow {
  /** Firestore document ID — equals `clientId` for v1 1:1 chats. */
  id: string;

  /** Client's Firebase Auth UID — mirrors the doc id. */
  clientId: string;

  /** Coach's Firebase Auth UID — mirrors /users/{clientId}.coachId at chat-doc creation time. */
  coachId: string;

  /**
   * Denormalized preview of the most-recent message. Absent until the
   * first message lands in the thread. Owned by the Cloud Function.
   */
  lastMessage?: {
    /** Truncated to 140 chars by the Cloud Function (P08-06 contract). */
    text: string;
    /** Sender's Firebase Auth UID. */
    senderId: string;
    /** ISO 8601 string — server timestamp from the source message. */
    createdAt: string;
    /** Source message's `kind` discriminator. */
    kind: MessageKind;
  };

  /**
   * Top-level mirror of `lastMessage.createdAt` so the trainer inbox
   * composite index (`coachId ASC, lastMessageAt DESC` — Index #17 from
   * P08-01) can sort by recency without indexing a nested-map sub-key.
   * Owned by the Cloud Function (P08-06).
   */
  lastMessageAt: string | null;

  /**
   * Per-participant unread counter. Map of `uid → int`. Owned by the
   * Cloud Function — increments the recipient's slot on every message
   * create; zeroed by the client's read-receipt write path (P08-07 +
   * P08-06 cross-write contract).
   */
  unreadCount: Record<string, number>;

  /** ISO 8601 string — server timestamp at chat creation. */
  createdAt: string | null;

  /** ISO 8601 string — bumped on every Cloud Function denorm pass. */
  updatedAt: string | null;
}

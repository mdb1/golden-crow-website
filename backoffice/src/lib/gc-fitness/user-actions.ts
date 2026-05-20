// user-actions.ts
//
// Server Actions for the GC Fitness trainer's OWN /users/{uid} self-write
// surface. Today this module exposes a single Action:
//
//   - updateChatQuickReplies(input) — write the trainer's CHAT-11 quick-reply
//     template list to their own /users/{session.uid}.chatQuickReplies.
//
// The full editor UI lands in P08-12 (the trainer Settings form). The
// Server Action ships here in P08-05 alongside the iOS writer + the
// firestore.rules whitelist extension so the wire path is end-to-end
// testable as soon as the form ships.
//
// SAME-WRITE-SHAPE invariant (Pitfall 7 — 10th reuse):
//   The iOS UserRepository.updateChatQuickReplies(_:) writer mirrors this
//   Server Action's wire shape — empty array → FieldValue.delete() so the
//   doc carries NO chatQuickReplies key (matches the Codable encoder's
//   omit-on-empty); non-empty → array replace; updatedAt always co-written
//   (Pitfall 9 inoculation, 7th reuse). Diverging the two writers would
//   silently split-brain the user doc between iOS sessions and backoffice
//   sessions.
//
// AUTH GATE:
//   getCurrentTrainer() — trainer role + email allowlist (P03-05). The
//   uid is resolved from `session.uid` AFTER the Zod parse so a tampered
//   input cannot surface a forged uid (T-08-05-03). The Firestore rule
//   layer (P08-05 affectedKeys whitelist extension) double-gates this
//   path via `uid == myUid()` + `affectedKeys.hasOnly([..., 'chatQuickReplies'])`.
//
// REFERENCE PATTERN: mirrors `habit-actions.ts` (P06-05) for the
// getCurrentTrainer integration + FieldValue.serverTimestamp + post-parse
// session-uid assignment; mirrors `chat-server-actions.ts` (P08-04) for
// the in-phase Server Action header style.
//
// Threat-register coverage (matches PLAN.md 08-05 <threat_model>):
//   T-08-05-01 (Tampering — cross-user write to another user's quick-reply set)
//     → docRef binds to `session.uid`, never to a caller-supplied uid; the
//       Zod schema does not accept a uid field at all (strip-unknown).
//       Rule layer double-gates via uid == myUid() on /users update.
//   T-08-05-02 (DoS — unbounded chatQuickReplies array growth)
//     → Zod schema caps at MAX 20 entries × MAX 240 chars each, trims
//       whitespace, drops empty strings post-trim. Defense in depth above
//       the unbounded rule-layer admission (rules have no per-field length
//       cap).
//   T-08-05-03 (Spoofing — caller-supplied uid in updateChatQuickReplies)
//     → uid resolved AFTER getCurrentTrainer() gate; never from caller
//       input. Same convention as createHabit's trainerId post-parse
//       assignment (T-06-05-01 mitigation).

"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

/**
 * Per-template length cap. 240 chars is generous for a quick-reply
 * ("Great job! See you tomorrow at the gym for a strong push session 💪"
 * is ~80 chars) — the cap exists to prevent a malicious trainer from
 * bloating their own user doc to abuse Firestore's per-doc 1 MiB limit
 * (T-08-05-02 DoS mitigation).
 */
const MAX_TEMPLATE_CHARS = 240;

/**
 * Per-trainer template-count cap. 20 is well above any realistic
 * one-tap-insert dropdown size (a trainer scrolling 20 items in a
 * dropdown already has UX problems); the cap exists for the same
 * doc-bloat DoS mitigation as `MAX_TEMPLATE_CHARS`.
 */
const MAX_TEMPLATES = 20;

/**
 * Zod schema for `updateChatQuickReplies` input. Caps at 20 templates ×
 * 240 chars each, trims surrounding whitespace, and drops empty strings
 * post-trim so a trainer cannot push `["", "", ""]` to spend their
 * template budget on whitespace.
 *
 * Defense-in-depth note: the rule layer (P08-05) has NO per-field length
 * cap — the affectedKeys.hasOnly([..., 'chatQuickReplies']) admission is
 * unbounded by Firestore rules' static-syntax constraints (no
 * `.size().bytes()` predicate is portable across the v1 rule grammar).
 * The Server Action is therefore the SOLE enforcement of these caps;
 * the iOS writer does no validation by design (the iOS app never
 * surfaces an editor — clients always store nil).
 */
export const updateChatQuickRepliesSchema = z.object({
  replies: z
    .array(z.string().max(MAX_TEMPLATE_CHARS))
    .max(MAX_TEMPLATES)
    .transform((arr) =>
      arr.map((s) => s.trim()).filter((s) => s.length > 0),
    ),
});
export type UpdateChatQuickRepliesInput = z.infer<
  typeof updateChatQuickRepliesSchema
>;

/**
 * Server Action: update `/users/{trainer.uid}.chatQuickReplies`.
 *
 * Trainer-only — `getCurrentTrainer()` is the gate; the rule layer
 * (P02-05 + P07-01 + P08-05) admits the write for any signed-in uid
 * but only trainer accounts have a UI surface (the backoffice Settings
 * form in P08-12).
 *
 * Wire shape mirrors `UserRepository.updateChatQuickReplies` (iOS,
 * P08-05):
 *   - Empty array → `FieldValue.delete()` (matches the Codable
 *     encoder's omit-on-empty so the doc carries NO chatQuickReplies
 *     key when no templates are set).
 *   - Non-empty → array replace.
 *   - `updatedAt` co-written via `serverTimestamp()` (Pitfall 9
 *     inoculation — 8th reuse).
 *
 * Mitigates: T-08-05-01 (cross-user write — docRef binds to
 * `session.uid`), T-08-05-02 (DoS via unbounded array growth — Zod cap
 * 20 × 240), T-08-05-03 (caller-supplied uid — never from input).
 */
export async function updateChatQuickReplies(
  input: unknown,
): Promise<{ ok: true }> {
  const session = await getCurrentTrainer();

  // Zod-parse FIRST. The schema has no `uid` field at all; even if a
  // future schema rev accidentally accepts one, the docRef below
  // binds to `session.uid` (T-08-05-03).
  const parsed = updateChatQuickRepliesSchema.parse(input);

  const db = gcFitnessFirestore();
  const docRef = db.collection(FirestoreCollections.users).doc(session.uid);

  if (parsed.replies.length === 0) {
    // Empty → match the iOS writer's FieldValue.delete() so both
    // writers produce byte-identical wire diffs (the doc carries NO
    // chatQuickReplies key when no templates are set).
    await docRef.update({
      chatQuickReplies: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await docRef.update({
      chatQuickReplies: parsed.replies,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return { ok: true };
}

/**
 * Server Action: read the current trainer's profile slice that the chat
 * UI needs — `chatQuickReplies` (CHAT-11 dropdown source) + `displayName`
 * (header label fallback). Returns an empty/zeroed shape if the user doc
 * doesn't exist yet (a brand-new trainer who has never opened Settings).
 *
 * Used by:
 *   - P08-12 QuickReplyDropdown (chat MessageInput sibling) — populates
 *     the one-tap-insert menu.
 *   - P08-12 Settings page (`/gc-fitness/settings`) — seeds the
 *     `QuickRepliesForm` initialReplies prop without exposing the full
 *     /users/{uid} payload to the client.
 *
 * AUTH GATE: `getCurrentTrainer()` — same trainer-role + email-allowlist
 * gate as `updateChatQuickReplies`. The trainer reads only their own
 * profile (T-08-12-01 mitigation — cross-trainer reads impossible since
 * `session.uid` binds the docRef; the caller cannot supply a uid).
 *
 * THREAT NOTE: This Action returns ONLY a hand-picked slice (uid +
 * displayName + chatQuickReplies). It does NOT return the full /users
 * doc — that would leak fields like email / FCM tokens / role metadata
 * to the client bundle unnecessarily. Keep the shape narrow.
 */
export async function getCurrentTrainerProfile(): Promise<{
  uid: string;
  displayName: string;
  chatQuickReplies: string[];
}> {
  const session = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.users)
    .doc(session.uid)
    .get();
  if (!snap.exists) {
    return { uid: session.uid, displayName: "", chatQuickReplies: [] };
  }
  const data = snap.data() as {
    displayName?: string;
    chatQuickReplies?: string[];
  };
  return {
    uid: session.uid,
    displayName: data.displayName ?? "",
    chatQuickReplies: data.chatQuickReplies ?? [],
  };
}

// chat-reply.ts
// Pure snippet builder for the WhatsApp-style reply quote (quick-260603-p1p).
// TS twin of the iOS `ReplyQuote.make(from:)` static builder.
//
// SAME-SOURCE-OF-TRUTH (Pitfall 7) — the snippet + truncation rules here
// MUST match:
//   gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/ReplyQuote.swift
//     (ReplyQuote.make — text → text, image → caption/"", voice → "",
//      truncate to <= 200 chars via prefix(200) / slice(0, 200))
//   gc-fitness/firestore.rules messages-create replyTo validation clause
//   gc-fitness/.planning/schemas/chats.md § "Reply quote (replyTo)"
//   chat-schema.ts `replyToSchema`
//
// Returns null when the quoted message has no id (an optimistic, not-yet-
// persisted message cannot be quoted — there is no doc id to reference).

import type { MessageRow, MessageKind } from "./chat-schema";

/** The 4-key wire shape written on the new message's `replyTo` field. */
export interface ReplyQuote {
  messageId: string;
  senderId: string;
  kind: MessageKind;
  textSnippet: string;
}

/** Max snippet length (chars). Mirrors the rule layer's `<= 200` clamp. */
const SNIPPET_MAX = 200;

/**
 * Build a `replyTo` snapshot from the message being quoted. Returns null
 * when `message.id` is falsy.
 *
 * textSnippet rules (mirror iOS ReplyQuote.make):
 *   - text  → message.text ?? ""
 *   - image → message.text ?? "" (caption, or "" when absent)
 *   - voice → "" (voice has no text; the UI renders a 🎤 placeholder)
 * then truncated to <= 200 chars.
 */
export function buildReplyQuote(
  message: Pick<MessageRow, "id" | "senderId" | "kind" | "text">,
): ReplyQuote | null {
  if (!message.id) return null;
  let raw: string;
  switch (message.kind) {
    case "text":
      raw = message.text ?? "";
      break;
    case "image":
      raw = message.text ?? "";
      break;
    case "voice":
      raw = "";
      break;
  }
  return {
    messageId: message.id,
    senderId: message.senderId,
    kind: message.kind,
    textSnippet: raw.slice(0, SNIPPET_MAX),
  };
}

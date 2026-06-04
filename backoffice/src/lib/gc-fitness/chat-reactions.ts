// chat-reactions.ts — backoffice-only constant.
//
// The set of emoji the trainer's chat reaction picker offers. Shared by the
// reaction picker UI (ChatConversation) and the `setTrainerMessageReaction`
// server-action validation so the two can never drift. This is NOT a wire
// contract change: the `reactions` map (uid → emoji string) is unchanged; this
// is just the allow-list the backoffice writes from. Lives in its own plain
// module (not chat-schema.ts) to avoid implying a cross-surface contract, and
// not in chat-server-actions.ts (a "use server" module can only export async
// functions).

export const REACTION_EMOJI = ["👍", "❤️", "🔥", "😂", "💪", "🙌"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

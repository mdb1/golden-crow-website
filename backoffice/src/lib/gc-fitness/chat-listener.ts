"use client";

// chat-listener.ts
//
// React-Query bridge for the trainer chat inbox + active conversation.
//
// Pattern reuse — exact twin of `workout-templates-listener.ts` (P04-04):
//   - Wraps the per-trainer Server Actions from `chat-server-actions.ts`
//     (P08-04) rather than a client-SDK `onSnapshot` listener. Reasons:
//       * Server Actions enforce `getCurrentTrainer()` + ownership precondition
//         (per-chat `coachId === session.uid` 1-get() gate) BEFORE any Admin
//         SDK read. The rule layer doesn't apply to Admin paths, so this
//         server-side gate IS the security boundary.
//       * Sort by `lastMessageAt DESC` uses the P08-01 composite index
//         (`coachId ASC, lastMessageAt DESC`). The client SDK can't execute
//         the same query without the trainer's uid AND a custom-claims
//         rule allowing the cross-uid `chats` read — both more brittle than
//         a server-side query.
//       * Inbox throughput is bounded (one chat doc per assigned client,
//         capped at 200 by the Server Action) — React-Query polling is
//         plenty fresh for v1. V2 carry-forward: swap polling for an
//         `onSnapshot` listener (file kept named `chat-listener.ts` so the
//         V2 patch is local).
//
// Cache keys (kept namespaced under `["gc-fitness", "chats", ...]`):
//   - useTrainerChats():           ["gc-fitness", "chats"]
//   - useChatMessages(chatId):     ["gc-fitness", "chats", chatId, "messages"]
//
// Components that mutate the chat surface — currently only
// `sendTrainerMessage` from `MessageInput.tsx` + `setReadReceiptForTrainer`
// from `ChatConversation.tsx` — should call
// `queryClient.invalidateQueries({ queryKey: CHATS_BASE_KEY })` to refresh
// the inbox sort order after a send.
//
// REFETCH CADENCE (V1 fallback for live updates):
//   - Inbox: 30s background poll (from the ChatQueryProvider default).
//   - Active conversation: 10s background poll (override below) — keeps the
//     trainer's right pane tight while they're actively typing.
//
// CONTRACT NOTE: This file is OWNED BY PLAN 08-11. It mounts inside a
// `'use client'` component and calls the gc-fitness Server Actions via
// next's "use server" boundary.

import { useQuery } from "@tanstack/react-query";

import {
  fetchMessages,
  listChatsForTrainer,
} from "./chat-server-actions";
import type { ChatRow, MessageRow } from "./chat-schema";

export type { ChatRow, MessageRow } from "./chat-schema";

/** Top-level cache namespace — useful for blanket invalidation on mutate. */
export const CHATS_BASE_KEY = ["gc-fitness", "chats"] as const;

/**
 * Trainer inbox feed. Returns the React-Query `UseQueryResult` with
 * `data: ChatRow[] | undefined` + standard `isLoading` / `error` boundaries.
 *
 * Server query orders by `lastMessageAt DESC`. The inbox UI re-sorts
 * client-side by `unreadCount[trainerUid] DESC` then by the server's
 * `lastMessageAt DESC` tiebreaker (per PATTERNS.md Note A — Firestore can't
 * compositely index a dot-path map with a variable key).
 */
export function useTrainerChats(enabled: boolean = true) {
  return useQuery<ChatRow[]>({
    queryKey: CHATS_BASE_KEY,
    queryFn: () => listChatsForTrainer(),
    enabled,
    // Pin the refetch cadence on the hook itself so the shell badge (BADGE-04)
    // stays fresh on every gc-fitness route, not just the ones whose
    // route-group QueryClient happens to set the same defaults.
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

/**
 * Active-conversation message feed. Returns the React-Query
 * `UseQueryResult` with `data: MessageRow[] | undefined`.
 *
 * Disabled when `chatId === null` (right pane shows the empty state) so we
 * don't fire a Server Action call against the empty string. The Server
 * Action returns `[]` for a missing chat (never-messaged client) rather than
 * throwing — see `fetchMessages` in chat-server-actions.ts P08-04 contract.
 *
 * Refetch cadence overrides the ChatQueryProvider default (30s → 10s) so the
 * active thread stays tight while the trainer is typing.
 */
export function useChatMessages(chatId: string | null) {
  return useQuery<MessageRow[]>({
    queryKey: [...CHATS_BASE_KEY, chatId, "messages"],
    queryFn: () =>
      chatId ? fetchMessages(chatId, 50) : Promise.resolve([]),
    enabled: chatId !== null,
    refetchInterval: 10_000,
  });
}

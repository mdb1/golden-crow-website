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
//   - Inbox: 120s poll WHILE THE TAB IS VISIBLE + refetch on window focus
//     (0z9 / COST-RD1-B slowed it from 30s; #501 stopped it in hidden tabs —
//     it ran on every gc-fitness route, 200 chats per call, even with the tab
//     in the background all day). The focus refetch keeps the badge instant
//     when the trainer comes back.
//   - Active conversation: 10s poll of the NEWEST page only, visible tab only
//     (#501). The infinite query itself never polls: React Query refetches an
//     infinite query page by page, so a coach who scrolled back 10 pages paid
//     10 Server Action reads of 50 messages every 10 seconds. The poller
//     fetches page 1 and merges it into the cache (`mergeNewestPage`).
//
// After a SEND, call `refreshNewestChatPage(queryClient, chatId)` (one page),
// and invalidate the inbox with `exact: true` — a prefix invalidation of
// CHATS_BASE_KEY also matches every open thread's infinite query and refetches
// all its pages.
//
// CONTRACT NOTE: This file is OWNED BY PLAN 08-11. It mounts inside a
// `'use client'` component and calls the gc-fitness Server Actions via
// next's "use server" boundary.

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import {
  fetchMessages,
  listChatsForTrainer,
} from "./chat-server-actions";
import type { ChatRow, MessageRow } from "./chat-schema";
import { CHAT_PAGE_SIZE, mergeNewestPage } from "./chat-newest-page";

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
    //
    // 0z9 / COST-RD1-B: 120s background poll (was 30s) to cut inbox read
    // volume 4×, paired with refetchOnWindowFocus so the badge refreshes
    // immediately whenever the trainer returns to the tab. staleTime kept at
    // 10s so a focus refetch within the window is still deduped.
    staleTime: 10_000,
    refetchInterval: 120_000,
    // #501 — no polling from a hidden tab; focus refetch covers the return.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** The open thread's infinite query (every page loaded so far). */
export function chatMessagesKey(chatId: string | null) {
  return [...CHATS_BASE_KEY, chatId, "messages", "infinite"] as const;
}

/** The newest-page poller of a thread (#501). Invalidate THIS after a send. */
export function chatNewestPageKey(chatId: string | null) {
  return [...CHATS_BASE_KEY, chatId, "messages", "newest"] as const;
}

/**
 * Fetch the newest page of `chatId` and merge it into the infinite cache.
 * One Server Action call regardless of how many pages are loaded.
 */
export async function refreshNewestChatPage(
  queryClient: QueryClient,
  chatId: string,
): Promise<MessageRow[]> {
  const fresh = await fetchMessages(chatId, CHAT_PAGE_SIZE, null);
  queryClient.setQueryData<InfiniteData<MessageRow[], string | null>>(
    chatMessagesKey(chatId),
    (prev) => {
      if (!prev || prev.pages.length === 0) return prev;
      const first = mergeNewestPage(prev.pages[0], fresh);
      if (first === prev.pages[0]) return prev;
      return { ...prev, pages: [first, ...prev.pages.slice(1)] };
    },
  );
  return fresh;
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
 * Refetch cadence is pinned on the hook itself (10s) so the active thread
 * stays tight while the trainer is typing — independent of whichever
 * QueryClient the chat surface mounts under (it now shares the shell-level
 * client; see chat/page.tsx).
 */
export function useChatMessages(chatId: string | null) {
  const queryClient = useQueryClient();
  const infinite = useInfiniteQuery<MessageRow[], Error>({
    queryKey: chatMessagesKey(chatId),
    queryFn: ({ pageParam }) =>
      chatId
        ? fetchMessages(chatId, CHAT_PAGE_SIZE, (pageParam as string | null | undefined) ?? null)
        : Promise.resolve([]),
    enabled: chatId !== null,
    // #501 — never refetch every page on a timer or on focus: the newest-page
    // poller below is the live update. An explicit invalidation of this key
    // (delete / reaction on an older message) still reloads it whole.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.length) return undefined;
      const first = lastPage[0];
      return first.createdAt ?? undefined;
    },
  });

  // Starts once the first page is in the cache (otherwise it would duplicate
  // the initial load). `refetchIntervalInBackground: false` pauses it while the
  // tab is hidden; returning to the tab refetches it immediately.
  useQuery<MessageRow[]>({
    queryKey: chatNewestPageKey(chatId),
    queryFn: () => (chatId ? refreshNewestChatPage(queryClient, chatId) : Promise.resolve([])),
    enabled: chatId !== null && infinite.isSuccess,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // The first run would re-fetch what the infinite query just loaded.
    initialData: [],
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 9_000,
  });

  return infinite;
}

// chat-newest-page.ts
//
// #501 — the open conversation polls ONLY its newest page and merges it into
// the infinite-query cache, instead of letting React Query refetch every page
// the coach scrolled back through (10 s × N pages of 50 messages each).
//
// Pure, no React: the merge rule is the part that can lose messages, so it is
// the part with tests.

import type { MessageRow } from "./chat-schema";

export const CHAT_PAGE_SIZE = 50;

function ms(m: MessageRow): number {
  // A pending write (no server stamp yet) is the newest thing in the thread.
  if (!m.createdAt) return Number.POSITIVE_INFINITY;
  const t = Date.parse(m.createdAt);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Merge a freshly fetched newest page into the cached first page.
 *
 * - Every message the fresh page covers (createdAt ≥ its oldest) comes from the
 *   fresh page: new messages appear, edited reactions/read receipts update and a
 *   deleted message disappears.
 * - Cached messages OLDER than the fresh page are kept. Replacing the page
 *   outright would drop them: with k new messages, the newest 50 no longer
 *   contain the k oldest of the previous 50, and those are not in page 2 either
 *   (page 2 starts before the old page 1). That is a hole in the thread.
 * - An empty fresh page means the thread is empty now.
 *
 * Returns the cached array itself when nothing changed, so React Query keeps
 * structural sharing and the conversation does not re-render every 10 s.
 */
export function mergeNewestPage(cached: MessageRow[] | undefined, fresh: MessageRow[]): MessageRow[] {
  if (fresh.length === 0) return cached && cached.length === 0 ? cached : [];
  const oldest = Math.min(...fresh.map(ms));
  const freshIds = new Set(fresh.map((m) => m.id));
  const kept = (cached ?? []).filter((m) => !freshIds.has(m.id) && ms(m) < oldest);
  const merged = [...kept, ...fresh].sort((a, b) => ms(a) - ms(b));
  if (cached && sameMessages(cached, merged)) return cached;
  return merged;
}

function sameMessages(a: MessageRow[], b: MessageRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}

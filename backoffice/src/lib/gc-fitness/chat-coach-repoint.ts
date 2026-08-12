// chat-coach-repoint.ts
//
// PURE helper for #838 — moving the 1:1 chat doc to the coach who just took
// the client on. I/O-free on purpose (no Admin SDK, no Firestore, no
// "use server"): it takes the freshly-read `chats/{clientId}` data plus the
// incoming coach's uid and returns the next state of the doc's participant
// fields, so both alta paths (`provisionClient` and `transferClientToCoach`)
// share ONE authority and the decision is jest-testable without a fake db.
//
// ## What #838 actually was, and what it was not
//
// The issue predicted that `chats/{uid}.coachId` stays frozen at whoever the
// FIRST message resolved — because `onMessageCreated` only resolves
// participants when the parent doc does not exist yet, and never recomputes
// them afterwards. That half is true and unchanged (see
// `functions/src/chat/onMessageCreated.ts` — "The clientId/coachId fields are
// immutable post-create").
//
// What the issue missed is that the backoffice ALREADY re-points the doc at
// alta time, from both paths, via the Admin SDK (which is exactly the fix it
// proposed): `provisionClient`'s existing-user branch has written
// `chats/{clientId}.coachId` since Phase 32 (`dbe40f2`), and
// `transferClientToCoach` — the action the coach-less adoption page delegates
// to — has done the same. So the misrouting the ticket describes (the new
// coach cannot read the thread; pushes keep going to the sales coach) could
// not actually happen through either surface.
//
// ## The part that WAS still broken: the counter does not follow the coach
//
// `unreadCount` is a map keyed by uid. Re-pointing `coachId` alone leaves the
// OUTGOING coach holding the unread tally and gives the INCOMING coach no
// slot at all — so:
//
//   - the adopting coach's inbox badge reads 0 on a thread whose only message
//     is the client asking for a coach. `client-roster` composes the badge as
//     `chats/{clientId}.unreadCount[trainer.uid]`, and that key is absent.
//   - the moment the new coach replies, `onMessageCreated` writes
//     `unreadCount.{sender} = 0` for them — so the pending count is destroyed
//     without ever having been shown to anybody.
//   - the outgoing coach's slot lingers forever on a doc they can no longer
//     read, and accumulates one dead key per transfer.
//
// Carrying the tally over is the honest reading: those messages are unread by
// the coach side, and after the alta the incoming coach is the only person who
// can read them. Zeroing instead would tell the new coach "nothing pending" on
// a client who literally just asked for attention.
//
// ## Legacy flat keys
//
// Docs written before 260524 carry top-level fields literally named
// `"unreadCount.{uid}"` (the `set()`-treats-dots-as-literal bug documented in
// `onMessageCreated.ts`). The readers already fall back to them, so the
// effective map below merges them into the canonical nested shape. The stale
// top-level fields are left in place — replacing `unreadCount` wholesale
// cannot reach them, and every reader prefers the nested value anyway, so they
// stay cosmetic.

const UNREAD_FLAT_PREFIX = "unreadCount.";

export interface ChatCoachRepointPlan {
  /**
   * False when nothing must be written: there is no chat doc yet, or the doc
   * already names the incoming coach. The same-coach guard matters — a
   * re-link / idempotent resubmit must NOT reset the coach's own live badge.
   */
  changed: boolean;
  /** The coach the doc named before this alta, or null when it named nobody. */
  previousCoachId: string | null;
  /** Unread messages the outgoing coach was holding, moved to the new one. */
  carriedUnread: number;
  /**
   * The COMPLETE next `unreadCount` map — written as a whole field value so
   * the outgoing coach's slot is actually removed. (A merge-set cannot delete
   * a key inside a map, and dotted-path deletes are the exact footgun
   * `onMessageCreated` documents: `set()` treats them as literal field names.)
   */
  nextUnreadCount: Record<string, number>;
}

/**
 * Read a chat doc's effective unread map: the canonical nested `unreadCount`
 * merged over any legacy flat `"unreadCount.{uid}"` top-level fields. Nested
 * wins on collision, matching `client-roster` / `chat-server-actions`.
 */
function effectiveUnreadCount(
  chat: Record<string, unknown>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(chat)) {
    if (!key.startsWith(UNREAD_FLAT_PREFIX)) continue;
    const uid = key.slice(UNREAD_FLAT_PREFIX.length);
    if (uid.length > 0 && typeof value === "number" && Number.isFinite(value)) {
      out[uid] = value;
    }
  }
  const nested = chat.unreadCount;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [uid, value] of Object.entries(nested as Record<string, unknown>)) {
      if (uid.length > 0 && typeof value === "number" && Number.isFinite(value)) {
        out[uid] = value;
      }
    }
  }
  return out;
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decide how `chats/{clientId}`'s participant fields must change when
 * `nextCoachId` takes the client on.
 *
 * Call it with the chat doc read in the SAME transaction/batch as the write
 * (both callers do) so the plan is authoritative against a concurrent
 * `onMessageCreated` increment.
 *
 * @param chat the chat doc's data, or null when the doc does not exist yet.
 */
export function planChatCoachRepoint(args: {
  chat: Record<string, unknown> | null;
  nextCoachId: string;
}): ChatCoachRepointPlan {
  const nextCoachId = args.nextCoachId.trim();
  const chat = args.chat;

  if (!chat || nextCoachId.length === 0) {
    return {
      changed: false,
      previousCoachId: null,
      carriedUnread: 0,
      nextUnreadCount: {},
    };
  }

  const previousCoachId = trimmedString(chat.coachId);

  // Already this coach's thread — leave the counters alone. This is the
  // re-link / `alreadyYours` shape, and clobbering the slot here would zero a
  // badge the coach is actively looking at.
  if (previousCoachId !== null && previousCoachId === nextCoachId) {
    return {
      changed: false,
      previousCoachId,
      carriedUnread: 0,
      nextUnreadCount: {},
    };
  }

  const current = effectiveUnreadCount(chat);
  const carriedUnread =
    previousCoachId !== null ? (current[previousCoachId] ?? 0) : 0;

  const nextUnreadCount: Record<string, number> = { ...current };
  if (previousCoachId !== null) {
    delete nextUnreadCount[previousCoachId];
  }
  nextUnreadCount[nextCoachId] = carriedUnread;

  return {
    changed: true,
    previousCoachId,
    carriedUnread,
    nextUnreadCount,
  };
}

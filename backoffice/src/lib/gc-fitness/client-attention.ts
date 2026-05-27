// client-attention.ts
//
// "Needs attention" predicate for the trainer roster + dashboard at-risk tile.
//
// History: in P11-06 this predicate combined missed-workouts (≥2 in the last
// 7 days) with low habit compliance (<60%). In practice that flagged half the
// roster because hitting a single bad week dropped the average below the
// threshold even when the client was actively training. After feedback from
// the first real-world coach using the dashboard we replaced it with a single,
// intuitive signal: a client is "at risk" iff they have NOT logged any habit,
// workout, or chat activity for at least 3 days (configurable below).
//
// Pattern B — pure synchronous function, no Firestore imports, trivially
// testable from Jest with `Date.now` injected.

/**
 * Hours of silence before a client is flagged. Single source of truth.
 *
 * Used by:
 *   - `client-roster.ts` (column on /gc-fitness/clients + sidebar pill).
 *   - `dashboard/page.tsx` (At-risk KPI tile + warning chip).
 */
export const NEEDS_ATTENTION_INACTIVITY_HOURS = 72;

/**
 * Reason strings — closed-set union for future extensibility (e.g., we may
 * add `"pending-signin"` once the mirror-doc flow surfaces those clients).
 */
export type AttentionReason = "inactive-3-days";

export interface ClientAttentionInput {
  /**
   * Most recent activity timestamp in epoch milliseconds (max of workout
   * log startedAt, habit log loggedAt, chat message createdAt). `null`
   * means the client has zero activity on record and is always flagged.
   */
  lastActivityAtMs: number | null;
  /**
   * "Now" in epoch ms. Caller-injected so tests can supply a frozen clock
   * without monkey-patching `Date`.
   */
  nowMs: number;
}

export interface ClientAttentionResult {
  needsAttention: boolean;
  reasons: AttentionReason[];
}

/**
 * Pure-function predicate. Returns `needsAttention=true` iff the client has
 * had zero activity for at least `NEEDS_ATTENTION_INACTIVITY_HOURS` hours.
 */
export function clientNeedsAttention(
  input: ClientAttentionInput,
): ClientAttentionResult {
  const cutoff = input.nowMs - NEEDS_ATTENTION_INACTIVITY_HOURS * 60 * 60 * 1000;
  if (input.lastActivityAtMs === null || input.lastActivityAtMs < cutoff) {
    return { needsAttention: true, reasons: ["inactive-3-days"] };
  }
  return { needsAttention: false, reasons: [] };
}

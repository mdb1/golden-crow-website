// client-attention.ts
//
// "Needs attention" predicate for the trainer roster view (BO-09, P11-06).
//
// Pattern B — Foundation-free / NO server-action directive:
//   - Plain TypeScript module (no firebase-admin, no next/headers).
//   - All exports are pure synchronous functions.
//   - Jest can exercise the function directly without mocking Firestore.
//   - Mirrors the precedent set by habit-compliance.ts (P06-08) — same
//     module shape, same testing convention.
//
// Pitfall 7 — same-source-of-truth:
//   The thresholds below are the SOLE source of truth for the
//   "needs attention" definition. Any future Cloud Function that wants
//   to surface a per-client attention badge (e.g., a daily digest email
//   for the trainer, an FCM push when a client crosses the threshold)
//   MUST import these constants from this file, NOT re-declare them.
//   Drift would surface as "iOS shows 4 needs-attention clients but the
//   digest email lists 3" — a silent product bug.
//
// Decision boundaries (from 11-CONTEXT.md):
//   (a) missedWorkouts >= 2  in the last 7 days  → reason "missed-workouts"
//   (b) complianceRatio < 0.6  in the last 7 days  → reason "low-compliance"
//   Both can fire together; reasons[] contains both.

/**
 * Threshold: a client is flagged as "needs attention" when they have
 * missed this many or more assigned workouts over the last 7 days.
 *
 * `missedWorkouts = assignedWorkouts(client, last7Days) - completedWorkouts(client, last7Days)`.
 * Negative values are clamped to 0 by this predicate (defense in depth —
 * the aggregator is expected to clamp, but we re-clamp here so the
 * predicate degrades gracefully on bad input).
 */
export const NEEDS_ATTENTION_MISSED_WORKOUTS_THRESHOLD = 2;

/**
 * Threshold: a client is flagged as "needs attention" when their habit
 * compliance ratio over the last 7 days is STRICTLY less than this value.
 *
 * `complianceRatio` is in [0, 1] — computed by `habit-compliance.ts`
 * `computeCompliance` averaged across the client's assigned habits.
 * A client with no assigned habits should be passed `1.0` by the caller
 * (vacuously compliant) so they aren't flagged for low compliance
 * against an empty habit set.
 */
export const NEEDS_ATTENTION_COMPLIANCE_THRESHOLD = 0.6;

/**
 * Reason strings — closed-set union. Pitfall 7 — these literal strings
 * are part of the public contract. Adding a new reason means:
 *   1. Append to the union here.
 *   2. Update the Jest cases to cover the new case.
 *   3. Update the RosterTable tooltip / chip-label rendering to handle
 *      the new reason.
 */
export type AttentionReason = "missed-workouts" | "low-compliance";

export interface ClientAttentionInput {
  /**
   * Number of workouts the client missed (assigned but not completed)
   * over the last 7 days. Computed server-side from
   *   `assignedWorkouts(last7days) - completedWorkouts(last7days)`.
   * Negative values are clamped to 0 inside this predicate.
   */
  missedWorkoutsLast7Days: number;

  /**
   * Habit compliance ratio over the last 7 days in [0, 1]. Computed
   * server-side as average of `computeCompliance()` across the client's
   * assigned habits. If the client has 0 assigned habits, callers
   * should pass 1.0 (vacuously compliant) so the predicate doesn't flag
   * "low compliance" against an empty habit set.
   */
  complianceRatioLast7Days: number;
}

export interface ClientAttentionResult {
  needsAttention: boolean;
  reasons: AttentionReason[];
}

/**
 * Pure-function predicate. Returns a result + reason list.
 *
 * Edge cases:
 *   - `missedWorkoutsLast7Days < 0` is treated as 0 (input is malformed
 *     but we don't throw — we degrade gracefully).
 *   - `complianceRatioLast7Days` outside [0, 1] is NOT clamped because
 *     the comparison `< 0.6` is well-defined for any number; we
 *     document the expectation that callers pass a clamped value.
 *   - Both reasons can fire together; ordering in the returned array
 *     is stable: missed-workouts first, then low-compliance (matches
 *     the order of the AttentionReason union).
 */
export function clientNeedsAttention(
  input: ClientAttentionInput,
): ClientAttentionResult {
  const missed = Math.max(0, input.missedWorkoutsLast7Days);
  const compliance = input.complianceRatioLast7Days;
  const reasons: AttentionReason[] = [];

  if (missed >= NEEDS_ATTENTION_MISSED_WORKOUTS_THRESHOLD) {
    reasons.push("missed-workouts");
  }
  if (compliance < NEEDS_ATTENTION_COMPLIANCE_THRESHOLD) {
    reasons.push("low-compliance");
  }

  return {
    needsAttention: reasons.length > 0,
    reasons,
  };
}

// client-attention.ts
//
// "Needs attention" predicate for the trainer roster (/gc-fitness/clients).
//
// History:
//   - P11-06 combined missed-workouts (≥2 in 7 days) with low habit compliance
//     (<60%). That flagged half the roster: one bad week dragged the average
//     under the bar even for a client who trained every day.
//   - May 2026 → a single signal: no habit/workout/photo activity for 3 days.
//   - #499 (2.3.0) → several INDEPENDENT reasons, each one something a coach
//     can act on today (cobrar, agendar, escribir, contestar). The lesson of
//     P11-06 is kept: no reason is an average of soft signals, every threshold
//     points at few enough clients that the coach opens them.
//
// ⚠️ TWIN: the mobile apps get the same reasons from the callable
// `functions/src/coach/coachAttention.ts` (gc-fitness). The ids, thresholds and
// rank below are the SHARED TABLE — a change here goes there too. The case
// table both sides should pass lives in `__tests__/twin-vectors/client-attention-cases.json` (pinned copy, #1644)
// (pure input → expected reasons, no Firestore), so the callable can copy it
// verbatim into its own test.
//
// Pattern B — pure synchronous function, no Firestore imports, `nowMs` injected.

/**
 * The shared reason table. Wire ids are camelCase like the callable's
 * (`CoachHome.AttentionReason` on the apps). `rank`: lower = more urgent — it
 * orders the reasons of one client and the roster's "attention" sort.
 */
export const ATTENTION_RULES = {
  /** No workout log / habit log / progress photo for `hours`. Null activity = flagged. */
  inactive: { rank: 0, hours: 72 },
  /** Nothing in the next `windowDays` civil days (today included): no workout
   *  assignment AND no habit scheduled on any of those days. */
  nothingAssigned: { rank: 1, windowDays: 4 },
  /** Workouts scheduled in the `lookbackDays` civil days BEFORE today (today is
   *  not over yet) that are not completed — at least `min` of them. */
  missedWorkouts: { rank: 2, lookbackDays: 7, min: 1 },
  /** `client_billing` status is overdue (`billing.ts status()`): the due date
   *  passed, or a class pack ran out. `due_soon` is NOT a reason. */
  overduePayment: { rank: 3 },
  /** A nutrition phase is in force today and the 7-day adherence is under
   *  `ratio` (= NUTRITION_ATTENTION_RATIO). No plan / nothing asked = no reason. */
  lowNutrition: { rank: 4, lookbackDays: 7, ratio: 0.6 },
  /** The coach has at least `min` unread messages in the client's chat. */
  unreadChat: { rank: 5, min: 1 },
} as const;

export type AttentionReason = keyof typeof ATTENTION_RULES;

/** Every reason, most urgent first. */
export const ATTENTION_REASONS: readonly AttentionReason[] = (
  Object.keys(ATTENTION_RULES) as AttentionReason[]
).sort((a, b) => ATTENTION_RULES[a].rank - ATTENTION_RULES[b].rank);

/**
 * Hours of silence before a client is flagged `inactive`. Kept as its own
 * export: the dashboard's at-risk tile is ONLY the inactivity signal.
 */
export const NEEDS_ATTENTION_INACTIVITY_HOURS = ATTENTION_RULES.inactive.hours;

export interface ClientAttentionInput {
  /** Most recent activity (epoch ms), or null when the client never did anything. */
  lastActivityAtMs: number | null;
  /** "Now" in epoch ms. */
  nowMs: number;
  /** Covered by a workout or a scheduled habit in the next window. Omitted = not evaluated. */
  hasSomethingAssignedSoon?: boolean;
  /** Past, not-completed assignments in the lookback window. Omitted = 0. */
  missedWorkouts?: number;
  /** `billing.ts status().state === "overdue"`. Omitted = false. */
  billingOverdue?: boolean;
  /** 7-day nutrition adherence in [0,1], or null when nothing was asked. */
  nutritionRatio7Days?: number | null;
  /** A nutrition phase is in force today. */
  nutritionHasActivePlan?: boolean;
  /** The coach's unread count in this client's chat. */
  unreadChatCount?: number;
}

export interface ClientAttentionResult {
  needsAttention: boolean;
  /** Most urgent first (by `ATTENTION_RULES[*].rank`). */
  reasons: AttentionReason[];
}

/** Pure predicate. Each reason is independent; `reasons` is ordered by rank. */
export function clientNeedsAttention(input: ClientAttentionInput): ClientAttentionResult {
  const reasons: AttentionReason[] = [];
  const cutoff = input.nowMs - ATTENTION_RULES.inactive.hours * 60 * 60 * 1000;
  if (input.lastActivityAtMs === null || input.lastActivityAtMs < cutoff) {
    reasons.push("inactive");
  }
  if (input.hasSomethingAssignedSoon === false) {
    reasons.push("nothingAssigned");
  }
  if ((input.missedWorkouts ?? 0) >= ATTENTION_RULES.missedWorkouts.min) {
    reasons.push("missedWorkouts");
  }
  if (input.billingOverdue === true) {
    reasons.push("overduePayment");
  }
  if (
    input.nutritionHasActivePlan === true &&
    typeof input.nutritionRatio7Days === "number" &&
    Number.isFinite(input.nutritionRatio7Days) &&
    input.nutritionRatio7Days < ATTENTION_RULES.lowNutrition.ratio
  ) {
    reasons.push("lowNutrition");
  }
  if ((input.unreadChatCount ?? 0) >= ATTENTION_RULES.unreadChat.min) {
    reasons.push("unreadChat");
  }
  reasons.sort((a, b) => ATTENTION_RULES[a].rank - ATTENTION_RULES[b].rank);
  return { needsAttention: reasons.length > 0, reasons };
}

/** The most urgent rank a client has, or `Infinity` when nothing is wrong (sorts last). */
export function attentionRank(reasons: readonly AttentionReason[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const r of reasons) {
    const rank = ATTENTION_RULES[r]?.rank;
    if (typeof rank === "number" && rank < best) best = rank;
  }
  return best;
}

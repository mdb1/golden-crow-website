// push-cap-schema.ts
//
// TypeScript MIRROR of the daily push cap constants defined in the
// gc-fitness Cloud Functions at
// `functions/src/push/types.ts`:
//
//   DAILY_TOTAL_CAP   = 4   (shared across nudge + assignment + pr categories;
//                            chat bypasses this — bypassTotalCap: true)
//   nudge.dailyCap    = 3   (per-category cap for `nudge`)
//
// Pitfall 7 (18th reuse — same-source-of-truth contract):
//   Drift between THESE constants and the Cloud Function's `types.ts` is
//   a CONTRACT BREAK. Symptom: the NudgeButton inline counter says
//   "3 / 4 today" but the next nudge gets `dropped:daily_cap` because the
//   Cloud Function's real per-category cap is lower. All three caps live
//   in one place per side; any change here MUST land in the same commit
//   as the Cloud Function constant. (See the chronological reuse table in
//   `nudge-schema.ts` for prior Pitfall 7 entries.)

/**
 * Maximum non-chat pushes a single client can receive in one civil-date.
 * Shared across `nudge`, `assignment`, `pr`, and `reminder` categories;
 * `chat` is explicitly exempt (`bypassTotalCap: true` in the function).
 *
 * MIRROR of `DAILY_TOTAL_CAP` in `functions/src/push/types.ts`.
 */
export const DAILY_TOTAL_CAP = 4;

/**
 * Per-category cap for the `nudge` category. Lower than `DAILY_TOTAL_CAP`
 * so a trainer can't burn the entire daily budget on nudges and shut out
 * legitimate workout/PR pushes. The orchestrator enforces whichever cap
 * is hit first.
 *
 * MIRROR of `PUSH_CATEGORIES.nudge.dailyCap` in `functions/src/push/types.ts`.
 */
export const NUDGE_CATEGORY_CAP = 3;

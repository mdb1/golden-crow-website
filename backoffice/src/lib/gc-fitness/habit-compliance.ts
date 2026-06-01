// habit-compliance.ts
// TS twin of GCFitnessCore HabitStreakCalculator (Swift, Plan 06-02).
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7):
//   The `logCountsAsCompleted` predicate + the `computeCompliance` algorithm
//   MUST parity-match the Swift `HabitStreakCalculator.complianceRatio` at
//   the algorithm layer. Drift between the two surfaces would surface as
//   "iOS shows 80% but backoffice shows 60% for the same habit on the same
//   day" — a silent product bug. The cross-surface parity fixture (T08 in
//   __tests__/habit-compliance.test.ts) locks the algorithm.
//
// FOUNDATION-FREE / NO server-action directive:
//   This file is plain TypeScript — no firebase-admin, no next/headers, no
//   server-action directive at the top. That means:
//     - It is safely importable from client components (e.g. the SVG
//       sparkline could re-derive ratios in the browser if it wanted).
//     - Jest can exercise the pure functions directly without mocking
//       Firestore.
//
//   The Server Action that reads /habit_logs is split into a sibling file
//   `habit-compliance-actions.ts` which DOES carry the server-action
//   directive at the top. Splitting is the only way Next.js 16 supports
//   both ergonomic client-side import AND server-side log fetching from
//   the same conceptual module (Next.js requires every export in a
//   server-action file to be a Server Action, so pure functions cannot
//   live next to them).
//
// PARITY WITH SWIFT — semantic mapping (HabitStreakCalculator.swift):
//   - `logCountsAsCompleted(log, habitType, targetValue)` mirrors
//     Swift `logCountsAsCompleted(_:habitType:targetValue:)`.
//     Habits are BINARY-ONLY now: a log counts iff `!deleted && value === true`.
//     `habitType` / `targetValue` are kept in the signature for call-site
//     parity but are unused (every habit is binary).
//   - `computeCompliance(habitType, logs, windowDays, today, timezone, targetValue?)`
//     mirrors Swift `complianceRatio(habitType:logs:windowDays:today:timezoneIdentifier:targetValue:)`.
//       Edge cases: windowDays <= 0 → 0.0; empty logs → 0.0.
//       Walks windowDays days backward from today (inclusive), counting hits
//       in the precomputed completed-day set. The set semantics handle the
//       "multiple logs same civilDate" edge case implicitly — a day either
//       has a completed log or doesn't.
//
// DST-SAFE DAY-STEP ARITHMETIC:
//   The Swift side uses Calendar(.gregorian) + TimeZone(identifier:) +
//   noon-anchored DateComponents to walk civilDays. We do the equivalent by
//   anchoring each parsed civil-date to 12:00 UTC and calling setUTCDate.
//   Civil-date arithmetic done in UTC space (anchoring at noon UTC) is safe
//   across DST boundaries because UTC has no DST. The `timezone` parameter
//   is accepted for parity with the Swift signature but is functionally
//   unused at the day-step layer — the caller pre-computes `today` in the
//   target timezone via civilDateToday(timezone), and from that point the
//   walk is purely arithmetic on civil-date strings.
//
// CALL SITES:
//   - habit-compliance-actions.ts → fetchHabitCompliance (Server Action) calls
//     computeCompliance(habitType, logs, 7, today, "UTC", targetValue) and
//     same with windowDays=30.
//   - Jest tests (this plan, 06-08) exercise computeCompliance + logCountsAsCompleted
//     directly with hand-crafted log fixtures (no Firestore round-trip).

import type { HabitType } from "./habit-schema";

/**
 * Wire-shape projection of a `/habit_logs/{logId}` document as seen by the
 * compliance algorithm.
 *
 * Field names match the camelCase wire keys locked in
 * `.planning/schemas/habit-logs.md` (Plan 06-01) + the Swift
 * `HabitLog.swift` Codable struct (Plan 06-02 post-fix `4482452`).
 *
 * `value` is a boolean — habits are binary-only (yes/no). Mirrors the Swift
 * `HabitLog.value` after the binary-only collapse.
 */
export interface HabitLogRow {
  habitId: string;
  clientId: string;
  civilDate: string; // "YYYY-MM-DD"
  value: boolean;
  unit?: string;
  loggedAt?: string; // ISO 8601 when the log was tapped (optional in compliance math)
  deleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * SOLE source of truth for "did this log count?". Re-used by
 * `computeCompliance` so the semantics cannot drift between the trainer
 * surface and any future per-day rollup. Parity-matches the Swift
 * `HabitStreakCalculator.logCountsAsCompleted`.
 *
 * Habits are BINARY-ONLY: a log counts iff `!deleted && value === true`.
 * `_habitType` / `_targetValue` are kept in the signature for call-site
 * parity (callers still pass them) but are unused.
 */
export function logCountsAsCompleted(
  log: HabitLogRow,
  _habitType?: HabitType,
  _targetValue?: number | undefined,
): boolean {
  if (log.deleted === true) return false;
  return log.value === true;
}

/**
 * Computes the compliance ratio over a window ending at `today` plus a
 * day-by-day completion timeline suitable for sparkline rendering.
 *
 * Returns `{ ratio, dailyCounts }`:
 *   - `ratio`: in [0.0, 1.0] = (completed days in window) / windowDays.
 *   - `dailyCounts`: ascending civil-date order (oldest first, newest last)
 *     so a sparkline renders left-to-right past-to-present. Length always
 *     equals `windowDays` (or 0 if windowDays ≤ 0).
 *
 * Edge cases (parity with Swift HabitStreakCalculator.complianceRatio):
 *   - windowDays ≤ 0 → ratio 0.0, dailyCounts []. Avoids divide-by-zero.
 *   - empty logs → ratio 0.0, dailyCounts of length windowDays w/ all
 *     completed:false.
 *   - multiple logs same civilDate → "at-least-one" rule (set semantics).
 *   - soft-deleted logs → never count toward completion.
 *
 * @param habitType discriminator for the value-variant predicate
 * @param logs all logs for ONE habit (caller responsible for habitId filter)
 * @param windowDays positive integer (7 or 30 in v1)
 * @param today civil-date string "YYYY-MM-DD" ending the window (inclusive)
 * @param timezone IANA tz id — accepted for parity with the Swift signature
 *   but unused at the day-step layer (the caller pre-computes `today`).
 *   Kept in the signature so future callers can flow client.timezone down
 *   without API breakage.
 * @param targetValue optional numeric target (numeric habit only)
 */
export function computeCompliance(
  habitType: HabitType,
  logs: HabitLogRow[],
  windowDays: number,
  today: string,
  _timezone: string,
  targetValue?: number,
): { ratio: number; dailyCounts: { date: string; completed: boolean }[] } {
  if (windowDays <= 0) {
    return { ratio: 0, dailyCounts: [] };
  }

  // Build the set of civil-dates with at least one completed log. The
  // set semantics handle the "multiple logs same civilDate" edge case —
  // a day either has a completed log or doesn't.
  const completedDays = new Set<string>();
  for (const log of logs) {
    if (logCountsAsCompleted(log, habitType, targetValue)) {
      completedDays.add(log.civilDate);
    }
  }

  // Walk windowDays days backward from today (inclusive). UTC anchoring
  // sidesteps DST (UTC has no DST), and we re-format each anchored Date
  // back to "YYYY-MM-DD" via inline projection (we don't need civilDateFormat
  // here because the anchor is always at 12:00 UTC and we project in UTC).
  const todayDate = parseISOCivilDateToUTC(today);
  const dailyCountsDesc: { date: string; completed: boolean }[] = [];
  let completedCount = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = formatUTCDateAsCivil(d);
    const completed = completedDays.has(dateStr);
    dailyCountsDesc.push({ date: dateStr, completed });
    if (completed) completedCount++;
  }
  // Reverse so the sparkline reads oldest→newest left-to-right.
  const dailyCounts = dailyCountsDesc.slice().reverse();

  return {
    ratio: completedCount / windowDays,
    dailyCounts,
  };
}

/**
 * Parses a "YYYY-MM-DD" civil-date into a Date anchored at 12:00 UTC on
 * that civil day. Noon-UTC anchoring is deliberate:
 *
 *   - UTC has no DST so setUTCDate(getUTCDate() - 1) is exact day-step.
 *   - The noon anchor mirrors the Swift HabitStreakCalculator.previousCivilDay
 *     convention — irrelevant for UTC arithmetic but kept for symmetry with
 *     the algorithm reference.
 *
 * Returns Date(NaN) on malformed input — let downstream surface a useful
 * error rather than silently producing 1970-01-01.
 */
function parseISOCivilDateToUTC(civilDate: string): Date {
  const parts = civilDate.split("-");
  if (parts.length !== 3) {
    return new Date(NaN);
  }
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(NaN);
  }
  // Date.UTC(year, monthIndex, day, hours, minutes, seconds) — monthIndex
  // is 0-based.
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Formats a Date anchored in UTC back to "YYYY-MM-DD" using UTC-component
 * extraction. Safe for our compliance walk because we strictly stay inside
 * UTC arithmetic — no DST, no locale, no Intl involvement needed.
 *
 * We do NOT call `civilDateFormat(d, "UTC")` here even though it would
 * produce the same string — keeping this projection local lets the file
 * stay self-contained for the pure-function audit (no implicit
 * cross-module dependency on Intl behavior).
 */
function formatUTCDateAsCivil(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const yy = String(y).padStart(4, "0");
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

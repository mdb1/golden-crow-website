// habit-compliance-actions.ts
//
// Server Action surface for the GC Fitness trainer per-habit compliance view
// (Plan 06-08). The pure-function math lives in the sibling
// `habit-compliance.ts` so it can be imported from client components and
// exercised by Jest without mocking Firestore. This file is the I/O wrapper:
//
//   1. Resolve trainer identity via getCurrentTrainer (T-06-08-01 mitigation
//      — never read /habit_logs for a foreign trainer's habit).
//   2. Read the parent habit doc via Admin SDK + verify trainerId ownership
//      (defense-in-depth before the rule-layer deny — Admin SDK bypasses rules).
//   3. Query /habit_logs windowed to the last 30 civil days using the
//      habitId+civilDate composite index from Plan 06-01 (index #3).
//   4. Hand the rows to computeCompliance for windowDays=7 and windowDays=30.
//   5. Return a serializable shape for the ComplianceWidget React component.
//
// THREAT-REGISTER COVERAGE (PLAN 06-08 <threat_model>):
//   T-06-08-01 (InfoDisclosure — foreign trainer's habit) — getCurrentTrainer
//              + habitSnap.data().trainerId === trainer.uid pre-flight.
//   T-06-08-02 (Tampering — soft-deleted logs counted) — handled in
//              logCountsAsCompleted (returns false on deleted === true).
//   T-06-08-03 (Tampering — numeric below-target counted) — handled in
//              logCountsAsCompleted (numeric branch: value >= targetValue).
//   T-06-08-05 (DoS — pagination-free /habit_logs query) — window-bounded
//              query (civil_date >= today-29d) ensures ≤30 docs per habit.
//
// RETURN SHAPE — consumed by ComplianceWidget.tsx:
//   {
//     sevenDayRatio: number;       // [0.0, 1.0]
//     thirtyDayRatio: number;      // [0.0, 1.0]
//     dailyCounts: { date: string; completed: boolean }[]; // 30 entries
//                                                          // oldest→newest
//   }
//
// REFERENCE PATTERN: mirrors `habit-actions.ts` (P06-05) verbatim for the
// getCurrentTrainer guard + Admin SDK ownership pre-flight + ISO timestamp
// projection — keeps the surface shape consistent across the habit Server
// Action module group.

"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  computeCompliance,
  type HabitLogRow,
} from "./habit-compliance";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import type { HabitType } from "./habit-schema";
import { civilDateToday, civilDateFormat } from "./civil-date";

/**
 * Serializable shape returned by `fetchHabitCompliance` — consumed by the
 * ComplianceWidget React Server Component on `/gc-fitness/habits/[id]`.
 */
export interface HabitComplianceResponse {
  sevenDayRatio: number;
  thirtyDayRatio: number;
  /**
   * Daily completion bits for the trailing 30-day window, oldest → newest.
   * Length always 30 (or 0 if the upstream window was non-positive — should
   * never happen in production but the type permits it for defense).
   */
  dailyCounts: { date: string; completed: boolean }[];
}

/**
 * Coerces a Firestore Timestamp (or any value exposing `.toDate()`) to an
 * ISO string. Returns "" for missing / unknown shapes. Mirrors the
 * `toIso` helper from `habit-actions.ts`.
 */
function toIsoOrEmpty(v: unknown): string {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return "";
}

/**
 * Reads the last 30 days of habit_logs for the given habit and returns the
 * 7-day + 30-day compliance ratios plus a daily-completion timeline.
 *
 * Trainer ownership is verified BEFORE any /habit_logs read (defense in
 * depth — the Admin SDK bypasses rules, so we re-enforce here).
 *
 * Throws:
 *   - `Error("Forbidden")` from getCurrentTrainer if the trainer is not
 *     signed in / not in the allowlist / role != "trainer".
 *   - `Error("Habit not found.")` if the habitId does not exist.
 *   - `Error("Not your habit.")` if the habit belongs to a different trainer.
 */
export async function fetchHabitCompliance(
  habitId: string,
): Promise<HabitComplianceResponse> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();

  // 1) Pre-flight habit read + trainer-ownership check (T-06-08-01).
  const habitSnap = await db
    .collection(FirestoreCollections.habits)
    .doc(habitId)
    .get();
  if (!habitSnap.exists) {
    throw new Error("Habit not found.");
  }
  const habit = habitSnap.data() as {
    trainerId?: string;
    type?: HabitType;
    targetValue?: number;
  };
  if (habit.trainerId !== trainer.uid) {
    throw new Error("Not your habit.");
  }

  const habitType: HabitType = (habit.type as HabitType) ?? "binary";
  const targetValue =
    typeof habit.targetValue === "number" ? habit.targetValue : undefined;

  // 2) Compute the 30-day civil-date window.
  //
  // v1 uses server-side UTC for the "today" anchor. A future refinement
  // (after we collect client.timezone consistently on /users/) would flow
  // the client's IANA tz here so the trainer's compliance view aligns
  // with the client's civil-date semantics. For now the iOS HabitDetailView
  // also computes in client.timezone, so a small mis-alignment is possible
  // at the day boundary in the client's evening hours — acceptable for v1
  // per CONTEXT.md.
  const today = civilDateToday("UTC");
  const startDate = computeStartCivilDate(29);

  // 3) Window-bounded query using the habitId+civilDate composite index
  //    (#3 from P06-01). Returns ≤30 docs per habit by construction
  //    (T-06-08-05 DoS mitigation).
  const snap = await db
    .collection(FirestoreCollections.habitLogs)
    .where("habitId", "==", habitId)
    .where("civilDate", ">=", startDate)
    .orderBy("civilDate", "asc")
    .get();

  const logs: HabitLogRow[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      habitId: (data.habitId as string) ?? "",
      clientId: (data.clientId as string) ?? "",
      civilDate: (data.civilDate as string) ?? "",
      value: data.value as boolean | string | number,
      unit: typeof data.unit === "string" ? data.unit : undefined,
      loggedAt: toIsoOrEmpty(data.loggedAt),
      deleted: data.deleted === true,
      createdAt: toIsoOrEmpty(data.createdAt),
      updatedAt: toIsoOrEmpty(data.updatedAt),
    };
  });

  // 4) Pure-function rollup — single source of truth for "did this log
  //    count?" lives in habit-compliance.ts.
  const seven = computeCompliance(habitType, logs, 7, today, "UTC", targetValue);
  const thirty = computeCompliance(habitType, logs, 30, today, "UTC", targetValue);

  return {
    sevenDayRatio: seven.ratio,
    thirtyDayRatio: thirty.ratio,
    dailyCounts: thirty.dailyCounts,
  };
}

/**
 * Returns the civil-date string `daysBack` days earlier than today (UTC).
 *
 * Used to compute the 30-day query lower bound: we want today + the 29
 * preceding civil days, so the window length is 30. Anchored at noon UTC
 * for the same reasons as `parseISOCivilDateToUTC` in habit-compliance.ts —
 * UTC is DST-free so day-step arithmetic with setUTCDate is exact.
 */
function computeStartCivilDate(daysBack: number): string {
  const t = new Date();
  t.setUTCHours(12, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() - daysBack);
  return civilDateFormat(t, "UTC");
}

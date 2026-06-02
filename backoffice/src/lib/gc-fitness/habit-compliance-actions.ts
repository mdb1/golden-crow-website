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
  computeAdherence,
  type HabitLogRow,
} from "./habit-compliance";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import type { HabitType } from "./habit-schema";
import { civilDateToday, civilDateFormat } from "./civil-date";
import { getTrainerTimezone } from "./trainer-timezone";

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
    clientId?: string;
    type?: HabitType;
    targetValue?: number;
    // Schedule fields — drive the SCHEDULED-DAY adherence denominator via
    // isHabitScheduledOn (honors startsOn/endsOn/skippedDates + cadence).
    scheduleType?: "one-time" | "recurring";
    startsOn?: string;
    endsOn?: string;
    scheduleCadence?: "daily" | "weekly" | "monthly";
    scheduleWeekdays?: number[];
    scheduleDayOfMonth?: number;
    scheduleMonthDays?: number[];
    skippedDates?: string[];
  };
  if (habit.trainerId !== trainer.uid) {
    throw new Error("Not your habit.");
  }

  const habitType: HabitType = (habit.type as HabitType) ?? "binary";
  const targetValue =
    typeof habit.targetValue === "number" ? habit.targetValue : undefined;

  // Habit-like object consumed by computeAdherence → isHabitScheduledOn. Only
  // the schedule fields matter for the scheduled-day denominator; we pass them
  // through verbatim so the predicate matches what the client sees on iOS.
  const habitSchedule: Record<string, unknown> = {
    scheduleType: habit.scheduleType,
    startsOn: habit.startsOn,
    endsOn: habit.endsOn,
    scheduleCadence: habit.scheduleCadence,
    scheduleWeekdays: habit.scheduleWeekdays,
    scheduleDayOfMonth: habit.scheduleDayOfMonth,
    scheduleMonthDays: habit.scheduleMonthDays,
    skippedDates: habit.skippedDates,
  };

  // 2) Compute the 30-day civil-date window.
  //
  // We anchor "today" and the window start in the CLIENT's IANA timezone so
  // the trainer's compliance view aligns with the civil-date semantics the
  // client sees on iOS (HabitDetailView computes in client.timezone). The tz
  // is resolved from the client's /users doc, falling back to the trainer's
  // own cookie tz (and ultimately "UTC" via getTrainerTimezone's own
  // fallback) when the client has no stored timezone.
  const clientId = typeof habit.clientId === "string" ? habit.clientId : "";
  let clientTz = await getTrainerTimezone();
  if (clientId) {
    const clientSnap = await db
      .collection(FirestoreCollections.users)
      .doc(clientId)
      .get();
    const storedTz = clientSnap.get("timezone");
    if (typeof storedTz === "string" && storedTz) {
      clientTz = storedTz;
    }
  }

  const today = civilDateToday(clientTz);
  const startDate = computeStartCivilDate(29, clientTz);

  // 3) Window-bounded query using the habitId+civilDate composite index
  //    (#3 from P06-01). Returns ≤30 docs per habit by construction
  //    (T-06-08-05 DoS mitigation).
  // Defensive (260602-moz): a failure HERE (e.g. a missing/not-yet-built
  // composite index, or a transient Firestore read error) must NOT crash the
  // whole habit detail page — that throws up to /habits/error.tsx and "bounces
  // back to the list with an error card", blocking BOTH viewing and (via the
  // page) reaching the Edit button. Degrade to empty compliance instead: the
  // metadata card + Edit button still render; compliance just shows 0/empty.
  // The ownership checks above still throw (those are legitimate 403/404s).
  let logs: HabitLogRow[] = [];
  try {
    const snap = await db
      .collection(FirestoreCollections.habitLogs)
      .where("habitId", "==", habitId)
      .where("civilDate", ">=", startDate)
      // orderBy DESC to match the DEPLOYED composite index
      // (habit_logs: habitId ASC, civilDate DESC). An ASC orderBy needs a
      // separate (habitId ASC, civilDate ASC) index that is NOT deployed.
      // Order is irrelevant: computeCompliance derives a Set of completed days
      // and builds dailyCounts from the window, not the input order.
      .orderBy("civilDate", "desc")
      .get();

    logs = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        habitId: (data.habitId as string) ?? "",
        clientId: (data.clientId as string) ?? "",
        civilDate: (data.civilDate as string) ?? "",
        value: data.value === true,
        unit: typeof data.unit === "string" ? data.unit : undefined,
        loggedAt: toIsoOrEmpty(data.loggedAt),
        deleted: data.deleted === true,
        createdAt: toIsoOrEmpty(data.createdAt),
        updatedAt: toIsoOrEmpty(data.updatedAt),
      };
    });
  } catch (err) {
    console.error(
      "[habit-compliance] habit_logs query failed; degrading to empty compliance",
      err,
    );
  }

  // 4) Pure-function rollup. The displayed compliance % is SCHEDULED-DAY
  //    adherence (computeAdherence): the denominator counts only days the
  //    habit was active + scheduled in the window — NOT the full 7/30-day
  //    calendar window. This matches the iOS definition
  //    (HabitStreakCalculator.computeAdherenceRatio) and fixes the
  //    "activated May 5, done 5/5 → reads 5/30 instead of 100%" bug.
  const sevenAdherence = computeAdherence(habitSchedule, logs, 7, today);
  const thirtyAdherence = computeAdherence(habitSchedule, logs, 30, today);

  // dailyCounts keeps the full 30-day per-day completion timeline for the
  // sparkline. computeCompliance and computeAdherence build dailyCounts
  // identically (every day in the window, `completed` from the log set), so
  // we source it from the 30-day adherence pass.
  return {
    sevenDayRatio: sevenAdherence.ratio,
    thirtyDayRatio: thirtyAdherence.ratio,
    dailyCounts: thirtyAdherence.dailyCounts,
  };
}

/**
 * Returns the civil-date string `daysBack` days earlier than today in the
 * supplied IANA timezone.
 *
 * Used to compute the 30-day query lower bound: we want today + the 29
 * preceding civil days, so the window length is 30. The instant is anchored
 * at noon UTC before stepping back `daysBack` days — UTC is DST-free so the
 * setUTCDate stepping is exact, and anchoring at noon keeps the resulting
 * civil day stable when projected into the client's timezone offset. Only
 * the FINAL format zone is the client tz.
 */
function computeStartCivilDate(daysBack: number, timezone: string): string {
  const t = new Date();
  t.setUTCHours(12, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() - daysBack);
  return civilDateFormat(t, timezone);
}

// inherited-plan.ts — gc-fitness#1504: the pure half of «Terminar plan del coach
// anterior», and the pure bits of the ficha that must ignore inherited work.
//
// `planInheritedPlanEnd` follows the criteria of gc-fitness
// `functions/src/coach/unlinkCleanupPlan.ts` (#1395) for assignments, habits and
// (since #1504 Q2, 2026-11-08) nutrition plans. Plain module (NOT "use server"): sync
// exports would break `next build` there (#785).

import { assignedBy, isEndableAssignment, isEndableHabit, isEndablePlan } from "./assigned-by";
import { addCivilDays } from "./recurrence-expansion";

export interface PlanDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface InheritedPlanEnd {
  deleteAssignmentIds: string[];
  endHabits: Array<{ id: string; endsOn: string }>;
  deleteHabitIds: string[];
  endPlans: Array<{ id: string; endsOn: string }>;
  deletePlanIds: string[];
}

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function civil(v: unknown): string | null {
  return typeof v === "string" && CIVIL_DATE_RE.test(v) ? v : null;
}

/**
 * - Assignments: inherited, from today on, still `scheduled`, not self-assigned and
 *   with no `workout_logs` doc (the client opened it — kept) → deleted.
 * - Habits: inherited, live, not over → `endsOn = yesterday`; when that would precede
 *   `startsOn` there is no past to keep → soft-deleted.
 * - Nutrition plans: inherited, live, not `source == "self"`, not a past phase →
 *   `endsOn = yesterday`; one that starts today or later (or has no `startsOn`) →
 *   soft-deleted, exactly like the server's `planUnlinkCleanup`.
 */
export function planInheritedPlanEnd(args: {
  coachId: string | null;
  today: string;
  assignments: PlanDoc[];
  habits: PlanDoc[];
  plans?: PlanDoc[];
  loggedAssignmentIds?: ReadonlySet<string>;
}): InheritedPlanEnd {
  const user = { coachId: args.coachId };
  const logged = args.loggedAssignmentIds ?? new Set<string>();
  const yesterday = addCivilDays(args.today, -1);

  const deleteAssignmentIds = args.assignments
    .filter(({ id, data }) => isEndableAssignment(data, user, args.today) && !logged.has(id))
    .map((d) => d.id);

  const endHabits: InheritedPlanEnd["endHabits"] = [];
  const deleteHabitIds: string[] = [];
  for (const { id, data } of args.habits) {
    if (!isEndableHabit(data, user, args.today)) continue;
    const startsOn = civil(data.startsOn);
    if (startsOn && yesterday < startsOn) deleteHabitIds.push(id);
    else endHabits.push({ id, endsOn: yesterday });
  }

  const endPlans: InheritedPlanEnd["endPlans"] = [];
  const deletePlanIds: string[] = [];
  for (const { id, data } of args.plans ?? []) {
    if (!isEndablePlan(data, user, args.today)) continue;
    const startsOn = civil(data.startsOn);
    if (!startsOn || startsOn >= args.today) deletePlanIds.push(id);
    else endPlans.push({ id, endsOn: yesterday });
  }
  return { deleteAssignmentIds, endHabits, deleteHabitIds, endPlans, deletePlanIds };
}

/** Drops the `former` docs of a client from any number the coach is shown. */
export function withoutInherited<T>(
  docs: readonly T[],
  dataOf: (doc: T) => Record<string, unknown>,
  coachId: string | null | undefined,
): T[] {
  return docs.filter((doc) => assignedBy(dataOf(doc), { coachId }) !== "former");
}

/**
 * Consecutive completed past assignments for the ficha. Walks past-or-today rows
 * newest first; a miss, or a past-due `scheduled`/`started`, ends it; today's
 * unfinished one is the grace window. Inherited rows are invisible: 334 overdue
 * workouts from a former coach must not read as the client's streak breaking.
 */
export function computeWorkoutStreak(
  rows: ReadonlyArray<Record<string, unknown>>,
  todayCivil: string,
  coachId: string | null | undefined,
): number {
  const sorted = rows
    .filter((data) => assignedBy(data, { coachId }) !== "former")
    .map((data) => ({
      scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
      status: typeof data.status === "string" ? data.status : "",
    }))
    .filter((row) => row.scheduledFor && row.scheduledFor <= todayCivil)
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  let streak = 0;
  for (const row of sorted) {
    if (row.status === "completed") {
      streak += 1;
      continue;
    }
    if (row.status === "missed") return streak;
    if (row.scheduledFor === todayCivil) continue;
    return streak;
  }
  return streak;
}

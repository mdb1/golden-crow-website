// nutrition-plan-resolution.ts
// TS twin of GCFitnessCore `NutritionPlanResolver.swift` / `NutritionPlanOverlap` and of
// Kotlin `NutritionPlanResolver.kt` (#913).
//
// SAME-SOURCE-OF-TRUTH CONTRACT (Pitfall 7): behavioral changes land in all three in the
// SAME PR, and the shared fixture block in the three test files must keep agreeing. The
// precedent is habit-compliance: three implementations that merely resemble each other
// produce three different numbers on three screens, and no test fails.
//
// FOUNDATION-FREE / NO server-action directive: pure functions, no firebase-admin. The
// Server Actions that read plans live in a sibling `*-actions.ts` (#785 — a synchronous
// export in a `"use server"` file passes Jest and dies in `next build`).

import { civilDateAddDays } from "./civil-date";
import { planIsActiveOn, type NutritionPlan } from "./nutrition-schema";

/**
 * The plan in force on `civilDate`, or `null` when there is none.
 *
 * **`null` is a first-class answer**, not an error: "sin plan vigente" must render as an
 * empty state, never as a ghost list carrying last month's targets. It is also the single
 * most important thing for a coach to notice on the roster.
 *
 * ### Determinism when more than one plan matches
 *
 * The overlap invariant says this cannot happen, but corrupt data and a half-applied
 * assign both produce it, and three platforms silently disagreeing would be worse than
 * any of the possible answers. Tie-break, in order:
 *
 * 1. the latest `startsOn` — the most recent intent wins;
 * 2. `coach` over `self` — **manda el coach**; the self-authored plan stays as a past
 *    phase, it is never deleted;
 * 3. the lexicographically smallest doc id — arbitrary but *stable*, so iOS, Android and
 *    the backoffice land on the same doc.
 */
export function activeNutritionPlan(
  plans: NutritionPlan[],
  civilDate: string,
): NutritionPlan | null {
  const candidates = plans.filter((plan) => planIsActiveOn(plan, civilDate));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  return [...candidates].sort((a, b) => {
    if (a.startsOn !== b.startsOn) return a.startsOn < b.startsOn ? 1 : -1;
    if (a.source !== b.source) return a.source === "coach" ? -1 : 1;
    return (a.id ?? "").localeCompare(b.id ?? "");
  })[0]!;
}

/**
 * The plans that overlap the closed range `[start, end]`, sorted by `startsOn` ascending —
 * the phase strip drawn behind the weight chart, and the denominator source for a
 * multi-phase adherence range.
 *
 * Soft-deleted plans are excluded. A plan with `endsOn === null` overlaps any range that
 * ends on or after its `startsOn`.
 */
export function nutritionPlansOverlapping(
  plans: NutritionPlan[],
  start: string,
  end: string,
): NutritionPlan[] {
  if (start > end) return [];
  return plans
    .filter((plan) => {
      if (plan.deleted === true) return false;
      if (plan.startsOn > end) return false;
      return plan.endsOn === null || plan.endsOn === undefined
        ? true
        : plan.endsOn >= start;
    })
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

// ── The assign-time planner ─────────────────────────────────────────────────────────

export type NutritionPlanOverlapAction =
  /** Close the phase the day before the new one opens. */
  | { kind: "trim"; endsOn: string }
  /**
   * The new phase completely covers this one — soft-delete it. Only when the existing
   * plan starts on/after the new one and ends within it, i.e. a queued future phase
   * replaced before it ever took effect.
   */
  | { kind: "supersede" }
  /**
   * The existing phase starts inside the new span but outlives it — push its start to the
   * day after the new phase closes, rather than throwing it away.
   */
  | { kind: "deferStart"; startsOn: string };

export interface NutritionPlanOverlapEdit {
  planId: string;
  action: NutritionPlanOverlapAction;
}

/**
 * The edits an assign must apply so that **no two plans are ever active on the same civil
 * day**, for a new phase spanning `[newStartsOn, newEndsOn]` (`null` ⇒ open-ended).
 *
 * The invariant is held by CONSTRUCTION, not by the rule layer: Firestore rules cannot
 * cheaply see sibling documents, so a rule could only reject an overlap it happens to be
 * shown. This is what the assign runs before writing — and it is also what must feed the
 * "el plan vigente se recorta al 31 de agosto" warning, so that sentence can never drift
 * from what the save actually does.
 *
 * Plans with no `id` are skipped: an edit that cannot name its target is not applicable,
 * and silently addressing the wrong doc is worse than doing nothing.
 */
export function nutritionPlanOverlapEdits(
  existing: NutritionPlan[],
  newStartsOn: string,
  newEndsOn: string | null,
): NutritionPlanOverlapEdit[] {
  const dayBeforeNewStart = civilDateAddDays(newStartsOn, -1);

  return existing
    .filter((plan) => plan.deleted !== true && !!plan.id)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .flatMap((plan): NutritionPlanOverlapEdit[] => {
      const planId = plan.id!;
      const planEndsOn = plan.endsOn ?? null;

      // Already closed before the new phase opens — untouched history.
      if (planEndsOn !== null && planEndsOn < newStartsOn) return [];

      if (plan.startsOn < newStartsOn) {
        // Runs into the new phase: close it the day before.
        if (dayBeforeNewStart === null) return [];
        return [{ planId, action: { kind: "trim", endsOn: dayBeforeNewStart } }];
      }

      // Starts on or after the new phase.
      if (newEndsOn === null) {
        // The new phase is open-ended, so it swallows everything after it.
        return [{ planId, action: { kind: "supersede" } }];
      }

      if (plan.startsOn > newEndsOn) return []; // a later phase, untouched

      if (planEndsOn !== null && planEndsOn <= newEndsOn) {
        return [{ planId, action: { kind: "supersede" } }];
      }

      const resumeOn = civilDateAddDays(newEndsOn, 1);
      if (resumeOn === null) return [];
      return [{ planId, action: { kind: "deferStart", startsOn: resumeOn } }];
    });
}

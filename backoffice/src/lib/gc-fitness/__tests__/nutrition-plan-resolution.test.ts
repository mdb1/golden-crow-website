// nutrition-plan-resolution.test.ts
// Twin of iOS `NutritionPlanResolverTests.swift` and Kotlin `NutritionPlanResolverTest.kt`
// (#913). Locks "never two plans active on the same civil day" and the deterministic
// resolution that has to hold anyway when the data says otherwise.

import { civilDateAddDays } from "../civil-date";
import {
  activeNutritionPlan,
  nutritionPlanOverlapEdits,
  nutritionPlansOverlapping,
} from "../nutrition-plan-resolution";
import { isSelfAuthoredPlan, planIsActiveOn } from "../nutrition-schema";
import { phaseA, phaseB, selfPlan } from "./nutrition-fixtures";

describe("civilDateAddDays — the single rolling-day mechanism", () => {
  it("crosses month and year boundaries, and knows February 2026 has 28 days", () => {
    expect(civilDateAddDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(civilDateAddDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(civilDateAddDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(civilDateAddDays("2024-03-01", -1)).toBe("2024-02-29"); // leap year
  });

  it("returns null on malformed input rather than a plausible wrong day", () => {
    expect(civilDateAddDays("2026-8-1", 1)).toBeNull();
    expect(civilDateAddDays("20260801", 1)).toBeNull();
    expect(civilDateAddDays("", 1)).toBeNull();
  });
});

describe("activeNutritionPlan", () => {
  it("resolves the phase in force, and switches on the cut day", () => {
    const plans = [phaseA(), phaseB()];
    expect(activeNutritionPlan(plans, "2026-08-31")?.id).toBe("plan-a");
    // The cut day itself already belongs to the new phase — the boundary is inclusive on
    // both ends and there is no gap between them.
    expect(activeNutritionPlan(plans, "2026-09-01")?.id).toBe("plan-b");
    expect(activeNutritionPlan(plans, "2027-03-14")?.id).toBe("plan-b");
  });

  it("before the first phase there is NO plan — null is a first-class answer", () => {
    expect(activeNutritionPlan([phaseA()], "2026-07-31")).toBeNull();
  });

  it("a closed phase does not leak past its endsOn", () => {
    expect(activeNutritionPlan([phaseA()], "2026-09-01")).toBeNull();
  });

  it("soft-deleted plans are never in force", () => {
    expect(activeNutritionPlan([{ ...phaseA(), deleted: true }], "2026-08-15")).toBeNull();
  });

  it("an open-ended self plan is resolvable — it must not need an endsOn to be found", () => {
    // #400's shape: the self-authored doc is the one most likely to be open-ended, so it
    // is the one that disappears when a query assumes a field is present.
    const plan = activeNutritionPlan([selfPlan()], "2026-08-18");
    expect(plan?.id).toBe("plan-self");
    expect(isSelfAuthoredPlan(plan!)).toBe(true);
  });

  it("overlapping plans resolve deterministically: latest start, then coach, then id", () => {
    const earlySelf = { ...selfPlan(), endsOn: null }; // starts 2026-06-01
    const lateCoach = { ...phaseA(), endsOn: null }; // starts 2026-08-01
    const lateSelf = { ...selfPlan(), id: "plan-self-late", startsOn: "2026-08-01" };

    // 1. latest startsOn wins over an earlier one.
    expect(activeNutritionPlan([earlySelf, lateCoach], "2026-08-18")?.id).toBe("plan-a");
    // 2. same start ⇒ manda el coach. The self plan is not deleted, it just stops being
    //    the one in force.
    expect(activeNutritionPlan([lateSelf, lateCoach], "2026-08-18")?.id).toBe("plan-a");
    // 3. same start, same source ⇒ smallest doc id, so three platforms agree on an
    //    arbitrary answer rather than on three different ones.
    const twinA = { ...phaseA(), id: "plan-zzz" };
    const twinB = { ...phaseA(), id: "plan-aaa" };
    expect(activeNutritionPlan([twinA, twinB], "2026-08-18")?.id).toBe("plan-aaa");
  });
});

describe("nutritionPlansOverlapping", () => {
  it("returns the phase strip in start order", () => {
    const strip = nutritionPlansOverlapping(
      [phaseB(), phaseA(), selfPlan()],
      "2026-08-01",
      "2026-09-30",
    );
    expect(strip.map((p) => p.id)).toEqual(["plan-self", "plan-a", "plan-b"]);
  });

  it("excludes a phase that closed before the range starts", () => {
    const strip = nutritionPlansOverlapping(
      [phaseA(), phaseB()],
      "2026-09-01",
      "2026-09-30",
    );
    expect(strip.map((p) => p.id)).toEqual(["plan-b"]);
  });
});

describe("nutritionPlanOverlapEdits — the assign-time planner", () => {
  it("assigning after a running phase trims it to the day before", () => {
    expect(nutritionPlanOverlapEdits([selfPlan()], "2026-09-01", "2026-09-30")).toEqual([
      { planId: "plan-self", action: { kind: "trim", endsOn: "2026-08-31" } },
    ]);
  });

  it("the trim crosses a month boundary correctly", () => {
    const running = { ...phaseA(), startsOn: "2026-01-15", endsOn: null };
    // February 2026 has 28 days — the day before March 1 is Feb 28, not "2026-03-00" and
    // not "2026-02-29". The arithmetic goes through civilDateAddDays, the single
    // rolling-day mechanism, precisely so no call site re-derives it.
    expect(nutritionPlanOverlapEdits([running], "2026-03-01", null)).toEqual([
      { planId: "plan-a", action: { kind: "trim", endsOn: "2026-02-28" } },
    ]);
  });

  it("leaves history that already closed before the new phase alone", () => {
    expect(nutritionPlanOverlapEdits([phaseA()], "2026-09-01", null)).toEqual([]);
  });

  it("supersedes a queued future phase fully covered by the new one", () => {
    // phaseB starts 2026-09-01 open-ended; an open-ended new phase from 2026-08-20
    // swallows it, because two open-ended phases cannot both be last.
    expect(nutritionPlanOverlapEdits([phaseB()], "2026-08-20", null)).toEqual([
      { planId: "plan-b", action: { kind: "supersede" } },
    ]);
  });

  it("pushes the start of a queued phase that outlives the new one, not throwing it away", () => {
    // The coach inserts a short block ahead of an already-queued open-ended phase.
    // Deleting the queued phase would silently discard work the coach did.
    expect(nutritionPlanOverlapEdits([phaseB()], "2026-09-01", "2026-09-15")).toEqual([
      { planId: "plan-b", action: { kind: "deferStart", startsOn: "2026-09-16" } },
    ]);
  });

  it("leaves a phase starting after the new one closes untouched", () => {
    expect(nutritionPlanOverlapEdits([phaseB()], "2026-07-01", "2026-07-31")).toEqual([]);
  });

  it("never edits soft-deleted or id-less plans", () => {
    // An edit that cannot name its target is not applicable; silently addressing the
    // wrong doc would be worse than doing nothing.
    const deleted = { ...selfPlan(), deleted: true };
    const idless = { ...selfPlan(), id: undefined };
    expect(nutritionPlanOverlapEdits([deleted, idless], "2026-09-01", null)).toEqual([]);
  });

  it("applying the edits leaves exactly one plan in force on every day", () => {
    // The whole point of the planner: after applying what it returns, the resolver's
    // tie-break must never be reachable.
    let running = selfPlan(); // 2026-06-01, open-ended
    const newStart = "2026-09-01";
    const edits = nutritionPlanOverlapEdits([running], newStart, null);
    const action = edits[0]!.action;
    if (action.kind === "trim") running = { ...running, endsOn: action.endsOn };

    const incoming = { ...phaseB(), startsOn: newStart };
    const plans = [running, incoming];
    for (const day of ["2026-08-31", "2026-09-01", "2026-09-02"]) {
      expect(plans.filter((p) => planIsActiveOn(p, day))).toHaveLength(1);
    }
  });
});

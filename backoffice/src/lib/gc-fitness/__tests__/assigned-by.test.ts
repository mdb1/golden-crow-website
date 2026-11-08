// gc-fitness#1504 — twin of Swift `AssignedByTests`, Kotlin `AssignedByTest` and
// functions' `assignedBy.test.ts`: all of them walk the same vector.

import { assignedBy, isEndableAssignment, isEndableHabit, isEndablePlan } from "../assigned-by";
import { computeWorkoutStreak, planInheritedPlanEnd, withoutInherited } from "../inherited-plan";
import vector from "./assigned-by.vector.json";

describe("assignedBy — shared vector", () => {
  it.each(vector.assignedBy.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(assignedBy(c, { coachId: c.coachId })).toBe(c.expected);
  });

  it.each(vector.endableAssignment.map((c) => [c.name, c] as const))("endable assignment: %s", (_name, c) => {
    expect(isEndableAssignment(c, { coachId: c.coachId }, c.today)).toBe(c.expected);
  });

  it.each(vector.endableHabit.map((c) => [c.name, c] as const))("endable habit: %s", (_name, c) => {
    expect(isEndableHabit(c, { coachId: c.coachId }, c.today)).toBe(c.expected);
  });

  it.each(vector.endablePlan.map((c) => [c.name, c] as const))("endable plan: %s", (_name, c) => {
    expect(isEndablePlan(c, { coachId: c.coachId }, c.today)).toBe(c.expected);
  });

  it("the vector keeps the size the other twins assert", () => {
    expect(vector.assignedBy).toHaveLength(11);
    expect(vector.endableAssignment).toHaveLength(10);
    expect(vector.endableHabit).toHaveLength(10);
    expect(vector.endablePlan).toHaveLength(9);
  });
});

describe("computeWorkoutStreak", () => {
  const TODAY = "2026-11-05";
  const row = (scheduledFor: string, status: string, trainerId: string) => ({
    clientId: "C",
    trainerId,
    scheduledFor,
    status,
  });

  it("an inherited overdue workout does not break the streak", () => {
    const rows = [
      row("2026-11-04", "completed", "NEW"),
      row("2026-11-03", "scheduled", "OLD"),
      row("2026-11-02", "missed", "OLD"),
      row("2026-11-01", "completed", "NEW"),
    ];
    expect(computeWorkoutStreak(rows, TODAY, "NEW")).toBe(2);
  });

  it("an inherited completed workout does not extend it", () => {
    const rows = [row("2026-11-04", "completed", "OLD"), row("2026-11-03", "completed", "NEW")];
    expect(computeWorkoutStreak(rows, TODAY, "NEW")).toBe(1);
  });

  it("the current coach's own miss still breaks it, and self workouts still count", () => {
    const rows = [
      row("2026-11-04", "completed", "C"),
      row("2026-11-03", "missed", "NEW"),
      row("2026-11-02", "completed", "NEW"),
    ];
    expect(computeWorkoutStreak(rows, TODAY, "NEW")).toBe(1);
  });

  it("today's unfinished workout is the grace window; future rows are ignored", () => {
    const rows = [
      row("2026-11-06", "scheduled", "NEW"),
      row(TODAY, "scheduled", "NEW"),
      row("2026-11-04", "completed", "NEW"),
    ];
    expect(computeWorkoutStreak(rows, TODAY, "NEW")).toBe(1);
  });
});

describe("withoutInherited", () => {
  it("keeps self and current, drops former", () => {
    const docs = [
      { clientId: "C", trainerId: "C" },
      { clientId: "C", trainerId: "NEW" },
      { clientId: "C", trainerId: "OLD" },
    ];
    expect(withoutInherited(docs, (d) => d, "NEW")).toEqual(docs.slice(0, 2));
  });
});

describe("planInheritedPlanEnd", () => {
  const TODAY = "2026-11-05";
  const former = { clientId: "C", trainerId: "OLD" };

  it("deletes future scheduled former assignments, keeping the logged one, the past and everyone else's", () => {
    const plan = planInheritedPlanEnd({
      coachId: "NEW",
      today: TODAY,
      habits: [],
      loggedAssignmentIds: new Set(["logged"]),
      assignments: [
        { id: "future", data: { ...former, status: "scheduled", scheduledFor: "2026-11-10" } },
        { id: "today", data: { ...former, status: "scheduled", scheduledFor: TODAY } },
        { id: "logged", data: { ...former, status: "scheduled", scheduledFor: "2026-11-11" } },
        { id: "past", data: { ...former, status: "scheduled", scheduledFor: "2026-11-04" } },
        { id: "started", data: { ...former, status: "started", scheduledFor: "2026-11-12" } },
        { id: "current", data: { clientId: "C", trainerId: "NEW", status: "scheduled", scheduledFor: "2026-11-10" } },
        { id: "self", data: { clientId: "C", trainerId: "C", selfAssigned: true, status: "scheduled", scheduledFor: "2026-11-10" } },
      ],
    });
    expect(plan.deleteAssignmentIds).toEqual(["future", "today"]);
  });

  it("ends a running habit yesterday, and soft-deletes one with no past to keep", () => {
    const plan = planInheritedPlanEnd({
      coachId: "NEW",
      today: TODAY,
      assignments: [],
      habits: [
        { id: "running", data: { ...former, startsOn: "2026-01-01" } },
        { id: "no-dates", data: { ...former } },
        { id: "starts-today", data: { ...former, startsOn: TODAY } },
        { id: "starts-later", data: { ...former, startsOn: "2026-12-01" } },
        { id: "over", data: { ...former, startsOn: "2026-01-01", endsOn: "2026-11-04" } },
        { id: "gone", data: { ...former, deleted: true } },
        { id: "current", data: { clientId: "C", trainerId: "NEW", startsOn: "2026-01-01" } },
        { id: "own", data: { clientId: "C", trainerId: "C", clientOwned: true } },
      ],
    });
    expect(plan.endHabits).toEqual([
      { id: "running", endsOn: "2026-11-04" },
      { id: "no-dates", endsOn: "2026-11-04" },
    ]);
    expect(plan.deleteHabitIds).toEqual(["starts-today", "starts-later"]);
  });

  it("ends a former coach's nutrition plan yesterday, and soft-deletes one that hadn't started (#1504 Q2)", () => {
    const plan = planInheritedPlanEnd({
      coachId: "NEW",
      today: TODAY,
      assignments: [],
      habits: [],
      plans: [
        { id: "running", data: { ...former, source: "coach", startsOn: "2026-01-01" } },
        { id: "no-dates", data: { ...former, source: "coach" } },
        { id: "starts-today", data: { ...former, source: "coach", startsOn: TODAY } },
        { id: "past-phase", data: { ...former, source: "coach", startsOn: "2026-01-01", endsOn: "2026-11-04" } },
        { id: "gone", data: { ...former, source: "coach", deleted: true } },
        { id: "current", data: { clientId: "C", trainerId: "NEW", source: "coach", startsOn: "2026-01-01" } },
        { id: "own", data: { clientId: "C", trainerId: "C", source: "self", startsOn: "2026-01-01" } },
      ],
    });
    expect(plan.endPlans).toEqual([{ id: "running", endsOn: "2026-11-04" }]);
    expect(plan.deletePlanIds).toEqual(["no-dates", "starts-today"]);
  });
});

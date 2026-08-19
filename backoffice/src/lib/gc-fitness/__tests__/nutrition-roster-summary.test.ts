// nutrition-roster-summary.test.ts
// The roster line and the monitoring rows for nutrition (#923).
//
// What these two surfaces can get wrong in a way nothing else catches:
//
//   • **Rendering "0%" for a client nobody gave a plan to.** Zero reads as a client who
//     is failing. It sends the coach to have the wrong conversation, and the client it
//     mislabels is the one with the least to answer for.
//   • **Losing the expired phase.** A client whose fase ran out and whose next one nobody
//     loaded shows nothing anywhere else: their adherence simply stops moving, which
//     looks like a quiet week. That signal is the reason this issue exists.
//   • **Rendering `create nutrition_plans` in monitoring.** A capture nobody can read is
//     a capture nobody checks — and the write most worth reading is the TRIM, the sibling
//     edit an assign performs on its neighbours, which is exactly what a coach later
//     swears they never did.
//   • **Showing one action twice.** `coach_activity` and `audit_log` record the same
//     coach action by two mechanisms that know nothing about each other.

import {
  classifyAuditRecord,
  coachActivityKeysFor,
  type AuditRecord,
} from "../activity-feed-model";
import { buildNutritionRosterSummary } from "../nutrition-compliance";
import { TODAY, YESTERDAY, fullyDone, mixed, phaseA, phaseB, selfPlan } from "./nutrition-fixtures";

describe("buildNutritionRosterSummary", () => {
  it("reports the 7-day number and the phase in force", () => {
    const summary = buildNutritionRosterSummary(
      [phaseA()],
      [fullyDone(YESTERDAY), mixed(TODAY)],
      TODAY,
    );
    // 3 done Monday + 1 done Tuesday of 21 expected across the 7-day window.
    expect(summary.percent7d).toBe(19);
    expect(summary.hasActivePlan).toBe(true);
    expect(summary.activePlanName?.es).toBe("Mantenimiento");
    expect(summary.activePlanEndsOn).toBe("2026-08-31");
    expect(summary.neverHadPlan).toBe(false);
  });

  it("says NOTHING rather than 0% when nothing was asked", () => {
    // A client with no plan is not a client at 0%. This is the single assertion that
    // keeps the roster from libelling the people it has the least to say about.
    const summary = buildNutritionRosterSummary([], [], TODAY);
    expect(summary.ratio7d).toBeNull();
    expect(summary.percent7d).toBeNull();
    expect(summary.neverHadPlan).toBe(true);
  });

  it("separates an expired phase from never having had one", () => {
    // The whole point of the column. Both render without a percentage, and only one of
    // them is something the coach has to fix today.
    const expired = buildNutritionRosterSummary(
      [{ ...phaseA(), startsOn: "2026-06-01", endsOn: "2026-06-30" }],
      [],
      TODAY,
    );
    expect(expired.hasActivePlan).toBe(false);
    expect(expired.neverHadPlan).toBe(false);

    const never = buildNutritionRosterSummary([], [], TODAY);
    expect(never.hasActivePlan).toBe(false);
    expect(never.neverHadPlan).toBe(true);
  });

  it("counts a scheduled-but-not-started phase as no plan in force", () => {
    // phaseB starts 2026-09-01. Having queued the next block is not the same as being on
    // one today, and the client's app shows the empty state meanwhile.
    const summary = buildNutritionRosterSummary([phaseB()], [], TODAY);
    expect(summary.hasActivePlan).toBe(false);
    expect(summary.neverHadPlan).toBe(false);
    expect(summary.percent7d).toBeNull();
  });

  it("counts the client's own plan as a plan", () => {
    // A coach-less client authored their own (#917). It governs their day, so the roster
    // must not report them as unplanned just because no coach typed it.
    const summary = buildNutritionRosterSummary([selfPlan()], [], TODAY);
    expect(summary.hasActivePlan).toBe(true);
  });

  it("ignores superseded phases", () => {
    const summary = buildNutritionRosterSummary([{ ...phaseA(), deleted: true }], [], TODAY);
    expect(summary.hasActivePlan).toBe(false);
    expect(summary.neverHadPlan).toBe(true);
  });
});

// ── Monitoring ──────────────────────────────────────────────────────────────────────

function auditRecord(over: Partial<AuditRecord>): AuditRecord {
  return {
    id: "a1",
    collection: "nutrition_plans",
    docId: "plan-a",
    op: "create",
    changedFields: [],
    changedFieldCount: 0,
    before: null,
    after: null,
    actorUid: null,
    trainerId: "coach-martin",
    coachId: "coach-martin",
    clientId: "client-sofia",
    occurredAtISO: "2026-08-18T12:00:00.000Z",
    ...over,
  };
}

describe("classifyAuditRecord — nutrition_plans", () => {
  it("names an assignment instead of printing the raw op", () => {
    const event = classifyAuditRecord(
      auditRecord({
        op: "create",
        after: {
          name: { en: "Cut", es: "Definición" },
          startsOn: "2026-09-01",
          endsOn: null,
          targets: { kcal: 2000 },
          source: "coach",
        },
      }),
    );
    expect(event.category).toBe("nutrition");
    expect(event.title).toBe("Asignó un plan de nutrición");
    expect(event.subject).toBe("Definición");
    // The window is what distinguishes two phases of the same plan — "Definición" twice
    // tells an operator nothing.
    expect(event.meta).toContain("2026-09-01 → sin fecha de fin");
    expect(event.meta).toContain("2000 kcal");
  });

  it("names a TRIM as a trim — the write nobody remembers making", () => {
    // Assigning a phase silently closes its neighbour. Reported as "editó" it reads as a
    // deliberate edit; it is the side effect that makes this collection worth monitoring.
    const event = classifyAuditRecord(
      auditRecord({
        op: "update",
        changedFields: ["endsOn", "updatedAt"],
        before: { name: { en: "Maintenance", es: "Mantenimiento" }, endsOn: "2026-09-30" },
        after: { name: { en: "Maintenance", es: "Mantenimiento" }, endsOn: "2026-08-31" },
      }),
    );
    expect(event.title).toBe("Recortó una fase de nutrición");
    expect(event.meta).toContain("termina 2026-08-31");
    expect(event.meta).toContain("antes 2026-09-30");
  });

  it("reads a soft delete as the close it is", () => {
    // There is no hard delete: the rules deny it and the daily logs point at the plan by
    // id. "Cerró" is what actually happened.
    const event = classifyAuditRecord(
      auditRecord({
        op: "update",
        changedFields: ["deleted", "updatedAt"],
        before: { name: { en: "Cut", es: "Definición" }, deleted: false },
        after: { name: { en: "Cut", es: "Definición" }, deleted: true },
      }),
    );
    expect(event.title).toBe("Cerró una fase de nutrición");
    expect(event.isDeletion).toBe(true);
  });

  it("attributes a self-authored plan to the client, not the coach", () => {
    const event = classifyAuditRecord(
      auditRecord({
        op: "create",
        clientId: "client-sofia",
        trainerId: "client-sofia",
        after: {
          name: { en: "My plan", es: "Mi plan" },
          startsOn: "2026-08-01",
          endsOn: null,
          source: "self",
        },
      }),
    );
    expect(event.title).toBe("Creó su plan de nutrición");
    expect(event.isSelfService).toBe(true);
    expect(event.actorUid).toBe("client-sofia");
  });
});

describe("coachActivityKeysFor — nutrition_plans", () => {
  it("bridges onto the coach event so one action is one row", () => {
    // `nutritionPlanEvent` keys by `nut:${planId}`. Without the bridge, an assign that
    // also trims a neighbour renders four rows for two facts.
    expect(coachActivityKeysFor(auditRecord({ op: "create" }))).toEqual(["nut:plan-a"]);
    expect(coachActivityKeysFor(auditRecord({ op: "update" }))).toEqual(["nut:plan-a"]);
  });

  it("does not bridge a hard delete", () => {
    // Nothing writes one (the rules deny it), so a row that appears is an out-of-band
    // console deletion — precisely the event that must NOT be folded away into a coach
    // row that says something else happened.
    expect(coachActivityKeysFor(auditRecord({ op: "delete" }))).toEqual([]);
  });
});

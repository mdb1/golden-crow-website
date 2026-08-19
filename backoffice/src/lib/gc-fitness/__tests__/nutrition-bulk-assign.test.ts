// nutrition-bulk-assign.test.ts
// The pure half of "asignar una plantilla a varios clientes" (#927).
//
// What these lock:
//   1. the summary counts CLIENTS and PHASES as two different numbers — one client can
//      have two phases touched by the same window, and collapsing them makes the confirm
//      sentence lie in exactly the case the coach most needs it right;
//   2. a pre-created (`mirror:`) client reads as "hasn't signed in", NOT as "not your
//      client" — two different things to tell a coach;
//   3. a template becomes a plan body that KEEPS `mealId` (the daily log's map key) and
//      fills both localized slots.

import {
  bulkBlockedReasonFor,
  nutritionPlanBodyFromTemplate,
  summarizeNutritionBulkPreview,
  type NutritionBulkPreviewRow,
} from "../nutrition-bulk-assign";
import type { NutritionTemplateRow } from "../nutrition-library-model";

function row(
  clientId: string,
  notices: NutritionBulkPreviewRow["notices"],
  blockedReason: NutritionBulkPreviewRow["blockedReason"] = null,
): NutritionBulkPreviewRow {
  return { clientId, clientName: clientId, blockedReason, notices };
}

function notice(
  kind: "trim" | "supersede" | "deferStart",
  planId = "plan-old",
): NutritionBulkPreviewRow["notices"][number] {
  return { planId, planName: "Definición", kind, date: kind === "supersede" ? null : "2026-08-31" };
}

describe("summarizeNutritionBulkPreview", () => {
  it("separates clients from phases when one client has two phases touched", () => {
    const summary = summarizeNutritionBulkPreview([
      row("a", [notice("trim", "p1"), notice("supersede", "p2")]),
      row("b", []),
      row("c", [notice("deferStart", "p3")]),
    ]);

    expect(summary.assignable).toBe(3);
    expect(summary.affected).toBe(2); // clients
    expect(summary.untouched).toBe(1);
    expect(summary.trimmed + summary.superseded + summary.deferred).toBe(3); // phases
    expect(summary).toMatchObject({ trimmed: 1, superseded: 1, deferred: 1 });
  });

  it("counts blocked clients apart and never as assignable", () => {
    const summary = summarizeNutritionBulkPreview([
      row("a", []),
      row("mirror:x@y.com", [], "pendingProvisioning"),
      row("gone", [], "notOnRoster"),
    ]);

    expect(summary.assignable).toBe(1);
    expect(summary.blocked).toBe(2);
    expect(summary.affected + summary.untouched).toBe(1);
  });

  it("is all zeros for an empty selection", () => {
    expect(summarizeNutritionBulkPreview([])).toEqual({
      assignable: 0,
      blocked: 0,
      untouched: 0,
      affected: 0,
      trimmed: 0,
      superseded: 0,
      deferred: 0,
    });
  });
});

describe("bulkBlockedReasonFor", () => {
  const roster = new Map([["real-client", { pendingProvisioning: false }]]);

  it("admits a client on the caller's roster", () => {
    expect(bulkBlockedReasonFor("real-client", roster)).toBeNull();
  });

  it("reads a pre-created client as pending, not as a stranger", () => {
    // The regression this guards: a `mirror:` uid has no /users doc, so a roster lookup
    // reports "notOnRoster" — which tells the coach the person is not their client when
    // the truth is that they have not signed in yet.
    expect(bulkBlockedReasonFor("mirror:ana@example.com", roster)).toBe("pendingProvisioning");
  });

  it("refuses a uid that is not on the roster", () => {
    expect(bulkBlockedReasonFor("someone-elses-client", roster)).toBe("notOnRoster");
  });
});

describe("nutritionPlanBodyFromTemplate", () => {
  const template: NutritionTemplateRow = {
    id: "tpl-def",
    name: { es: "Definición", en: "" },
    ownerId: "trainer-1",
    targets: { kcal: 2000, proteinG: 160, carbsG: null, fatG: null },
    meals: [
      {
        mealId: "meal-lunch",
        name: { es: "Almuerzo", en: "Lunch" },
        moment: "lunch",
        targets: { kcal: 700 },
        options: [{ id: "opt-1", text: { es: "Pollo", en: "" }, targets: { kcal: 700 } }],
        order: 1,
      },
      {
        mealId: "meal-breakfast",
        name: { es: "Desayuno", en: "Breakfast" },
        moment: "breakfast",
        targets: {},
        options: [],
        order: 0,
      },
    ],
  };

  const body = nutritionPlanBodyFromTemplate(template, {
    startsOn: "2026-09-01",
    endsOn: null,
  });

  it("keeps mealId — it is the key the daily log's meals map uses", () => {
    // Minting fresh ids here would silently re-key every client's log and orphan whatever
    // they had already marked that day.
    expect(body.meals.map((meal) => meal.mealId)).toEqual(["meal-breakfast", "meal-lunch"]);
  });

  it("orders meals by `order`, not by however the template listed them", () => {
    expect(body.meals[0]!.moment).toBe("breakfast");
  });

  it("fills both localized slots, falling back across languages", () => {
    // "No translation" must not reach Firestore as "blank in English": the schema requires
    // both slots and a blank one renders as an empty name on an English phone.
    expect(body.name).toEqual({ es: "Definición", en: "Definición" });
    expect(body.meals[1]!.options![0]!.text).toEqual({ es: "Pollo", en: "Pollo" });
  });

  it("carries templateId through as provenance", () => {
    // This is the field the library's "asignada N veces" pill counts.
    expect(body.templateId).toBe("tpl-def");
  });

  it("passes the window through untouched", () => {
    expect(body.startsOn).toBe("2026-09-01");
    expect(body.endsOn).toBeNull();
  });
});

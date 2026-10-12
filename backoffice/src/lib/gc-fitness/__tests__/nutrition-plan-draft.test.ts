/**
 * @jest-environment jsdom
 */

// nutrition-plan-draft.test.ts — the storage rules under the nutrition editor's
// draft (coach report 2026-10-12). The form-level behaviour is pinned in
// assign-nutrition-form.test.tsx; this pins what the envelope tolerates.

import {
  NUTRITION_DRAFT_MAX_AGE_MS,
  clearNutritionPlanDraft,
  nutritionPlanDraftKey,
  readNutritionPlanDraft,
  writeNutritionPlanDraft,
} from "@/lib/gc-fitness/nutrition-plan-draft";

const KEY = nutritionPlanDraftKey("client-1", null);

beforeEach(() => window.localStorage.clear());

it("keys a new plan and an edited plan apart", () => {
  expect(nutritionPlanDraftKey("c", null)).not.toBe(nutritionPlanDraftKey("c", "plan-9"));
  expect(nutritionPlanDraftKey("c", "plan-9")).toContain("plan-9");
});

it("round-trips what was written", () => {
  writeNutritionPlanDraft(KEY, { name: "Volumen" }, 1_000);
  expect(readNutritionPlanDraft(KEY, 2_000)).toEqual({ name: "Volumen" });
  clearNutritionPlanDraft(KEY);
  expect(readNutritionPlanDraft(KEY, 2_000)).toBeNull();
});

it("drops a draft older than the max age instead of resurrecting it", () => {
  writeNutritionPlanDraft(KEY, { name: "Viejo" }, 0);
  expect(readNutritionPlanDraft(KEY, NUTRITION_DRAFT_MAX_AGE_MS + 1)).toBeNull();
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it.each([
  ["not JSON", "{oops"],
  ["a bare value", JSON.stringify({ name: "x" })],
  ["another version", JSON.stringify({ v: 99, savedAt: 1, data: { name: "x" } })],
  ["no data", JSON.stringify({ v: 1, savedAt: 1, data: null })],
])("ignores %s without throwing", (_label, raw) => {
  window.localStorage.setItem(KEY, raw);
  expect(readNutritionPlanDraft(KEY, 2)).toBeNull();
});

it("never throws when storage is blocked", () => {
  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  try {
    expect(() => writeNutritionPlanDraft(KEY, { name: "x" })).not.toThrow();
  } finally {
    spy.mockRestore();
  }
});

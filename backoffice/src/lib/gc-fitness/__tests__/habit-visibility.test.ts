// __tests__/habit-visibility.test.ts
//
// Pure unit tests for the in-memory habit-visibility predicate that replaces
// the `.where("deleted","==",false)` Firestore equality on the per-client
// habit surfaces (issue #437 / PR #230 pattern). A Firestore equality filter
// only matches docs where the field EXISTS, so client-created habits (issue
// #400) — which never write a `deleted` field — were silently dropped. The
// predicate keeps only a strict boolean `true` out; a missing/undefined/null/
// false field stays visible.

import { isHabitNotDeleted } from "@/lib/gc-fitness/habit-visibility";

describe("isHabitNotDeleted", () => {
  it("keeps a client-created habit with no deleted field (the #437/#400 bug)", () => {
    expect(isHabitNotDeleted({})).toBe(true);
  });

  it("keeps a habit with deleted: false", () => {
    expect(isHabitNotDeleted({ deleted: false })).toBe(true);
  });

  it("excludes a genuinely soft-deleted habit (deleted: true)", () => {
    expect(isHabitNotDeleted({ deleted: true })).toBe(false);
  });

  it("keeps a habit with deleted: undefined", () => {
    expect(isHabitNotDeleted({ deleted: undefined })).toBe(true);
  });

  it("keeps a habit with deleted: null (only strict true excludes)", () => {
    expect(isHabitNotDeleted({ deleted: null })).toBe(true);
  });
});

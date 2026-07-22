// habit-visibility.ts
//
// Pure, I/O-free predicate for the per-client habit surfaces. It replaces the
// Firestore `.where("deleted","==",false)` equality that silently dropped
// client-created habits.
//
// Issue #437 / PR #230: a Firestore equality filter only matches docs where
// the field EXISTS. Client-created habits (issue #400) are written WITHOUT a
// `deleted` field (the rules forbid it at create), so `deleted == false`
// excluded every one of them. The fix is to fetch by `clientId` only and
// filter in memory here: ONLY a strict boolean `true` is soft-deleted; a
// missing / undefined / null / false field means the habit is visible.
//
// No Admin SDK import — this stays testable in isolation and reusable across
// server components + server actions.
export function isHabitNotDeleted(habit: { deleted?: unknown }): boolean {
  return habit.deleted !== true;
}

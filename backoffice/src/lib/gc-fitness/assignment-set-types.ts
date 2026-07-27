// assignment-set-types.ts — #582.
//
// The per-set-type (#403) rules that both ends of the ASSIGNMENT path need:
// the assign modal / edit dialog on the client, and the Server Actions that
// write `templateSnapshot.exercises[].setTypesBySet`.
//
// Why this exists: a template's `setTypesBySet` rides into the assignment
// snapshot verbatim (`templateSnapshotForAssignment` copies each exercise with
// `...exercise`), but the coach can ADD or REMOVE sets while assigning. A
// 4-entry array against 3 sets slides the warm-up marker onto the wrong row —
// so the array has to be realigned to the FINAL set count on every write, and
// dropped entirely when nothing non-normal survives.
//
// Plain module (NOT "use server") so client components and Server Actions can
// both import it — unit-tested in __tests__/assignment-set-types.test.ts.

import { plannedSetType, type SetType } from "./set-type";

/** Upper bound on a realigned array — matches the edit dialog's clamp. */
const MAX_ALIGNED_SETS = 20;

/**
 * Coerce a raw `setTypesBySet` (any wire shape) to exactly `count` entries.
 *
 * POSITIONAL, never filtering: an unknown / missing entry becomes "normal" at
 * its own index. Dropping bad entries instead would shift every later set's
 * type up a row — the exact corruption this module exists to prevent.
 *
 * `count` falls back to the source length (then 1) when it is 0/absent, and is
 * clamped to `MAX_ALIGNED_SETS`.
 */
export function alignSetTypes(raw: unknown, count: number): SetType[] {
  const source = Array.isArray(raw) ? (raw as readonly string[]) : [];
  const length = Math.max(
    1,
    Math.min(MAX_ALIGNED_SETS, count || source.length || 1),
  );
  return Array.from({ length }, (_, i) => plannedSetType(i, source));
}

/**
 * Wire form of a realigned array: the array itself, or **null when every entry
 * is normal**.
 *
 * Null is the signal to DELETE the key, not to skip the write — the wire
 * contract omits all-normal arrays, and an inherited non-normal array must not
 * outlive an all-normal prescription.
 *
 * Returns null for a non-array input (nothing was prescribed), so callers can
 * pass a possibly-absent field straight through.
 */
export function normalizeSetTypesToCount(
  raw: unknown,
  setCount: number,
): SetType[] | null {
  if (!Array.isArray(raw)) return null;
  const aligned = alignSetTypes(raw, setCount);
  return aligned.some((t) => t !== "normal") ? aligned : null;
}

/**
 * True when two aligned type arrays differ — the assign modal's "did the coach
 * change the types?" test.
 *
 * Compare arrays that were BOTH aligned to the same final set count: that is
 * what makes a pure set-count change (delete a set, keep every type) register
 * as a difference, which it must — the inherited array is then the wrong
 * length and every marker after the removed row is off by one.
 */
export function setTypesDiffer(
  a: readonly SetType[],
  b: readonly SetType[],
): boolean {
  if (a.length !== b.length) return true;
  return a.some((type, i) => type !== b[i]);
}

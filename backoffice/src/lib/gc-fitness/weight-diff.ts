// weight-diff.ts
// Pure helpers for deciding WHEN a prescription write should bump the
// `prescriptionUpdatedAt` "weight-prefill freshness anchor" on a
// workout_assignments doc.
//
// Context: `prescriptionUpdatedAt` is the anchor the shared weight-prefill
// resolver (weight-prefill.ts / WeightPrefillResolver.swift) compares against a
// client's last log. Bumping it makes the client apps surface the coach's
// routine weights ONCE (with a "coach updated" alert) before reverting to the
// client's own remembered weights. We therefore want to bump it ONLY when the
// WEIGHTS genuinely changed — bumping on a notes-only edit would spuriously
// nag every client and reset weights they'd set for themselves.
//
// PURITY: no Firestore types. Plain snapshot-shaped objects in, booleans out —
// trivially unit-testable. Used by editAssignmentExercises (per-client edit)
// and propagateTemplateToFutureAssignments (template → future occurrences).

/** The minimal exercise shape we care about for the weight comparison. The
 *  real snapshots carry many more fields (reps, rest, notes, name, …) — those
 *  are intentionally ignored here. We match exercises by `exerciseId` so a
 *  reorder of identical weights is NOT treated as a change. */
export interface WeightComparableExercise {
  exerciseId?: unknown;
  weightBySetKg?: unknown;
}

/** Coerce an unknown `weightBySetKg` into a normalized `number[]`. Non-arrays
 *  become `[]`; non-finite entries become `0` so a malformed value can't make
 *  two otherwise-equal snapshots compare unequal. */
function normalizeWeights(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0,
  );
}

/** Per-set array equality. Different lengths (a set added/removed) → not equal,
 *  which is the whole point: adding or removing a set IS a weight change. */
function weightArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Build an exerciseId → weightBySetKg map. Exercises with no usable
 *  `exerciseId` are keyed positionally (`__idx_<n>`) so they still participate
 *  in the diff rather than silently collapsing onto each other. */
function weightsById(
  exercises: ReadonlyArray<WeightComparableExercise> | undefined,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  if (!Array.isArray(exercises)) return map;
  exercises.forEach((ex, i) => {
    const id =
      typeof ex?.exerciseId === "string" && ex.exerciseId.length > 0
        ? ex.exerciseId
        : `__idx_${i}`;
    // First occurrence wins (matches the note-merge convention elsewhere).
    if (!map.has(id)) map.set(id, normalizeWeights(ex?.weightBySetKg));
  });
  return map;
}

/**
 * True when the per-exercise weights differ between two snapshots' exercise
 * lists, matched by `exerciseId`. Returns true when:
 *   - any matched exercise has a different `weightBySetKg` (changed value OR a
 *     set added/removed), OR
 *   - an exercise present in `oldExercises` is gone in `newExercises` (or vice
 *     versa) AND it carried any weight — i.e. the set of weighted exercises
 *     changed.
 * Returns false when only non-weight fields (notes, reps, rest, order, …)
 * differ — those must NOT bump the freshness anchor.
 *
 * Note-only / reorder edits → false. Weight edits, added sets, removed sets,
 * and added/removed weighted exercises → true.
 */
export function weightsDifferBetweenSnapshots(
  oldExercises: ReadonlyArray<WeightComparableExercise> | undefined,
  newExercises: ReadonlyArray<WeightComparableExercise> | undefined,
): boolean {
  const oldMap = weightsById(oldExercises);
  const newMap = weightsById(newExercises);

  const allIds = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const oldW = oldMap.get(id) ?? [];
    const newW = newMap.get(id) ?? [];
    if (!weightArraysEqual(oldW, newW)) return true;
  }
  return false;
}

/** Extract the `exercises` array from a loosely-typed snapshot value. */
export function exercisesOf(
  snapshot: unknown,
): WeightComparableExercise[] {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    Array.isArray((snapshot as { exercises?: unknown }).exercises)
  ) {
    return (snapshot as { exercises: WeightComparableExercise[] }).exercises;
  }
  return [];
}

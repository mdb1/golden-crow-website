// live-workout-supersets.ts
//
// Pure superset-grouping logic — the TypeScript twin of iOS
// `GCFitnessCore/SupersetGrouping.swift`. No I/O, no React; unit-tested in
// __tests__/live-workout-supersets.test.ts.
//
// Contract (mirrors iOS SupersetBlock):
//   - A run of CONSECUTIVE exercises sharing the same non-empty
//     `supersetGroup` label forms one superset block.
//   - An exercise with no group label (null/empty) is its own standalone
//     block (groupLabel = null, isSuperset = false).
//   - A block is a "superset" only when it holds 2+ exercises under a label.
//   - Ordering is preserved; grouping never reorders exercises.

export type ExerciseMetric = "reps" | "time";

/** Minimal shape the grouping needs — any object carrying a superset label. */
export interface GroupableExercise {
  supersetGroup?: string | null;
}

export interface SupersetBlock<T extends GroupableExercise> {
  exercises: T[];
  /** The shared label ("A", "B", …) or null for a standalone block. */
  groupLabel: string | null;
  /** True when the block alternates 2+ exercises under a label. */
  isSuperset: boolean;
}

/**
 * Product fallback when a workout snapshot has no explicit
 * `transition_rest_seconds` for an exercise handoff. Mirrors
 * `SupersetSequence.defaultTransitionRestSeconds` (Swift) / the estimator's
 * `DEFAULT_TRANSITION_REST_SECONDS`.
 */
export const DEFAULT_TRANSITION_REST_SECONDS = 60;

/**
 * Minimal shape the flattened-sequence / rest twins need — a superset-labelled
 * exercise carrying its set count and rest prescriptions. CamelCase, matching
 * the Swift `ExerciseSnapshot` and the backoffice live-session `SessionExercise`.
 * Callers holding the snake_case template shape (`rest_seconds`,
 * `transition_rest_seconds`) map to this before invoking the twins.
 */
export interface SequenceExercise extends GroupableExercise {
  exerciseId: string;
  sets: number;
  restSeconds: number;
  transitionRestSeconds?: number | null;
}

/** A single advancement slot: one set of one exercise. Mirrors
 *  `SupersetSequence.Coordinate` (Swift). */
export interface SupersetCoordinate {
  exerciseId: string;
  setIndex: number;
}

function normalizedLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Group an ordered list of exercises into superset/standalone blocks.
 *
 * @param exercises ordered exercises (already sorted by `order`).
 */
export function groupIntoSupersetBlocks<T extends GroupableExercise>(
  exercises: T[],
): SupersetBlock<T>[] {
  const blocks: SupersetBlock<T>[] = [];

  for (const exercise of exercises) {
    const label = normalizedLabel(exercise.supersetGroup);

    if (label === null) {
      // Standalone — always its own block.
      blocks.push({ exercises: [exercise], groupLabel: null, isSuperset: false });
      continue;
    }

    const last = blocks[blocks.length - 1];
    if (last && last.groupLabel === label) {
      // Extend the current same-label superset block.
      last.exercises.push(exercise);
      last.isSuperset = last.exercises.length > 1;
    } else {
      // Start a new labelled block (becomes a superset once a 2nd joins).
      blocks.push({ exercises: [exercise], groupLabel: label, isSuperset: false });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Flattened interleave sequence + round-based rest — TS twins of
// `SupersetSequence` (SupersetGrouping.swift) / `SupersetSequence.kt`.
//
// These are the SINGLE SOURCE OF TRUTH for the flattened advancement order and
// round-based rest resolution on the backoffice (live-run page + duration
// estimator). Algorithm-identical to the app twins, INCLUDING the D3 rule:
//
//   D3 — a NON-transition rest INSIDE a superset block resolves to the block's
//   LAST member's `restSeconds` (the canonical "round rest"), NOT the completing
//   sibling's. Standalone exercises always rest with their own `restSeconds`.
//   Transition rests (an exercise's final set before a DIFFERENT next exercise)
//   resolve to that exercise's `transitionRestSeconds ?? 60`.
//
// `shouldRest` suppresses the timer for the intra-round handoffs (A.setN → the
// next sibling's setN) so a superset rests ONCE per round, after its last
// effective sibling. Mirrors SupersetAdvanceTests.
// ---------------------------------------------------------------------------

/**
 * The full flattened interleaved sequence of coordinates, in the exact order
 * the app auto-advance traverses them. Mirrors
 * `SupersetSequence.flattenedCoordinates`.
 *
 * @param sorted exercises ALREADY ordered by `order` (caller's responsibility).
 */
export function flattenedCoordinates<T extends SequenceExercise>(
  sorted: T[],
): SupersetCoordinate[] {
  const result: SupersetCoordinate[] = [];
  for (const block of groupIntoSupersetBlocks(sorted)) {
    if (block.isSuperset) {
      const maxSets = Math.max(0, ...block.exercises.map((e) => Math.max(0, e.sets)));
      for (let setIndex = 0; setIndex < maxSets; setIndex += 1) {
        for (const ex of block.exercises) {
          if (setIndex < ex.sets) {
            result.push({ exerciseId: ex.exerciseId, setIndex });
          }
        }
      }
    } else {
      const ex = block.exercises[0];
      for (let setIndex = 0; setIndex < ex.sets; setIndex += 1) {
        result.push({ exerciseId: ex.exerciseId, setIndex });
      }
    }
  }
  return result;
}

/** The coordinate AFTER `current` in the flattened sequence, or null if
 *  `current` is the final slot or is not present. Mirrors
 *  `SupersetSequence.nextCoordinate`. */
export function nextSupersetCoordinate<T extends SequenceExercise>(
  current: SupersetCoordinate,
  sorted: T[],
): SupersetCoordinate | null {
  const flat = flattenedCoordinates(sorted);
  const idx = flat.findIndex(
    (c) => c.exerciseId === current.exerciseId && c.setIndex === current.setIndex,
  );
  if (idx < 0) return null;
  const next = idx + 1;
  return next < flat.length ? flat[next] : null;
}

/**
 * Port of `SupersetSequence.shouldRest`: standalone → always true; superset →
 * false when any sibling AFTER ours still owns THIS setIndex
 * (`setIndex < sibling.sets`), else true (the last effective sibling of the
 * round). This is what makes a superset rest ONCE per round.
 */
export function shouldRest<T extends SequenceExercise>(
  current: SupersetCoordinate,
  sorted: T[],
): boolean {
  const blocks = groupIntoSupersetBlocks(sorted);
  const block = blocks.find((b) =>
    b.exercises.some((e) => e.exerciseId === current.exerciseId),
  );
  if (!block || !block.isSuperset) return true;
  const myIndex = block.exercises.findIndex(
    (e) => e.exerciseId === current.exerciseId,
  );
  if (myIndex < 0) return true;
  for (const ex of block.exercises.slice(myIndex + 1)) {
    if (current.setIndex < ex.sets) return false;
  }
  return true;
}

/**
 * True when completing `current` finishes that exercise and the next planned
 * coordinate belongs to a DIFFERENT exercise — the exact point where
 * `transitionRestSeconds` applies. Mirrors
 * `SupersetSequence.isExerciseTransition`.
 */
export function isExerciseTransition<T extends SequenceExercise>(
  current: SupersetCoordinate,
  sorted: T[],
): boolean {
  const exercise = sorted.find((e) => e.exerciseId === current.exerciseId);
  if (!exercise || exercise.sets <= 0 || current.setIndex !== exercise.sets - 1) {
    return false;
  }
  const next = nextSupersetCoordinate(current, sorted);
  if (!next) return false;
  return next.exerciseId !== current.exerciseId;
}

/**
 * Round-based rest duration to use after completing `current`. Mirrors
 * `SupersetSequence.prescribedRestSeconds` with the D3 rule:
 *
 *   - transition (final set before a different next exercise) →
 *     `transitionRestSeconds ?? DEFAULT_TRANSITION_REST_SECONDS`.
 *   - non-transition INSIDE a superset → the block's LAST member's
 *     `restSeconds` (canonical round rest, D1/D3).
 *   - non-transition standalone → the exercise's own `restSeconds`.
 */
export function prescribedRestSeconds<T extends SequenceExercise>(
  current: SupersetCoordinate,
  sorted: T[],
  defaultSeconds = DEFAULT_TRANSITION_REST_SECONDS,
): number {
  const exercise = sorted.find((e) => e.exerciseId === current.exerciseId);
  if (!exercise) return Math.max(0, defaultSeconds);

  if (isExerciseTransition(current, sorted)) {
    return Math.max(
      0,
      exercise.transitionRestSeconds ?? DEFAULT_TRANSITION_REST_SECONDS,
    );
  }

  const block = groupIntoSupersetBlocks(sorted).find((b) =>
    b.exercises.some((e) => e.exerciseId === current.exerciseId),
  );
  if (block && block.isSuperset) {
    const last = block.exercises[block.exercises.length - 1];
    return Math.max(0, last.restSeconds);
  }
  return Math.max(0, exercise.restSeconds);
}

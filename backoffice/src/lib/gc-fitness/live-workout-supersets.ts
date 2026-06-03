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

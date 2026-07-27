// exercise-set-history.ts
//
// #574 — pure shaping for the coach's per-exercise "Series registradas" list on
// /gc-fitness/clients/[id]/progress. Turns one session's `ExerciseSetRow[]`
// into display lines: the Hevy set label (W/F/D letters, normal sets numbered
// counting ONLY normal sets) plus the numbers the coach reads.
//
// Formatting of the numbers themselves stays in the component (the "reps" word
// is localized); everything ORDER- and LABEL-related lives here so it's
// unit-tested and can't drift from the `setDisplayLabels` twin.

import { effectiveSetType, setDisplayLabels, type SetType } from "./set-type";
import type { ExerciseSetRow } from "./exercise-progress-actions";

/** How the value column should be rendered for one set. */
export type SetLineKind =
  /** Time-metric set — `durationSeconds` is authoritative. */
  | "time"
  /** Weighted set — `weightKg > 0`. */
  | "weighted"
  /** Bodyweight / unweighted reps set. */
  | "reps";

export interface SetLine {
  /** Hevy display label: "1", "2", … for normal sets; "W" / "F" / "D". */
  label: string;
  kind: SetLineKind;
  weightKg: number;
  reps: number;
  durationSeconds: number | null;
  setType: SetType;
  isPR: boolean;
}

/** How many sessions the list reveals per "Ver más" press (issue #574). */
export const SET_HISTORY_PAGE_SIZE = 3;

/**
 * One session's sets → display lines, in `setIndex` order.
 *
 * The label comes from `setDisplayLabels`, the shared twin of iOS
 * `SetTypeDisplay.labels` / Android `SetTypeUi`: a warm-up / failure / drop set
 * renders its letter and does NOT consume a number, so a
 * `[warmup, normal, normal, dropset, normal]` session reads W, 1, 2, D, 3.
 */
export function sessionSetLines(sets: readonly ExerciseSetRow[]): SetLine[] {
  const ordered = sets.slice().sort((a, b) => a.setIndex - b.setIndex);
  const types = ordered.map((row) =>
    // A row's `setType` is omitted at "normal" on the wire; `effectiveSetType`
    // also covers a legacy row that only carried the warm-up flag.
    effectiveSetType({ setType: row.setType ?? null }),
  );
  const labels = setDisplayLabels(types);

  return ordered.map((row, i) => {
    const durationSeconds =
      typeof row.durationSeconds === "number" && row.durationSeconds > 0
        ? row.durationSeconds
        : null;
    const kind: SetLineKind =
      durationSeconds !== null ? "time" : row.weightKg > 0 ? "weighted" : "reps";
    return {
      label: labels[i],
      kind,
      weightKg: row.weightKg,
      reps: row.reps,
      durationSeconds,
      setType: types[i],
      isPR: row.isPR === true,
    };
  });
}

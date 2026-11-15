// assign-template-overrides.ts
//
// Pure model of the per-exercise override editor inside
// `components/gc-fitness/schedule/assign-template-modal.tsx` (#507 — moved out
// of the 1,600-line modal so it can be unit tested without rendering it).
//
//   - `seedOverrideDrafts`  template detail → one editable draft per exercise
//   - `buildExerciseOverrides` drafts → the `exerciseOverrides` payload, with
//     ONLY the fields the coach actually changed (an untouched exercise emits
//     nothing, so the assignment keeps inheriting the template)
//   - `buildAssignRecurrence` the cadence picker → the canonical recurrence
//     rule (shared by the calendar preview and the submit, so the highlighted
//     days are exactly the sessions that will be created)
//   - small immutable row updaters used by the editor's buttons
//
// The code is the modal's, moved verbatim; behaviour must not change.
//
// CIVIL-DATE CONTRACT (Pitfall 1): the shadcn Calendar works with local-time
// Dates at midnight. Convert IN with `parseCivilToLocalDate` and OUT with
// `formatLocalDateToCivil`; NEVER `toISOString().slice(0,10)` — that would
// UTC-shift the day.

import type { getWorkoutTemplateForAssignment } from "./workout-template-actions";
import { alignSetTypes, setTypesDiffer } from "./assignment-set-types";
import { parseDecimalInput } from "./decimal-input";
import { plannedSetType, type SetType } from "./set-type";

export type AssignTemplateDetail = Awaited<ReturnType<typeof getWorkoutTemplateForAssignment>>;
export type AssignTemplateDetailExercise = AssignTemplateDetail["exercises"][number];
export type AssignExerciseOverride = ReturnType<typeof buildExerciseOverrides>[number];

/** Plan 21-04b: four cadence modes + monthly (added 26-05). */
export type AssignMode = "once" | "weekly" | "daily" | "everyN" | "monthly";

/**
 * One editable prescribed set inside the assign modal.
 *
 * #582 — the per-set TYPE lives on the row, NOT in a sibling `setTypes[]` array
 * (the shape the assignment EDIT dialog uses). The modal mutates `setRows`
 * inline at five call sites (per-field edit, remove, append, copy-to-all,
 * metric flip); a parallel array would have to be re-synced at every one of
 * them, and a missed sync is exactly the misalignment this issue is about —
 * the warm-up marker sliding onto the wrong set. Embedding it makes
 * add/remove correct by construction.
 */
export interface AssignSetRow {
  reps: string;
  kg: string;
  duration?: string;
  type: SetType;
}

/**
 * Per-exercise edit buffer. `setRows` is one entry per prescribed set —
 * each carries its own reps + kg buffer, mirroring the authoring form's
 * per-set table. `sets` is derived from setRows.length on commit; the
 * trainer adds/removes rows via the +/- buttons rather than retyping a
 * count input. Notes + rest_seconds stay exercise-level.
 *
 * 26-03 — `duration` is additive (optional) on each row. Populated only
 * when the effective metric for that exercise is "time"; otherwise it
 * remains undefined and the submit-time transform omits
 * `durationBySetSeconds` from the override.
 */
export interface AssignOverrideDraft {
  rest_seconds: string;
  transition_rest_seconds: string;
  notes: string;
  setRows: AssignSetRow[];
  // 260610-j67 (issue #159) — "Sin peso" intent. Seeded from the source
  // template exercise's hasExplicitNoWeightPrescription; ON → the
  // override writes weightBySetKg: [] + hides the kg column.
  noWeight: boolean;
  // The trainer can switch an exercise between reps- and time-based at
  // assignment time. Undefined → inherit the template/exercise metric;
  // set → the chosen metric. The override emits `metric` + per-set
  // duration when this differs from the template's effective metric.
  metric?: "reps" | "time";
}

/** Drafts keyed by the template exercise's `index`. */
export type AssignOverrideDrafts = Record<number, AssignOverrideDraft>;

export type AssignRecurrence =
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number }
  | { kind: "weekly_days"; weekdays: number[] }
  | { kind: "every_n_days"; everyN: number }
  | { kind: "monthly"; dayOfMonth: number };

/** Max prescribed sets per exercise (Zod caps `sets` at 10). */
export const ASSIGN_MAX_SET_ROWS = 10;

/** "YYYY-MM-DD" → local-time Date at midnight (no UTC shift). */
export function parseCivilToLocalDate(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** local-time Date → "YYYY-MM-DD" using the local-time y/m/d parts. */
export function formatLocalDateToCivil(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function restMinutesHint(rawSeconds: string): string {
  const seconds = Number(rawSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} min`;
  }
  if (seconds > 60) {
    return `${Math.round((seconds / 60) * 10) / 10} min`;
  }
  return "";
}

/**
 * The recurrence rule for a non-"once" cadence. One weekday collapses to
 * `{kind:"weekly", weekday}`; two or more widen to `{kind:"weekly_days"}`
 * SORTED — the same wire shape the recurrence-edit dialog writes.
 */
export function buildAssignRecurrence(
  mode: Exclude<AssignMode, "once">,
  input: { civilDate: string; recurringWeekdays: ReadonlySet<number>; recurringEveryN: number },
): AssignRecurrence {
  const { civilDate, recurringWeekdays, recurringEveryN } = input;
  if (mode === "daily") {
    return { kind: "daily" };
  }
  if (mode === "everyN") {
    return { kind: "every_n_days", everyN: recurringEveryN };
  }
  if (mode === "monthly") {
    return {
      kind: "monthly",
      dayOfMonth: parseCivilToLocalDate(civilDate).getDate(),
    };
  }
  const weekdays = Array.from(recurringWeekdays).sort((a, b) => a - b);
  return weekdays.length === 1
    ? { kind: "weekly", weekday: weekdays[0] }
    : { kind: "weekly_days", weekdays };
}

/**
 * Toggle one weekday of the weekly cadence. The last selected weekday can't
 * be unselected — at least one must remain.
 */
export function toggleWeekdayIn(prev: ReadonlySet<number>, idx: number): Set<number> {
  const next = new Set(prev);
  if (next.has(idx)) {
    if (next.size === 1) return next;
    next.delete(idx);
  } else {
    next.add(idx);
  }
  return next;
}

/** Template detail → one draft per exercise (keyed by `exercise.index`). */
export function seedOverrideDrafts(
  exercises: AssignTemplateDetailExercise[],
): AssignOverrideDrafts {
  return exercises.reduce<AssignOverrideDrafts>((acc, exercise) => {
    // Reconstruct one row per prescribed set. Pull reps from
    // repsBySet[i] if present, otherwise from the exercise-level
    // `reps` fallback. Same for kg from weightBySetKg[i]. The
    // canonical row count is the MAX of (sets, repsBySet.length,
    // weightBySetKg.length) so a desync at the source — like the
    // "sets=1 but weightBySetKg=[24,24,23]" template the operator
    // ran into — surfaces here as all 3 rows instead of silently
    // collapsing back to 1.
    const repsBySet = Array.isArray(exercise.repsBySet)
      ? exercise.repsBySet
      : [];
    const weightBySetKg = Array.isArray(exercise.weightBySetKg)
      ? exercise.weightBySetKg
      : [];
    // 26-03 — Per-set duration source (time exercises only).
    const durationBySetSeconds = Array.isArray(
      exercise.durationBySetSeconds,
    )
      ? exercise.durationBySetSeconds
      : [];
    const rowCount = Math.min(
      10,
      Math.max(
        exercise.sets ?? 1,
        repsBySet.length,
        weightBySetKg.length,
        durationBySetSeconds.length,
        1,
      ),
    );
    // 26-03 — effective metric per PATTERNS.md §17 + Shared 1.
    // Cascade: template metric ?? source exercise metric ?? "reps".
    const exerciseEffectiveMetric: "reps" | "time" =
      exercise.metric ?? exercise.sourceMetric ?? "reps";
    const setRows = Array.from({ length: rowCount }, (_, i) => ({
      reps: String(
        Number.isFinite(repsBySet[i])
          ? repsBySet[i]
          : exercise.reps ?? 0,
      ),
      kg: Number.isFinite(weightBySetKg[i])
        ? String(weightBySetKg[i])
        : "",
      // #582 — seed from the template's prescription. Short / missing /
      // unknown entries coerce to "normal" (forgiving decode), and the
      // row count above may exceed the array, so this always yields a
      // type for every row.
      type: plannedSetType(i, exercise.setTypesBySet),
      ...(exerciseEffectiveMetric === "time"
        ? {
            duration: String(
              Number.isFinite(durationBySetSeconds[i])
                ? durationBySetSeconds[i]
                : exercise.durationSeconds ?? 60,
            ),
          }
        : {}),
    }));
    acc[exercise.index] = {
      rest_seconds: String(exercise.rest_seconds),
      transition_rest_seconds: String(
        exercise.transition_rest_seconds ?? 60,
      ),
      notes: exercise.notes ?? "",
      setRows,
      // 260610-j67 — seed the no-weight intent from the template.
      noWeight: exercise.hasExplicitNoWeightPrescription === true,
    };
    return acc;
  }, {});
}

/**
 * Drafts → the `exerciseOverrides` payload. Exercises the coach didn't touch
 * are omitted entirely; touched ones carry only the changed fields.
 */
export function buildExerciseOverrides(
  templateDetail: AssignTemplateDetail | null,
  overrideDrafts: AssignOverrideDrafts,
) {
  if (!templateDetail) return [];
  return templateDetail.exercises
    .map((exercise) => {
      const draft = overrideDrafts[exercise.index];
      if (!draft) return null;

      // 26-03 — effective metric per PATTERNS.md §17 + Shared 1.
      // The trainer's per-assignment toggle (draft.metric) wins over the
      // template's metric; falls back to template ?? source ?? "reps".
      const templateMetric: "reps" | "time" =
        exercise.metric ?? exercise.sourceMetric ?? "reps";
      const effectiveMetric: "reps" | "time" =
        draft.metric ?? templateMetric;
      const changedMetric = effectiveMetric !== templateMetric;

      // setRows → reps[] + kg[] + sets count, cleaning non-finite entries.
      const repsBySet = draft.setRows
        .map((row) => Number(row.reps))
        .map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(50, Math.round(n))) : NaN));
      const weightBySetKg = draft.setRows
        .map((row) => row.kg.trim())
        // #451 — "62,5" (es keyboard) is 62.5, not NaN → 0 kg.
        .map((raw) => (raw === "" ? NaN : parseDecimalInput(raw)))
        .map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(500, n)) : NaN));
      // 26-03 — Parallel duration cleanup (5..1800 clamp). Only used
      // when the effective metric is "time"; we still compute it
      // unconditionally so a metric flip mid-draft doesn't drop the
      // values the trainer just typed.
      const durationBySetSeconds = draft.setRows
        .map((row) => (row.duration ?? "").trim())
        .map((raw) => (raw === "" ? NaN : Number(raw)))
        .map((n) =>
          Number.isFinite(n) ? Math.max(5, Math.min(1800, Math.round(n))) : NaN,
        );

      const validRepsLen = repsBySet.filter((n) => Number.isFinite(n)).length;
      const validDurationLen = durationBySetSeconds.filter((n) =>
        Number.isFinite(n),
      ).length;
      // Set-count basis follows the primary metric: count the populated
      // duration entries on time exercises, populated reps entries on
      // reps exercises.
      const primaryValidLen =
        effectiveMetric === "time" ? validDurationLen : validRepsLen;
      const finalSets = Math.max(
        1,
        Math.min(10, primaryValidLen || draft.setRows.length),
      );
      const finalRepsBySet = repsBySet
        .slice(0, finalSets)
        .map((n) => (Number.isFinite(n) ? n : 0));
      const finalWeightsRaw = weightBySetKg.slice(0, finalSets);
      // 260610-j67 (issue #159) — when "Sin peso" is on, force no weights
      // (`weightBySetKg: []`). Otherwise an empty kg field means 0kg,
      // not a reps-only prescription.
      const finalWeights = draft.noWeight
        ? []
        : Array.from({ length: finalSets }, (_, i) =>
            Number.isFinite(finalWeightsRaw[i]) ? finalWeightsRaw[i] : 0,
          );
      // 26-03 — Final duration array for time exercises.
      const finalDurationBySetSeconds = durationBySetSeconds
        .slice(0, finalSets)
        .map((n) => (Number.isFinite(n) ? n : 60));
      // #582 — per-set types, always exactly `finalSets` long (rows beyond
      // the draft pad to "normal"), so a set the coach REMOVED can't leave a
      // trailing entry that slides the markers on the surviving rows.
      const finalSetTypes = alignSetTypes(
        draft.setRows.map((row) => row.type),
        finalSets,
      );

      const nextRest = Number(draft.rest_seconds);
      const nextTransitionRest = Number(draft.transition_rest_seconds);
      const nextNotes = draft.notes.trim();

      const baseRepsBySet = Array.isArray(exercise.repsBySet) ? exercise.repsBySet : [];
      const baseWeightBySetKg = Array.isArray(exercise.weightBySetKg)
        ? exercise.weightBySetKg
        : [];
      const baseDurationBySetSeconds = Array.isArray(
        exercise.durationBySetSeconds,
      )
        ? exercise.durationBySetSeconds
        : [];

      const changedSets = finalSets !== exercise.sets;
      const changedReps =
        finalRepsBySet[0] !== undefined && finalRepsBySet[0] !== exercise.reps;
      const changedRepsBySet =
        finalRepsBySet.length !== baseRepsBySet.length ||
        finalRepsBySet.some((v, i) => v !== baseRepsBySet[i]);
      // #451 — a template with NO weight prescription (legacy doc, empty
      // array, not the explicit "Sin peso") seeds blank kg cells. Blank cells
      // the coach never filled are "still no weights", not an explicit
      // [0, 0, 0] prescription — so they are not a change.
      const untouchedNoWeights =
        !draft.noWeight &&
        baseWeightBySetKg.length === 0 &&
        draft.setRows.every((row) => row.kg.trim() === "");
      const changedWeights =
        !untouchedNoWeights &&
        (finalWeights.length !== baseWeightBySetKg.length ||
          finalWeights.some((v, i) => v !== baseWeightBySetKg[i]));
      // #582 — compare against the template's array COERCED to the final set
      // count, so "the coach deleted a set" registers as a change even when
      // no picker was opened: the inherited array is then the wrong length
      // and every marker after the deleted row is off by one.
      const baseSetTypes = alignSetTypes(exercise.setTypesBySet, finalSets);
      const changedSetTypes = setTypesDiffer(finalSetTypes, baseSetTypes);
      const changedRest =
        Number.isFinite(nextRest) && nextRest !== exercise.rest_seconds;
      const changedTransitionRest =
        Number.isFinite(nextTransitionRest) &&
        nextTransitionRest !== (exercise.transition_rest_seconds ?? 60);
      const changedNotes = nextNotes !== (exercise.notes ?? "").trim();
      // 26-03 — Duration change detection (only relevant when time).
      const changedDurations =
        effectiveMetric === "time" &&
        (finalDurationBySetSeconds.length !== baseDurationBySetSeconds.length ||
          finalDurationBySetSeconds.some(
            (v, i) => v !== baseDurationBySetSeconds[i],
          ));

      if (
        !changedSets &&
        !changedReps &&
        !changedRepsBySet &&
        !changedWeights &&
        !changedRest &&
        !changedTransitionRest &&
        !changedNotes &&
        !changedDurations &&
        !changedMetric &&
        !changedSetTypes
      ) {
        return null;
      }
      return {
        index: exercise.index,
        ...(changedSets ? { sets: finalSets } : {}),
        // 26-03 — For reps exercises keep writing `reps` + `repsBySet`
        // as today. For time exercises we do NOT write reps at all —
        // PATTERNS.md §17: "do NOT write both arrays for the same
        // exercise."
        ...(effectiveMetric === "reps" && changedReps
          ? { reps: Math.max(0, Math.min(50, Math.round(finalRepsBySet[0] ?? 0))) }
          : {}),
        ...(effectiveMetric === "reps" && changedRepsBySet
          ? { repsBySet: finalRepsBySet }
          : {}),
        ...(changedWeights ? { weightBySetKg: finalWeights } : {}),
        ...(changedRest
          ? { rest_seconds: Math.max(0, Math.min(600, Math.round(nextRest))) }
          : {}),
        ...(changedTransitionRest
          ? {
              transition_rest_seconds: Math.max(
                0,
                Math.min(600, Math.round(nextTransitionRest)),
              ),
            }
          : {}),
        ...(changedNotes ? { notes: nextNotes } : {}),
        // #582 — the server realigns to the final set count and DROPS the
        // key when everything came out normal, so an inherited array can't
        // outlive an all-normal prescription.
        ...(changedSetTypes ? { setTypesBySet: finalSetTypes } : {}),
        // Emit the chosen metric when the trainer flipped reps↔time so the
        // assignment snapshot carries the new metric (consumers branch on it).
        ...(changedMetric ? { metric: effectiveMetric } : {}),
        // 26-03 — Duration override write (time exercises only). Also writes
        // on a reps→time flip (base durations are empty → changedDurations).
        // durationSeconds is the exercise-level fallback (the time analog of
        // `reps`) so the snapshot satisfies "metric=time needs a duration".
        ...(effectiveMetric === "time" && (changedDurations || changedMetric)
          ? {
              durationBySetSeconds: finalDurationBySetSeconds,
              durationSeconds: finalDurationBySetSeconds[0] ?? 60,
            }
          : {}),
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null,
    );
}

/**
 * Copy set 1's reps / kg (/ duration) onto every other set of one exercise.
 * `undefined` = nothing to copy (no draft, or a single set).
 */
export function copyFirstSetToAllRows(
  cur: AssignOverrideDraft | undefined,
  metric: "reps" | "time",
): AssignOverrideDraft | undefined {
  const first = cur?.setRows[0];
  if (!cur || !first || cur.setRows.length <= 1) return undefined;
  const next = cur.setRows.map((row, index) => {
    if (index === 0) return row;
    // #582 — `...row` keeps each row's own `type`. Copying the first
    // set's TYPE is deliberately NOT part of "copiar a todas": set 1 is
    // very often the warm-up, and turning every set into a warm-up is
    // never what the coach means by copying the prescription.
    return {
      ...row,
      reps: first.reps,
      kg: first.kg,
      ...(metric === "time" ? { duration: first.duration ?? "60" } : {}),
    };
  });
  return { ...cur, setRows: next };
}

/** #582 — swap ONE row's per-set type (Hevy picker in the `#` column). */
export function withRowType(
  cur: AssignOverrideDraft,
  setIdx: number,
  type: SetType,
): AssignOverrideDraft {
  const next = cur.setRows.map((row, i) =>
    i === setIdx ? { ...row, type } : row,
  );
  return { ...cur, setRows: next };
}

/** Patch one text field of one set row. */
export function withRowField(
  cur: AssignOverrideDraft,
  setIdx: number,
  field: "reps" | "kg" | "duration",
  value: string,
): AssignOverrideDraft {
  const next = cur.setRows.map((r, i) =>
    i === setIdx ? { ...r, [field]: value } : r,
  );
  return { ...cur, setRows: next };
}

/**
 * Flip an exercise between reps- and time-based at assignment time. When
 * switching to "time", seed each set row's `duration` (so the seconds inputs
 * start populated instead of empty); `fallbackDuration` is the template's
 * exercise-level duration when present, else 60s.
 */
export function withExerciseMetric(
  cur: AssignOverrideDraft,
  metric: "reps" | "time",
  fallbackDuration: number,
): AssignOverrideDraft {
  const setRows =
    metric === "time"
      ? cur.setRows.map((row) => ({
          ...row,
          duration: row.duration ?? String(fallbackDuration),
        }))
      : cur.setRows;
  return { ...cur, metric, setRows };
}

/** Remove one set (never the last one). `undefined` = nothing to do. */
export function withoutSetRow(
  cur: AssignOverrideDraft,
  setIdx: number,
): AssignOverrideDraft | undefined {
  if (cur.setRows.length <= 1) return undefined;
  return { ...cur, setRows: cur.setRows.filter((_, i) => i !== setIdx) };
}

/**
 * Append one set (up to 10). The new row carries the previous row's values as
 * a sensible default — common case is +1 set with the same prescription as the
 * prior set. 26-03 additionally seeds `duration` when the effective metric is
 * "time" so the new row surfaces a usable number instead of an empty string.
 * `undefined` = already at the cap.
 */
export function withAppendedSetRow(
  cur: AssignOverrideDraft,
  effectiveMetric: "reps" | "time",
): AssignOverrideDraft | undefined {
  if (cur.setRows.length >= ASSIGN_MAX_SET_ROWS) return undefined;
  const last = cur.setRows[cur.setRows.length - 1];
  const newRow: AssignSetRow = {
    reps: last?.reps ?? "0",
    kg: last?.kg ?? "",
    // #582 — an appended set is NORMAL, never the previous row's type:
    // inheriting it would turn "+ agregar serie" after a warm-up into a
    // second warm-up. Values carry over, the type does not.
    type: "normal",
  };
  if (effectiveMetric === "time") {
    newRow.duration = last?.duration ?? "60";
  }
  return { ...cur, setRows: [...cur.setRows, newRow] };
}

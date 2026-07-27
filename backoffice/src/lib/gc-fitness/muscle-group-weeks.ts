// muscle-group-weeks.ts
// #480 / #568 — pure weekly bucketing for the coach's muscle-group progress
// charts. Extracted out of exercise-progress-actions.ts (where it lived as a
// private helper) so the projection math is unit-testable.
//
// SOURCE OF TRUTH (keep in sync, line-for-line):
//   - iOS:     gc-fitness/iOS/GCFitness/Features/Profile/ProgressPhotosViewModel.swift
//              (`projectedContributions`, `projectedSetVolumeKg`,
//               `recomputeMuscleGroups`) + GCFitnessCore/Progress/MuscleGroupProgress.swift
//   - Android: android/core/src/main/kotlin/com/goldencrow/fitness/core/
//              algorithms/MuscleGroupCharts.kt
//
// ATTRIBUTION: a non-warmup set is attributed to every coarse group its
// exercise trains, weighted 1.0 for the primary mover / 0.5 per secondary —
// see muscle-group-display.coarseWeights (the shared twin).
//
// #568 PROJECTION: the mobile charts append ~4 weeks of dashed "what the plan
// says you're about to do" to the right of today, built from upcoming
// `scheduled` assignments' frozen `templateSnapshot`. The backoffice does the
// same, and ALSO projects the *remainder of the current week* — otherwise a
// Monday reading of "3 series esta semana" is misleadingly low (the second half
// of #568).

import { COARSE_MUSCLE_GROUPS, coarseWeights } from "@/lib/gc-fitness/muscle-group-display";

/** How many FULL future weeks the projection appends (mobile parity). */
export const PROJECTION_WEEKS = 4;

/** Weighted sets + volume for one coarse group in one week. */
export interface MuscleGroupCell {
  sets: number;
  volume: number;
}

/**
 * #480 — one WEEK bucket of the muscle-group breakdown. `byGroup` is keyed by
 * COARSE muscle group (see muscle-group-display.ts); `sets` is the weighted set
 * count (primary 1.0 / secondary 0.5) and `volume` the weighted Σ kg for that
 * group in the Monday-anchored week starting `weekStart`. Only groups with data
 * appear. Weeks are contiguous (zero-filled) from the earliest trained week, so
 * the overlaid lines stay continuous.
 */
export interface MuscleGroupWeekPoint {
  /** YYYY-MM-DD of the Monday that starts this week (client timezone). */
  weekStart: string;
  /** What was actually LOGGED in this week. Empty for future weeks. */
  byGroup: Record<string, MuscleGroupCell>;
  /**
   * #568 — actual-so-far PLUS the still-scheduled prescription for this week.
   * Present only from the current week onward (past weeks can't be projected);
   * equals `byGroup` when nothing is scheduled for the rest of the week.
   */
  projectedByGroup?: Record<string, MuscleGroupCell>;
  /** True for weeks that start AFTER the current week (pure projection). */
  projected?: boolean;
}

/** A single completed (or prescribed) set, tagged with its civil date. */
export interface MuscleSetInput {
  /** YYYY-MM-DD in the client's timezone. */
  date: string;
  exerciseId: string;
  volumeKg: number;
}

/** The muscle metadata read off an `exercises` doc, for the weighting. */
export interface ExerciseMuscleMeta {
  muscleGroups: string[];
  primaryMuscleGroup: string | null;
  secondaryMuscles: string[];
}

/** The subset of a `templateSnapshot.exercises[]` entry the projection reads. */
export interface SnapshotExerciseInput {
  exerciseId?: unknown;
  sets?: unknown;
  reps?: unknown;
  repsBySet?: unknown;
  weightBySetKg?: unknown;
  metric?: unknown;
  durationSeconds?: unknown;
  durationBySetSeconds?: unknown;
}

/**
 * Monday that starts the week containing `civilDate` (YYYY-MM-DD). Anchored at
 * UTC noon so the weekday math never trips a DST boundary. Week starts Monday
 * (matches DashboardAggregator.weekStart across all surfaces).
 */
export function civilWeekStart(civilDate: string): string {
  const parts = civilDate.split("-");
  if (parts.length !== 3) return civilDate;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return civilDate;
  }
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  // getUTCDay(): 0=Sun … 6=Sat. Days since Monday = (day + 6) % 7.
  const sinceMonday = (noon.getUTCDay() + 6) % 7;
  noon.setUTCDate(noon.getUTCDate() - sinceMonday);
  return formatUTC(noon);
}

/** `civilDate` shifted by `delta` days (UTC-noon anchored). */
export function shiftCivilDays(civilDate: string, delta: number): string {
  const parts = civilDate.split("-");
  if (parts.length !== 3) return civilDate;
  const noon = new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0),
  );
  noon.setUTCDate(noon.getUTCDate() + delta);
  return formatUTC(noon);
}

function formatUTC(d: Date): string {
  const yy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function numberAt(raw: unknown, index: number): number | null {
  if (!Array.isArray(raw)) return null;
  const v = raw[index];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function lastNumber(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const v = raw[raw.length - 1];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function finite(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return null;
}

/**
 * Prescribed volume of ONE set of a snapshot exercise, in kg. Time-based sets
 * use `weight × duration/60`; rep-based use `weight × reps`. Per-set
 * prescriptions (`weightBySetKg` / `repsBySet` / `durationBySetSeconds`) win,
 * then the exercise-level fallbacks, then 0 (no prescribed weight → a
 * bodyweight / open lift contributes 0 volume but still COUNTS as a set).
 *
 * Twin of iOS `ProgressPhotosViewModel.projectedSetVolumeKg` and Android
 * `MuscleGroupCharts.projectedSetVolumeKg`.
 */
export function projectedSetVolumeKg(
  exercise: SnapshotExerciseInput,
  setIndex: number,
): number {
  const weight =
    numberAt(exercise.weightBySetKg, setIndex) ??
    lastNumber(exercise.weightBySetKg) ??
    0;

  const durationBySet = exercise.durationBySetSeconds;
  const isTime =
    exercise.metric === "time" ||
    finite(exercise.durationSeconds) !== null ||
    (Array.isArray(durationBySet) && durationBySet.length > 0);

  if (isTime) {
    const seconds =
      numberAt(durationBySet, setIndex) ?? finite(exercise.durationSeconds) ?? 0;
    return weight * (seconds / 60);
  }

  const reps = numberAt(exercise.repsBySet, setIndex) ?? finite(exercise.reps) ?? 0;
  return weight * reps;
}

/**
 * Flatten one upcoming assignment's frozen `templateSnapshot.exercises[]` into
 * per-prescribed-set inputs dated on the assignment's `scheduledFor`. Twin of
 * iOS/Android `projectedContributions` (the caller does the status + window
 * filtering).
 */
export function projectedSetsForAssignment(
  scheduledFor: string,
  exercises: SnapshotExerciseInput[],
): MuscleSetInput[] {
  const out: MuscleSetInput[] = [];
  for (const exercise of exercises) {
    const exerciseId =
      typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
    if (!exerciseId) continue;
    const setCount = Math.max(0, Math.trunc(finite(exercise.sets) ?? 0));
    for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
      out.push({
        date: scheduledFor,
        exerciseId,
        volumeKg: projectedSetVolumeKg(exercise, setIndex),
      });
    }
  }
  return out;
}

/** Fold a flat set list into weekStart → group → weighted { sets, volume }. */
function bucketByWeek(
  inputs: MuscleSetInput[],
  metaById: Map<string, ExerciseMuscleMeta>,
  groupsWithData: Set<string>,
): Map<string, Map<string, MuscleGroupCell>> {
  const byWeek = new Map<string, Map<string, MuscleGroupCell>>();
  for (const input of inputs) {
    const meta = metaById.get(input.exerciseId);
    if (!meta) continue;
    const weights = coarseWeights({
      muscleGroups: meta.muscleGroups,
      primaryMuscleGroup: meta.primaryMuscleGroup,
      secondaryMuscles: meta.secondaryMuscles,
    });
    const groups = Object.keys(weights);
    if (groups.length === 0) continue;

    const week = civilWeekStart(input.date);
    let weekMap = byWeek.get(week);
    if (!weekMap) {
      weekMap = new Map();
      byWeek.set(week, weekMap);
    }
    for (const group of groups) {
      const weight = weights[group];
      groupsWithData.add(group);
      const cell = weekMap.get(group) ?? { sets: 0, volume: 0 };
      cell.sets += weight;
      cell.volume += input.volumeKg * weight;
      weekMap.set(group, cell);
    }
  }
  return byWeek;
}

/** Weighted cells → the rounded record the chart consumes. */
function roundCells(
  weekMap: Map<string, MuscleGroupCell> | undefined,
): Record<string, MuscleGroupCell> {
  const out: Record<string, MuscleGroupCell> = {};
  if (!weekMap) return out;
  for (const [group, cell] of weekMap) {
    out[group] = {
      sets: Math.round(cell.sets * 10) / 10,
      volume: Math.round(cell.volume),
    };
  }
  return out;
}

/** actual ⊎ projected, summed per group (used for the current week). */
function mergeCells(
  actual: Map<string, MuscleGroupCell> | undefined,
  projected: Map<string, MuscleGroupCell> | undefined,
): Record<string, MuscleGroupCell> {
  const merged = new Map<string, MuscleGroupCell>();
  for (const source of [actual, projected]) {
    if (!source) continue;
    for (const [group, cell] of source) {
      const acc = merged.get(group) ?? { sets: 0, volume: 0 };
      acc.sets += cell.sets;
      acc.volume += cell.volume;
      merged.set(group, acc);
    }
  }
  return roundCells(merged);
}

/**
 * #480 / #568 — fold the completed non-warmup sets (`actual`) and the upcoming
 * prescribed sets (`projected`) into one contiguous weekly axis.
 *
 * - weeks BEFORE the current week carry `byGroup` only;
 * - the CURRENT week carries `byGroup` (logged so far) AND `projectedByGroup`
 *   (logged + still scheduled for the rest of the week);
 * - weeks AFTER the current week carry an empty `byGroup`, a
 *   `projectedByGroup`, and `projected: true`.
 *
 * The axis is bounded by the caller's read windows (≤ 53 actual buckets from
 * the 365-day log window + PROJECTION_WEEKS ahead).
 */
export function buildMuscleGroupWeeks(
  actual: MuscleSetInput[],
  projected: MuscleSetInput[],
  metaById: Map<string, ExerciseMuscleMeta>,
  today: string,
): { muscleGroupWeeks: MuscleGroupWeekPoint[]; availableMuscleGroups: string[] } {
  const groupsWithData = new Set<string>();
  const actualByWeek = bucketByWeek(actual, metaById, groupsWithData);
  const projectedByWeek = bucketByWeek(projected, metaById, groupsWithData);

  if (actualByWeek.size === 0 && projectedByWeek.size === 0) {
    return { muscleGroupWeeks: [], availableMuscleGroups: [] };
  }

  const currentWeek = civilWeekStart(today);
  // Never project further than PROJECTION_WEEKS past the current week, even if
  // a far-future assignment slipped into the read window.
  const lastProjectedWeek = shiftCivilDays(currentWeek, 7 * PROJECTION_WEEKS);

  const knownWeeks = [...actualByWeek.keys(), ...projectedByWeek.keys()].sort();
  const earliest =
    knownWeeks.length > 0 && knownWeeks[0] < currentWeek
      ? knownWeeks[0]
      : currentWeek;

  const weeks: MuscleGroupWeekPoint[] = [];
  let cursor = earliest;
  // Guard against runaway iteration on a malformed date.
  for (let i = 0; i < 64 && cursor <= lastProjectedWeek; i += 1) {
    const actualWeek = actualByWeek.get(cursor);
    const projectedWeek = projectedByWeek.get(cursor);

    if (cursor < currentWeek) {
      // Past week — actuals only (a still-`scheduled` past assignment is a
      // missed workout, not a projection).
      weeks.push({ weekStart: cursor, byGroup: roundCells(actualWeek) });
    } else if (cursor === currentWeek) {
      weeks.push({
        weekStart: cursor,
        byGroup: roundCells(actualWeek),
        projectedByGroup: mergeCells(actualWeek, projectedWeek),
      });
    } else {
      weeks.push({
        weekStart: cursor,
        byGroup: {},
        projectedByGroup: roundCells(projectedWeek),
        projected: true,
      });
    }
    cursor = shiftCivilDays(cursor, 7);
  }

  const availableMuscleGroups = COARSE_MUSCLE_GROUPS.filter((g) =>
    groupsWithData.has(g),
  );

  return { muscleGroupWeeks: weeks, availableMuscleGroups };
}

// ---------------------------------------------------------------------------
// Chart shaping (#568) — kept here, next to the bucketer, so the boundary math
// is unit-testable without mounting recharts.
// ---------------------------------------------------------------------------

/** Suffix that marks a projected series' dataKey (`back` → `back__proj`). */
export const PROJECTED_KEY_SUFFIX = "__proj";

/**
 * Whether a week carries a projection worth drawing: a future week with any
 * scheduled work, or the CURRENT week whose plan still exceeds what's logged.
 * A client with nothing upcoming keeps the pre-#568 chart (no dashed region).
 */
export function weekHasProjection(week: MuscleGroupWeekPoint): boolean {
  const proj = week.projectedByGroup;
  if (!proj) return false;
  if (week.projected) return Object.values(proj).some((c) => c.sets > 0);
  return Object.entries(proj).some(
    ([group, cell]) => cell.sets > (week.byGroup[group]?.sets ?? 0),
  );
}

/**
 * One recharts row per week. Per selected group it emits a solid `g` column
 * (actuals — null once the week is entirely in the future, so the solid line
 * stops at today) and a dashed `g__proj` column.
 *
 * The projected column is SEEDED one week BEFORE the current week with that
 * week's actual value, so the dashed segment grows out of the solid line
 * instead of floating — the same `boundary - 1` trick the iOS chart uses.
 * `null` everywhere else keeps both lines (and, with `filterNull`, the tooltip)
 * confined to their own region.
 */
export function buildChartRows(
  weeks: MuscleGroupWeekPoint[],
  groups: string[],
  metric: "sets" | "volume",
  currentIndex: number,
  hasProjection: boolean,
): Array<Record<string, number | string | null>> {
  return weeks.map((week, i) => {
    const row: Record<string, number | string | null> = { week: week.weekStart };
    for (const group of groups) {
      row[group] = week.projected ? null : (week.byGroup[group]?.[metric] ?? 0);

      const projectedKey = group + PROJECTED_KEY_SUFFIX;
      if (!hasProjection || currentIndex < 0 || i < currentIndex - 1) {
        row[projectedKey] = null;
      } else if (i === currentIndex - 1) {
        row[projectedKey] = week.byGroup[group]?.[metric] ?? 0;
      } else {
        row[projectedKey] = week.projectedByGroup?.[group]?.[metric] ?? 0;
      }
    }
    return row;
  });
}

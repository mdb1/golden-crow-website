"use client";

// exercise-filter-state.ts
//
// Phase 24-06 Task 2 — client-side filter state for the exercise picker.
//
// Provides a pure-function `applyFilters` and a `useExerciseFilters` hook
// over the in-memory ExerciseRow cache delivered by `useExercisesQuery`
// (exercises-listener.ts). No Firestore queries, no composite indexes,
// no new `where` clauses — see I13 in 24-PATTERNS.md and Pitfall 10 in
// 24-RESEARCH.md.
//
// ---------------------------------------------------------------------------
// Codex MEDIUM — Set mutation safety contract (DO NOT VIOLATE)
// ---------------------------------------------------------------------------
//
// Every state-update path on the `muscles` and `equipment` Set fields
// MUST return a NEW Set instance. React `useState` bails on re-render
// when the next-state reference equals the prior reference; mutating a
// Set in place and returning the same reference therefore leaves the
// chip click visually unresponsive even though the underlying Set
// content changed.
//
// IMMUTABLE PATTERNS (use these):
//   ADD:    new Set([...prev, value])
//   REMOVE: new Set(Array.from(prev).filter(v => v !== value))
//   CLEAR:  new Set()
//
// FORBIDDEN PATTERNS (do NOT use):
//   - calling the Set#add / Set#delete METHOD on the state field
//     (e.g. filters[muscles][add](...)) — mutates the stored Set in
//     place; React skips the re-render because the reference did not
//     change.
//   - assigning back to filters.muscles or filters.equipment outside a
//     setFilters call.
//
// A grep gate in the acceptance asserts ≥ 3 `new Set(` occurrences in
// this file AND zero literal `.muscles[.]add(` / `.muscles[.]delete(` /
// `.equipment[.]add(` / `.equipment[.]delete(` references anywhere in
// the executable code of the touched files.

import { useMemo, useState } from "react";
import type { ExerciseRow } from "./exercises-listener";

export interface ExerciseFilters {
  /** Multi-select. Matches against `muscleGroups ∪ primaryMuscles`. */
  muscles: Set<string>;
  /** Multi-select. Matches against the row's `equipment[]`. */
  equipment: Set<string>;
  /** Single-select. Strict equality on `row.level`; null row.level fails. */
  level: string | null;
  /** Single-select. Strict equality on `row.mechanic`; null row.mechanic fails. */
  mechanic: string | null;
}

const EMPTY: ExerciseFilters = {
  muscles: new Set(),
  equipment: new Set(),
  level: null,
  mechanic: null,
};

const MUSCLE_FILTER_ALIASES: Record<string, string[]> = {
  legs: ["legs", "quadriceps", "hamstrings", "glutes", "calves"],
};

/**
 * React hook returning the filter state and a setter. The setter accepts
 * either a next-state object or a `(prev) => next` updater — callers MUST
 * use the immutable patterns documented at the top of this file when the
 * updater touches `muscles` or `equipment`.
 *
 * Returned helpers:
 *   - `filters`: current state
 *   - `setFilters`: React-style setter (object or updater)
 *   - `isEmpty`: true when ALL fields are at their default (no chips active)
 *   - `clear`: resets to EMPTY in a single state transition
 */
export function useExerciseFilters() {
  const [filters, setFilters] = useState<ExerciseFilters>(EMPTY);

  const isEmpty = useMemo(
    () =>
      filters.muscles.size === 0 &&
      filters.equipment.size === 0 &&
      filters.level === null &&
      filters.mechanic === null,
    [filters],
  );

  const clear = () =>
    setFilters({
      muscles: new Set(),
      equipment: new Set(),
      level: null,
      mechanic: null,
    });

  return { filters, setFilters, isEmpty, clear };
}

/**
 * Pure-function projection used by the picker. Defensive against legacy
 * docs that lack the Phase 24 FEXD enrichment fields (primaryMuscles,
 * mechanic, level) — those rows pass every filter that doesn't constrain
 * the missing field.
 *
 * Returns the input array reference unchanged when no filter is active,
 * so callers can use referential equality as a cheap "no-op" signal in a
 * `useMemo` dependency list.
 */
export function applyFilters(
  rows: ExerciseRow[],
  f: ExerciseFilters,
): ExerciseRow[] {
  if (
    f.muscles.size === 0 &&
    f.equipment.size === 0 &&
    f.level === null &&
    f.mechanic === null
  ) {
    return rows;
  }
  return rows.filter((ex) => {
    if (f.muscles.size > 0) {
      const exMuscles = new Set<string>([
        ...ex.muscleGroups,
        ...(ex.primaryMuscles ?? []),
      ]);
      let hit = false;
      for (const m of f.muscles) {
        const aliases = MUSCLE_FILTER_ALIASES[m] ?? [m];
        if (aliases.some((alias) => exMuscles.has(alias))) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (f.equipment.size > 0) {
      let hit = false;
      for (const e of ex.equipment) {
        if (f.equipment.has(e)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (f.level !== null && ex.level !== f.level) return false;
    if (f.mechanic !== null && ex.mechanic !== f.mechanic) return false;
    return true;
  });
}

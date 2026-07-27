// muscle-group-preferences.ts
// #578 — persistence for the coach's "Grupos musculares" chart controls on
// `/gc-fitness/clients/[id]/progress`.
//
// The chips + target-zone bounds used to be plain `useState`, so ticking all
// seven groups survived neither a reload nor a hop to the next client (a route
// change remounts the component and re-runs the seed initializer).
//
// TWIN — both mobile surfaces already persist exactly this bundle; the
// backoffice was the only one that didn't:
//   - iOS:     ProgressPhotosViewModel.MuscleDefaultsKey / loadMusclePreferences()
//              (UserDefaults `progress.muscleGroups.{selected,targetSetsMin,
//               targetSetsMax}.v1`)
//   - Android: ProgressViewModel / MuscleGroupChartsStandalone — musclePrefs.loadSelected()
//
// Storage is device-local on all three surfaces (UserDefaults / SharedPreferences
// / localStorage). Nothing here reads or writes Firestore.
//
// TWO SEMANTICS COPIED FROM iOS ON PURPOSE:
//
//  1. A restored selection is NOT intersected with the client's available
//     groups. Client B may not train legs, but the chart only ever draws
//     `availableGroups ∩ selected` anyway — so an unavailable group is simply
//     not drawn while STAYING in the preference. Intersecting on read would
//     silently erase groups as the coach walks the roster.
//  2. A restored selection suppresses default seeding entirely (iOS
//     `didSeedMuscleSelection`). An empty stored array means "the coach
//     unticked everything", not "no value" — it is restored as empty.

import { COARSE_MUSCLE_GROUPS } from "./muscle-group-display";

/** localStorage keys — `gc-fitness:` prefixed like `gc-fitness:template-draft:new`. */
export const MUSCLE_PREFERENCE_KEYS = {
  selected: "gc-fitness:progress.muscleGroups.selected.v1",
  targetMin: "gc-fitness:progress.muscleGroups.targetSetsMin.v1",
  targetMax: "gc-fitness:progress.muscleGroups.targetSetsMax.v1",
} as const;

/**
 * Default green target band on the sets chart — 12–20 weighted sets per muscle
 * group per week. Twin of the iOS `defaultTargetSetsMin/Max`.
 */
export const DEFAULT_TARGET_MIN = 12;
export const DEFAULT_TARGET_MAX = 20;

/** Upper sanity bound for a persisted target-zone edge (the input is free-form). */
const MAX_TARGET_BOUND = 1000;

export interface MusclePreferences {
  /** `null` when nothing was stored — the caller keeps its default seeding. */
  selected: string[] | null;
  /** `null` when absent/corrupt — the caller keeps its default. */
  targetMin: number | null;
  targetMax: number | null;
}

/**
 * Parse a stored selection.
 *
 * Returns `null` ONLY when the value is absent, unparseable, or not an array —
 * i.e. "no preference, seed the defaults". A well-formed array yields the
 * entries that are real coarse groups, deduped and in canonical display order
 * (so the order values happened to be written in can never disturb the line /
 * legend order), possibly empty.
 *
 * An array of nothing but unknown ids therefore degrades to an empty selection
 * rather than to the defaults — indistinguishable from a deliberate "untick
 * everything", and one click away from recovery either way.
 */
export function parseSelectedMuscleGroups(raw: string | null): string[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const stored = new Set(parsed.filter((v): v is string => typeof v === "string"));
  return COARSE_MUSCLE_GROUPS.filter((g) => stored.has(g));
}

/** Parse a stored target-zone edge; `null` for anything not a sane whole count. */
export function parseTargetBound(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_TARGET_BOUND) return null;
  return n;
}

/**
 * Clamp the green target band so `0 ≤ min ≤ max`. Twin of iOS
 * `ProgressPhotosViewModel.updateTargetSets(min:max:)`. Used for BOTH the live
 * edit and the restore path, so corrupt storage can't produce an inverted band.
 *
 * A non-finite edge (an emptied `<input type="number">` yields `Number("") === 0`,
 * but a pasted "abc" yields NaN) falls back to that edge's default instead of
 * poisoning the band — NaN would otherwise flow through every Math.min/max and
 * blank the ReferenceArea.
 */
export function clampTargetZone(
  min: number,
  max: number,
): { min: number; max: number } {
  const safeMin = Number.isFinite(min) ? min : DEFAULT_TARGET_MIN;
  const safeMax = Number.isFinite(max) ? max : DEFAULT_TARGET_MAX;
  const lo = Math.max(0, Math.min(safeMin, safeMax));
  return { min: lo, max: Math.max(lo, safeMax) };
}

// ---------------------------------------------------------------------------
// window-touching wrappers — the ONLY non-pure functions in this file.
// Every one is SSR-guarded and try/catch'd: localStorage throws in Safari
// private mode / when site data is blocked, and a chart preference must never
// take the progress page down with it.
// ---------------------------------------------------------------------------

const NO_PREFERENCES: MusclePreferences = {
  selected: null,
  targetMin: null,
  targetMax: null,
};

/** Restore the persisted bundle. Call from a mount effect, never during SSR. */
export function readMusclePreferences(): MusclePreferences {
  if (typeof window === "undefined") return NO_PREFERENCES;
  try {
    const { localStorage: ls } = window;
    return {
      selected: parseSelectedMuscleGroups(ls.getItem(MUSCLE_PREFERENCE_KEYS.selected)),
      targetMin: parseTargetBound(ls.getItem(MUSCLE_PREFERENCE_KEYS.targetMin)),
      targetMax: parseTargetBound(ls.getItem(MUSCLE_PREFERENCE_KEYS.targetMax)),
    };
  } catch {
    return NO_PREFERENCES;
  }
}

/** Persist the chip selection (canonical order; an empty set is stored as `[]`). */
export function writeSelectedMuscleGroups(groups: Iterable<string>): void {
  if (typeof window === "undefined") return;
  const set = new Set(groups);
  try {
    window.localStorage.setItem(
      MUSCLE_PREFERENCE_KEYS.selected,
      JSON.stringify(COARSE_MUSCLE_GROUPS.filter((g) => set.has(g))),
    );
  } catch {
    // Storage unavailable — the selection still applies for this session.
  }
}

/** Persist the target-zone bounds (already clamped by the caller). */
export function writeTargetZone(min: number, max: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUSCLE_PREFERENCE_KEYS.targetMin, String(min));
    window.localStorage.setItem(MUSCLE_PREFERENCE_KEYS.targetMax, String(max));
  } catch {
    // Storage unavailable — see above.
  }
}

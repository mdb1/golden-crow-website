// fexd-vocabulary-map.ts
//
// Maps Free-Exercise-DB's raw muscle vocabulary (17 distinct values) to the
// GC canonical 16-item vocabulary defined in:
//   - backoffice/src/lib/gc-fitness/exercise-vocabulary.ts (MUSCLE_GROUPS)
//   - gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Vocabulary.swift
//
// SAME-SOURCE-OF-TRUTH CONTRACT:
// If MUSCLE_GROUPS in the TS/Swift twins changes, the right-hand values in
// FEXD_TO_GC_MUSCLE may need to widen too. Re-running seed-from-fexd.ts
// after a table change converges existing /exercises docs idempotently
// (Pattern 1 in 24-RESEARCH.md). Re-running backfill-fexd-vocabulary.ts
// has the same idempotent property for the 63 already-live FEXD docs.
//
// Consumers:
//   - scripts/gc-fitness/seed-from-fexd.ts (Plan 24-03) — applied inside
//     buildPayload() at seed time so newly-written /exercises docs use
//     GC canonical muscleGroups, not raw FEXD names.
//   - scripts/gc-fitness/backfill-fexd-vocabulary.ts (Plan 24-01 Task 2) —
//     the one-shot backfill that rewrites muscleGroups on the existing
//     63 FEXD docs whose muscleGroups currently leak raw FEXD vocabulary.
//   - (Optionally) backoffice listener snapToRow() as a defensive
//     normalisation layer for any legacy doc that slipped raw vocab.
//
// Foundation-equivalent module: no firebase-admin / no env loading / no
// runtime deps. Testable in isolation against jest with no mocks.

/**
 * Locked mapping from FEXD's 17 distinct muscle names to the GC canonical
 * 16-item bucket vocabulary. Verbatim from 24-PATTERNS.md (Pattern 5).
 *
 * Notes on the 8 non-passthrough projections:
 *  - abdominals → abs       : FEXD uses the medical name; GC uses the gym name.
 *  - abductors  → glutes    : sparse FEXD bucket folded into nearest big bucket.
 *  - adductors  → legs      : sparse FEXD bucket folded into nearest big bucket.
 *  - lats       → back      : FEXD distinguishes lats/middle back/lower back/traps
 *  - lower back → back      : as four sub-regions of "back"; GC uses a single
 *  - middle back→ back      : "back" bucket (rationale: filter UX, not anatomy).
 *  - neck       → shoulders : sparse FEXD bucket folded into nearest big bucket.
 *  - traps      → back      : see lats/lower back/middle back above.
 *
 * The remaining 9 entries are 1:1 passthroughs (biceps, calves, chest,
 * forearms, glutes, hamstrings, quadriceps, shoulders, triceps).
 */
export const FEXD_TO_GC_MUSCLE: Record<string, string> = {
  abdominals: "abs",
  abductors: "glutes",
  adductors: "legs",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "back",
  "lower back": "back",
  "middle back": "back",
  neck: "shoulders",
  quadriceps: "quadriceps",
  shoulders: "shoulders",
  traps: "back",
  triceps: "triceps",
};

/**
 * Project a raw FEXD primary or secondary muscle list onto GC canonical
 * buckets. Unknown raw values pass through unchanged so callers (and tests)
 * can detect upstream FEXD vocabulary drift via Set difference against
 * `Object.keys(FEXD_TO_GC_MUSCLE)`.
 *
 * Dedupes the result via `new Set(...)` because multiple FEXD inputs can
 * collapse to the same GC bucket (e.g. ["lats", "middle back", "traps"]
 * all map to "back").
 */
export function mapFexdMuscles(raw: string[]): string[] {
  return Array.from(new Set(raw.map((m) => FEXD_TO_GC_MUSCLE[m] ?? m)));
}

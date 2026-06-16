// workout-generator/engine.ts
//
// The deterministic Workout Generator engine. PURE — no Firebase, no React, no
// Math.random / Date.now. Given a `GeneratorInput` and an injected exercise
// pool it produces a `GeneratedWorkout`.
//
// THE HARD RULE (issue #296): an exercise is only eligible if EVERY piece of
// equipment it requires is in the trainer's selected set. If barbell wasn't
// selected, no barbell exercise can appear — neither in the workout nor in any
// replacement pill (replacements are drawn from the same eligible pool, so the
// guarantee is structural). `isEquipmentAllowed` is the single chokepoint and
// `engine.test.ts` locks it.
//
// Selection is muscle-balanced: candidates are bucketed by the selected muscle
// they cover, each bucket is shuffled with a seeded PRNG, then the engine
// round-robins across muscles so a "push" workout spreads across chest /
// shoulders / triceps instead of stacking five chest presses.

import {
  estimateTemplateDurationMinutes,
  type DurationEstimateExercise,
} from "../workout-duration-estimate";
import { hashString, mulberry32, seededShuffle } from "./prng";
import {
  estimateSecondsPerExercise,
  getWorkoutTypePreset,
} from "./workout-type-presets";
import type {
  GeneratedExercise,
  GeneratedWorkout,
  GeneratorExercise,
  GeneratorInput,
  ReplacementOption,
} from "./types";

/** Equipment that imposes no requirement — "none" means the exercise needs
 *  nothing, so it's allowed regardless of selection. Everything else
 *  (including "bodyweight") must be explicitly selected. */
const ALWAYS_AVAILABLE_EQUIPMENT = new Set<string>(["none"]);

const MAX_EXERCISES = 30; // mirrors workoutTemplateSchema.exercises.max(30)
const MAX_REPLACEMENTS = 5;

/** The equipment an exercise requires. An empty list is normalized to
 *  `["bodyweight"]`, mirroring `equipmentListSchema` in exercise-schema.ts. */
export function equipmentRequirements(exercise: GeneratorExercise): string[] {
  const cleaned = (exercise.equipment ?? []).filter(
    (e): e is string => typeof e === "string" && e.length > 0,
  );
  return cleaned.length > 0 ? cleaned : ["bodyweight"];
}

// Name keywords that imply a bench is needed. The standard library tags each
// exercise with only its PRIMARY implement (e.g. "Press de banca inclinado
// (Mancuerna)" → equipment:[dumbbell]); the bench is implied by the movement
// name, never tagged. Without this, picking "dumbbell only" (no bench) would
// wrongly surface incline/bench presses. ES + EN keywords.
const BENCH_NAME_KEYWORDS = [
  "banca",
  "bench",
  "inclinad",
  "incline",
  "declinad",
  "decline",
  "predicador",
  "preacher",
];

// Name keywords that imply a pull-up bar is needed. Same gap as the bench: a
// pull-up / chin-up / muscle-up is usually tagged only "bodyweight" (it needs
// no external load), so "bodyweight only" (no bar) would wrongly surface them.
// Inferring the bar from the name closes the hole structurally — when the coach
// hasn't selected `pull_up_bar`, these movements are excluded. ES + EN keywords.
// Kept narrow to clear bar movements; "jalón"/"pulldown" (cable/machine) and
// rows must NOT match.
const PULL_UP_BAR_NAME_KEYWORDS = [
  "dominada", // ES: pull-up / chin-up
  "pull-up",
  "pull up",
  "pullup",
  "chin-up",
  "chin up",
  "chinup",
  "muscle-up",
  "muscle up",
  "muscleup",
];

/**
 * Auxiliary equipment inferred from the exercise NAME that the data doesn't
 * tag: a bench for bench/incline/decline/preacher movements, and a pull-up bar
 * for pull-up/chin-up/muscle-up movements. The floor press ("Press de suelo" /
 * "floor press") is explicitly bench-FREE, so it's guarded even though no
 * current keyword matches it.
 */
export function inferAuxiliaryEquipment(name: {
  en?: string | null;
  es?: string | null;
}): string[] {
  const hay = `${name.en ?? ""} ${name.es ?? ""}`.toLowerCase();
  const inferred: string[] = [];
  const isFloor = hay.includes("suelo") || hay.includes("floor");
  if (!isFloor && BENCH_NAME_KEYWORDS.some((k) => hay.includes(k))) {
    inferred.push("bench");
  }
  if (PULL_UP_BAR_NAME_KEYWORDS.some((k) => hay.includes(k))) {
    inferred.push("pull_up_bar");
  }
  return inferred;
}

/** Full equipment an exercise needs = its tagged implement(s) PLUS any
 *  name-inferred auxiliary equipment (a bench). This is what eligibility
 *  checks against. */
export function effectiveEquipment(exercise: GeneratorExercise): string[] {
  return Array.from(
    new Set([
      ...equipmentRequirements(exercise),
      ...inferAuxiliaryEquipment(exercise.name ?? { en: "", es: "" }),
    ]),
  );
}

/** THE eligibility chokepoint. True iff every required equipment item (tagged
 *  OR name-inferred) is in the selected set (or is an always-available item
 *  like "none"). */
export function isEquipmentAllowed(
  exercise: GeneratorExercise,
  selectedEquipment: ReadonlySet<string>,
): boolean {
  return effectiveEquipment(exercise).every(
    (item) =>
      ALWAYS_AVAILABLE_EQUIPMENT.has(item) || selectedEquipment.has(item),
  );
}

/** The first selected muscle group this exercise covers, or null if none. The
 *  ordering of `exercise.muscleGroups` is treated as primary→secondary, so the
 *  earliest selected match is the muscle this exercise "belongs to". */
export function primaryCoveredMuscle(
  exercise: GeneratorExercise,
  selectedMuscles: ReadonlySet<string>,
): string | null {
  for (const m of exercise.muscleGroups ?? []) {
    if (selectedMuscles.has(m)) return m;
  }
  return null;
}

function effectiveMetric(exercise: GeneratorExercise): "reps" | "time" {
  return exercise.metric === "time" ? "time" : "reps";
}

interface EligibleEntry {
  exercise: GeneratorExercise;
  primaryMuscle: string;
}

/** Exercises that pass BOTH the equipment filter and the muscle filter,
 *  deduped by id, each tagged with the selected muscle it primarily covers. */
export function getEligibleExercises(
  pool: readonly GeneratorExercise[],
  input: Pick<GeneratorInput, "equipment" | "muscleGroups">,
): EligibleEntry[] {
  const selectedEquipment = new Set(input.equipment);
  const selectedMuscles = new Set(input.muscleGroups);
  const seen = new Set<string>();
  const out: EligibleEntry[] = [];
  for (const exercise of pool) {
    if (!exercise || typeof exercise.id !== "string" || !exercise.id) continue;
    if (seen.has(exercise.id)) continue;
    if (!isEquipmentAllowed(exercise, selectedEquipment)) continue;
    const primaryMuscle = primaryCoveredMuscle(exercise, selectedMuscles);
    if (primaryMuscle === null) continue;
    seen.add(exercise.id);
    out.push({ exercise, primaryMuscle });
  }
  return out;
}

function toReplacementOption(entry: EligibleEntry): ReplacementOption {
  return {
    exerciseId: entry.exercise.id,
    name: entry.exercise.name,
    primaryMuscle: entry.primaryMuscle,
  };
}

/**
 * Equipment-eligible alternatives for a slot: other exercises covering the
 * SAME muscle, excluding any id already used in the workout. Drawn from the
 * pre-filtered `eligible` list, so every option is guaranteed equipment-legal.
 * Deterministic given the seed. Exposed so the UI can recompute a slot's pills
 * after the trainer swaps an exercise.
 */
export function computeReplacements(
  eligible: readonly EligibleEntry[],
  primaryMuscle: string,
  usedIds: ReadonlySet<string>,
  seed: number,
  limit: number = MAX_REPLACEMENTS,
): ReplacementOption[] {
  const rand = mulberry32(seed >>> 0);
  const candidates = eligible.filter(
    (e) => e.primaryMuscle === primaryMuscle && !usedIds.has(e.exercise.id),
  );
  return seededShuffle(candidates, rand).slice(0, limit).map(toReplacementOption);
}

/** Stable fallback seed derived from the input so identical inputs reproduce
 *  the same workout even when the caller doesn't pass an explicit seed. */
export function deriveSeed(input: GeneratorInput): number {
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) {
    return input.seed >>> 0;
  }
  const key = [
    [...input.equipment].sort().join(","),
    [...input.muscleGroups].sort().join(","),
    input.workoutType,
    input.volumeMode,
    input.exerciseCount ?? "",
    input.timeMinutes ?? "",
  ].join("|");
  return hashString(key);
}

/** Resolve how many exercises to generate from the volume input. Time budgets
 *  are converted to a count via the type preset's per-exercise estimate. */
export function resolveTargetCount(input: GeneratorInput): number {
  const preset = getWorkoutTypePreset(input.workoutType);
  let raw: number;
  if (input.volumeMode === "time") {
    const minutes =
      typeof input.timeMinutes === "number" && input.timeMinutes > 0
        ? input.timeMinutes
        : 40;
    const perExercise = estimateSecondsPerExercise(preset, "reps");
    raw = Math.round((minutes * 60) / Math.max(1, perExercise));
  } else {
    raw =
      typeof input.exerciseCount === "number" && input.exerciseCount > 0
        ? Math.round(input.exerciseCount)
        : 6;
  }
  return Math.max(1, Math.min(MAX_EXERCISES, raw));
}

function buildDefaultName(input: GeneratorInput): { en: string; es: string } {
  const preset = getWorkoutTypePreset(input.workoutType);
  if (input.focusLabel && input.focusLabel.en) {
    return {
      en: `${input.focusLabel.en} · ${preset.label.en}`,
      es: `${input.focusLabel.es || input.focusLabel.en} · ${preset.label.es}`,
    };
  }
  return { en: preset.label.en, es: preset.label.es };
}

/**
 * Round-robin selection across selected muscles. Walks the selected muscle
 * order repeatedly, taking the next (shuffled) candidate from each muscle's
 * bucket until the target count is reached or every bucket is exhausted.
 */
function selectExercises(
  eligible: readonly EligibleEntry[],
  selectedMuscleOrder: readonly string[],
  targetCount: number,
  seed: number,
  favoriteIds: ReadonlySet<string>,
): EligibleEntry[] {
  const rand = mulberry32(seed >>> 0);
  // Bucket candidates by primary muscle, shuffled deterministically. Within a
  // bucket, favorited exercises (#297) are floated ahead of the rest while
  // KEEPING the deterministic shuffled order inside each group — so the coach's
  // starred exercises are picked first, ties broken by the same seeded shuffle.
  const buckets = new Map<string, EligibleEntry[]>();
  for (const muscle of selectedMuscleOrder) {
    const inMuscle = eligible.filter((e) => e.primaryMuscle === muscle);
    if (inMuscle.length === 0) continue;
    const shuffled = seededShuffle(inMuscle, rand);
    if (favoriteIds.size > 0) {
      const favs = shuffled.filter((e) => favoriteIds.has(e.exercise.id));
      const rest = shuffled.filter((e) => !favoriteIds.has(e.exercise.id));
      buckets.set(muscle, [...favs, ...rest]);
    } else {
      buckets.set(muscle, shuffled);
    }
  }
  const musclesWithCandidates = selectedMuscleOrder.filter((m) =>
    buckets.has(m),
  );

  const chosen: EligibleEntry[] = [];
  const used = new Set<string>();
  let progressed = true;
  while (chosen.length < targetCount && progressed) {
    progressed = false;
    for (const muscle of musclesWithCandidates) {
      if (chosen.length >= targetCount) break;
      const bucket = buckets.get(muscle);
      if (!bucket || bucket.length === 0) continue;
      // Pop the next unused candidate from this muscle's bucket.
      let next: EligibleEntry | undefined;
      while (bucket.length > 0) {
        const candidate = bucket.shift()!;
        if (!used.has(candidate.exercise.id)) {
          next = candidate;
          break;
        }
      }
      if (!next) continue;
      used.add(next.exercise.id);
      chosen.push(next);
      progressed = true;
    }
  }
  return chosen;
}

/**
 * Generate a complete workout. Deterministic given (input, pool): the same
 * inputs always produce the same workout; bump `input.seed` to vary it.
 */
export function generateWorkout(
  input: GeneratorInput,
  pool: readonly GeneratorExercise[],
): GeneratedWorkout {
  const seed = deriveSeed(input);
  const preset = getWorkoutTypePreset(input.workoutType);
  const eligible = getEligibleExercises(pool, input);
  const targetCount = resolveTargetCount(input);

  const chosen = selectExercises(
    eligible,
    input.muscleGroups,
    targetCount,
    seed,
    new Set(input.favoriteExerciseIds ?? []),
  );

  const usedIds = new Set(chosen.map((c) => c.exercise.id));

  const exercises: GeneratedExercise[] = chosen.map((entry, index) => {
    const metric = effectiveMetric(entry.exercise);
    // Replacement seed is offset per-slot so two slots covering the same muscle
    // don't surface the identical shuffled order.
    const replacements = computeReplacements(
      eligible,
      entry.primaryMuscle,
      usedIds,
      (seed ^ ((index + 1) * 0x9e3779b1)) >>> 0,
    );
    return {
      exerciseId: entry.exercise.id,
      name: entry.exercise.name,
      primaryMuscle: entry.primaryMuscle,
      metric,
      sets: preset.sets,
      reps: metric === "time" ? 0 : preset.reps,
      rest_seconds: preset.rest_seconds,
      transition_rest_seconds: preset.transition_rest_seconds,
      ...(metric === "time" ? { durationSeconds: preset.durationSeconds } : {}),
      replacements,
    };
  });

  const estimatorInput: DurationEstimateExercise[] = exercises.map((e, idx) => ({
    exerciseId: e.exerciseId,
    sets: e.sets,
    reps: e.reps,
    rest_seconds: e.rest_seconds,
    transition_rest_seconds: e.transition_rest_seconds,
    order: idx + 1,
    metric: e.metric,
    durationSeconds: e.durationSeconds ?? null,
  }));

  return {
    name: buildDefaultName(input),
    exercises,
    estimatedDurationMinutes: estimateTemplateDurationMinutes(estimatorInput),
    requestedCount: targetCount,
    eligiblePoolSize: eligible.length,
  };
}

// shared-vector.test.ts
//
// #765/01 — the TypeScript third of the cross-platform generator vector.
//
// The workout generator now exists in THREE codebases: here (the original,
// #296), `GCFitnessCore/WorkoutGenerator/` on iOS, and
// `core/.../algorithms/workoutgenerator/` on Android. The apps must produce the
// SAME plan as this engine for the same input — the onboarding flow (#765)
// generates on-device, while a coach may preview the same shapes from the
// backoffice.
//
// This file asserts the exact numbers that `WorkoutGeneratorTests.swift` and
// `WorkoutGeneratorTest.kt` assert, case for case, from the same fixture pool.
// It is deliberately redundant with `engine.test.ts`: that suite tests the
// engine's BEHAVIOUR, this one pins its literal OUTPUT so a refactor here can't
// silently desync the two mobile ports.
//
// ⚠️ Changing any expected value here means the apps now disagree with the
// backoffice. If you intend that, all three files change in the SAME PR.
//
// "Shared vector = discipline, not JSON" — the house convention (see
// `OnboardingRouting` / `FreeTierGate`).

import { mulberry32, hashString, seededShuffle } from "../prng";
import {
  generateWorkout,
  deriveSeed,
  resolveTargetCount,
  inferAuxiliaryEquipment,
  isEquipmentAllowed,
  equipmentRequirements,
} from "../engine";
import {
  EQUIPMENT_GROUPS,
  expandEquipmentGroups,
  equipmentGroupsReferenceValidVocab,
} from "../equipment-groups";
import {
  MUSCLE_PRESETS,
  expandMusclePresets,
  musclePresetsReferenceValidVocab,
  muscleLabelsCoverVocab,
} from "../muscle-presets";
import { WORKOUT_TYPE_PRESETS, getWorkoutTypePreset } from "../workout-type-presets";
import type { GeneratorExercise, GeneratorInput } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures — verbatim twins of the Swift and Kotlin ones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliberately includes the two name-inference traps (a bench-implied press, a
 * pull-up tagged bodyweight-only) and an exercise with EMPTY equipment.
 */
const POOL: GeneratorExercise[] = [
  { id: "e1", name: { en: "Barbell Bench Press", es: "Press de banca con barra" }, muscleGroups: ["chest", "triceps"], equipment: ["barbell"] },
  { id: "e2", name: { en: "Push-up", es: "Flexiones" }, muscleGroups: ["chest", "triceps"], equipment: ["bodyweight"] },
  { id: "e3", name: { en: "Dumbbell Shoulder Press", es: "Press de hombros con mancuerna" }, muscleGroups: ["shoulders"], equipment: ["dumbbell"] },
  { id: "e4", name: { en: "Pull-up", es: "Dominada" }, muscleGroups: ["back", "biceps"], equipment: ["bodyweight"] },
  { id: "e5", name: { en: "Bodyweight Squat", es: "Sentadilla libre" }, muscleGroups: ["quadriceps", "glutes"], equipment: ["bodyweight"] },
  { id: "e6", name: { en: "Plank", es: "Plancha" }, muscleGroups: ["core", "abs"], equipment: ["bodyweight"], metric: "time" },
  { id: "e7", name: { en: "Dumbbell Incline Press", es: "Press inclinado con mancuerna" }, muscleGroups: ["chest"], equipment: ["dumbbell"] },
  { id: "e8", name: { en: "Cable Triceps Pushdown", es: "Extensión de tríceps en polea" }, muscleGroups: ["triceps"], equipment: ["cable"] },
  { id: "e9", name: { en: "Dumbbell Lateral Raise", es: "Elevación lateral con mancuerna" }, muscleGroups: ["shoulders"], equipment: ["dumbbell"] },
  { id: "e10", name: { en: "Glute Bridge", es: "Puente de glúteos" }, muscleGroups: ["glutes", "hamstrings"], equipment: [] },
];

const INPUTS: Record<string, GeneratorInput> = {
  ppl_push_gym: {
    equipment: expandEquipmentGroups(["full_gym"]),
    muscleGroups: expandMusclePresets(["push"]),
    volumeMode: "count",
    exerciseCount: 5,
    workoutType: "hypertrophy",
    focusLabel: { en: "Push", es: "Empuje" },
  },
  fullbody_home: {
    equipment: expandEquipmentGroups(["home"]),
    muscleGroups: expandMusclePresets(["full_body"]),
    volumeMode: "count",
    exerciseCount: 6,
    workoutType: "beginner",
    focusLabel: { en: "Full body", es: "Cuerpo completo" },
  },
  circuit_bodyweight: {
    equipment: expandEquipmentGroups(["bodyweight_only"]),
    muscleGroups: expandMusclePresets(["full_body"]),
    volumeMode: "count",
    exerciseCount: 4,
    workoutType: "circuit",
    focusLabel: { en: "Full body", es: "Cuerpo completo" },
  },
  time_budget: {
    equipment: expandEquipmentGroups(["full_gym"]),
    muscleGroups: expandMusclePresets(["upper"]),
    volumeMode: "time",
    timeMinutes: 45,
    workoutType: "hypertrophy",
  },
  explicit_seed: {
    equipment: expandEquipmentGroups(["free_weights"]),
    muscleGroups: expandMusclePresets(["legs"]),
    volumeMode: "count",
    exerciseCount: 3,
    workoutType: "strength",
    seed: 99,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRNG
// ─────────────────────────────────────────────────────────────────────────────

describe("shared vector — PRNG", () => {
  // The 2654435761 and 4294967295 seeds exist specifically to exercise the high
  // bit / full-width wrap. A Swift or Kotlin port that uses a signed 64-bit
  // integer instead of an explicitly-wrapping UInt32 diverges HERE and nowhere
  // else visible — it still generates a plausible workout, just a different one.
  const SEQUENCES: [number, number[]][] = [
    [0, [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086]],
    [1, [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849]],
    [42, [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423]],
    [2654435761, [0.5464560757391155, 0.45955629041418433, 0.2470416973810643, 0.5192999374121428, 0.8892884191591293]],
    [4294967295, [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677, 0.8452364315744489]],
  ];

  it.each(SEQUENCES)("mulberry32(%i) yields the locked sequence", (seed, expected) => {
    const rand = mulberry32(seed);
    expect(expected.map(() => rand())).toEqual(expected);
  });

  // "Sentadilla búlgara" is the load-bearing case: `charCodeAt` is UTF-16, so a
  // port that hashes UTF-8 bytes or unicode scalars still produces a hash, just
  // a different one — and every Spanish exercise name carries an accent, so the
  // seed would silently diverge in production while every ASCII case stayed
  // green.
  it("hashString matches the locked values", () => {
    expect(hashString("")).toBe(2166136261);
    expect(hashString("a")).toBe(3826002220);
    expect(hashString("hypertrophy")).toBe(1647428371);
    expect(hashString("bodyweight,pull_up_bar")).toBe(4220748506);
    expect(hashString("Sentadilla búlgara")).toBe(1343835969);
    expect(hashString("chest,shoulders,triceps|hypertrophy")).toBe(3296764011);
  });

  it("seededShuffle matches the locked orders", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(seededShuffle(items, mulberry32(0))).toEqual(["f", "c", "d", "e", "a", "b"]);
    expect(seededShuffle(items, mulberry32(7))).toEqual(["e", "b", "c", "d", "f", "a"]);
    expect(seededShuffle(items, mulberry32(12345))).toEqual(["a", "d", "c", "e", "b", "f"]);
  });

  // The engine threads ONE stream through every muscle bucket, so a spurious
  // draw on an empty bucket would shift every later bucket's order.
  it("a degenerate shuffle consumes no draws", () => {
    const rand = mulberry32(0);
    seededShuffle([], rand);
    seededShuffle(["only"], rand);
    expect(rand()).toBe(0.26642920868471265);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Catalogs
// ─────────────────────────────────────────────────────────────────────────────

describe("shared vector — catalogs", () => {
  it("equipment groups expand to the locked item lists", () => {
    expect(expandEquipmentGroups(["full_gym"])).toEqual([
      "barbell", "dumbbell", "cable", "machine", "bench", "smith", "pull_up_bar",
      "kettlebell", "discs", "rope", "medicine_ball", "swiss_ball", "bodyweight",
    ]);
    expect(expandEquipmentGroups(["free_weights"])).toEqual([
      "barbell", "dumbbell", "bench", "kettlebell", "discs", "bodyweight",
    ]);
    expect(expandEquipmentGroups(["home"])).toEqual([
      "bodyweight", "dumbbell", "resistance_band", "kettlebell",
    ]);
    expect(expandEquipmentGroups(["minimal"])).toEqual([
      "bodyweight", "dumbbell", "resistance_band",
    ]);
    expect(expandEquipmentGroups(["bodyweight_only"])).toEqual(["bodyweight", "pull_up_bar"]);
  });

  it("muscle presets expand to the locked muscle lists", () => {
    // ⚠️ ORDER is load-bearing: the engine round-robins in exactly this order,
    // so reordering a preset changes which exercises land in a short workout.
    expect(expandMusclePresets(["full_body"])).toEqual([
      "chest", "back", "shoulders", "quadriceps", "hamstrings", "glutes", "core",
    ]);
    expect(expandMusclePresets(["push"])).toEqual(["chest", "shoulders", "triceps"]);
    expect(expandMusclePresets(["pull"])).toEqual(["back", "biceps", "forearms"]);
    expect(expandMusclePresets(["legs"])).toEqual(["quadriceps", "hamstrings", "glutes", "calves"]);
    expect(expandMusclePresets(["upper"])).toEqual(["chest", "back", "shoulders", "biceps", "triceps"]);
    expect(expandMusclePresets(["lower"])).toEqual(["quadriceps", "hamstrings", "glutes", "calves"]);
    expect(expandMusclePresets(["arms"])).toEqual(["biceps", "triceps", "forearms"]);
    expect(expandMusclePresets(["core"])).toEqual(["abs", "core"]);
    expect(expandMusclePresets(["flexibility"])).toEqual(["flexibility"]);
  });

  // The mobile twins run this same assertion against THEIR `Vocabulary`. It is
  // what caught the `discs` / `smith` drift fixed alongside this vector: those
  // two ids lived only here for two months, so the mobile equipment filters and
  // exercise editor silently dropped them.
  it("catalogs only reference real vocabulary ids", () => {
    expect(equipmentGroupsReferenceValidVocab()).toBe(true);
    expect(musclePresetsReferenceValidVocab()).toBe(true);
    expect(muscleLabelsCoverVocab()).toBe(true);
  });

  it("an unknown group or preset expands to nothing", () => {
    expect(expandEquipmentGroups(["not_a_group"])).toEqual([]);
    expect(expandMusclePresets(["not_a_preset"])).toEqual([]);
  });

  // A preset outside these bounds builds a template the client happily
  // assembles and `firestore.rules` rejects — an opaque permission error at the
  // very end of onboarding.
  it("every workout-type preset is server-legal", () => {
    for (const preset of WORKOUT_TYPE_PRESETS) {
      expect(preset.sets).toBeGreaterThanOrEqual(1);
      expect(preset.sets).toBeLessThanOrEqual(10);
      expect(preset.reps).toBeGreaterThanOrEqual(0);
      expect(preset.reps).toBeLessThanOrEqual(50);
      expect(preset.rest_seconds).toBeGreaterThanOrEqual(0);
      expect(preset.rest_seconds).toBeLessThanOrEqual(600);
      expect(preset.transition_rest_seconds).toBeGreaterThanOrEqual(0);
      expect(preset.transition_rest_seconds).toBeLessThanOrEqual(600);
      expect(preset.durationSeconds).toBeGreaterThanOrEqual(5);
      expect(preset.durationSeconds).toBeLessThanOrEqual(1800);
    }
  });

  it("an unknown workout type falls back to hypertrophy", () => {
    expect(getWorkoutTypePreset("nope").id).toBe("hypertrophy");
  });

  it("the catalogs have the locked ids, so the ports can be enumerated", () => {
    expect(EQUIPMENT_GROUPS.map((g) => g.id)).toEqual([
      "full_gym", "free_weights", "home", "minimal", "bodyweight_only",
    ]);
    expect(MUSCLE_PRESETS.map((p) => p.id)).toEqual([
      "full_body", "push", "pull", "legs", "upper", "lower", "arms", "core", "flexibility",
    ]);
    expect(WORKOUT_TYPE_PRESETS.map((p) => p.id)).toEqual([
      "strength", "hypertrophy", "muscle_growth", "endurance", "beginner", "power", "circuit",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The hard equipment rule (#296)
// ─────────────────────────────────────────────────────────────────────────────

describe("shared vector — the hard equipment rule (#296)", () => {
  it("infers auxiliary equipment from the exercise name", () => {
    const expected: Record<string, string[]> = {
      e1: ["bench"],       // "Bench Press" / "banca"
      e2: [], e3: [],
      e4: ["pull_up_bar"], // "Pull-up" / "Dominada"
      e5: [], e6: [],
      e7: ["bench"],       // "Incline Press" / "inclinado"
      e8: [], e9: [], e10: [],
    };
    for (const ex of POOL) {
      expect(inferAuxiliaryEquipment(ex.name)).toEqual(expected[ex.id]);
    }
  });

  // The two deliberate non-matches. A floor press is bench-FREE, and a pulldown
  // is a cable machine — inferring a bar there would strip a full-gym user's
  // back work for no reason.
  it("a floor press and a pulldown infer nothing", () => {
    expect(inferAuxiliaryEquipment({ en: "Dumbbell Floor Press", es: "Press de suelo con mancuerna" })).toEqual([]);
    expect(inferAuxiliaryEquipment({ en: "Lat Pulldown", es: "Jalón al pecho" })).toEqual([]);
  });

  it("bodyweight-only excludes every loaded exercise", () => {
    const selected = new Set(expandEquipmentGroups(["bodyweight_only"]));
    const expected: Record<string, boolean> = {
      e1: false,  // barbell (+ inferred bench)
      e2: true,
      e3: false,  // dumbbell
      e4: true,   // bodyweight + inferred pull_up_bar, which IS in the group
      e5: true,
      e6: true,
      e7: false,  // dumbbell (+ inferred bench)
      e8: false,  // cable
      e9: false,  // dumbbell
      e10: true,  // EMPTY equipment normalizes to bodyweight
    };
    for (const ex of POOL) {
      expect(isEquipmentAllowed(ex, selected)).toBe(expected[ex.id]);
    }
  });

  // Structural, not a second check: replacements come from the same eligible
  // list, so no generated workout can offer an illegal swap.
  it("no generated exercise or replacement needs unselected equipment", () => {
    const selected = expandEquipmentGroups(["bodyweight_only"]);
    const selectedSet = new Set(selected);
    const workout = generateWorkout(
      {
        equipment: selected,
        muscleGroups: expandMusclePresets(["full_body"]),
        volumeMode: "count",
        exerciseCount: 10,
        workoutType: "circuit",
      },
      POOL,
    );
    const byId = new Map(POOL.map((e) => [e.id, e]));
    let checked = 0;
    for (const generated of workout.exercises) {
      for (const id of [generated.exerciseId, ...generated.replacements.map((r) => r.exerciseId)]) {
        expect(isEquipmentAllowed(byId.get(id)!, selectedSet)).toBe(true);
        checked += 1;
      }
    }
    // Guard against the test passing because nothing was generated at all.
    expect(checked).toBeGreaterThan(0);
  });

  // Empty must normalize to bodyweight, not to "needs nothing" — otherwise a
  // legacy untagged exercise would be eligible under EVERY selection.
  it("empty equipment normalizes to bodyweight", () => {
    const untagged = POOL.find((e) => e.id === "e10")!;
    expect(equipmentRequirements(untagged)).toEqual(["bodyweight"]);
    expect(isEquipmentAllowed(untagged, new Set(["barbell"]))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Seed & sizing
// ─────────────────────────────────────────────────────────────────────────────

describe("shared vector — seed derivation & sizing", () => {
  it("derives the locked seeds", () => {
    expect(deriveSeed(INPUTS.ppl_push_gym)).toBe(1368529693);
    expect(deriveSeed(INPUTS.fullbody_home)).toBe(335177257);
    expect(deriveSeed(INPUTS.circuit_bodyweight)).toBe(2157741227);
    expect(deriveSeed(INPUTS.time_budget)).toBe(4166878304);
    expect(deriveSeed(INPUTS.explicit_seed)).toBe(99);
  });

  it("resolves the locked target counts", () => {
    expect(resolveTargetCount(INPUTS.ppl_push_gym)).toBe(5);
    expect(resolveTargetCount(INPUTS.fullbody_home)).toBe(6);
    expect(resolveTargetCount(INPUTS.circuit_bodyweight)).toBe(4);
    expect(resolveTargetCount(INPUTS.time_budget)).toBe(4);
    expect(resolveTargetCount(INPUTS.explicit_seed)).toBe(3);
  });

  it("clamps sizing to the schema bounds", () => {
    const target = (exerciseCount?: number) =>
      resolveTargetCount({
        equipment: [], muscleGroups: [], volumeMode: "count",
        exerciseCount, workoutType: "hypertrophy",
      });
    expect(target(500)).toBe(30);
    expect(target(0)).toBe(6);   // non-positive → the default, not 1
    expect(target(-3)).toBe(6);
    expect(target(undefined)).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full generation vector
// ─────────────────────────────────────────────────────────────────────────────

interface ExpectedExercise {
  id: string;
  pm: string;
  metric: "reps" | "time";
  sets: number;
  reps: number;
  rest: number;
  trest: number;
  dur: number | null;
  repl: string[];
}

interface ExpectedWorkout {
  nameEn: string;
  nameEs: string;
  minutes: number;
  requestedCount: number;
  eligiblePoolSize: number;
  exercises: ExpectedExercise[];
}

const EXPECTED: Record<string, ExpectedWorkout> = {
  ppl_push_gym: {
    nameEn: "Push · Hypertrophy", nameEs: "Empuje · Hipertrofia",
    minutes: 49, requestedCount: 5, eligiblePoolSize: 6,
    exercises: [
      { id: "e7", pm: "chest", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: ["e2"] },
      { id: "e3", pm: "shoulders", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: [] },
      { id: "e8", pm: "triceps", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: [] },
      { id: "e1", pm: "chest", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: ["e2"] },
      { id: "e9", pm: "shoulders", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: [] },
    ],
  },
  fullbody_home: {
    nameEn: "Full body · Beginner", nameEs: "Cuerpo completo · Principiante",
    minutes: 46, requestedCount: 6, eligiblePoolSize: 6,
    exercises: [
      { id: "e2", pm: "chest", metric: "reps", sets: 3, reps: 12, rest: 75, trest: 60, dur: null, repl: [] },
      { id: "e3", pm: "shoulders", metric: "reps", sets: 3, reps: 12, rest: 75, trest: 60, dur: null, repl: [] },
      { id: "e5", pm: "quadriceps", metric: "reps", sets: 3, reps: 12, rest: 75, trest: 60, dur: null, repl: [] },
      { id: "e10", pm: "glutes", metric: "reps", sets: 3, reps: 12, rest: 75, trest: 60, dur: null, repl: [] },
      // The one time-based slot: reps collapse to 0 and the hold moves to
      // durationSeconds. A port that forgot this would prescribe "12 reps of plank".
      { id: "e6", pm: "core", metric: "time", sets: 3, reps: 0, rest: 75, trest: 60, dur: 30, repl: [] },
      { id: "e9", pm: "shoulders", metric: "reps", sets: 3, reps: 12, rest: 75, trest: 60, dur: null, repl: [] },
    ],
  },
  circuit_bodyweight: {
    nameEn: "Full body · Circuit", nameEs: "Cuerpo completo · Circuito",
    minutes: 24, requestedCount: 4, eligiblePoolSize: 5,
    exercises: [
      { id: "e2", pm: "chest", metric: "reps", sets: 3, reps: 15, rest: 30, trest: 20, dur: null, repl: [] },
      { id: "e4", pm: "back", metric: "reps", sets: 3, reps: 15, rest: 30, trest: 20, dur: null, repl: [] },
      { id: "e5", pm: "quadriceps", metric: "reps", sets: 3, reps: 15, rest: 30, trest: 20, dur: null, repl: [] },
      { id: "e10", pm: "glutes", metric: "reps", sets: 3, reps: 15, rest: 30, trest: 20, dur: null, repl: [] },
    ],
  },
  time_budget: {
    // No focusLabel → the name is the bare preset label.
    nameEn: "Hypertrophy", nameEs: "Hipertrofia",
    minutes: 40, requestedCount: 4, eligiblePoolSize: 7,
    exercises: [
      { id: "e2", pm: "chest", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: ["e7", "e1"] },
      { id: "e4", pm: "back", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: [] },
      { id: "e3", pm: "shoulders", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: ["e9"] },
      { id: "e8", pm: "triceps", metric: "reps", sets: 4, reps: 10, rest: 75, trest: 60, dur: null, repl: [] },
    ],
  },
  // Pool runs dry: 3 requested, only 2 eligible. The engine returns what it has
  // rather than padding — `requestedCount` vs `exercises.length` is how the UI
  // knows to say so.
  explicit_seed: {
    nameEn: "Strength", nameEs: "Fuerza",
    minutes: 39, requestedCount: 3, eligiblePoolSize: 2,
    exercises: [
      { id: "e5", pm: "quadriceps", metric: "reps", sets: 5, reps: 5, rest: 180, trest: 120, dur: null, repl: [] },
      { id: "e10", pm: "glutes", metric: "reps", sets: 5, reps: 5, rest: 180, trest: 120, dur: null, repl: [] },
    ],
  },
};

describe("shared vector — full generation", () => {
  it.each(Object.keys(EXPECTED))("%s generates the locked workout", (key) => {
    const want = EXPECTED[key];
    const got = generateWorkout(INPUTS[key], POOL);

    expect(got.name).toEqual({ en: want.nameEn, es: want.nameEs });
    expect(got.requestedCount).toBe(want.requestedCount);
    expect(got.eligiblePoolSize).toBe(want.eligiblePoolSize);
    expect(got.estimatedDurationMinutes).toBe(want.minutes);

    expect(
      got.exercises.map((e) => ({
        id: e.exerciseId,
        pm: e.primaryMuscle,
        metric: e.metric,
        sets: e.sets,
        reps: e.reps,
        rest: e.rest_seconds,
        trest: e.transition_rest_seconds,
        dur: e.durationSeconds ?? null,
        repl: e.replacements.map((r) => r.exerciseId),
      })),
    ).toEqual(want.exercises);
  });

  // The onboarding "generating" screen (#765/06) reaches this state whenever the
  // exercise-library fetch comes back empty.
  it("an empty pool produces an empty workout", () => {
    const workout = generateWorkout(INPUTS.ppl_push_gym, []);
    expect(workout.exercises).toEqual([]);
    expect(workout.eligiblePoolSize).toBe(0);
    expect(workout.estimatedDurationMinutes).toBe(0);
    expect(workout.requestedCount).toBe(5);
  });

  it("no selected muscles produces an empty workout", () => {
    const workout = generateWorkout(
      {
        equipment: expandEquipmentGroups(["full_gym"]),
        muscleGroups: [],
        volumeMode: "count",
        exerciseCount: 5,
        workoutType: "hypertrophy",
      },
      POOL,
    );
    expect(workout.exercises).toEqual([]);
  });

  it("duplicate pool entries are deduped", () => {
    const workout = generateWorkout(INPUTS.ppl_push_gym, [...POOL, ...POOL]);
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(workout.eligiblePoolSize).toBe(6);
  });

  it("the same input twice yields the same workout", () => {
    expect(generateWorkout(INPUTS.ppl_push_gym, POOL)).toEqual(
      generateWorkout(INPUTS.ppl_push_gym, POOL),
    );
  });
});

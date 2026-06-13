// engine.test.ts
//
// Exhaustive tests for the deterministic Workout Generator engine. The single
// most important guarantee (issue #296) is the EQUIPMENT RULE: an exercise
// requiring equipment the trainer didn't select must never appear in the
// generated workout NOR in any replacement pill. That rule gets the most
// coverage here.

import {
  computeReplacements,
  deriveSeed,
  effectiveEquipment,
  equipmentRequirements,
  generateWorkout,
  getEligibleExercises,
  inferAuxiliaryEquipment,
  isEquipmentAllowed,
  primaryCoveredMuscle,
  resolveTargetCount,
} from "@/lib/gc-fitness/workout-generator/engine";
import type {
  GeneratorExercise,
  GeneratorInput,
} from "@/lib/gc-fitness/workout-generator/types";

// ---------------------------------------------------------------------------
// Fixture pool — a small synthetic library covering several muscles/equipment.
// ---------------------------------------------------------------------------

function ex(
  id: string,
  muscleGroups: string[],
  equipment: string[],
  metric: "reps" | "time" = "reps",
): GeneratorExercise {
  return {
    id,
    name: { en: id, es: id },
    muscleGroups,
    equipment,
    metric,
  };
}

const POOL: GeneratorExercise[] = [
  // chest
  ex("bench-press-bb", ["chest", "triceps"], ["barbell", "bench"]),
  ex("bench-press-db", ["chest", "triceps"], ["dumbbell", "bench"]),
  ex("pushup", ["chest", "triceps"], ["bodyweight"]),
  ex("cable-fly", ["chest"], ["cable"]),
  // shoulders
  ex("ohp-bb", ["shoulders", "triceps"], ["barbell"]),
  ex("lateral-raise-db", ["shoulders"], ["dumbbell"]),
  ex("pike-pushup", ["shoulders"], ["bodyweight"]),
  // triceps
  ex("tricep-pushdown", ["triceps"], ["cable"]),
  ex("dips", ["triceps", "chest"], ["bodyweight", "pull_up_bar"]),
  // back
  ex("deadlift-bb", ["back", "hamstrings"], ["barbell"]),
  ex("pullup", ["back", "biceps"], ["bodyweight", "pull_up_bar"]),
  ex("row-db", ["back", "biceps"], ["dumbbell", "bench"]),
  // biceps
  ex("curl-db", ["biceps"], ["dumbbell"]),
  ex("curl-bb", ["biceps"], ["barbell"]),
  // legs
  ex("squat-bb", ["quadriceps", "glutes"], ["barbell"]),
  ex("goblet-squat", ["quadriceps", "glutes"], ["dumbbell"]),
  ex("air-squat", ["quadriceps", "glutes"], ["bodyweight"]),
  ex("lunge-db", ["quadriceps", "glutes", "hamstrings"], ["dumbbell"]),
  // core (time-based)
  ex("plank", ["core", "abs"], ["bodyweight"], "time"),
  ex("hollow-hold", ["core", "abs"], ["bodyweight"], "time"),
];

function input(overrides: Partial<GeneratorInput>): GeneratorInput {
  return {
    equipment: ["bodyweight"],
    muscleGroups: ["chest"],
    volumeMode: "count",
    exerciseCount: 4,
    workoutType: "hypertrophy",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// equipmentRequirements + isEquipmentAllowed
// ---------------------------------------------------------------------------

describe("equipmentRequirements", () => {
  it("normalizes an empty equipment list to ['bodyweight']", () => {
    expect(equipmentRequirements(ex("x", ["chest"], []))).toEqual(["bodyweight"]);
  });
  it("drops empty-string entries then falls back to bodyweight", () => {
    expect(equipmentRequirements(ex("x", ["chest"], [""]))).toEqual(["bodyweight"]);
  });
  it("passes real requirements through unchanged", () => {
    expect(equipmentRequirements(ex("x", ["chest"], ["barbell", "bench"]))).toEqual([
      "barbell",
      "bench",
    ]);
  });
});

describe("inferAuxiliaryEquipment (name-based bench inference)", () => {
  it("infers a bench for bench/incline/decline/preacher movements (ES)", () => {
    expect(inferAuxiliaryEquipment({ en: "", es: "Press de banca (Mancuerna)" })).toEqual(["bench"]);
    expect(inferAuxiliaryEquipment({ en: "", es: "Press de banca inclinado (Mancuerna)" })).toEqual([
      "bench",
    ]);
    expect(inferAuxiliaryEquipment({ en: "", es: "Curl inclinado (Mancuerna)" })).toEqual(["bench"]);
    expect(inferAuxiliaryEquipment({ en: "", es: "Curl predicador (Mancuerna)" })).toEqual(["bench"]);
  });

  it("infers a bench for English names too", () => {
    expect(inferAuxiliaryEquipment({ en: "Incline Bench Press", es: "" })).toEqual(["bench"]);
    expect(inferAuxiliaryEquipment({ en: "Preacher Curl", es: "" })).toEqual(["bench"]);
  });

  it("does NOT infer a bench for a floor press ('press de suelo')", () => {
    expect(inferAuxiliaryEquipment({ en: "", es: "Press de suelo (Mancuerna)" })).toEqual([]);
    expect(inferAuxiliaryEquipment({ en: "Floor press", es: "" })).toEqual([]);
  });

  it("does NOT infer a bench for ordinary dumbbell movements", () => {
    expect(inferAuxiliaryEquipment({ en: "", es: "Curl con mancuerna (Mancuerna)" })).toEqual([]);
    expect(inferAuxiliaryEquipment({ en: "", es: "Curl martillo (Mancuerna)" })).toEqual([]);
  });

  it("effectiveEquipment merges tagged implement + inferred bench", () => {
    const inclinePress = ex("p", ["chest"], ["dumbbell"]);
    inclinePress.name = { en: "", es: "Press de banca inclinado (Mancuerna)" };
    expect(effectiveEquipment(inclinePress).sort()).toEqual(["bench", "dumbbell"]);
  });
});

describe("isEquipmentAllowed (THE rule)", () => {
  it("allows an exercise when all its equipment is selected", () => {
    const allowed = isEquipmentAllowed(
      ex("x", ["chest"], ["dumbbell", "bench"]),
      new Set(["dumbbell", "bench"]),
    );
    expect(allowed).toBe(true);
  });

  it("rejects an exercise when ANY required equipment is missing", () => {
    const allowed = isEquipmentAllowed(
      ex("x", ["chest"], ["dumbbell", "bench"]),
      new Set(["dumbbell"]), // no bench
    );
    expect(allowed).toBe(false);
  });

  it("rejects a barbell exercise when barbell is not selected", () => {
    expect(
      isEquipmentAllowed(ex("x", ["chest"], ["barbell"]), new Set(["dumbbell", "bench"])),
    ).toBe(false);
  });

  it("treats 'none' as always available", () => {
    expect(isEquipmentAllowed(ex("x", ["core"], ["none"]), new Set())).toBe(true);
  });

  it("requires 'bodyweight' to be explicitly selected", () => {
    expect(isEquipmentAllowed(ex("x", ["chest"], ["bodyweight"]), new Set())).toBe(false);
    expect(
      isEquipmentAllowed(ex("x", ["chest"], ["bodyweight"]), new Set(["bodyweight"])),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// primaryCoveredMuscle
// ---------------------------------------------------------------------------

describe("primaryCoveredMuscle", () => {
  it("returns the first selected muscle the exercise covers", () => {
    expect(
      primaryCoveredMuscle(ex("x", ["triceps", "chest"], []), new Set(["chest"])),
    ).toBe("chest");
  });
  it("respects primary→secondary ordering", () => {
    expect(
      primaryCoveredMuscle(ex("x", ["chest", "triceps"], []), new Set(["chest", "triceps"])),
    ).toBe("chest");
  });
  it("returns null when no muscle matches", () => {
    expect(primaryCoveredMuscle(ex("x", ["chest"], []), new Set(["back"]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getEligibleExercises
// ---------------------------------------------------------------------------

describe("getEligibleExercises", () => {
  it("returns only exercises passing both equipment and muscle filters", () => {
    const eligible = getEligibleExercises(POOL, {
      equipment: ["bodyweight"],
      muscleGroups: ["chest"],
    });
    const ids = eligible.map((e) => e.exercise.id);
    expect(ids).toContain("pushup");
    expect(ids).not.toContain("bench-press-bb"); // needs barbell+bench
    expect(ids).not.toContain("cable-fly"); // needs cable
  });

  it("excludes barbell exercises entirely when barbell is unselected", () => {
    const eligible = getEligibleExercises(POOL, {
      equipment: ["dumbbell", "bench", "bodyweight", "cable", "pull_up_bar"],
      muscleGroups: ["chest", "shoulders", "triceps", "back", "biceps", "quadriceps"],
    });
    for (const e of eligible) {
      expect(e.exercise.equipment).not.toContain("barbell");
    }
  });

  it("dedupes by id", () => {
    const dupePool = [POOL[0], POOL[0], POOL[2]];
    const eligible = getEligibleExercises(dupePool, {
      equipment: ["barbell", "bench", "bodyweight"],
      muscleGroups: ["chest"],
    });
    expect(eligible.filter((e) => e.exercise.id === "bench-press-bb")).toHaveLength(1);
  });

  it("ignores malformed rows (no id)", () => {
    const messyPool = [
      { ...ex("good", ["chest"], ["bodyweight"]) },
      { ...ex("", ["chest"], ["bodyweight"]) },
    ];
    const eligible = getEligibleExercises(messyPool, {
      equipment: ["bodyweight"],
      muscleGroups: ["chest"],
    });
    expect(eligible.map((e) => e.exercise.id)).toEqual(["good"]);
  });
});

// ---------------------------------------------------------------------------
// resolveTargetCount
// ---------------------------------------------------------------------------

describe("resolveTargetCount", () => {
  it("uses the explicit count, clamped to 1..30", () => {
    expect(resolveTargetCount(input({ volumeMode: "count", exerciseCount: 8 }))).toBe(8);
    expect(resolveTargetCount(input({ volumeMode: "count", exerciseCount: 99 }))).toBe(30);
    expect(resolveTargetCount(input({ volumeMode: "count", exerciseCount: 0 }))).toBe(6);
  });

  it("derives a count from a time budget (more time → more exercises)", () => {
    const short = resolveTargetCount(input({ volumeMode: "time", timeMinutes: 20 }));
    const long = resolveTargetCount(input({ volumeMode: "time", timeMinutes: 60 }));
    expect(short).toBeGreaterThanOrEqual(1);
    expect(long).toBeGreaterThan(short);
  });
});

// ---------------------------------------------------------------------------
// generateWorkout — equipment rule end-to-end
// ---------------------------------------------------------------------------

describe("generateWorkout — equipment rule", () => {
  const fullMuscles = [
    "chest",
    "shoulders",
    "triceps",
    "back",
    "biceps",
    "quadriceps",
    "glutes",
    "hamstrings",
    "core",
    "abs",
  ];

  it("NEVER includes a barbell exercise when barbell is unselected (workout + replacements)", () => {
    const workout = generateWorkout(
      input({
        equipment: ["dumbbell", "bench", "bodyweight", "cable", "pull_up_bar", "resistance_band"],
        muscleGroups: fullMuscles,
        exerciseCount: 30,
      }),
      POOL,
    );
    const barbellIds = new Set(
      POOL.filter((e) => e.equipment.includes("barbell")).map((e) => e.id),
    );
    for (const slot of workout.exercises) {
      expect(barbellIds.has(slot.exerciseId)).toBe(false);
      for (const rep of slot.replacements) {
        expect(barbellIds.has(rep.exerciseId)).toBe(false);
      }
    }
  });

  it("bodyweight-only selection yields only bodyweight-eligible exercises", () => {
    const workout = generateWorkout(
      input({ equipment: ["bodyweight"], muscleGroups: fullMuscles, exerciseCount: 30 }),
      POOL,
    );
    const byId = new Map(POOL.map((e) => [e.id, e]));
    for (const slot of workout.exercises) {
      const source = byId.get(slot.exerciseId)!;
      expect(equipmentRequirements(source).every((r) => r === "bodyweight")).toBe(true);
    }
    // pull_up_bar exercises (dips/pullup) excluded since the bar wasn't selected.
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("dips");
    expect(ids).not.toContain("pullup");
  });

  it("dumbbell-only (no bench) excludes incline/bench dumbbell exercises", () => {
    // Mirrors the real standard-library data: every doc tags ONLY its implement
    // (dumbbell), the bench is implied by the name.
    const libraryLike: GeneratorExercise[] = [
      { id: "curl", name: { en: "", es: "Curl con mancuerna (Mancuerna)" }, muscleGroups: ["biceps"], equipment: ["dumbbell"] },
      { id: "incline-curl", name: { en: "", es: "Curl inclinado (Mancuerna)" }, muscleGroups: ["biceps"], equipment: ["dumbbell"] },
      { id: "bench-press", name: { en: "", es: "Press de banca (Mancuerna)" }, muscleGroups: ["chest"], equipment: ["dumbbell"] },
      { id: "floor-press", name: { en: "", es: "Press de suelo (Mancuerna)" }, muscleGroups: ["chest"], equipment: ["dumbbell"] },
    ];
    const dumbbellOnly = getEligibleExercises(libraryLike, {
      equipment: ["dumbbell"],
      muscleGroups: ["biceps", "chest"],
    }).map((e) => e.exercise.id);
    expect(dumbbellOnly).toContain("curl");
    expect(dumbbellOnly).toContain("floor-press"); // floor press needs no bench
    expect(dumbbellOnly).not.toContain("incline-curl");
    expect(dumbbellOnly).not.toContain("bench-press");

    // Add a bench → the bench exercises become eligible again.
    const withBench = getEligibleExercises(libraryLike, {
      equipment: ["dumbbell", "bench"],
      muscleGroups: ["biceps", "chest"],
    }).map((e) => e.exercise.id);
    expect(withBench).toEqual(
      expect.arrayContaining(["curl", "incline-curl", "bench-press", "floor-press"]),
    );
  });

  it("every replacement is itself equipment-eligible", () => {
    const selected = new Set(["dumbbell", "bench", "bodyweight"]);
    const byId = new Map(POOL.map((e) => [e.id, e]));
    const workout = generateWorkout(
      input({
        equipment: [...selected],
        muscleGroups: fullMuscles,
        exerciseCount: 12,
      }),
      POOL,
    );
    for (const slot of workout.exercises) {
      for (const rep of slot.replacements) {
        const source = byId.get(rep.exerciseId)!;
        expect(isEquipmentAllowed(source, selected)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// generateWorkout — selection behavior
// ---------------------------------------------------------------------------

describe("generateWorkout — selection", () => {
  it("never picks the same exercise twice", () => {
    const workout = generateWorkout(
      input({
        equipment: ["bodyweight", "dumbbell", "bench", "barbell", "cable", "pull_up_bar"],
        muscleGroups: ["chest", "shoulders", "triceps"],
        exerciseCount: 10,
      }),
      POOL,
    );
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spreads across selected muscles (round-robin), not all from one", () => {
    const workout = generateWorkout(
      input({
        equipment: ["barbell", "dumbbell", "bench", "bodyweight", "cable", "pull_up_bar"],
        muscleGroups: ["chest", "shoulders", "triceps"],
        exerciseCount: 3,
      }),
      POOL,
    );
    const muscles = workout.exercises.map((e) => e.primaryMuscle);
    // With 3 slots across 3 muscles each gets one.
    expect(new Set(muscles)).toEqual(new Set(["chest", "shoulders", "triceps"]));
  });

  it("returns fewer than requested when the pool is too small (no repeats)", () => {
    const workout = generateWorkout(
      input({ equipment: ["bodyweight"], muscleGroups: ["chest"], exerciseCount: 20 }),
      POOL,
    );
    // Only pushup is chest+bodyweight (dips needs pull_up_bar).
    expect(workout.exercises).toHaveLength(1);
    expect(workout.exercises[0].exerciseId).toBe("pushup");
    expect(workout.eligiblePoolSize).toBe(1);
    expect(workout.requestedCount).toBe(20);
  });

  it("produces an empty workout when nothing matches", () => {
    const workout = generateWorkout(
      input({ equipment: ["machine"], muscleGroups: ["calves"], exerciseCount: 5 }),
      POOL,
    );
    expect(workout.exercises).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateWorkout — prescription from workout type
// ---------------------------------------------------------------------------

describe("generateWorkout — prescription", () => {
  it("stamps the workout-type preset onto each exercise", () => {
    const workout = generateWorkout(
      input({ equipment: ["bodyweight"], muscleGroups: ["chest"], workoutType: "strength" }),
      POOL,
    );
    const slot = workout.exercises[0];
    expect(slot.sets).toBe(5);
    expect(slot.reps).toBe(5);
    expect(slot.rest_seconds).toBe(180);
  });

  it("marks time-based exercises with metric 'time' + a durationSeconds", () => {
    const workout = generateWorkout(
      input({ equipment: ["bodyweight"], muscleGroups: ["core"], workoutType: "hypertrophy" }),
      POOL,
    );
    const plank = workout.exercises.find((e) => e.exerciseId === "plank");
    expect(plank).toBeDefined();
    expect(plank!.metric).toBe("time");
    expect(plank!.durationSeconds).toBe(40);
    expect(plank!.reps).toBe(0);
  });

  it("computes a positive estimated duration", () => {
    const workout = generateWorkout(
      input({
        equipment: ["bodyweight", "dumbbell", "bench"],
        muscleGroups: ["chest", "shoulders"],
        exerciseCount: 4,
      }),
      POOL,
    );
    expect(workout.estimatedDurationMinutes).toBeGreaterThan(0);
  });

  it("builds a default name from focus label + type", () => {
    const workout = generateWorkout(
      input({
        equipment: ["bodyweight"],
        muscleGroups: ["chest"],
        workoutType: "hypertrophy",
        focusLabel: { en: "Push", es: "Empuje" },
      }),
      POOL,
    );
    expect(workout.name.en).toBe("Push · Hypertrophy");
    expect(workout.name.es).toBe("Empuje · Hipertrofia");
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("generateWorkout — determinism", () => {
  const base = input({
    equipment: ["barbell", "dumbbell", "bench", "bodyweight", "cable", "pull_up_bar"],
    muscleGroups: ["chest", "shoulders", "triceps", "back"],
    exerciseCount: 6,
  });

  it("same input → identical workout", () => {
    const a = generateWorkout(base, POOL);
    const b = generateWorkout(base, POOL);
    expect(a.exercises.map((e) => e.exerciseId)).toEqual(b.exercises.map((e) => e.exerciseId));
  });

  it("same explicit seed → identical, different seed → may differ", () => {
    const a = generateWorkout({ ...base, seed: 1 }, POOL);
    const b = generateWorkout({ ...base, seed: 1 }, POOL);
    const c = generateWorkout({ ...base, seed: 999 }, POOL);
    expect(a.exercises.map((e) => e.exerciseId)).toEqual(b.exercises.map((e) => e.exerciseId));
    // Not a hard guarantee for all seeds, but with this pool seed 1 vs 999 differ.
    expect(c.exercises.map((e) => e.exerciseId)).not.toEqual(
      a.exercises.map((e) => e.exerciseId),
    );
  });

  it("deriveSeed is stable for the same input and order-independent on lists", () => {
    const s1 = deriveSeed(
      input({ equipment: ["a", "b"], muscleGroups: ["chest", "back"] }),
    );
    const s2 = deriveSeed(
      input({ equipment: ["b", "a"], muscleGroups: ["back", "chest"] }),
    );
    expect(s1).toBe(s2);
  });
});

// ---------------------------------------------------------------------------
// computeReplacements — swap semantics
// ---------------------------------------------------------------------------

describe("computeReplacements", () => {
  const eligible = getEligibleExercises(POOL, {
    equipment: ["barbell", "dumbbell", "bench", "bodyweight", "cable", "pull_up_bar"],
    muscleGroups: ["chest"],
  });

  it("returns only same-muscle candidates not already used", () => {
    const used = new Set(["pushup"]);
    const reps = computeReplacements(eligible, "chest", used, 7);
    expect(reps.every((r) => r.primaryMuscle === "chest")).toBe(true);
    expect(reps.map((r) => r.exerciseId)).not.toContain("pushup");
  });

  it("excludes everything currently in the workout", () => {
    const used = new Set(eligible.map((e) => e.exercise.id));
    expect(computeReplacements(eligible, "chest", used, 1)).toHaveLength(0);
  });

  it("recomputing after a swap drops the newly-used exercise and re-offers the old", () => {
    // Slot currently shows pushup; replacements offer cable-fly etc.
    const before = computeReplacements(eligible, "chest", new Set(["pushup"]), 3);
    expect(before.map((r) => r.exerciseId)).toContain("cable-fly");
    // Swap pushup → cable-fly. Recompute: cable-fly now used, pushup free again.
    const after = computeReplacements(eligible, "chest", new Set(["cable-fly"]), 3);
    expect(after.map((r) => r.exerciseId)).toContain("pushup");
    expect(after.map((r) => r.exerciseId)).not.toContain("cable-fly");
  });

  it("respects the limit", () => {
    expect(computeReplacements(eligible, "chest", new Set(), 1, 2)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// generateWorkout — favorites preference (#297)
// ---------------------------------------------------------------------------

describe("generateWorkout — favorites preference (#297)", () => {
  // core has TWO equally-eligible bodyweight candidates (plank, hollow-hold),
  // so the single picked exercise is decided by the seeded shuffle — unless a
  // favorite tips it. Asserting BOTH directions proves the favorite wins
  // regardless of which one the shuffle would have chosen.
  const coreInput = (favoriteExerciseIds?: string[]): GeneratorInput =>
    input({
      equipment: ["bodyweight"],
      muscleGroups: ["core"],
      exerciseCount: 1,
      favoriteExerciseIds,
    });

  it("picks the favorited exercise over an equally-eligible non-favorite", () => {
    const withPlank = generateWorkout(coreInput(["plank"]), POOL);
    expect(withPlank.exercises.map((e) => e.exerciseId)).toEqual(["plank"]);

    const withHollow = generateWorkout(coreInput(["hollow-hold"]), POOL);
    expect(withHollow.exercises.map((e) => e.exerciseId)).toEqual([
      "hollow-hold",
    ]);
  });

  it("never overrides the hard equipment rule — a favorite needing absent equipment stays excluded", () => {
    // Favorite a barbell+bench chest press while only bodyweight is selected.
    // The only eligible bodyweight chest exercise is pushup; the favorite must
    // NOT appear.
    const workout = generateWorkout(
      input({
        equipment: ["bodyweight"],
        muscleGroups: ["chest"],
        exerciseCount: 1,
        favoriteExerciseIds: ["bench-press-bb"],
      }),
      POOL,
    );
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("bench-press-bb");
    expect(ids).toEqual(["pushup"]);
  });

  it("is a no-op when no favorites are supplied (back-compat)", () => {
    const a = generateWorkout(coreInput(), POOL);
    const b = generateWorkout(coreInput([]), POOL);
    expect(a.exercises.map((e) => e.exerciseId)).toEqual(
      b.exercises.map((e) => e.exerciseId),
    );
  });
});

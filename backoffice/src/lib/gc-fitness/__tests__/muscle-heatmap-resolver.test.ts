import { isMuscleGroup, MUSCLE_GROUPS } from "../exercise-vocabulary";
import {
  normalizeMuscleTag,
  muscleRegionsForTag,
  OUT_OF_VOCABULARY_MUSCLE_ALIASES,
} from "../muscle-heatmap-mapping";
import {
  heatmapWeightFor,
  resolveExerciseHeatmap,
  type MuscleHeatmapExercise,
} from "../muscle-heatmap-resolver";
import { MUSCLE_MAP_REGIONS, type MuscleMapRegion } from "../muscle-map-region";

/**
 * #1069 (épica #1067) — twin exacto de `MuscleHeatmapResolverTests.swift` y
 * `MuscleHeatmapResolverTest.kt`: MISMOS vectores, MISMOS nombres.
 */

function ex(
  muscleGroups: string[],
  primaryMuscleGroup: string | null = null,
  secondaryMuscles: string[] = [],
): MuscleHeatmapExercise {
  return { muscleGroups, primaryMuscleGroup, secondaryMuscles };
}

function lit(exercise: MuscleHeatmapExercise): MuscleMapRegion[] {
  return (Object.keys(resolveExerciseHeatmap(exercise).levels) as MuscleMapRegion[]).sort();
}

describe("muscle heatmap resolver — D-05: two levels only when the data distinguishes", () => {
  it("gives two levels for an explicit primary plus other groups", () => {
    const h = resolveExerciseHeatmap(ex(["chest", "triceps", "shoulders"], "chest"));

    expect(h.legend).toBe("primarySecondary");
    expect(h.levels.chest).toBe("primary");
    expect(h.levels.triceps).toBe("secondary");
    expect(h.levels.shoulders).toBe("secondary");
    expect(h.isApproximate).toBe(false);
    expect(h.hasNoRegions).toBe(false);
  });

  it("gives ONE level with no primary and no secondaryMuscles, not all-primary", () => {
    // El 40 % de la biblioteca. Con la regla ingenua esto se pinta ENTERO en rojo.
    const h = resolveExerciseHeatmap(ex(["biceps", "forearms"]));

    expect(h.legend).toBe("singleLevel");
    expect(Object.values(h.levels).every((l) => l === "single")).toBe(true);
  });

  it("falls back to one level on the #529 vector — a heuristic that swallows EVERY group", () => {
    // Un ejercicio de pierna que repite su propio motor principal dentro de
    // `secondaryMuscles`.
    const h = resolveExerciseHeatmap(
      ex(["quadriceps", "glutes"], null, ["Quadriceps femoris", "Gluteus maximus"]),
    );

    expect(h.legend).toBe("singleLevel");
    expect(h.levels.quadriceps).toBe("single");
    expect(h.levels.glutes).toBe("single");
  });

  it("still separates when the heuristic leaves a primary standing", () => {
    const h = resolveExerciseHeatmap(ex(["chest", "triceps"], null, ["Triceps brachii"]));

    expect(h.legend).toBe("primarySecondary");
    expect(h.levels.chest).toBe("primary");
    expect(h.levels.triceps).toBe("secondary");
  });

  it("gives one level when the primary covers every region, not a lying legend", () => {
    const h = resolveExerciseHeatmap(ex(["chest"], "chest"));

    expect(h.legend).toBe("singleLevel");
    expect(h.levels.chest).toBe("single");
  });
});

describe("muscle heatmap resolver — D-04: legs / arms with no company", () => {
  it("paints the whole limb for legs alone and flags it approximate", () => {
    expect(lit(ex(["legs"]))).toEqual(
      ["adductors", "calves", "glutes", "hamstrings", "quadriceps"],
    );
    expect(resolveExerciseHeatmap(ex(["legs"])).isApproximate).toBe(true);
    expect(resolveExerciseHeatmap(ex(["legs"])).legend).toBe("singleLevel");
  });

  it("paints biceps, triceps and forearms for arms alone and flags it approximate", () => {
    expect(lit(ex(["arms"]))).toEqual(["biceps", "forearms", "triceps"]);
    expect(resolveExerciseHeatmap(ex(["arms"])).isApproximate).toBe(true);
  });

  it("is no longer approximate once a fine tag is present", () => {
    // Hay una señal fina, así que la pastilla "Aproximado" mentiría.
    expect(resolveExerciseHeatmap(ex(["legs", "quadriceps"])).isApproximate).toBe(false);
  });

  it("paints every region for full_body and flags it approximate", () => {
    const h = resolveExerciseHeatmap(ex(["full_body"]));

    expect(Object.keys(h.levels)).toHaveLength(MUSCLE_MAP_REGIONS.length);
    expect(h.isApproximate).toBe(true);
  });
});

describe("muscle heatmap resolver — nothing lit", () => {
  it("lights NOTHING for cardio and flexibility — never everything", () => {
    for (const tag of ["cardio", "flexibility"]) {
      const h = resolveExerciseHeatmap(ex([tag]));

      expect(`${tag}:${h.hasNoRegions}`).toBe(`${tag}:true`);
      expect(Object.keys(h.levels)).toHaveLength(0);
      expect(h.isApproximate).toBe(false);
    }
  });

  it("lights nothing for an empty tag list", () => {
    expect(resolveExerciseHeatmap(ex([])).hasNoRegions).toBe(true);
  });
});

describe("muscle heatmap resolver — D-06: the four out-of-vocabulary tags", () => {
  it("resolves middle back — WITH A SPACE — to the back", () => {
    // Un normalizador que sólo baje a minúsculas deja pasar el espacio y el
    // ejercicio se pinta apagado sin que nada falle.
    expect(lit(ex(["middle back"]))).toEqual(["lower_back", "trapezius", "upper_back"]);
    expect(resolveExerciseHeatmap(ex(["middle back"])).hasNoRegions).toBe(false);
  });

  it("resolves Lats in mixed case to the back", () => {
    expect(lit(ex(["Lats"]))).toEqual(["lower_back", "trapezius", "upper_back"]);
  });

  it("resolves traps and abdominals too", () => {
    expect(lit(ex(["traps"]))).toEqual(["lower_back", "trapezius", "upper_back"]);
    expect(lit(ex(["abdominals"]))).toEqual(["abs"]);
  });

  it("resolves every alias to a real vocabulary tag that paints the same", () => {
    // El alias tiene que aterrizar en un tag del vocabulario y pintar
    // exactamente como él: si no, un documento que el backfill normalice se
    // dibujaría distinto que antes de la migración, sin que nadie lo decida.
    for (const [alias, canonical] of Object.entries(OUT_OF_VOCABULARY_MUSCLE_ALIASES)) {
      expect(`${alias}:${isMuscleGroup(canonical)}`).toBe(`${alias}:true`);
      expect(lit(ex([alias]))).toEqual(lit(ex([canonical])));
    }
  });
});

describe("muscle heatmap resolver — robustness", () => {
  it("ignores an unknown tag without taking the rest down", () => {
    expect(lit(ex(["pectorals", "chest"]))).toEqual(["chest"]);
    expect(resolveExerciseHeatmap(ex(["pectorals", "chest"])).hasNoRegions).toBe(false);
  });

  it("lights abs, obliques AND the lower back for core — not just abs", () => {
    expect(lit(ex(["core"]))).toEqual(["abs", "lower_back", "obliques"]);
  });

  it("keeps the higher level for a region lit by BOTH a primary and a secondary tag", () => {
    // Solapamiento REAL: la espalda baja la encienden `core` y `back`.
    const h = resolveExerciseHeatmap(ex(["core", "back"], "core"));

    expect(h.levels.abs).toBe("primary");
    expect(h.levels.obliques).toBe("primary");
    expect(h.levels.lower_back).toBe("primary");
    expect(h.levels.upper_back).toBe("secondary");
    expect(h.levels.trapezius).toBe("secondary");
  });

  it("resolves the same overlap the same way through the anatomy heuristic", () => {
    const h = resolveExerciseHeatmap(ex(["core", "back"], null, ["Erector spinae"]));

    expect(h.legend).toBe("primarySecondary");
    expect(h.levels.lower_back).toBe("primary");
    expect(h.levels.upper_back).toBe("secondary");
    expect(h.levels.trapezius).toBe("secondary");
  });

  it("falls through to the heuristic when primaryMuscleGroup is unmappable", () => {
    const h = resolveExerciseHeatmap(ex(["chest", "triceps"], "cardio", ["Triceps brachii"]));

    expect(h.levels.chest).toBe("primary");
    expect(h.levels.triceps).toBe("secondary");
  });
});

describe("muscle heatmap resolver — weights", () => {
  it("weighs single level 1.0, never 0.5", () => {
    // Sin jerarquía, inventar un 0.5 sería inventar dos veces.
    const h = resolveExerciseHeatmap(ex(["biceps", "forearms"]));

    expect(heatmapWeightFor(h, "biceps")).toBe(1.0);
    expect(heatmapWeightFor(h, "forearms")).toBe(1.0);
    expect(heatmapWeightFor(h, "chest")).toBe(0.0);
  });

  it("weighs secondary 0.5", () => {
    const h = resolveExerciseHeatmap(ex(["chest", "triceps"], "chest"));

    expect(heatmapWeightFor(h, "chest")).toBe(1.0);
    expect(heatmapWeightFor(h, "triceps")).toBe(0.5);
  });
});

describe("muscle heatmap resolver — normalization", () => {
  it("trims, lowercases and collapses whitespace runs", () => {
    expect(normalizeMuscleTag("  Middle   Back \n")).toBe("middle_back");
    expect(normalizeMuscleTag("CHEST")).toBe("chest");
    expect(normalizeMuscleTag("full_body")).toBe("full_body");
  });

  it("maps every vocabulary muscle group on purpose", () => {
    // Un tag del vocabulario sin entrada en la tabla se pintaría apagado en
    // silencio. Los únicos dos que mapean a nada lo hacen a propósito.
    const deliberatelyEmpty = new Set(["cardio", "flexibility"]);
    for (const tag of MUSCLE_GROUPS) {
      const regions = muscleRegionsForTag(tag);
      expect(`${tag}:${regions.length > 0}`).toBe(`${tag}:${!deliberatelyEmpty.has(tag)}`);
    }
  });
});

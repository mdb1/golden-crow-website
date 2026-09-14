import {
  aggregateWorkoutHeatmap,
  heatmapIntensity,
  heatmapStep,
  type MuscleHeatmapSet,
} from "../muscle-heatmap-aggregator";
import type { MuscleHeatmapExercise } from "../muscle-heatmap-resolver";
import { MUSCLE_MAP_REGIONS } from "../muscle-map-region";

/**
 * #1069 (épica #1067) — twin exacto de `MuscleHeatmapAggregatorTests.swift` y
 * `MuscleHeatmapAggregatorTest.kt`: MISMOS vectores, MISMOS nombres.
 */

function sets(exerciseId: string, count: number, warmup = false): MuscleHeatmapSet[] {
  return Array.from({ length: count }, () => ({ exerciseId, isWarmup: warmup }));
}

const library: Record<string, MuscleHeatmapExercise> = {
  // Primario explícito ⇒ dos niveles.
  bench: { muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest" },
  // Sin señal ⇒ nivel único.
  curl: { muscleGroups: ["biceps"] },
  row: { muscleGroups: ["back"], primaryMuscleGroup: "back" },
  run: { muscleGroups: ["cardio"] },
};

describe("muscle heatmap aggregator — D-07: relative to the max, not to a rank", () => {
  it("puts chest at step 4 and biceps at step 1 for 12 chest sets and 1 biceps set", () => {
    // Con un ranking, el bíceps saldría naranja: el MISMO naranja que en otro
    // entreno significa 9 series.
    const h = aggregateWorkoutHeatmap([...sets("bench", 12), ...sets("curl", 1)], library);

    expect(h.setsByRegion.chest).toBe(12);
    expect(h.setsByRegion.biceps).toBe(1);
    expect(heatmapStep(h, "chest")).toBe(4);
    expect(heatmapStep(h, "biceps")).toBe(1);
  });

  it("cuts the four colour steps where DATA-MODEL says", () => {
    const h = aggregateWorkoutHeatmap(sets("bench", 8), library);

    // pecho 8 (primario), tríceps 4 (secundario × 0.5) ⇒ 0.5 ⇒ escalón 3.
    expect(h.maxSets).toBe(8);
    expect(heatmapStep(h, "chest")).toBe(4);
    expect(heatmapStep(h, "triceps")).toBe(3);
    expect(heatmapStep(h, "glutes")).toBe(0);
  });
});

describe("muscle heatmap aggregator — warm-ups", () => {
  it("does not count warm-up sets", () => {
    // El que más calienta no entrena más.
    const h = aggregateWorkoutHeatmap([...sets("bench", 3, true), ...sets("bench", 2)], library);

    expect(h.setsByRegion.chest).toBe(2);
  });

  it("lights nothing for a workout of nothing but warm-ups", () => {
    const h = aggregateWorkoutHeatmap(sets("bench", 4, true), library);

    expect(h.maxSets).toBe(0);
    expect(Object.keys(h.setsByRegion)).toHaveLength(0);
  });
});

describe("muscle heatmap aggregator — attribution", () => {
  it("contributes 1.0 to EVERY region of a single-level exercise, not 0.5", () => {
    expect(aggregateWorkoutHeatmap(sets("curl", 4), library).setsByRegion.biceps).toBe(4);
  });

  it("attributes one set IN FULL to each region — it is not split", () => {
    // El color responde "cuánto trabajo tocó este músculo", no "cómo se reparte
    // el total". Un test que sumara 1.0 en total rompería el modelo.
    const h = aggregateWorkoutHeatmap(sets("row", 1), library);

    expect(h.setsByRegion.upper_back).toBe(1);
    expect(h.setsByRegion.lower_back).toBe(1);
    expect(h.setsByRegion.trapezius).toBe(1);
    expect(Object.values(h.setsByRegion).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("contributes half a set for secondary movers", () => {
    const h = aggregateWorkoutHeatmap(sets("bench", 4), library);

    expect(h.setsByRegion.chest).toBe(4);
    expect(h.setsByRegion.triceps).toBe(2);
  });
});

describe("muscle heatmap aggregator — edges", () => {
  it("has maxSets 0 and divides by nothing for an empty workout", () => {
    const h = aggregateWorkoutHeatmap([], library);

    expect(h.maxSets).toBe(0);
    expect(h.ranked).toHaveLength(0);
    expect(heatmapIntensity(h, "chest")).toBe(0);
    expect(heatmapStep(h, "chest")).toBe(0);
    expect(h.untrained).toHaveLength(MUSCLE_MAP_REGIONS.length);
  });

  it("lights nothing for a cardio-only workout", () => {
    const h = aggregateWorkoutHeatmap(sets("run", 5), library);

    expect(Object.keys(h.setsByRegion)).toHaveLength(0);
    expect(h.maxSets).toBe(0);
  });

  it("ignores a set whose exercise is missing from the map", () => {
    // No se inventa una región: el join falta, y punto.
    expect(Object.keys(aggregateWorkoutHeatmap(sets("ghost", 3), library).setsByRegion)).toHaveLength(0);
  });

  it("ranks ties in a stable order across the three platforms", () => {
    // Desempate por ID de región, no por nombre mostrado: un nombre localizado
    // ordenaría distinto en cada idioma.
    const h = aggregateWorkoutHeatmap([...sets("curl", 6), ...sets("row", 6)], library);

    expect(h.ranked.filter((r) => r.sets === 6).map((r) => r.region)).toEqual([
      "biceps",
      "lower_back",
      "trapezius",
      "upper_back",
    ]);
  });

  it("attributes each superset member's OWN sets", () => {
    // El bloque no se cuenta una vez: cada miembro aporta lo suyo.
    const h = aggregateWorkoutHeatmap([...sets("bench", 3), ...sets("curl", 3)], library);

    expect(h.setsByRegion.chest).toBe(3);
    expect(h.setsByRegion.biceps).toBe(3);
    expect(h.setsByRegion.triceps).toBe(1.5);
  });

  it("lists every zero region in untrained, in presentation order", () => {
    const h = aggregateWorkoutHeatmap(sets("curl", 2), library);

    expect(h.untrained).toContain("chest");
    expect(h.untrained).not.toContain("biceps");
    // El orden es el de presentación, no el de aparición.
    expect(h.untrained).toEqual(MUSCLE_MAP_REGIONS.filter((r) => r !== "biceps"));
  });
});

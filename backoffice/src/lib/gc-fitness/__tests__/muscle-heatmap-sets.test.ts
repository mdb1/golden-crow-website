/**
 * #1072 (épica #1067) — twin exacto de `MuscleHeatmapSetsTests.swift` y
 * `MuscleHeatmapSetsTest.kt`: MISMOS vectores, MISMOS nombres (salvo los dos
 * casos de `logged()`, que el backoffice no tiene — ver el gap declarado en
 * `muscle-heatmap-sets.ts`).
 */

import { aggregateWorkoutHeatmap } from "../muscle-heatmap-aggregator";
import {
  plannedHeatmapSets,
  plannedSetSlotCount,
  type MuscleHeatmapPlannedExercise,
} from "../muscle-heatmap-sets";

describe("muscle heatmap sets", () => {
  // --- Planificado ---------------------------------------------------------

  it("expandsFlat: a plain prescription expands to one heatmap set per planned set", () => {
    const out = plannedHeatmapSets([
      { exerciseId: "bench", setCount: 3 },
      { exerciseId: "curl", setCount: 2 },
    ]);

    expect(out).toHaveLength(5);
    expect(out.filter((s) => s.exerciseId === "bench")).toHaveLength(3);
    expect(out.every((s) => !s.isWarmup)).toBe(true);
  });

  it("marksWarmups: setTypesBySet marks the warm-up slots and nothing else", () => {
    const out = plannedHeatmapSets([
      {
        exerciseId: "bench",
        setCount: 4,
        setTypesBySet: ["warmup", "normal", "failure", "dropset"],
      },
    ]);

    expect(out.map((s) => s.isWarmup)).toEqual([true, false, false, false]);
  });

  it("forgivingSetTypes: a short, absent or unknown entry coerces to normal", () => {
    // La regla indulgente es de `plannedSetType`: array corto, valor desconocido
    // y array ausente valen todos "normal". Un heatmap que tratara "lo que no
    // reconozco" como calentamiento borraría series.
    const out = plannedHeatmapSets([
      { exerciseId: "a", setCount: 3, setTypesBySet: ["warmup"] },
      { exerciseId: "b", setCount: 2, setTypesBySet: ["nope", "warmup"] },
      { exerciseId: "c", setCount: 1, setTypesBySet: null },
    ]);

    expect(out.filter((s) => s.exerciseId === "a").map((s) => s.isWarmup)).toEqual([
      true,
      false,
      false,
    ]);
    expect(out.filter((s) => s.exerciseId === "b").map((s) => s.isWarmup)).toEqual([
      false,
      true,
    ]);
    expect(out.filter((s) => s.exerciseId === "c").map((s) => s.isWarmup)).toEqual([false]);
  });

  it("emptyPrescription: a zero or negative set count contributes nothing", () => {
    const out = plannedHeatmapSets([
      { exerciseId: "a", setCount: 0 },
      { exerciseId: "b", setCount: -3 },
    ]);

    expect(out).toEqual([]);
  });

  // --- El puente desde el documento ----------------------------------------

  it("bridgeUsesSlotCount: the slot count is the max, not `sets`", () => {
    // #562 — un documento desalineado (`sets: 3` con 4 reps por serie) muestra
    // CUATRO filas al usuario. Contar 3 pintaría un cuerpo que no coincide con
    // la lista que tiene al lado.
    const misaligned = { sets: 3, repsBySet: [10, 10, 8, 8] };
    expect(plannedSetSlotCount(misaligned)).toBe(4);

    const bridged: MuscleHeatmapPlannedExercise = {
      exerciseId: "bench",
      setCount: plannedSetSlotCount(misaligned),
    };
    expect(plannedHeatmapSets([bridged])).toHaveLength(4);
  });

  it("bridgeCarriesTypes: the slot count also grows with setTypesBySet", () => {
    const source = { sets: 2, setTypesBySet: ["warmup", "normal"] };
    const out = plannedHeatmapSets([
      {
        exerciseId: "bench",
        setCount: plannedSetSlotCount(source),
        setTypesBySet: source.setTypesBySet,
      },
    ]);

    expect(out.map((s) => s.isWarmup)).toEqual([true, false]);
  });

  it("plannedSetSlotCount never goes negative and tolerates absent fields", () => {
    expect(plannedSetSlotCount({})).toBe(0);
    expect(plannedSetSlotCount({ sets: -4 })).toBe(0);
    expect(plannedSetSlotCount({ sets: null, weightBySetKg: [1, 2, 3] })).toBe(3);
  });

  // --- El acople con el agregador ------------------------------------------

  it("warmupsReachAggregatorMarked: planned warm-ups reach the aggregator marked, and it drops them", () => {
    // El agregador es el ÚNICO que filtra: acá se marcan. Filtrar en los dos
    // lados sería filtrar dos veces y esconder el criterio.
    const sets = plannedHeatmapSets([
      {
        exerciseId: "bench",
        setCount: 5,
        setTypesBySet: ["warmup", "warmup", "normal", "normal", "normal"],
      },
    ]);
    expect(sets).toHaveLength(5);

    const heatmap = aggregateWorkoutHeatmap(sets, {
      bench: { muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest" },
    });

    expect(heatmap.setsByRegion.chest).toBe(3);
  });
});

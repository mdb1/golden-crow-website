import {
  MUSCLE_HEATMAP_LEGEND_STEPS,
  MUSCLE_HEATMAP_MAX_STEP,
  muscleHeatmapLowerBound,
  muscleHeatmapStepClass,
} from "../muscle-heatmap-palette";
import { heatmapStep, type WorkoutHeatmap } from "../muscle-heatmap-aggregator";

/**
 * #1070 (épica #1067) — twin de `MuscleHeatmapPaletteTests.swift` y
 * `MuscleHeatmapPaletteTest.kt`.
 */

describe("muscle heatmap palette", () => {
  it("gives every step its own class, and step 0 the silhouette", () => {
    const classes = [4, 3, 2, 1, 0].map(muscleHeatmapStepClass);

    // Los tres escalones con trabajo tienen que ser DISTINTOS: si dos
    // coincidieran, la leyenda diría dos cosas y el cuerpo mostraría una.
    expect(new Set([classes[0], classes[1], classes[2]]).size).toBe(3);
    expect(classes[4]).toContain("gc-heat-none");
  });

  it("separates the low step from the medium one", () => {
    expect(muscleHeatmapStepClass(1)).toContain("gc-heat-low");
    expect(muscleHeatmapStepClass(2)).toContain("gc-heat-mid");
  });

  it("degrades an out-of-range step to the silhouette instead of throwing", () => {
    expect(muscleHeatmapStepClass(99)).toContain("gc-heat-none");
    expect(muscleHeatmapStepClass(-1)).toContain("gc-heat-none");
  });

  it("emits both fill-* and bg-* — the SVG and the legend dot need different ones", () => {
    // Con una sola de las dos, o el músculo o el punto de la leyenda queda sin color.
    for (const step of [4, 3, 2, 1, 0]) {
      expect(muscleHeatmapStepClass(step)).toMatch(/fill-\[/);
      expect(muscleHeatmapStepClass(step)).toMatch(/bg-\[/);
    }
  });

  it("lists the four working steps in the legend, high to low, without the zero", () => {
    expect(MUSCLE_HEATMAP_LEGEND_STEPS).toEqual([4, 3, 2, 1]);
    expect(MUSCLE_HEATMAP_MAX_STEP).toBe(4);
  });

  it("matches the aggregator's cuts", () => {
    // Si la leyenda dijera "≥ 75 %" y el agregador cortara en otro lado, la
    // leyenda mentiría sobre el color que tiene al lado.
    for (const step of MUSCLE_HEATMAP_LEGEND_STEPS.filter((s) => s > 1)) {
      const bound = muscleHeatmapLowerBound(step);
      const heatmap: WorkoutHeatmap = {
        setsByRegion: { chest: bound * 100 },
        maxSets: 100,
        ranked: [{ region: "chest", sets: bound * 100 }],
        untrained: [],
      };
      expect(`step ${step}: ${heatmapStep(heatmap, "chest")}`).toBe(`step ${step}: ${step}`);
    }
  });
});

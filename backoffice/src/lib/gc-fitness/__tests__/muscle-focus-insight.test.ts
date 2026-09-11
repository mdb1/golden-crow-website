import type { WorkoutHeatmap } from "../muscle-heatmap-aggregator";
import { muscleFocusInsight } from "../muscle-focus-insight";
import { MUSCLE_MAP_REGIONS, type MuscleMapRegion } from "../muscle-map-region";

/**
 * #1069 (épica #1067) — twin exacto de `MuscleFocusInsightTests.swift` y
 * `MuscleFocusInsightTest.kt`: MISMOS vectores, MISMOS nombres.
 */

function heatmap(pairs: [MuscleMapRegion, number][]): WorkoutHeatmap {
  const setsByRegion: Partial<Record<MuscleMapRegion, number>> = {};
  for (const [region, value] of pairs) setsByRegion[region] = value;
  const entries = Object.entries(setsByRegion) as [MuscleMapRegion, number][];
  return {
    setsByRegion,
    maxSets: entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 0,
    ranked: entries
      .filter(([, v]) => v > 0)
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
      .map(([region, sets]) => ({ region, sets })),
    untrained: MUSCLE_MAP_REGIONS.filter((r) => (setsByRegion[r] ?? 0) <= 0),
  };
}

describe("muscle focus insight — D-08: it only speaks when there is something to say", () => {
  it("says NOTHING for nine sets in the window", () => {
    // "Tu foco va a estar en crecer los hombros más que las piernas" sobre una
    // semana de 2 series destruye la confianza en todo el resto.
    const i = muscleFocusInsight(heatmap([["shoulders", 6], ["quadriceps", 3]]), 9);

    expect(i.verdict).toEqual({ kind: "tooLittleData" });
  });

  it("speaks at exactly ten sets — the threshold is inclusive", () => {
    const i = muscleFocusInsight(heatmap([["shoulders", 8], ["quadriceps", 2]]), 10);

    expect(i.verdict).toEqual({ kind: "focus", top: "shoulders", low: "quadriceps" });
  });

  it("calls an even spread balanced instead of inventing a focus", () => {
    const i = muscleFocusInsight(
      heatmap([["shoulders", 7], ["quadriceps", 6], ["chest", 7]]),
      20,
    );

    expect(i.verdict).toEqual({ kind: "balanced" });
  });

  it("treats exactly 2x as a focus and a hair under as balanced", () => {
    expect(muscleFocusInsight(heatmap([["shoulders", 12], ["quadriceps", 6]]), 18).verdict).toEqual({
      kind: "focus",
      top: "shoulders",
      low: "quadriceps",
    });
    expect(muscleFocusInsight(heatmap([["shoulders", 11], ["quadriceps", 6]]), 17).verdict).toEqual({
      kind: "balanced",
    });
  });

  it("calls shoulders 14 versus quadriceps 6 a focus", () => {
    const i = muscleFocusInsight(heatmap([["shoulders", 14], ["quadriceps", 6]]), 20);

    expect(i.verdict).toEqual({ kind: "focus", top: "shoulders", low: "quadriceps" });
  });
});

describe("muscle focus insight — never against a zero", () => {
  it("NEVER makes a group at zero the low half of the phrase", () => {
    // Un grupo en 0 no es "menos foco": es *sin trabajar*, y va a la tabla.
    const i = muscleFocusInsight(
      heatmap([["shoulders", 14], ["quadriceps", 6], ["calves", 0]]),
      20,
    );

    expect(i.verdict).toEqual({ kind: "focus", top: "shoulders", low: "quadriceps" });
    expect(i.untrained).toContain("calves");
  });

  it("names the focus with no comparison when only ONE region is trained", () => {
    // No existe un "menos" contra el cual comparar, y comparar contra un 0 está
    // prohibido: la frase dice sólo la primera mitad.
    const i = muscleFocusInsight(heatmap([["shoulders", 14]]), 14);

    expect(i.verdict).toEqual({ kind: "focus", top: "shoulders", low: null });
  });

  it("lists every zero region in untrained and excludes the trained ones", () => {
    const i = muscleFocusInsight(heatmap([["shoulders", 14]]), 14);

    expect(i.untrained).toHaveLength(MUSCLE_MAP_REGIONS.length - 1);
    expect(i.untrained).not.toContain("shoulders");
  });
});

describe("muscle focus insight — ties and edges", () => {
  it("breaks a tie at the top by region id, identically on all three platforms", () => {
    const i = muscleFocusInsight(
      heatmap([["shoulders", 12], ["chest", 12], ["calves", 2]]),
      26,
    );

    // "chest" < "shoulders" alfabéticamente.
    expect(i.verdict).toEqual({ kind: "focus", top: "chest", low: "calves" });
  });

  it("says nothing for an empty window rather than dividing by zero", () => {
    const i = muscleFocusInsight(heatmap([]), 0);

    expect(i.verdict).toEqual({ kind: "tooLittleData" });
    expect(i.untrained).toHaveLength(MUSCLE_MAP_REGIONS.length);
  });

  it("still says nothing above the threshold when no region is lit", () => {
    // Una semana de puro cardio: 20 series contables, ninguna región.
    expect(muscleFocusInsight(heatmap([]), 20).verdict).toEqual({ kind: "tooLittleData" });
  });
});

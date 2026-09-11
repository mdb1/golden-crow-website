/**
 * #1069 (épica #1067) — la frase interpretativa de la vista semanal. Twin exacto
 * de `MuscleFocusInsight.swift` y `MuscleFocusInsight.kt`.
 *
 * LA REGLA QUE NO SE PUEDE ABLANDAR (`D-08`): la frase SÓLO habla cuando hay algo
 * que decir. Una frase generada es la parte de la feature que puede quedar
 * ridícula, y es la que más se comparte por captura de pantalla. "Tu foco va a
 * estar en crecer los hombros más que las piernas" sobre una semana de 2 series
 * totales es una afirmación que destruye la confianza en todo el resto de los
 * números. El umbral es lo que la hace decir menos y acertar.
 *
 * Va como twin porque el backoffice muestra la misma frase al COACH que las apps
 * al cliente: dos redacciones del mismo hecho es peor que ninguna. Este archivo
 * produce el VEREDICTO, no el texto — la redacción vive en cada superficie.
 */

import type { WorkoutHeatmap } from "./muscle-heatmap-aggregator";
import type { MuscleMapRegion } from "./muscle-map-region";

export type MuscleFocusVerdict =
  /**
   * Menos de `MIN_SETS_FOR_INSIGHT` series en la ventana ⇒ la vista NO muestra
   * frase. No es "poca data" como texto: es silencio.
   */
  | { readonly kind: "tooLittleData" }
  /**
   * El grupo más alto no supera al más bajo con series por al menos 2× ⇒ "semana
   * equilibrada". No se inventa un foco.
   */
  | { readonly kind: "balanced" }
  /**
   * Hay un foco real. `low` es `null` a propósito cuando una sola región tiene
   * series: no existe un "menos" contra el cual comparar, y `D-08` prohíbe
   * comparar contra un grupo en 0. En ese caso la superficie dice sólo el foco.
   */
  | { readonly kind: "focus"; readonly top: MuscleMapRegion; readonly low: MuscleMapRegion | null };

export interface MuscleFocusInsight {
  readonly verdict: MuscleFocusVerdict;
  /**
   * Las regiones con 0 series. Van a la TABLA, que es donde un cero es
   * informativo, y se nombran "sin trabajar" — nunca como "foco secundario".
   */
  readonly untrained: readonly MuscleMapRegion[];
}

/** Por debajo de esto la frase no aparece (`D-08`). */
export const MIN_SETS_FOR_INSIGHT = 10;

/** El múltiplo que el máximo tiene que superar para que haya "foco". */
export const FOCUS_RATIO = 2.0;

/**
 * @param heatmap el agregado de la ventana (una semana, típicamente).
 * @param totalSets el número CRUDO de series contables de la ventana — no la suma
 *   de `setsByRegion`, que cuenta la misma serie una vez por cada región que toca
 *   y por lo tanto es mucho mayor. Pasarlo por separado es lo que hace que el
 *   umbral de 10 signifique "10 series", que es lo que el usuario cuenta.
 */
export function muscleFocusInsight(heatmap: WorkoutHeatmap, totalSets: number): MuscleFocusInsight {
  const untrained = heatmap.untrained;

  if (totalSets < MIN_SETS_FOR_INSIGHT) {
    return { verdict: { kind: "tooLittleData" }, untrained };
  }

  // `ranked` ya viene descendente y desempatado por id de región.
  const top = heatmap.ranked[0];
  if (!top) return { verdict: { kind: "tooLittleData" }, untrained };

  // ⚠️ El "menos" se elige SÓLO entre los que tienen al menos una serie. Un grupo
  // en 0 no es "menos foco": es *sin trabajar*, y aparece como tal en la tabla.
  const low = heatmap.ranked[heatmap.ranked.length - 1];
  if (low.region === top.region) {
    return { verdict: { kind: "focus", top: top.region, low: null }, untrained };
  }

  if (top.sets < FOCUS_RATIO * low.sets) {
    return { verdict: { kind: "balanced" }, untrained };
  }

  return { verdict: { kind: "focus", top: top.region, low: low.region }, untrained };
}

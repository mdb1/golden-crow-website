/**
 * #1069 (épica #1067) — de UN ENTRENAMIENTO (o una semana) a un heatmap. Twin
 * exacto de `MuscleHeatmapAggregator.swift` y `MuscleHeatmapAggregator.kt`.
 *
 * LA REGLA QUE NO SE PUEDE ABLANDAR (`D-07`): la intensidad es RELATIVA AL MÁXIMO
 * del propio entreno, no el puesto en un ranking. Con ranking, un push day de 12
 * series de pecho y 1 de bíceps pintaría el bíceps de naranja — el mismo naranja
 * que en otro entreno significa 9 series. El usuario compara colores entre
 * entrenos porque el color es lo que la vista le ofrece para comparar.
 *
 * El defecto conocido y ACEPTADO de lo relativo: un entreno de 1 sola serie de
 * pecho pinta el pecho de rojo pleno. Se mitiga con la leyenda, que muestra el
 * número de series junto al color — el color ordena, el número calibra.
 */

import {
  heatmapWeightFor,
  resolveExerciseHeatmap,
  type ExerciseHeatmap,
  type MuscleHeatmapExercise,
} from "./muscle-heatmap-resolver";
import { MUSCLE_MAP_REGIONS, type MuscleMapRegion } from "./muscle-map-region";

/**
 * Una serie, reducida a lo único que el heatmap necesita.
 *
 * Se toma `isWarmup` YA RESUELTO (por el `effectiveSetType` de cada plataforma,
 * que mira `set_type` y cae al `is_warmup` viejo) en vez de recibir el modelo de
 * serie entero: mantiene el twin idéntico en las 3 plataformas.
 */
export interface MuscleHeatmapSet {
  readonly exerciseId: string;
  readonly isWarmup: boolean;
}

/** Una región con sus series, para el ranking. */
export interface RankedMuscleRegion {
  readonly region: MuscleMapRegion;
  readonly sets: number;
}

/** El heatmap de un conjunto de series. */
export interface WorkoutHeatmap {
  /** Región → series atribuidas (pesadas 1.0 primario / 0.5 secundario). */
  readonly setsByRegion: Partial<Record<MuscleMapRegion, number>>;
  /** El máximo de `setsByRegion`. 0 cuando no hubo ninguna serie contable. */
  readonly maxSets: number;
  /**
   * Las regiones con al menos una serie, de mayor a menor. Los empates se
   * desempatan por **id de región ascendente**, no por nombre mostrado: un nombre
   * localizado ordenaría distinto en cada idioma y las 3 plataformas dejarían de
   * coincidir.
   */
  readonly ranked: readonly RankedMuscleRegion[];
  /**
   * Las regiones ubicables que quedaron en CERO, en orden de presentación. Son la
   * mitad útil de la vista semanal (`D-09`): el valor no es confirmar que
   * entrenaste pecho, es ver qué NO estás entrenando.
   */
  readonly untrained: readonly MuscleMapRegion[];
}

/**
 * Series de una región en `[0, 1]` contra el máximo del propio conjunto. Devuelve
 * 0 —sin dividir por cero— cuando no hubo series.
 */
export function heatmapIntensity(heatmap: WorkoutHeatmap, region: MuscleMapRegion): number {
  if (heatmap.maxSets <= 0) return 0;
  return (heatmap.setsByRegion[region] ?? 0) / heatmap.maxSets;
}

/**
 * El escalón de color, 0…4 (`DATA-MODEL` §4). El corte es sobre el máximo del
 * propio entreno, no sobre una escala absoluta.
 */
export function heatmapStep(heatmap: WorkoutHeatmap, region: MuscleMapRegion): number {
  const value = heatmapIntensity(heatmap, region);
  if (value >= 0.75) return 4;
  if (value >= 0.5) return 3;
  if (value >= 0.25) return 2;
  if (value > 0) return 1;
  return 0;
}

/**
 * Agrega series a regiones.
 *
 * @param sets las series a contar. Los calentamientos se descartan ACÁ.
 * @param exercisesById el join `set.exerciseId → ejercicio`. Una serie cuyo
 *   ejercicio no está en el mapa se ignora (no se inventa una región).
 */
export function aggregateWorkoutHeatmap(
  sets: readonly MuscleHeatmapSet[],
  exercisesById: Readonly<Record<string, MuscleHeatmapExercise>>,
): WorkoutHeatmap {
  // Resolver cada ejercicio UNA vez, no una por serie.
  const cache = new Map<string, ExerciseHeatmap>();
  const setsByRegion: Partial<Record<MuscleMapRegion, number>> = {};

  for (const set of sets) {
    // ⚠️ Los calentamientos NO cuentan, igual que en el cálculo de volumen. Un
    // heatmap que los contara pintaría más fuerte al que más calienta.
    if (set.isWarmup) continue;
    const exercise = exercisesById[set.exerciseId];
    if (!exercise) continue;

    let heatmap = cache.get(set.exerciseId);
    if (!heatmap) {
      heatmap = resolveExerciseHeatmap(exercise);
      cache.set(set.exerciseId, heatmap);
    }

    // ⚠️ Una serie se atribuye COMPLETA a cada región que toca, no repartida. La
    // pregunta que responde el color es "cuánto trabajo tocó este músculo", no
    // "cómo se reparte el total". Un test que sumara 1.0 en total rompería el
    // modelo.
    for (const region of Object.keys(heatmap.levels) as MuscleMapRegion[]) {
      setsByRegion[region] = (setsByRegion[region] ?? 0) + heatmapWeightFor(heatmap, region);
    }
  }

  const entries = Object.entries(setsByRegion) as [MuscleMapRegion, number][];
  const maxSets = entries.length > 0 ? Math.max(...entries.map(([, value]) => value)) : 0;
  const ranked = entries
    .filter(([, value]) => value > 0)
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .map(([region, value]) => ({ region, sets: value }));
  const untrained = MUSCLE_MAP_REGIONS.filter((region) => (setsByRegion[region] ?? 0) <= 0);

  return { setsByRegion, maxSets, ranked, untrained };
}

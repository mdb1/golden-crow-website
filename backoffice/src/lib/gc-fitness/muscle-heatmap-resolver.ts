/**
 * #1069 (épica #1067) — de UN EJERCICIO a un heatmap. Twin exacto de
 * `MuscleHeatmapResolver.swift` y `MuscleHeatmapResolver.kt`.
 *
 * LA REGLA QUE NO SE PUEDE ABLANDAR (`D-05`): el heatmap de un ejercicio tiene
 * dos niveles SÓLO cuando el dato los distingue. Si no, pinta un ÚNICO nivel
 * neutro y la leyenda lo dice.
 *
 * Por qué importa tanto: en producción `primaryMuscleGroup` falta en el 94 % de
 * los ejercicios y `secondaryMuscles` en el 40 %. Con la regla ingenua ("todo lo
 * que no es secundario es primario"), ese 40 % se pinta ENTERO EN ROJO. Un cuerpo
 * todo rojo no es una degradación elegante: es una afirmación fuerte y falsa,
 * sobre una superficie que el usuario lee como anatomía.
 *
 * ADITIVO Y RETRO-COMPATIBLE: no cambia `coarseWeights` ni ningún cálculo
 * existente — lo REUSA.
 */

import { coarseGroup, coarseGroupFromAnatomy } from "./muscle-group-display";
import {
  isApproximateMuscleTag,
  muscleRegionsForTag,
  normalizeMuscleTag,
} from "./muscle-heatmap-mapping";
import type { MuscleMapRegion } from "./muscle-map-region";

/** El nivel con el que se tiñe una región en el heatmap de un ejercicio. */
export type MuscleHeatmapLevel =
  /** El motor principal. Sólo existe cuando el dato distingue (`D-05`). */
  | "primary"
  /** Un motor secundario. Sólo existe junto a `primary`. */
  | "secondary"
  /** Nivel único: el dato no permite jerarquizar, así que no se inventa una. */
  | "single";

/**
 * Qué leyenda corresponde mostrar. Es parte del resultado, no una decisión de la
 * vista: la leyenda tiene que decir la verdad sobre el dato que la produjo.
 */
export type MuscleHeatmapLegend = "primarySecondary" | "singleLevel";

/**
 * La forma mínima que el resolver necesita de un ejercicio. Se declara aparte
 * para que el twin sea idéntico en las 3 plataformas y para NO acoplar esta
 * lógica al modelo persistido — mismo patrón que `CoarseWeightsInput`.
 */
export interface MuscleHeatmapExercise {
  readonly muscleGroups: readonly string[];
  readonly primaryMuscleGroup?: string | null;
  readonly secondaryMuscles?: readonly string[];
}

/** El heatmap de un ejercicio. */
export interface ExerciseHeatmap {
  /** Región → nivel. Vacío cuando `hasNoRegions`. */
  readonly levels: Partial<Record<MuscleMapRegion, MuscleHeatmapLevel>>;
  /**
   * El ejercicio ubica un miembro pero no una vista (`legs` / `arms` /
   * `full_body` sin más precisión) — `D-04`. La vista muestra la pastilla
   * "Aproximado", que además es el medidor de progreso del backfill de M7.
   */
  readonly isApproximate: boolean;
  /**
   * Ningún tag mapeó a una región (cardio, flexibility, tags desconocidos). La
   * vista muestra el cuerpo apagado CON su texto, no un cuerpo entero pintado:
   * pintar "todas" como fallback es la lectura opuesta a la verdad.
   */
  readonly hasNoRegions: boolean;
  readonly legend: MuscleHeatmapLegend;
}

/**
 * El peso de atribución de una región. Primario y **nivel único** pesan 1.0;
 * secundario 0.5.
 *
 * ⚠️ Nivel único pesa 1.0, NO 0.5. Sin jerarquía, inventar un 0.5 sería inventar
 * dos veces — y es exactamente el defecto que `#529` arregló.
 */
export function heatmapWeightFor(heatmap: ExerciseHeatmap, region: MuscleMapRegion): number {
  switch (heatmap.levels[region]) {
    case "primary":
    case "single":
      return 1.0;
    case "secondary":
      return 0.5;
    default:
      return 0.0;
  }
}

/** El orden de las guardas ES la corrección (`DATA-MODEL` §3). */
export function resolveExerciseHeatmap(exercise: MuscleHeatmapExercise): ExerciseHeatmap {
  // 1. Normalizar cada tag y mapearlo a regiones.
  const regionsByTag: { tag: string; regions: MuscleMapRegion[] }[] = [];
  for (const raw of exercise.muscleGroups) {
    const regions = muscleRegionsForTag(raw);
    if (regions.length > 0) regionsByTag.push({ tag: normalizeMuscleTag(raw), regions });
  }
  const allRegions = new Set(regionsByTag.flatMap((entry) => entry.regions));

  // 2. Sin regiones ⇒ cuerpo apagado. NUNCA "todas" como fallback.
  if (allRegions.size === 0) {
    return { levels: {}, isApproximate: false, hasNoRegions: true, legend: "singleLevel" };
  }

  // Aproximado si TODO lo que ubicó es aproximado. Un ejercicio con
  // `[legs, quadriceps]` sí tiene una señal fina, así que no lo es.
  const isApproximate = regionsByTag.every((entry) => isApproximateMuscleTag(entry.tag));

  // 3. Partir en primarias y secundarias, si el dato lo permite.
  const secondaryRegions = secondaryHeatmapRegions(exercise, regionsByTag, allRegions);
  const primaryCount = [...allRegions].filter((r) => !secondaryRegions.has(r)).length;

  // 4. Una partición sólo vale si deja AL MENOS UNA de cada clase. Si no, nivel
  //    único: una leyenda que nombra "secundario" cuando nada lo es miente igual
  //    que pintar todo de rojo.
  const levels: Partial<Record<MuscleMapRegion, MuscleHeatmapLevel>> = {};
  if (secondaryRegions.size === 0 || primaryCount === 0) {
    for (const region of allRegions) levels[region] = "single";
    return { levels, isApproximate, hasNoRegions: false, legend: "singleLevel" };
  }

  for (const region of allRegions) {
    levels[region] = secondaryRegions.has(region) ? "secondary" : "primary";
  }
  return { levels, isApproximate, hasNoRegions: false, legend: "primarySecondary" };
}

function secondaryHeatmapRegions(
  exercise: MuscleHeatmapExercise,
  regionsByTag: { tag: string; regions: MuscleMapRegion[] }[],
  allRegions: Set<MuscleMapRegion>,
): Set<MuscleMapRegion> {
  // 3a. Primario explícito: sus regiones son primarias, el resto secundarias.
  if (exercise.primaryMuscleGroup) {
    const primaryRegions = new Set(muscleRegionsForTag(exercise.primaryMuscleGroup));
    if (primaryRegions.size > 0) {
      return new Set([...allRegions].filter((region) => !primaryRegions.has(region)));
    }
  }

  // 3b. La heurística de anatomía sobre `secondaryMuscles`. Se reusa
  //     `coarseGroupFromAnatomy` TAL CUAL — es la misma que ya corrigió `#529`, y
  //     re-derivarla acá forkearía una regla que este repo ya arregló una vez.
  const anatomySecondaryCoarse = new Set<string>();
  for (const name of exercise.secondaryMuscles ?? []) {
    const coarse = coarseGroupFromAnatomy(name);
    if (coarse) anatomySecondaryCoarse.add(coarse);
  }
  if (anatomySecondaryCoarse.size === 0) return new Set();

  const allCoarse = new Set<string>();
  for (const raw of exercise.muscleGroups) {
    const coarse = coarseGroup(normalizeMuscleTag(raw));
    if (coarse) allCoarse.add(coarse);
  }

  // ⚠️ EL VECTOR DE `#529`, EXACTO. Los docs sembrados repiten el propio motor
  // principal del ejercicio dentro de `secondaryMuscles` (una elevación de pierna
  // que lista "Quadriceps femoris" / "Gluteus maximus"). Si la heurística se
  // comería TODOS los grupos gruesos, no queda motor primario que sostenga el
  // nivel alto: la señal es inusable y se cae al nivel único.
  if (allCoarse.size > 0 && [...allCoarse].every((c) => anatomySecondaryCoarse.has(c))) {
    return new Set();
  }

  const secondary = new Set<MuscleMapRegion>();
  const primaryLit = new Set<MuscleMapRegion>();
  for (const entry of regionsByTag) {
    const coarse = coarseGroup(entry.tag);
    if (coarse && anatomySecondaryCoarse.has(coarse)) {
      for (const region of entry.regions) secondary.add(region);
    } else {
      // Una región que otro tag PRIMARIO también enciende no puede ser
      // secundaria: el nivel más alto gana.
      for (const region of entry.regions) primaryLit.add(region);
    }
  }
  return new Set([...secondary].filter((region) => !primaryLit.has(region)));
}

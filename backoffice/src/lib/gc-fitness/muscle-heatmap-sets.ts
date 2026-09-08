/**
 * #1072 (épica #1067) — de una PRESCRIPCIÓN a las series que cuenta el heatmap.
 * Twin exacto de `MuscleHeatmapSets.swift` y `MuscleHeatmapSets.kt`.
 *
 * POR QUÉ ESTO ES UN TWIN Y NO UN `map` EN CADA PANTALLA. M4 monta el heatmap en
 * cuatro superficies que miran el MISMO entreno desde distintos ángulos — en el
 * backoffice, el detalle de la rutina y el editor; en las apps, además el entreno
 * activo y el éxito. Si cada una expandiera la prescripción a series por su
 * cuenta, dos vistas del mismo entreno pintarían distinto y nadie sabría cuál
 * miente. Las dos reglas que se pueden equivocar por separado son:
 *
 *  1. CUÁNTAS series tiene un ejercicio: NO es `sets` — es el `plannedSetSlotCount`
 *     (#562), el máximo entre `sets` y el largo de cada array por-serie. Un
 *     documento viejo con `sets: 3` y `repsBySet` de 4 le muestra CUATRO filas al
 *     usuario; contar 3 pintaría un cuerpo que no coincide con la lista de al lado.
 *  2. CUÁLES son de calentamiento: sale de `setTypesBySet` vía `plannedSetType`,
 *     con su regla indulgente (array ausente / corto / valor desconocido ⇒ "normal").
 *
 * El agregador YA descarta los calentamientos (`aggregateWorkoutHeatmap`), así que
 * acá NO se filtran: se marcan. Filtrar en los dos lados sería filtrar dos veces y
 * esconder el criterio en el lugar donde nadie lo busca.
 *
 * ⚠️ GAP DECLARADO CONTRA LOS TWINS: iOS y Android además exponen un `logged()`
 * (de `SetLog[]` a series) para la pantalla de éxito del entreno. El backoffice no
 * lo tiene porque no tiene esa superficie — sus dos superficies de M4 (`S9`) son
 * las dos PLANIFICADAS. Cuando el heatmap llegue a un entreno hecho del lado del
 * coach, el twin es de tres líneas y va acá.
 */

import { plannedSetType } from "./set-type";
import type { MuscleHeatmapSet } from "./muscle-heatmap-aggregator";

/**
 * Un ejercicio PLANIFICADO reducido a lo único que hace falta para contar sus
 * series.
 *
 * Se declara aparte —y no se toma el documento— porque las superficies
 * planificadas alimentan el heatmap desde modelos DISTINTOS: el detalle desde la
 * plantilla guardada, y el editor desde el borrador local, que todavía no es
 * ningún documento.
 */
export interface MuscleHeatmapPlannedExercise {
  readonly exerciseId: string;
  /**
   * Las filas de serie que el usuario REALMENTE ve. Los llamadores que parten de
   * un documento pasan `plannedSetSlotCount(...)`, no `sets`.
   */
  readonly setCount: number;
  /** El `setTypesBySet` crudo del wire. Ausente ⇒ todas normales. */
  readonly setTypesBySet?: readonly string[] | null;
}

/** La forma mínima de un ejercicio prescripto, tal como viene del wire. */
export interface PlannedExerciseSlotSource {
  readonly sets?: number | null;
  readonly repsBySet?: readonly unknown[] | null;
  readonly weightBySetKg?: readonly unknown[] | null;
  readonly durationBySetSeconds?: readonly unknown[] | null;
  readonly setTypesBySet?: readonly unknown[] | null;
}

/**
 * Las filas de serie efectivas de un ejercicio prescripto (#562). Twin de
 * `ExerciseSnapshot.plannedSetSlotCount` (Swift) / `.plannedSetSlotCount` (Kotlin):
 * el máximo entre `sets` y el largo de cada array por-serie, nunca negativo.
 */
export function plannedSetSlotCount(exercise: PlannedExerciseSlotSource): number {
  const lengthOf = (value: readonly unknown[] | null | undefined) =>
    Array.isArray(value) ? value.length : 0;
  return Math.max(
    0,
    typeof exercise.sets === "number" ? exercise.sets : 0,
    lengthOf(exercise.repsBySet),
    lengthOf(exercise.weightBySetKg),
    lengthOf(exercise.durationBySetSeconds),
    lengthOf(exercise.setTypesBySet),
  );
}

/**
 * Expande una prescripción a la lista de series que el heatmap agrega.
 *
 * Un `setCount` de 0 o negativo no aporta series (un ejercicio recién agregado en
 * el editor, antes de que tenga filas, no puede pintar nada).
 */
export function plannedHeatmapSets(
  exercises: readonly MuscleHeatmapPlannedExercise[],
): MuscleHeatmapSet[] {
  const out: MuscleHeatmapSet[] = [];
  for (const exercise of exercises) {
    if (exercise.setCount <= 0) continue;
    for (let index = 0; index < exercise.setCount; index += 1) {
      const type = plannedSetType(index, exercise.setTypesBySet ?? undefined);
      out.push({ exerciseId: exercise.exerciseId, isWarmup: type === "warmup" });
    }
  }
  return out;
}

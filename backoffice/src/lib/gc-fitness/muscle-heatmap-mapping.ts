/**
 * #1069 (épica #1067) — el mapeo `tag del vocabulario → regiones del cuerpo`.
 * Twin exacto de `MuscleHeatmapMapping.swift` y `MuscleHeatmapMapping.kt`.
 *
 * La tabla normativa está en
 * `gc-fitness/.planning/features/muscle-heatmap-1067/DATA-MODEL.md` §2.
 *
 * ES DE UNO A MUCHOS, Y EN UN SENTIDO SOLO. Dos tags distintos pueden pintar la
 * misma región (`core` y `abs` comparten el abdomen), así que de una región
 * pintada NO se puede recuperar qué tag la encendió. No agregues la inversa.
 *
 * ADITIVO Y RETRO-COMPATIBLE: no toca el vocabulario, no toca el modelo de
 * ejercicio y no cambia `muscle-group-display.ts`. Lee los mismos campos que ya
 * se escriben y no escribe nada.
 */

import { MUSCLE_MAP_REGIONS, type MuscleMapRegion } from "./muscle-map-region";

/**
 * Normaliza un tag crudo antes de buscarlo: recorta, baja a minúsculas y colapsa
 * CUALQUIER corrida de espacios en blanco a un `_`.
 *
 * ⚠️ El colapso de espacios no es decorativo: en producción hay un tag
 * `"middle back"` **con espacio** (`D-06`). Un normalizador que sólo baje a
 * minúsculas lo deja pasar, y el ejercicio se pinta apagado sin que nada falle.
 */
export function normalizeMuscleTag(raw: string): string {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean).join("_");
}

/**
 * Los 4 tags que existen en producción pero NO en `MUSCLE_GROUPS`, mapeados al
 * tag canónico que les corresponde (`D-06`).
 *
 * ⚠️ Cada alias apunta al TAG DEL VOCABULARIO, no a una región fina. Si mapeara
 * más fino (p. ej. `lats → upper_back` en vez de `lats → back`), un documento que
 * el backfill normalice a `back` pasaría a dibujarse distinto que antes de la
 * migración, sin que nadie lo haya decidido.
 *
 * Lo que esta tabla NO es: la lista de correcciones de la ola 1 de M7 (#1075).
 * Esos 7 ejercicios no están mal ESCRITOS, están mal CLASIFICADOS —un pushdown de
 * tríceps tagueado `lats`— y 3 de los 7 aterrizan en un tag distinto del que dice
 * esta tabla, a propósito.
 */
export const OUT_OF_VOCABULARY_MUSCLE_ALIASES: Record<string, string> = {
  lats: "back",
  traps: "back",
  abdominals: "abs",
  middle_back: "back",
};

/**
 * Los tags que ubican un miembro entero pero NO una vista (`D-04`), más
 * `full_body`. Un ejercicio cuya única señal es uno de estos se marca como
 * aproximado: se pinta el miembro completo y la leyenda lo dice.
 */
export const APPROXIMATE_MUSCLE_TAGS: readonly string[] = ["legs", "arms", "full_body"];

/**
 * `tag canónico → regiones`. La tabla de `DATA-MODEL` §2.
 *
 * `cardio` y `flexibility` mapean a NADA a propósito: pintar "todas" como
 * fallback sería la lectura opuesta a la verdad.
 */
export function muscleRegionsForTag(raw: string): MuscleMapRegion[] {
  const tag = normalizeMuscleTag(raw);
  switch (OUT_OF_VOCABULARY_MUSCLE_ALIASES[tag] ?? tag) {
    case "chest":
      return ["chest"];
    case "shoulders":
      return ["shoulders"];
    case "biceps":
      return ["biceps"];
    case "triceps":
      return ["triceps"];
    case "forearms":
      return ["forearms"];
    case "abs":
      return ["abs"];
    // El core incluye la cadena posterior lumbar — no es sólo el abdomen.
    case "core":
      return ["abs", "obliques", "lower_back"];
    case "back":
      return ["upper_back", "lower_back", "trapezius"];
    case "quadriceps":
      return ["quadriceps"];
    case "hamstrings":
      return ["hamstrings"];
    case "glutes":
      return ["glutes"];
    case "calves":
      return ["calves"];
    // `legs` no distingue frente de dorso: pinta el miembro entero (D-04).
    case "legs":
      return ["quadriceps", "hamstrings", "glutes", "calves", "adductors"];
    case "arms":
      return ["biceps", "triceps", "forearms"];
    case "full_body":
      return [...MUSCLE_MAP_REGIONS];
    // `cardio` / `flexibility` / cualquier tag desconocido: sin regiones.
    default:
      return [];
  }
}

/**
 * `true` si el tag ubica de forma aproximada (`D-04`). Se evalúa sobre el tag YA
 * normalizado y con alias resueltos.
 */
export function isApproximateMuscleTag(raw: string): boolean {
  const tag = normalizeMuscleTag(raw);
  return APPROXIMATE_MUSCLE_TAGS.includes(OUT_OF_VOCABULARY_MUSCLE_ALIASES[tag] ?? tag);
}

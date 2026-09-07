/**
 * #1068 (épica #1067) — las regiones tintables del cuerpo y los slugs del asset
 * que dibuja cada una. Twin exacto de `MuscleMapRegion.swift` (iOS) y
 * `MuscleMapRegion.kt` (Android).
 *
 * ESTE ARCHIVO SÍ SE EDITA A MANO. `muscle-map-geometry.ts` es generado (los
 * ~46 KB de coordenadas del upstream MIT); esto es la capa de PRODUCTO encima:
 * qué pedazos del asset forman "el pecho", "los isquios", etc. La tabla normativa
 * está en `gc-fitness/.planning/features/muscle-heatmap-1067/DATA-MODEL.md` §1.
 *
 * LO QUE NO ESTÁ ACÁ: el mapeo `tag del vocabulario → regiones` (`DATA-MODEL` §2)
 * es M1 y vive aparte. Esto es sólo el puente región → geometría, y es la mitad
 * que un test puede verificar hoy: todo slug que una región nombra tiene que
 * existir en la geometría generada, y todo slug de la geometría tiene que estar
 * clasificado — o como región, o como silueta.
 */

import {
  MUSCLE_MAP_VIEWS,
  muscleMapGroupsFor,
  type MuscleMapPathGroup,
  type MuscleMapView,
} from "./muscle-map-geometry";

/** Las regiones del cuerpo que el heatmap puede teñir, en orden de presentación. */
export const MUSCLE_MAP_REGIONS = [
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "upper_back",
  "lower_back",
  "trapezius",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
] as const;

export type MuscleMapRegion = (typeof MUSCLE_MAP_REGIONS)[number];

/**
 * Los slugs del asset upstream que forman cada región. Verbatim del asset
 * (`D-01`) para que el generado siga siendo trazable: por eso conviven
 * `hamstring` en singular con `calves` en plural, y `forearm` con `abs`.
 */
export const MUSCLE_MAP_REGION_SLUGS: Record<MuscleMapRegion, readonly string[]> = {
  chest: ["chest"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abs: ["abs"],
  obliques: ["obliques"],
  upper_back: ["upper-back"],
  lower_back: ["lower-back"],
  trapezius: ["trapezius"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  // `tibialis` es el tibial anterior, que está de FRENTE: sin él, un heatmap de
  // gemelos no pinta nada en la vista frontal.
  calves: ["calves", "tibialis"],
  adductors: ["adductors"],
};

/**
 * Los slugs del asset que **nunca se tiñen**: son la silueta del cuerpo. Por eso
 * no hace falta una imagen de fondo (`D-01`) — el cuerpo ES la unión de sus partes.
 */
export const MUSCLE_MAP_SILHOUETTE_SLUGS: readonly string[] = [
  "head",
  "hair",
  "neck",
  "hands",
  "feet",
  "knees",
  "ankles",
];

/**
 * Las vistas en las que una región dibuja algo. **Derivado** de la geometría, no
 * declarado: una tabla escrita a mano sería una cuarta copia del asset esperando
 * a desincronizarse cuando el upstream suba de versión.
 */
export function muscleMapRegionViews(region: MuscleMapRegion): MuscleMapView[] {
  const slugs = MUSCLE_MAP_REGION_SLUGS[region];
  return MUSCLE_MAP_VIEWS.filter((view) =>
    muscleMapGroupsFor(view).some((group) => slugs.includes(group.slug)),
  );
}

/** Los grupos de paths de una región en una vista, en orden de dibujo. */
export function muscleMapRegionGroups(
  region: MuscleMapRegion,
  view: MuscleMapView,
): MuscleMapPathGroup[] {
  const slugs = MUSCLE_MAP_REGION_SLUGS[region];
  return muscleMapGroupsFor(view).filter((group) => slugs.includes(group.slug));
}

/** La región a la que pertenece un slug del asset, si alguna. */
export function muscleMapRegionForSlug(slug: string): MuscleMapRegion | null {
  return (
    MUSCLE_MAP_REGIONS.find((region) => MUSCLE_MAP_REGION_SLUGS[region].includes(slug)) ?? null
  );
}

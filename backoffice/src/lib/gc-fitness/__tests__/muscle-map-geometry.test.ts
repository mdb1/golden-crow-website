import { createHash } from "node:crypto";

import {
  MUSCLE_MAP_BACK,
  MUSCLE_MAP_BACK_VIEW_BOX,
  MUSCLE_MAP_FRONT,
  MUSCLE_MAP_FRONT_VIEW_BOX,
  MUSCLE_MAP_UPSTREAM_COMMIT,
  MUSCLE_MAP_VIEWS,
  muscleMapCanonicalString,
  muscleMapGroupsFor,
  muscleMapViewBoxFor,
  muscleMapViewBoxValue,
  type MuscleMapView,
} from "../muscle-map-geometry";
import {
  MUSCLE_MAP_REGIONS,
  MUSCLE_MAP_REGION_SLUGS,
  MUSCLE_MAP_SILHOUETTE_SLUGS,
  muscleMapRegionForSlug,
  muscleMapRegionViews,
  type MuscleMapRegion,
} from "../muscle-map-region";

/**
 * #1068 (épica #1067) — el gate del twin de geometría.
 *
 * Twin exacto de `MuscleMapGeometryTests.swift` (iOS) y `MuscleMapGeometryTest.kt`
 * (Android): MISMOS casos, MISMAS constantes. `muscle-map-geometry.ts` es generado
 * por `gc-fitness/scripts/muscle-map/generate.mjs`; sin estos tests, "archivo
 * generado" es una sugerencia. Con ellos, editar el generado a mano pone roja la
 * suite de esa plataforma, y regenerar contra otro upstream pone rojas las tres a
 * la vez (`D-02`).
 */

/**
 * sha256 del string canónico. **HARDCODEADO A PROPÓSITO, y no viene del archivo
 * generado**: si lo leyéramos de ahí, el test compararía el generado contra sí
 * mismo y no probaría nada. Este literal es idéntico en las 3 plataformas —
 * cambiarlo es un acto deliberado que toca 3 archivos.
 */
const EXPECTED_CHECKSUM = "18dc6d75a2e4cebe5eb87760e4e47708f69df489ef2d0817194d6c804a622c86";

/**
 * Conteo de paths por slug. Un slug que perdió un path dibuja medio músculo y
 * nada más lo notaría.
 */
const EXPECTED_FRONT_COUNTS: Record<string, number> = {
  chest: 2, obliques: 16, abs: 8, biceps: 2, triceps: 2,
  neck: 5, trapezius: 2, deltoids: 2, adductors: 6, quadriceps: 6,
  knees: 4, tibialis: 2, calves: 4, forearm: 6, hands: 12,
  ankles: 4, feet: 4, head: 1, hair: 1,
};

const EXPECTED_BACK_COUNTS: Record<string, number> = {
  neck: 2, trapezius: 2, deltoids: 2, "upper-back": 6, triceps: 6,
  "lower-back": 4, forearm: 8, gluteal: 4, adductors: 2, hamstring: 8,
  calves: 8, ankles: 2, feet: 2, hands: 12, head: 1, hair: 1,
};

function countsFor(view: MuscleMapView): Record<string, number> {
  return Object.fromEntries(muscleMapGroupsFor(view).map((g) => [g.slug, g.paths.length]));
}

function allSlugs(): Set<string> {
  return new Set(MUSCLE_MAP_VIEWS.flatMap((v) => muscleMapGroupsFor(v).map((g) => g.slug)));
}

describe("muscle map geometry — checksum", () => {
  it("is the one the three platforms agree on", () => {
    const hex = createHash("sha256").update(muscleMapCanonicalString(), "utf8").digest("hex");

    expect(hex).toBe(EXPECTED_CHECKSUM);
  });

  it("shapes each line as view|slug|side|d", () => {
    const lines = muscleMapCanonicalString().split("\n");

    // La última es el resto vacío después del \n final.
    expect(lines[lines.length - 1]).toBe("");
    expect(lines.length - 1).toBe(89 + 70);

    const [view, slug, side, d] = lines[0].split("|");
    expect(view).toBe("front");
    expect(slug).toBe("chest");
    expect(side).toBe("left");
    expect(d.startsWith("M272.91")).toBe(true);
  });
});

describe("muscle map geometry — counts", () => {
  it("has 19 slugs and 89 paths in the front view", () => {
    expect(countsFor("front")).toEqual(EXPECTED_FRONT_COUNTS);
    expect(MUSCLE_MAP_FRONT).toHaveLength(19);
    expect(MUSCLE_MAP_FRONT.reduce((a, g) => a + g.paths.length, 0)).toBe(89);
  });

  it("has 16 slugs and 70 paths in the back view", () => {
    expect(countsFor("back")).toEqual(EXPECTED_BACK_COUNTS);
    expect(MUSCLE_MAP_BACK).toHaveLength(16);
    expect(MUSCLE_MAP_BACK.reduce((a, g) => a + g.paths.length, 0)).toBe(70);
  });

  it("never repeats a slug within a view", () => {
    for (const view of MUSCLE_MAP_VIEWS) {
      const slugs = muscleMapGroupsFor(view).map((g) => g.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("starts every path with a move command", () => {
    for (const view of MUSCLE_MAP_VIEWS) {
      for (const group of muscleMapGroupsFor(view)) {
        for (const path of group.paths) {
          expect(`${view}/${group.slug}: ${path.d.slice(0, 1)}`).toBe(`${view}/${group.slug}: M`);
        }
      }
    }
  });
});

describe("muscle map geometry — viewBox", () => {
  it("matches the upstream SVG wrapper", () => {
    expect(muscleMapViewBoxValue(MUSCLE_MAP_FRONT_VIEW_BOX)).toBe("0 0 724 1448");
    // El dorso NO arranca en 0: su minX es 724. Un viewBox distinto entre
    // plataformas desplaza el cuerpo y sólo se ve mirando.
    expect(muscleMapViewBoxValue(MUSCLE_MAP_BACK_VIEW_BOX)).toBe("724 0 724 1448");
    expect(muscleMapViewBoxFor("back").minX).toBe(724);
  });
});

describe("muscle map regions ↔ geometry", () => {
  it("resolves every slug a region names", () => {
    const known = allSlugs();

    for (const region of MUSCLE_MAP_REGIONS) {
      for (const slug of MUSCLE_MAP_REGION_SLUGS[region]) {
        expect(`${region}: ${known.has(slug)}`).toBe(`${region}: true`);
      }
      expect(muscleMapRegionViews(region).length).toBeGreaterThan(0);
    }
  });

  it("classifies every geometry slug as a region or as silhouette", () => {
    const known = allSlugs();
    const claimed = new Set([
      ...MUSCLE_MAP_REGIONS.flatMap((r) => [...MUSCLE_MAP_REGION_SLUGS[r]]),
      ...MUSCLE_MAP_SILHOUETTE_SLUGS,
    ]);

    // Si el upstream sube de versión y trae un slug nuevo, este test lo caza: un
    // slug sin clasificar se dibujaría (o no) sin que nadie lo decidiera.
    expect([...known].filter((s) => !claimed.has(s)).sort()).toEqual([]);
    expect([...claimed].filter((s) => !known.has(s)).sort()).toEqual([]);
  });

  it("never shares a slug between two regions", () => {
    const seen = new Map<string, MuscleMapRegion>();
    for (const region of MUSCLE_MAP_REGIONS) {
      for (const slug of MUSCLE_MAP_REGION_SLUGS[region]) {
        expect(`${slug}: ${seen.get(slug) ?? "unclaimed"}`).toBe(`${slug}: unclaimed`);
        seen.set(slug, region);
      }
    }
  });

  it("draws in the views DATA-MODEL declares", () => {
    // Derivado de la geometría, fijado acá: la tabla de `DATA-MODEL` §1.
    const front: MuscleMapView[] = ["front"];
    const back: MuscleMapView[] = ["back"];
    const both: MuscleMapView[] = ["front", "back"];
    const expected: Record<MuscleMapRegion, MuscleMapView[]> = {
      chest: front,
      shoulders: both,
      biceps: front,
      triceps: both,
      forearms: both,
      abs: front,
      obliques: front,
      upper_back: back,
      lower_back: back,
      trapezius: both,
      quadriceps: front,
      hamstrings: back,
      glutes: back,
      calves: both,
      adductors: both,
    };

    expect(Object.keys(expected)).toHaveLength(MUSCLE_MAP_REGIONS.length);
    for (const region of MUSCLE_MAP_REGIONS) {
      expect(`${region}: ${muscleMapRegionViews(region).join(",")}`).toBe(
        `${region}: ${expected[region].join(",")}`,
      );
    }
  });

  it("looks up a region by slug exactly, not fuzzily", () => {
    expect(muscleMapRegionForSlug("gluteal")).toBe("glutes");
    expect(muscleMapRegionForSlug("tibialis")).toBe("calves");
    expect(muscleMapRegionForSlug("upper-back")).toBe("upper_back");
    // Silueta: existe en el asset, no es una región.
    expect(muscleMapRegionForSlug("hands")).toBeNull();
    // El id de la región NO es el slug del asset.
    expect(muscleMapRegionForSlug("glutes")).toBeNull();
  });
});

describe("muscle map geometry — provenance", () => {
  it("is pinned to the vendored upstream commit", () => {
    expect(MUSCLE_MAP_UPSTREAM_COMMIT).toBe("15df9e2dbc621450001960bed5a30e6a75357faa");
  });
});

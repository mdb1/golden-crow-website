"use client";

// #1070 (épica #1067) — el cuerpo pintado. Twin visual de `MuscleHeatmapView.swift`
// (SwiftUI) y `MuscleHeatmap.kt` (Compose).
//
// Un SOLO componente con tres tamaños. Nada de esto se dibuja dos veces (`D-10`).
//
// DOS REGLAS DE FORMA QUE NO SON NEGOCIABLES:
//
// 1. FRENTE Y DORSO SIEMPRE JUNTOS, NUNCA UN TOGGLE. Un selector esconde la mitad
//    de la respuesta detrás de una interacción, y la pregunta que la pantalla
//    contesta ("qué músculos toca esto") no se puede responder viendo un lado.
// 2. EL CUERPO APAGADO ES UN ESTADO CON TEXTO. Una silueta gris sola se lee como
//    que la pantalla no cargó.
//
// A diferencia de iOS —que necesita su propio parser de paths— acá el navegador
// entiende `<path d="…">` de fábrica: la geometría de M0 se vuelca tal cual.

import { useTranslations } from "next-intl";

import {
  MUSCLE_MAP_VIEWS,
  muscleMapGroupsFor,
  muscleMapViewBoxValue,
  muscleMapViewBoxFor,
} from "@/lib/gc-fitness/muscle-map-geometry";
import {
  MUSCLE_MAP_REGIONS,
  muscleMapRegionForSlug,
  type MuscleMapRegion,
} from "@/lib/gc-fitness/muscle-map-region";
import {
  MUSCLE_HEATMAP_LEGEND_STEPS,
  muscleHeatmapStepClass,
} from "@/lib/gc-fitness/muscle-heatmap-palette";
import { heatmapStep, type WorkoutHeatmap } from "@/lib/gc-fitness/muscle-heatmap-aggregator";
import type { ExerciseHeatmap, MuscleHeatmapLevel } from "@/lib/gc-fitness/muscle-heatmap-resolver";

export type MuscleHeatmapSize = "compact" | "regular" | "detailed";

const BODY_HEIGHT: Record<MuscleHeatmapSize, number> = {
  compact: 96,
  regular: 200,
  detailed: 260,
};

/**
 * Lo que el componente necesita saber, YA RESUELTO. No llama al resolver ni al
 * agregador: recibe el resultado. Así el mismo componente sirve para un ejercicio
 * y para un entreno, y quien lo usa controla cuándo se recalcula.
 */
export type MuscleHeatmapContent =
  | { readonly kind: "exercise"; readonly heatmap: ExerciseHeatmap }
  | { readonly kind: "workout"; readonly heatmap: WorkoutHeatmap };

/** El escalón con el que se tiñe cada región, 0…4. */
export function muscleHeatmapContentStep(
  content: MuscleHeatmapContent,
  region: MuscleMapRegion,
): number {
  if (content.kind === "workout") return heatmapStep(content.heatmap, region);
  switch (content.heatmap.levels[region]) {
    // Con dos niveles: principal arriba de todo, secundario en el medio.
    case "primary":
      return 4;
    case "secondary":
      return 2;
    // Nivel único: un escalón propio, ni el más alto ni el más bajo — afirmar
    // "máximo" sobre un dato que no distingue sería la misma mentira que D-05
    // evita.
    case "single":
      return 3;
    default:
      return 0;
  }
}

export function isMuscleHeatmapEmpty(content: MuscleHeatmapContent): boolean {
  return content.kind === "exercise"
    ? content.heatmap.hasNoRegions
    : content.heatmap.maxSets <= 0;
}

export interface MuscleHeatmapProps {
  readonly content: MuscleHeatmapContent;
  readonly size?: MuscleHeatmapSize;
  /**
   * El texto que explica un cuerpo apagado. Lo pasa la pantalla porque el motivo
   * cambia: "este ejercicio no declara grupos" vs "esta semana no tiene nada".
   */
  readonly emptyMessage?: string;
  readonly className?: string;
}

export function MuscleHeatmap({
  content,
  size = "regular",
  emptyMessage,
  className,
}: MuscleHeatmapProps) {
  const t = useTranslations("muscleHeatmap");
  const empty = isMuscleHeatmapEmpty(content);
  const regionName = (region: MuscleMapRegion) => t(`regions.${region}`);
  const lit = MUSCLE_MAP_REGIONS.filter((r) => muscleHeatmapContentStep(content, r) > 0);
  const label = empty
    ? (emptyMessage ?? t("emptyGeneric"))
    : t("a11yWorks", { regions: lit.map(regionName).join(", ") });

  return (
    <div className={className} data-testid="muscle-heatmap">
      <div
        className="flex items-start gap-4"
        role="img"
        aria-label={label}
        data-testid="muscle-heatmap-body"
      >
        {/* Las DOS vistas, siempre. Nunca un toggle. */}
        {MUSCLE_MAP_VIEWS.map((view) => (
          <svg
            key={view}
            viewBox={muscleMapViewBoxValue(muscleMapViewBoxFor(view))}
            height={BODY_HEIGHT[size]}
            className="flex-1"
            aria-hidden="true"
            data-testid={`muscle-heatmap-view-${view}`}
          >
            {muscleMapGroupsFor(view).map((group) => {
              const region = muscleMapRegionForSlug(group.slug);
              const step = region ? muscleHeatmapContentStep(content, region) : 0;
              return group.paths.map((path, index) => (
                <path
                  key={`${group.slug}-${index}`}
                  d={path.d}
                  className={muscleHeatmapStepClass(step)}
                  data-slug={group.slug}
                  data-step={step}
                />
              ));
            })}
          </svg>
        ))}
      </div>

      {empty && emptyMessage ? (
        // Una silueta gris sola se lee como que la pantalla no cargó.
        <p className="mt-3 text-sm text-muted-foreground" data-testid="muscle-heatmap-empty">
          {emptyMessage}
        </p>
      ) : size !== "compact" ? (
        <MuscleHeatmapLegendRows content={content} />
      ) : null}
    </div>
  );
}

function MuscleHeatmapLegendRows({ content }: { readonly content: MuscleHeatmapContent }) {
  const t = useTranslations("muscleHeatmap");
  const regionName = (region: MuscleMapRegion) => t(`regions.${region}`);

  if (content.kind === "exercise") {
    const heatmap = content.heatmap;
    const names = (level: MuscleHeatmapLevel) =>
      MUSCLE_MAP_REGIONS.filter((r) => heatmap.levels[r] === level)
        .map(regionName)
        .join(", ");

    return (
      <div className="mt-3 space-y-1.5" data-testid="muscle-heatmap-legend">
        {/* La leyenda dice la verdad sobre el DATO que la produjo: con un solo
            nivel no nombra "secundario", porque nada lo es (D-05). */}
        {heatmap.legend === "primarySecondary" ? (
          <>
            <LegendRow step={4} title={t("legendPrimary")} detail={names("primary")} />
            <LegendRow step={2} title={t("legendSecondary")} detail={names("secondary")} />
          </>
        ) : (
          <LegendRow step={3} title={t("legendWorked")} detail={names("single")} />
        )}
        {heatmap.isApproximate ? (
          // La pastilla es además el medidor de progreso del backfill de M7:
          // cuando el dato mejore, deja de aparecer.
          <span
            className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
            title={t("approximateExplanation")}
            data-testid="muscle-heatmap-approximate"
          >
            {t("legendApproximate")}
          </span>
        ) : null}
      </div>
    );
  }

  const heatmap = content.heatmap;
  return (
    <div className="mt-3 space-y-1.5" data-testid="muscle-heatmap-legend">
      {MUSCLE_HEATMAP_LEGEND_STEPS.map((step) => {
        const regions = MUSCLE_MAP_REGIONS.filter((r) => heatmapStep(heatmap, r) === step);
        if (regions.length === 0) return null;
        const top = Math.max(...regions.map((r) => heatmap.setsByRegion[r] ?? 0));
        return (
          <LegendRow
            key={step}
            step={step}
            title={regions.map(regionName).join(", ")}
            // ⚠️ El número SIEMPRE al lado del color: lo relativo hace que un
            // entreno de 1 serie pinte rojo pleno, y el número es lo que calibra
            // (D-07). Sin él el color sería el único portador de la información.
            //
            // ⚠️ DOS claves, no el plural de next-intl. El valor puede ser
            // FRACCIONARIO —una región que sólo toca un motor secundario suma
            // 0,5— así que llega como texto ya formateado y no hay entero que
            // pluralizar. La regla es la única que corresponde: exactamente 1 es
            // singular, todo lo demás plural. Twin de `setsLabel` (iOS) y del
            // `setsRes` de Compose.
            detail={t(top === 1 ? "legendSetsOne" : "legendSets", {
              count: formatSets(top),
            })}
          />
        );
      })}
    </div>
  );
}

function LegendRow({
  step,
  title,
  detail,
}: {
  readonly step: number;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`muscle-heatmap-legend-${step}`}>
      <span className={`size-2.5 rounded-full ${muscleHeatmapStepClass(step)}`} aria-hidden="true" />
      <span className="font-semibold">{title}</span>
      <span className="ml-auto text-muted-foreground">{detail}</span>
    </div>
  );
}

/** "6" y no "6.0"; "1.5" cuando hay medias series (un motor secundario). */
function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

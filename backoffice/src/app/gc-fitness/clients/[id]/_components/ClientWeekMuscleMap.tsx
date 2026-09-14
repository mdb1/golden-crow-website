"use client";

// ClientWeekMuscleMap.tsx
// #1074 (épica #1067, M6, `S9`) — el heatmap de la semana del cliente, en la agenda del coach.
//
// Twin de `MuscleWeekSheet.swift` y `MuscleWeekSheet.kt`. Es donde el coach decide, así que es
// donde el desbalance tiene que ser visible ANTES de asignar.
//
// LAS DOS REGLAS QUE LA HACEN NO QUEDAR RIDÍCULA (las mismas que en las dos apps):
//
// 1. `D-09` — LOS CEROS SON EL PUNTO. La tabla lista TODAS las regiones ubicables, con los ceros
//    al final marcados "sin trabajar" y no con un 0 pelado (un cero en una columna de números se
//    lee como dato faltante). El valor no es confirmar que el cliente entrenó hombros: es ver qué
//    NO está entrenando.
//
// 2. `D-08` — LA FRASE CALLA CUANDO NO TIENE NADA QUE DECIR. El veredicto sale del twin puro
//    `muscleFocusInsight`; acá sólo se redacta. Menos de 10 series ⇒ SILENCIO, no un texto que
//    diga "poca data".
//
// ⚠️ SON 15 REGIONES, NO 13. `DATA-MODEL` §2 decía "13 grupos ubicables" sobre una tabla de 15
// filas; faltaban oblicuos y aductores. Este componente no lleva el número escrito: recorre.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MuscleHeatmap } from "@/components/gc-fitness/muscle-heatmap";
import {
  heatmapStep,
  type WorkoutHeatmap,
} from "@/lib/gc-fitness/muscle-heatmap-aggregator";
import type { MuscleFocusInsight } from "@/lib/gc-fitness/muscle-focus-insight";
import {
  getClientWeekMuscleMap,
  type ClientWeekMuscleMapPayload,
} from "@/lib/gc-fitness/client-week-muscle-actions";
import { muscleHeatmapStepClass } from "@/lib/gc-fitness/muscle-heatmap-palette";
import type { MuscleMapRegion } from "@/lib/gc-fitness/muscle-map-region";
import { cn } from "@/lib/utils";

export interface ClientWeekMuscleMapProps {
  readonly clientId: string;
  /** Cualquier día de la semana que se está mirando; el server resuelve su lunes. */
  readonly anchorCivil: string;
}

export function ClientWeekMuscleMap({ clientId, anchorCivil }: ClientWeekMuscleMapProps) {
  const t = useTranslations("muscleHeatmap");
  const [payload, setPayload] = useState<ClientWeekMuscleMapPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // ⚠️ Se calcula AL ABRIR y no con la agenda: agregar la semana lee todas las asignaciones
      // y sus snapshots, y la agenda se re-renderiza con cada movimiento de un chip.
      setPayload(await getClientWeekMuscleMap({ clientId, anchorCivil }));
    } catch {
      setError(t("weekLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (!payload) {
    return (
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2"
          data-testid="client-week-muscle-cta"
        >
          <Activity className="h-4 w-4" />
          {t("weekCta")}
        </Button>
        {error ? (
          <p className="mt-2 text-xs text-destructive" data-testid="client-week-muscle-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const empty = payload.heatmap.maxSets <= 0;
  // Las trabajadas descendente (`ranked` viene desempatado por ID de región, no por nombre
  // localizado — un nombre traducido ordenaría distinto en cada idioma y las 3 plataformas
  // dejarían de coincidir), y después los ceros.
  const rows: Array<{ region: MuscleMapRegion; sets: number }> = [
    ...payload.heatmap.ranked.map((entry) => ({ region: entry.region, sets: entry.sets })),
    ...payload.heatmap.untrained.map((region) => ({ region, sets: 0 })),
  ];

  return (
    <section className="mt-4 space-y-4 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground" data-testid="client-week-muscle-title">
        {t("weekTitle")}
      </h3>

      <MuscleHeatmap
        content={{ kind: "workout", heatmap: payload.heatmap }}
        size="detailed"
        emptyMessage={empty ? t("weekEmpty") : undefined}
      />

      {!empty ? (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("weekTableTitle")}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {rows.map(({ region, sets }) => (
                <WeekRow
                  key={region}
                  region={region}
                  sets={sets}
                  step={heatmapStep(payload.heatmap, region)}
                  label={t(`regions.${region}`)}
                  untrainedLabel={t("untrained")}
                  setsLabel={(count) =>
                    count === 1
                      ? t("legendSetsOne", { count: formatSets(count) })
                      : t("legendSets", { count: formatSets(count) })
                  }
                />
              ))}
            </ul>
          </div>
          <WeekInsight insight={payload.insight} />
        </>
      ) : null}
    </section>
  );
}

function WeekRow({
  region,
  sets,
  step,
  label,
  untrainedLabel,
  setsLabel,
}: {
  region: MuscleMapRegion;
  sets: number;
  step: number;
  label: string;
  untrainedLabel: string;
  setsLabel: (count: number) => string;
}) {
  const untrained = sets <= 0;
  return (
    <li
      className="flex items-center gap-3 px-3 py-2"
      data-testid={`client-week-muscle-row-${region}`}
    >
      {/* El MISMO helper de paleta que el cuerpo y la leyenda: el punto tiene que ser
          exactamente el color con el que está pintada la región que nombra. */}
      <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", muscleHeatmapStepClass(step))} />
      <span className={cn("flex-1 text-sm", untrained ? "text-muted-foreground" : "text-foreground")}>
        {label}
      </span>
      {untrained ? (
        // ⚠️ La PALABRA y no un 0: un cero en una columna de números se lee como dato faltante,
        // y `D-09` quiere hacer una afirmación.
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {untrainedLabel}
        </span>
      ) : (
        <span className="text-sm font-medium tabular-nums text-foreground">{setsLabel(sets)}</span>
      )}
    </li>
  );
}

function WeekInsight({ insight }: { insight: MuscleFocusInsight }) {
  const t = useTranslations("muscleHeatmap");
  const region = (value: MuscleMapRegion) => t(`regions.${value}`);

  // SILENCIO. No un texto que diga "poca data" — nada. Ver el docblock de arriba.
  if (insight.verdict.kind === "tooLittleData") return null;

  const text =
    insight.verdict.kind === "balanced"
      ? t("weekInsightBalanced")
      : insight.verdict.low
        ? t("weekInsightFocus", {
            top: region(insight.verdict.top),
            low: region(insight.verdict.low),
          })
        : // Una sola región con series: no hay un "menos" contra el cual comparar, y `D-08`
          // prohíbe comparar contra un grupo en 0.
          t("weekInsightFocusSingle", { top: region(insight.verdict.top) });

  return (
    <p
      className="rounded-lg bg-muted/50 p-3 text-sm text-foreground"
      data-testid="client-week-muscle-insight"
    >
      {text}
    </p>
  );
}

/** "6" y no "6.0"; "1.5" cuando hay medias series (un motor secundario). */
function formatSets(sets: number): number {
  return Math.round(sets * 10) / 10;
}

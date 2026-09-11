"use client";

// #1071 (épica #1067) — la sección "Músculos que trabaja" del ejercicio. Twin de
// `ExerciseMuscleHeatmapSection.swift` y `.kt`.
//
// Es el envoltorio que comparten las DOS superficies de M3: la ficha
// (`/exercises/[id]/view`) y el editor (`ExerciseForm`). Lo mismo en las dos,
// porque la pregunta es la misma —"¿qué toca esto?"— y en el editor además
// contesta "¿lo que elegí es lo que quise decir?".
//
// ⚠️ TOMA UN `MuscleHeatmapExercise`, no un documento. En la ficha da igual,
// pero en el editor es lo que permite alimentarlo desde los valores VIVOS del
// formulario (`form.watch`) en vez de desde Firestore: el heatmap se tiene que
// mover al cambiar un grupo, antes de guardar.

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import {
  MuscleHeatmap,
  type MuscleHeatmapSize,
} from "@/components/gc-fitness/muscle-heatmap";
import {
  resolveExerciseHeatmap,
  type MuscleHeatmapExercise,
} from "@/lib/gc-fitness/muscle-heatmap-resolver";

export interface ExerciseMuscleHeatmapSectionProps {
  readonly exercise: MuscleHeatmapExercise;
  readonly size?: MuscleHeatmapSize;
  readonly className?: string;
}

export function ExerciseMuscleHeatmapSection({
  exercise,
  size = "regular",
  className,
}: ExerciseMuscleHeatmapSectionProps) {
  const t = useTranslations("muscleHeatmap");
  // El editor recompone en cada cambio del formulario: se memoiza por la entrada.
  const heatmap = useMemo(() => resolveExerciseHeatmap(exercise), [exercise]);

  return (
    <section className={className} data-testid="exercise-heatmap-section">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t("title")}</h2>

      <MuscleHeatmap
        content={{ kind: "exercise", heatmap }}
        size={size}
        // El motivo del cuerpo apagado es específico de esta superficie: acá
        // siempre es "este ejercicio no declara grupos".
        emptyMessage={t("emptyExercise")}
      />

      {heatmap.isApproximate ? (
        // La explicación no va en un tooltip: en una lista larga nadie mantiene
        // el puntero encima para descubrir por qué el cuerpo se pintó entero.
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="exercise-heatmap-approximate-explanation"
        >
          {t("approximateExplanation")}
        </p>
      ) : null}
    </section>
  );
}

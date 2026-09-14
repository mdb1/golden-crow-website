/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "../../../../messages/en.json";
import {
  WorkoutMuscleHeatmapSection,
  type WorkoutHeatmapExerciseInput,
} from "../workout-muscle-heatmap-section";
import type { MuscleHeatmapExercise } from "@/lib/gc-fitness/muscle-heatmap-resolver";

/**
 * #1072 (épica #1067) — la sección tal como la montan la ficha de la rutina y el
 * editor de plantillas.
 *
 * Lo que se afirma acá es la SUPERFICIE, no los números: que el componente lee la
 * prescripción con las mismas reglas que el twin (`plannedSetSlotCount`,
 * calentamientos fuera), que la leyenda lleva el NÚMERO de series al lado del
 * color, y que un entreno sin señal muestra su texto en vez de un recuadro vacío.
 * Los escalones y los pesos ya están cubiertos por los tests twin de M1/M4.
 */

const LIBRARY: Record<string, MuscleHeatmapExercise> = {
  bench: { muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest" },
  curl: { muscleGroups: ["biceps"] },
  run: { muscleGroups: ["cardio"] },
};

function renderSection(
  exercises: readonly WorkoutHeatmapExerciseInput[],
  exercisesById: Record<string, MuscleHeatmapExercise> = LIBRARY,
  emptyMessage?: string,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <WorkoutMuscleHeatmapSection
        exercises={exercises}
        exercisesById={exercisesById}
        emptyMessage={emptyMessage}
      />
    </NextIntlClientProvider>,
  );
}

describe("<WorkoutMuscleHeatmapSection />", () => {
  it("monta el cuerpo con su título", () => {
    renderSection([{ exerciseId: "bench", sets: 4 }]);

    expect(screen.getByTestId("workout-heatmap-section")).toBeInTheDocument();
    expect(screen.getByTestId("muscle-heatmap-body")).toBeInTheDocument();
    expect(screen.getByText("Muscles worked", { selector: "h2" })).toBeInTheDocument();
  });

  it("la leyenda muestra el NÚMERO de series al lado del color", () => {
    // D-07 — la intensidad es relativa al máximo del propio entreno, así que un
    // entreno de una serie pinta rojo pleno. El número es lo único que calibra.
    renderSection([{ exerciseId: "bench", sets: 4 }]);

    // Pecho 4 (primario) → escalón 4; tríceps 2 (secundario × 0.5) → escalón 3.
    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("4 sets");
    expect(screen.getByTestId("muscle-heatmap-legend-3")).toHaveTextContent("2 sets");
  });

  it("el grupo con más series queda en el escalón más alto y el de menos en el más bajo", () => {
    renderSection([
      { exerciseId: "bench", sets: 12 },
      { exerciseId: "curl", sets: 1 },
    ]);

    // Pecho 12 → escalón 4; bíceps 1 → 1/12 → escalón 1.
    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("Chest");
    expect(screen.getByTestId("muscle-heatmap-legend-1")).toHaveTextContent("Biceps");
  });

  it("los calentamientos NO cuentan", () => {
    // Cinco filas, dos de calentamiento ⇒ el pecho suma 3, no 5. Es la regla
    // heredada de `MuscleGroupProgress`: contarlos pintaría más fuerte al que
    // más calienta.
    renderSection([
      {
        exerciseId: "bench",
        sets: 5,
        setTypesBySet: ["warmup", "warmup", "normal", "normal", "normal"],
      },
    ]);

    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("3 sets");
  });

  it("cuenta plannedSetSlotCount, no `sets`", () => {
    // #562 — un documento desalineado (`sets: 3` con 4 reps por serie) le muestra
    // al coach CUATRO filas. Contar 3 pintaría un cuerpo que no coincide con la
    // lista que tiene al lado.
    renderSection([{ exerciseId: "bench", sets: 3, repsBySet: [10, 10, 8, 8] }]);

    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("4 sets");
  });

  it("una sola serie dice «1 serie», no «1 series»", () => {
    // #1072 es la primera fase que RENDERIZA este conteo, y la primera en la que
    // se vio el singular mal. No se puede resolver con el plural de next-intl: el
    // valor puede ser fraccionario (0,5 cuando la región sólo toca un motor
    // secundario), así que llega ya formateado y no hay entero que pluralizar.
    renderSection([{ exerciseId: "curl", sets: 1 }]);

    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("1 set");
    expect(screen.getByTestId("muscle-heatmap-legend-4")).not.toHaveTextContent("1 sets");
  });

  it("media serie (un motor secundario solo) va en PLURAL", () => {
    // 0,5 no es 1: en inglés y en español el fraccionario va en plural. Es el caso
    // que hace que la regla no pueda ser "≤ 1 ⇒ singular".
    renderSection([{ exerciseId: "bench", sets: 1 }]);

    // Pecho 1 (primario, el máximo) → escalón 4, "1 set". Tríceps y hombros 0,5
    // (secundarios × 0.5) → 0,5/1 = 0,50 → escalón 3, "0.5 sets".
    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("1 set");
    expect(screen.getByTestId("muscle-heatmap-legend-3")).toHaveTextContent("0.5 sets");
  });

  it("un ejercicio que la biblioteca no resuelve no inventa regiones", () => {
    renderSection([{ exerciseId: "desconocido", sets: 3 }]);

    expect(screen.getByTestId("muscle-heatmap-empty")).toBeInTheDocument();
  });

  it("un entreno sin regiones muestra su TEXTO, no un recuadro vacío", () => {
    // Una silueta gris sola se lee como que la pantalla no cargó.
    renderSection([{ exerciseId: "run", sets: 3 }]);

    expect(screen.getByTestId("muscle-heatmap-empty")).toHaveTextContent(
      "None of this workout’s exercises declare muscle groups.",
    );
  });

  it("el texto del cuerpo apagado lo decide la pantalla", () => {
    // Una rutina vacía se está EMPEZANDO: decirle "ningún ejercicio declara
    // grupos" sería un reproche por algo que todavía no hizo.
    renderSection([], LIBRARY, enMessages.muscleHeatmap.emptyRoutine);

    expect(screen.getByTestId("muscle-heatmap-empty")).toHaveTextContent(
      "Add exercises to see which muscles this routine works.",
    );
  });
});

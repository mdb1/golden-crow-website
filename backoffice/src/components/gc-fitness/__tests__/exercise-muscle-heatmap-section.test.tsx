/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "../../../../messages/en.json";
import { ExerciseMuscleHeatmapSection } from "../exercise-muscle-heatmap-section";

/**
 * #1071 (épica #1067) — la sección tal como la montan la ficha y el editor.
 *
 * Lo que se afirma acá es la SUPERFICIE, no los números: que la leyenda que
 * aparece es la que le corresponde al dato, que la explicación de «Aproximado»
 * sólo sale cuando el dato es flojo, y que un ejercicio sin grupos muestra su
 * texto en vez de un recuadro vacío. Los niveles y los pesos ya están cubiertos
 * por los tests twin de M1.
 */

function renderSection(exercise: {
  muscleGroups: string[];
  primaryMuscleGroup?: string | null;
  secondaryMuscles?: string[];
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ExerciseMuscleHeatmapSection exercise={exercise} />
    </NextIntlClientProvider>,
  );
}

describe("<ExerciseMuscleHeatmapSection />", () => {
  it("monta el cuerpo con su título", () => {
    renderSection({ muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest" });

    expect(screen.getByTestId("exercise-heatmap-section")).toBeInTheDocument();
    expect(screen.getByTestId("muscle-heatmap-body")).toBeInTheDocument();
    expect(screen.getByText("Muscles worked", { selector: "h2" })).toBeInTheDocument();
  });

  it("con dato completo muestra «Principal / Secundario»", () => {
    renderSection({ muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest" });

    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
  });

  it("SIN primaryMuscleGroup muestra «Grupos trabajados», no dos niveles", () => {
    // D-05 — es el 40 % de la biblioteca. La leyenda no puede nombrar un nivel
    // que ninguna región tiene.
    renderSection({ muscleGroups: ["biceps", "forearms"] });

    expect(screen.getAllByText("Muscles worked").length).toBeGreaterThan(1); // título + leyenda
    expect(screen.queryByText("Secondary")).not.toBeInTheDocument();
  });

  it("explica el «Aproximado» con TEXTO, no con un tooltip", () => {
    // En una lista larga nadie mantiene el puntero encima para descubrir por qué
    // el cuerpo se pintó entero.
    renderSection({ muscleGroups: ["legs"] });

    expect(screen.getByTestId("exercise-heatmap-approximate-explanation")).toHaveTextContent(
      /legs/i,
    );
  });

  it("NO explica nada cuando el dato es preciso", () => {
    renderSection({ muscleGroups: ["quadriceps"], primaryMuscleGroup: "quadriceps" });

    expect(
      screen.queryByTestId("exercise-heatmap-approximate-explanation"),
    ).not.toBeInTheDocument();
  });

  it("un ejercicio sin grupos muestra su TEXTO, no un recuadro vacío", () => {
    renderSection({ muscleGroups: ["cardio"] });

    expect(screen.getByTestId("muscle-heatmap-empty")).toHaveTextContent(
      "This exercise doesn’t declare muscle groups.",
    );
  });

  it("refleja EXACTAMENTE lo que el editor va a guardar", () => {
    // El editor arma `muscleGroups = [primario, ...secundarios]` y pasa el
    // primario aparte. Si la sección leyera otra cosa, mostraría una cosa y
    // guardaría otra.
    const { container } = renderSection({
      muscleGroups: ["chest", "triceps", "shoulders"],
      primaryMuscleGroup: "chest",
    });

    expect(container.querySelector('path[data-slug="chest"]')).toHaveAttribute("data-step", "4");
    expect(container.querySelector('path[data-slug="triceps"]')).toHaveAttribute("data-step", "2");
    expect(container.querySelector('path[data-slug="deltoids"]')).toHaveAttribute("data-step", "2");
  });
});

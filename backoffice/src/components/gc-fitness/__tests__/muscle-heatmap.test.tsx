/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "../../../../messages/en.json";
import { MuscleHeatmap, type MuscleHeatmapContent } from "../muscle-heatmap";
import { aggregateWorkoutHeatmap } from "@/lib/gc-fitness/muscle-heatmap-aggregator";
import { resolveExerciseHeatmap } from "@/lib/gc-fitness/muscle-heatmap-resolver";
import { MUSCLE_MAP_REGIONS, MUSCLE_MAP_SILHOUETTE_SLUGS } from "@/lib/gc-fitness/muscle-map-region";

/**
 * #1070 (épica #1067) — el único test de render que la épica pide con nombre.
 *
 * Lo que se afirma acá es lo que SÓLO se puede afirmar en pantalla: que están
 * las dos vistas, que se tiñen las regiones esperadas, que el cuerpo apagado
 * lleva su texto y que la leyenda cambia con el dato que la produjo. Los números
 * y los niveles ya están afirmados en los tests twin del twin puro, donde son
 * baratos y exhaustivos — repetirlos acá sería probar Tailwind.
 */

function renderHeatmap(props: React.ComponentProps<typeof MuscleHeatmap>) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MuscleHeatmap {...props} />
    </NextIntlClientProvider>,
  );
}

const exercise = (
  muscleGroups: string[],
  primaryMuscleGroup: string | null = null,
  secondaryMuscles: string[] = [],
): MuscleHeatmapContent => ({
  kind: "exercise",
  heatmap: resolveExerciseHeatmap({ muscleGroups, primaryMuscleGroup, secondaryMuscles }),
});

function stepOf(container: HTMLElement, slug: string): number {
  const path = container.querySelector(`path[data-slug="${slug}"]`);
  return Number(path?.getAttribute("data-step") ?? -1);
}

describe("<MuscleHeatmap /> — el cuerpo", () => {
  it("dibuja LAS DOS vistas, siempre — nunca un toggle", () => {
    // Un selector escondería la mitad de la respuesta detrás de una interacción.
    renderHeatmap({ content: exercise(["chest"]) });

    expect(screen.getByTestId("muscle-heatmap-view-front")).toBeInTheDocument();
    expect(screen.getByTestId("muscle-heatmap-view-back")).toBeInTheDocument();
  });

  it("usa el viewBox de cada vista — el dorso NO arranca en 0", () => {
    renderHeatmap({ content: exercise(["chest"]) });

    expect(screen.getByTestId("muscle-heatmap-view-front")).toHaveAttribute("viewBox", "0 0 724 1448");
    expect(screen.getByTestId("muscle-heatmap-view-back")).toHaveAttribute("viewBox", "724 0 724 1448");
  });

  it("dibuja los 159 paths de la geometría", () => {
    const { container } = renderHeatmap({ content: exercise(["chest"]) });

    expect(container.querySelectorAll("path")).toHaveLength(159);
  });

  it("tiñe las regiones del ejercicio y deja el resto en el escalón 0", () => {
    const { container } = renderHeatmap({ content: exercise(["chest", "triceps"], "chest") });

    expect(stepOf(container, "chest")).toBe(4); // primario
    expect(stepOf(container, "triceps")).toBe(2); // secundario
    expect(stepOf(container, "quadriceps")).toBe(0); // sin tocar
  });

  it("NUNCA tiñe la silueta — cabeza, manos y pies quedan en 0", () => {
    // `full_body` enciende las 15 regiones; la silueta no es una región.
    const { container } = renderHeatmap({ content: exercise(["full_body"]) });

    for (const slug of MUSCLE_MAP_SILHOUETTE_SLUGS) {
      const path = container.querySelector(`path[data-slug="${slug}"]`);
      if (path) expect(`${slug}:${path.getAttribute("data-step")}`).toBe(`${slug}:0`);
    }
  });

  it("le da al cuerpo una etiqueta accesible con los grupos POR NOMBRE", () => {
    // El color no puede ser el único portador de la información.
    renderHeatmap({ content: exercise(["chest", "triceps"], "chest") });

    expect(screen.getByRole("img")).toHaveAccessibleName(/Chest/);
  });
});

describe("<MuscleHeatmap /> — el cuerpo apagado", () => {
  it("muestra el TEXTO, no sólo una silueta gris", () => {
    // Una silueta gris sola se lee como que la pantalla no cargó.
    renderHeatmap({
      content: exercise(["cardio"]),
      emptyMessage: "This exercise doesn’t declare muscle groups.",
    });

    expect(screen.getByTestId("muscle-heatmap-empty")).toHaveTextContent(
      "This exercise doesn’t declare muscle groups.",
    );
  });

  it("no tiñe NADA en vez de teñir todo", () => {
    // Pintar "todas" como fallback es la lectura opuesta a la verdad.
    const { container } = renderHeatmap({ content: exercise(["cardio"]), emptyMessage: "x" });

    const steps = [...container.querySelectorAll("path")].map((p) => p.getAttribute("data-step"));
    expect(new Set(steps)).toEqual(new Set(["0"]));
  });

  it("cambia la leyenda por el mensaje cuando el cuerpo está apagado", () => {
    renderHeatmap({ content: exercise(["cardio"]), emptyMessage: "x" });

    expect(screen.queryByTestId("muscle-heatmap-legend")).not.toBeInTheDocument();
  });
});

describe("<MuscleHeatmap /> — la leyenda dice la verdad sobre su dato", () => {
  it("dice «Principal / Secundario» cuando el dato distingue", () => {
    renderHeatmap({ content: exercise(["chest", "triceps"], "chest") });

    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(screen.queryByText("Muscles worked")).not.toBeInTheDocument();
  });

  it("dice «Grupos trabajados» y NO nombra «Secundario» cuando hay un solo nivel", () => {
    // D-05: una leyenda que nombra un nivel que ninguna región tiene miente
    // igual que pintar el cuerpo entero de rojo.
    renderHeatmap({ content: exercise(["biceps", "forearms"]) });

    expect(screen.getByText("Muscles worked")).toBeInTheDocument();
    expect(screen.queryByText("Secondary")).not.toBeInTheDocument();
  });

  it("muestra la pastilla «Aproximado» sólo cuando el dato es flojo", () => {
    renderHeatmap({ content: exercise(["legs"]) });
    expect(screen.getByTestId("muscle-heatmap-approximate")).toBeInTheDocument();
  });

  it("no muestra la pastilla cuando hay una señal fina", () => {
    renderHeatmap({ content: exercise(["quadriceps"]) });
    expect(screen.queryByTestId("muscle-heatmap-approximate")).not.toBeInTheDocument();
  });

  it("pone EL NÚMERO de series al lado del color en un entreno", () => {
    // D-07: lo relativo hace que un entreno de 1 serie pinte rojo pleno. El
    // número es lo que calibra, y sin él el color miente por comparación.
    const heatmap = aggregateWorkoutHeatmap(
      Array.from({ length: 12 }, () => ({ exerciseId: "bench", isWarmup: false })),
      { bench: { muscleGroups: ["chest", "triceps"], primaryMuscleGroup: "chest" } },
    );
    renderHeatmap({ content: { kind: "workout", heatmap } });

    expect(screen.getByTestId("muscle-heatmap-legend-4")).toHaveTextContent("12 sets");
    expect(screen.getByTestId("muscle-heatmap-legend-3")).toHaveTextContent("6 sets");
  });
});

describe("<MuscleHeatmap /> — tamaños", () => {
  it("compact no muestra leyenda", () => {
    renderHeatmap({ content: exercise(["chest"], "chest"), size: "compact" });

    expect(screen.queryByTestId("muscle-heatmap-legend")).not.toBeInTheDocument();
  });

  it("regular y detailed sí", () => {
    for (const size of ["regular", "detailed"] as const) {
      const { unmount } = renderHeatmap({ content: exercise(["chest", "triceps"], "chest"), size });
      expect(screen.getByTestId("muscle-heatmap-legend")).toBeInTheDocument();
      unmount();
    }
  });

  it("cada tamaño usa su alto", () => {
    const { container, unmount } = renderHeatmap({ content: exercise(["chest"]), size: "compact" });
    expect(container.querySelector("svg")).toHaveAttribute("height", "96");
    unmount();
    const { container: c2 } = renderHeatmap({ content: exercise(["chest"]), size: "detailed" });
    expect(c2.querySelector("svg")).toHaveAttribute("height", "260");
  });
});

describe("<MuscleHeatmap /> — traducciones", () => {
  it("tiene un nombre para las 15 regiones", () => {
    // Una región sin traducción renderiza la CLAVE cruda en la leyenda.
    const messages = enMessages as unknown as { muscleHeatmap: { regions: Record<string, string> } };
    for (const region of MUSCLE_MAP_REGIONS) {
      expect(`${region}:${Boolean(messages.muscleHeatmap.regions[region])}`).toBe(`${region}:true`);
    }
  });
});

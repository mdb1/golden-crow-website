/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "../../../../../../../messages/en.json";
import { aggregateWorkoutHeatmap } from "@/lib/gc-fitness/muscle-heatmap-aggregator";
import { muscleFocusInsight } from "@/lib/gc-fitness/muscle-focus-insight";
import { plannedHeatmapSets } from "@/lib/gc-fitness/muscle-heatmap-sets";
import type { MuscleHeatmapExercise } from "@/lib/gc-fitness/muscle-heatmap-resolver";
import { MUSCLE_MAP_REGIONS } from "@/lib/gc-fitness/muscle-map-region";

/**
 * #1074 (épica #1067, M6, `S9`) — la vista semanal de músculos del cliente, en la agenda del
 * coach. Twin de `MuscleHeatmapWeekUITests` (iOS) y `MuscleHeatmapWeekTest` (Android).
 *
 * ## Qué se afirma acá, y qué NO
 *
 * La agregación y el umbral de la frase ya están cubiertos con vectores por los tests twin de
 * M1 (`muscle-heatmap-aggregator.test.ts`, `muscle-focus-insight.test.ts`), en las tres
 * plataformas. Repetirlos acá sería probar React.
 *
 * Lo que sólo se puede afirmar montando el componente son tres cosas:
 *
 * 1. **Que la tabla lista TODAS las regiones, incluidas las que tienen cero**, marcadas
 *    "sin trabajar". Es `D-09` y es la mitad del ticket: el valor no es confirmar que el
 *    cliente entrenó hombros, es ver qué NO está entrenando. Un `.filter(sets > 0)` colado en
 *    el render pasaría todos los tests del twin.
 * 2. **Que con menos de 10 series la frase NO SE DIBUJA.** Es `D-08`, es SILENCIO y no un
 *    texto más suave. El twin puede devolver `tooLittleData` perfectamente y el componente
 *    igual pintar algo.
 * 3. **Que el cuerpo apagado muestra su texto** en vez de un recuadro vacío, que se lee como
 *    que la pantalla no cargó.
 *
 * ⚠️ SON 15 REGIONES, NO 13 (`DATA-MODEL` §2 decía 13 sobre una tabla de 15: faltaban
 * oblicuos y aductores). El número sale de `MUSCLE_MAP_REGIONS`, no de un literal.
 */

// El server action se stubbea: este test es sobre el RENDER. Que la ventana sea la semana
// calendario y no la rodante de ±3 días es responsabilidad del action y vive en su propio
// comentario; acá se le entrega el payload ya resuelto.
const mockGetClientWeekMuscleMap = jest.fn();
jest.mock("@/lib/gc-fitness/client-week-muscle-actions", () => ({
  getClientWeekMuscleMap: (...args: unknown[]) => mockGetClientWeekMuscleMap(...args),
}));

import { ClientWeekMuscleMap } from "../ClientWeekMuscleMap";

const LIBRARY: Record<string, MuscleHeatmapExercise> = {
  press: { muscleGroups: ["shoulders"], primaryMuscleGroup: "shoulders" },
  squat: { muscleGroups: ["quadriceps"], primaryMuscleGroup: "quadriceps" },
};

/** La MISMA fixture que las dos apps: 14 de hombro + 6 de cuádriceps, cero de isquios. */
function weekPayload(shoulderSets: number, quadSets: number) {
  const sets = plannedHeatmapSets([
    { exerciseId: "press", setCount: shoulderSets },
    { exerciseId: "squat", setCount: quadSets },
  ]);
  const heatmap = aggregateWorkoutHeatmap(sets, LIBRARY);
  const totalSets = sets.filter((s) => !s.isWarmup).length;
  return {
    weekStartCivil: "2026-09-07",
    weekEndCivil: "2026-09-13",
    heatmap,
    insight: muscleFocusInsight(heatmap, totalSets),
    totalSets,
  };
}

async function open(payload: unknown) {
  mockGetClientWeekMuscleMap.mockResolvedValue(payload);
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ClientWeekMuscleMap clientId="client-1" anchorCivil="2026-09-09" />
    </NextIntlClientProvider>,
  );
  await userEvent.click(screen.getByTestId("client-week-muscle-cta"));
  await waitFor(() => expect(screen.getByTestId("client-week-muscle-title")).toBeInTheDocument());
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("La semana del cliente — la tabla (D-09)", () => {
  it("lista TODAS las regiones, incluidas las que tienen cero series", async () => {
    await open(weekPayload(14, 6));

    for (const region of MUSCLE_MAP_REGIONS) {
      expect(screen.getByTestId(`client-week-muscle-row-${region}`)).toBeInTheDocument();
    }
    // Y son 15, no 13: la corrección que arrastra esta fase.
    expect(MUSCLE_MAP_REGIONS).toHaveLength(15);
  });

  it("marca el grupo sin entrenar con la PALABRA, no con un cero", async () => {
    await open(weekPayload(14, 6));

    const row = screen.getByTestId("client-week-muscle-row-hamstrings");
    expect(row).toHaveTextContent(enMessages.muscleHeatmap.untrained);
    // Un cero en una columna de números se lee como dato faltante; `D-09` hace una afirmación.
    expect(row).not.toHaveTextContent("0 sets");
  });

  it("muestra el conteo de la SEMANA en el grupo con más series", async () => {
    await open(weekPayload(14, 6));

    expect(screen.getByTestId("client-week-muscle-row-shoulders")).toHaveTextContent("14");
  });
});

describe("La semana del cliente — la frase (D-08)", () => {
  it("la dice cuando la semana tiene series de sobra y un foco real", async () => {
    await open(weekPayload(14, 6));

    // 14/6 = 2.33× ⇒ arriba del `FOCUS_RATIO` de 2 ⇒ foco, no "equilibrada".
    expect(screen.getByTestId("client-week-muscle-insight")).toBeInTheDocument();
  });

  it("⚠️ CALLA en una semana de menos de 10 series", async () => {
    // 2 + 1 = 3 series, debajo del `MIN_SETS_FOR_INSIGHT` de 10.
    await open(weekPayload(2, 1));

    // `D-08` no pide un texto más suave: pide SILENCIO. Una afirmación sobre el foco de una
    // semana de 3 series destruye la confianza en todos los demás números, y es la parte de la
    // feature que más se comparte por captura de pantalla.
    expect(screen.queryByTestId("client-week-muscle-insight")).not.toBeInTheDocument();
    // Pero la tabla sí está: los ceros siguen siendo informativos aunque la frase calle.
    expect(screen.getByTestId("client-week-muscle-row-hamstrings")).toBeInTheDocument();
  });
});

describe("La semana del cliente — la semana vacía", () => {
  it("muestra el texto del cuerpo apagado en vez de un recuadro vacío", async () => {
    await open(weekPayload(0, 0));

    expect(screen.getByText(enMessages.muscleHeatmap.weekEmpty)).toBeInTheDocument();
    // Sin series no hay tabla ni frase que mostrar.
    expect(screen.queryByTestId("client-week-muscle-row-hamstrings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("client-week-muscle-insight")).not.toBeInTheDocument();
  });
});

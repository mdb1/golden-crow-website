/**
 * #1070 (épica #1067) — el escalón de intensidad → la clase de color con la que
 * se tiñe. Twin de `MuscleHeatmapPalette.swift` y `MuscleHeatmapPalette.kt`.
 *
 * ⚠️ LA RAMPA ES CÁLIDA A PROPÓSITO: rojo → naranja → ámbar → ámbar al 40 %.
 * No rojo→verde. Varía en LUMINANCIA además de en tono, así que sigue siendo
 * legible con daltonismo rojo-verde. Y la leyenda siempre muestra el NÚMERO de
 * series al lado del color: el color ordena, el número calibra.
 *
 * ⚠️ `SCREENS.md` proponía `StatYellow` para el escalón medio. **Ese token no
 * existe** en ninguna de las 3 plataformas; en iOS un color inexistente NO falla,
 * se dibuja y no se ve (memoria `ios-missing-color-asset-silent`). El medio usa
 * el ámbar de marca, que sí existe en las tres.
 *
 * Acá las clases son de Tailwind y los valores salen de las CSS vars del tema
 * (`globals.css` → `.gc-fitness-theme`), no de literales sueltos en el JSX.
 *
 * ⚠️ EL ESCALÓN 0 ES UN GRIS VISIBLE, no el color de la superficie. `SCREENS.md`
 * mandaba `SurfaceElevatedColor`, que en modo claro es BLANCO PURO: la silueta
 * quedaba pintada de blanco sobre una tarjeta blanca, el cuerpo se veía flotando
 * en pedazos sin cabeza ni manos, y el estado "sin grupos musculares" —que
 * existe justamente para mostrar una silueta apagada— salía como un recuadro
 * vacío. Se descubrió MIRANDO EL PNG de iOS; ningún test lo veía.
 */

/** El escalón más alto que produce el agregador. */
export const MUSCLE_HEATMAP_MAX_STEP = 4;

/**
 * Los escalones que la leyenda lista, de mayor a menor. El 0 no aparece: "sin
 * trabajo" es la silueta, y en `detailed` los ceros se nombran en la tabla, que
 * es donde un cero es informativo (`D-09`).
 */
export const MUSCLE_HEATMAP_LEGEND_STEPS: readonly number[] = [4, 3, 2, 1];

/**
 * La clase de relleno de cada escalón. Devuelve `fill-*` para los `<path>` del
 * SVG y `bg-*` para el punto de la leyenda — Tailwind necesita las dos, y una
 * sola clase no sirve para ambos.
 */
export function muscleHeatmapStepClass(step: number): string {
  switch (step) {
    case 4:
      return "fill-[var(--gc-heat-max)] bg-[var(--gc-heat-max)]";
    case 3:
      return "fill-[var(--gc-heat-high)] bg-[var(--gc-heat-high)]";
    case 2:
      return "fill-[var(--gc-heat-mid)] bg-[var(--gc-heat-mid)]";
    case 1:
      return "fill-[var(--gc-heat-low)] bg-[var(--gc-heat-low)]";
    default:
      return "fill-[var(--gc-heat-none)] bg-[var(--gc-heat-none)]";
  }
}

/** El umbral inferior de cada escalón, para la leyenda ("≥ 75 %", …). */
export function muscleHeatmapLowerBound(step: number): number {
  switch (step) {
    case 4:
      return 0.75;
    case 3:
      return 0.5;
    case 2:
      return 0.25;
    default:
      return 0;
  }
}

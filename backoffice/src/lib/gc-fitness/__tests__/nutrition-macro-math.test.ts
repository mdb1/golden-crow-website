// nutrition-macro-math.test.ts
// The kcal hint the plan editors print under the macro grid (#949).

import {
  KCAL_MISMATCH_TOLERANCE,
  MACRO_GRAMS_TOLERANCE,
  estimateKcalFromMacros,
  macroKcalMismatch,
  rollupDeltaIsWorthShowing,
  rollupMealMacros,
} from "../nutrition-macro-math";

describe("estimateKcalFromMacros", () => {
  it("applies the 4/4/9 factors", () => {
    // The screenshot in #949: 90 P / 280 C / 50 G against a typed 2000 kcal.
    expect(estimateKcalFromMacros({ proteinG: 90, carbsG: 280, fatG: 50 })).toEqual({
      kcal: 1930,
      macrosUsed: 3,
      isPartial: false,
    });
  });

  it("returns null when no macro is set — there is no claim to check", () => {
    expect(estimateKcalFromMacros({})).toBeNull();
    expect(
      estimateKcalFromMacros({ proteinG: null, carbsG: null, fatG: undefined }),
    ).toBeNull();
  });

  it("estimates from a PARTIAL set and says so, instead of treating blanks as zero", () => {
    const estimate = estimateKcalFromMacros({ proteinG: 180 });
    expect(estimate).toEqual({ kcal: 720, macrosUsed: 1, isPartial: true });
  });

  it("counts an explicit zero as a set macro", () => {
    // A coach who typed 0 g of fat made a statement; a blank field did not.
    expect(estimateKcalFromMacros({ proteinG: 100, carbsG: 100, fatG: 0 })).toEqual({
      kcal: 800,
      macrosUsed: 3,
      isPartial: false,
    });
  });

  it("rounds to whole kilocalories", () => {
    expect(estimateKcalFromMacros({ proteinG: 90.5, carbsG: 0, fatG: 0 })?.kcal).toBe(362);
  });
});

describe("macroKcalMismatch", () => {
  it("reports the signed gap once it is worth reporting", () => {
    const estimate = estimateKcalFromMacros({ proteinG: 90, carbsG: 280, fatG: 100 });
    // 1 380 + 900 = 2 380 against a typed 2 000.
    expect(macroKcalMismatch(2000, estimate)).toBe(380);
    expect(macroKcalMismatch(2800, estimate)).toBe(-420);
  });

  it("stays quiet inside the tolerance", () => {
    const estimate = estimateKcalFromMacros({ proteinG: 90, carbsG: 280, fatG: 50 });
    expect(estimate?.kcal).toBe(1930);
    expect(macroKcalMismatch(1930, estimate)).toBeNull();
    expect(macroKcalMismatch(1930 - (KCAL_MISMATCH_TOLERANCE - 1), estimate)).toBeNull();
    expect(macroKcalMismatch(1930 - KCAL_MISMATCH_TOLERANCE, estimate)).toBe(
      KCAL_MISMATCH_TOLERANCE,
    );
  });

  it("never flags a partial estimate — it is low by construction", () => {
    const partial = estimateKcalFromMacros({ proteinG: 180 });
    expect(partial?.isPartial).toBe(true);
    expect(macroKcalMismatch(2400, partial)).toBeNull();
  });

  it("needs both sides: no macros or no calorie target means nothing to compare", () => {
    expect(macroKcalMismatch(2000, null)).toBeNull();
    expect(macroKcalMismatch(null, estimateKcalFromMacros({ proteinG: 90, carbsG: 280, fatG: 50 })))
      .toBeNull();
  });
});

// ── #961 — ¿las comidas suman el día? ────────────────────────────────────────────────

describe("rollupMealMacros", () => {
  /** El plan del issue: 2000 / 90 / 280 / 55, repartido en cuatro comidas. */
  const targets = { kcal: 2000, proteinG: 90, carbsG: 280, fatG: 55 };
  const fourMeals = [
    { kcal: 160, proteinG: 21, carbsG: 5, fatG: 5 },
    { kcal: 700, proteinG: 50, carbsG: 70, fatG: 20 },
    { kcal: 300, proteinG: 20, carbsG: 50, fatG: 10 },
    { kcal: 600, proteinG: 40, carbsG: 60, fatG: 20 },
  ];

  it("suma cada métrica por separado y la compara con su objetivo", () => {
    const rollup = rollupMealMacros(fourMeals, targets);
    expect(rollup.kcal.total).toBe(1760);
    expect(rollup.kcal.delta).toBe(-240);
    expect(rollup.proteinG.total).toBe(131);
    expect(rollup.proteinG.delta).toBe(41);
    expect(rollup.carbsG.delta).toBe(185 - 280);
    expect(rollup.fatG.delta).toBe(0);
    expect(rollup.isEmpty).toBe(false);
  });

  /**
   * La aserción que evita el peor resultado posible de esta feature: decirle al coach que
   * le faltan 90 g de proteína porque tres comidas no la tienen cargada. El total sigue
   * estando (es un piso útil), pero la DIFERENCIA se calla.
   */
  it("no calcula la diferencia cuando alguna comida no tiene la métrica cargada", () => {
    const rollup = rollupMealMacros(
      [
        { kcal: 160, proteinG: 21 },
        { kcal: 700 },
        { kcal: 300 },
        { kcal: 600 },
      ],
      targets,
    );
    // Las calorías SÍ están completas: esa diferencia se puede afirmar.
    expect(rollup.kcal.mealsMissing).toBe(0);
    expect(rollup.kcal.delta).toBe(-240);
    // La proteína no.
    expect(rollup.proteinG.total).toBe(21);
    expect(rollup.proteinG.mealsCounted).toBe(1);
    expect(rollup.proteinG.mealsMissing).toBe(3);
    expect(rollup.proteinG.delta).toBeNull();
  });

  it("sin objetivo del día no hay contra qué comparar, pero el total se sigue mostrando", () => {
    const rollup = rollupMealMacros(fourMeals, { kcal: 2000 });
    expect(rollup.proteinG.total).toBe(131);
    expect(rollup.proteinG.target).toBeNull();
    expect(rollup.proteinG.delta).toBeNull();
  });

  it("un plan sin comidas todavía no dice nada", () => {
    expect(rollupMealMacros([], targets).isEmpty).toBe(true);
    expect(rollupMealMacros([{}, {}], targets).isEmpty).toBe(true);
  });
});

describe("rollupDeltaIsWorthShowing", () => {
  it("usa la MISMA tolerancia de 50 kcal que el aviso por comida", () => {
    const under = rollupMealMacros(
      [{ kcal: 2000 - KCAL_MISMATCH_TOLERANCE }],
      { kcal: 2000 },
    ).kcal;
    expect(rollupDeltaIsWorthShowing(under, "kcal")).toBe(true);
    const inside = rollupMealMacros(
      [{ kcal: 2000 - (KCAL_MISMATCH_TOLERANCE - 1) }],
      { kcal: 2000 },
    ).kcal;
    expect(rollupDeltaIsWorthShowing(inside, "kcal")).toBe(false);
  });

  it("en gramos alcanza con uno: repartir 90 g en cuatro da números redondos", () => {
    const off = rollupMealMacros([{ proteinG: 90 - MACRO_GRAMS_TOLERANCE }], { proteinG: 90 });
    expect(rollupDeltaIsWorthShowing(off.proteinG, "grams")).toBe(true);
    const exact = rollupMealMacros([{ proteinG: 90 }], { proteinG: 90 });
    expect(rollupDeltaIsWorthShowing(exact.proteinG, "grams")).toBe(false);
  });

  it("una diferencia que no se puede afirmar nunca se muestra", () => {
    const partial = rollupMealMacros([{ proteinG: 21 }, {}], { proteinG: 90 });
    expect(partial.proteinG.delta).toBeNull();
    expect(rollupDeltaIsWorthShowing(partial.proteinG, "grams")).toBe(false);
  });
});

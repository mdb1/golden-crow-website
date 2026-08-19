// nutrition-macro-math.test.ts
// The kcal hint the plan editors print under the macro grid (#949).

import {
  KCAL_MISMATCH_TOLERANCE,
  estimateKcalFromMacros,
  macroKcalMismatch,
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

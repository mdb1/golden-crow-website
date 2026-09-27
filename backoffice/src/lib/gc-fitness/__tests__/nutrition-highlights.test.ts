// Twin of gc-fitness `NutritionWeekHeatmapTests.swift` / `NutritionWeekHeatmapTest.kt` — the
// highlights cases, same fixtures, same expected values.
//
// Fixture calendar: 2026-08-17 is a Monday, 2026-08-18 (today) a Tuesday.

import { nutritionHighlights } from "../nutrition-highlights";
import { DAY_BEFORE, MID_DAY, TODAY, YESTERDAY, fullyDone, mixed, phaseA } from "./nutrition-fixtures";

describe("nutritionHighlights (twin of the apps)", () => {
  it("over the fixture narrative: 3 perfect of 4, streak 3, all logged", () => {
    const h = nutritionHighlights(
      [phaseA()],
      [fullyDone(DAY_BEFORE), fullyDone(MID_DAY), fullyDone(YESTERDAY), mixed(TODAY)],
      DAY_BEFORE,
      TODAY,
    );
    expect(h.perfectDays).toBe(3);
    expect(h.daysWithPlan).toBe(4);
    expect(h.bestStreak).toBe(3);
    expect(h.loggedPercent).toBe(100);
    // One day per weekday is below the bar — no best / worst.
    expect(h.bestWeekday).toBeNull();
    expect(h.worstWeekday).toBeNull();
  });

  it("finds the best and worst weekday", () => {
    const mondays = ["2026-08-03", "2026-08-10", "2026-08-17"].map((d) => fullyDone(d));
    const tuesdays = ["2026-08-04", "2026-08-11", "2026-08-18"].map((d) => mixed(d));
    const h = nutritionHighlights([phaseA()], [...mondays, ...tuesdays], "2026-08-03", TODAY);
    expect(h.daysWithPlan).toBe(16);
    expect(h.perfectDays).toBe(3);
    expect(h.bestStreak).toBe(1);
    // 18 of 48 slots marked = 37.5% → 38.
    expect(h.loggedPercent).toBe(38);
    expect(h.bestWeekday).toBe(0);
    expect(h.bestWeekdayPercent).toBe(100);
    // Wednesday through Sunday all sit at 0%; the earliest wins the tie.
    expect(h.worstWeekday).toBe(2);
    expect(h.worstWeekdayPercent).toBe(0);
  });

  it("with no plan everything is zero and there is no logged percent", () => {
    const h = nutritionHighlights([], [], "2026-08-03", TODAY);
    expect(h.perfectDays).toBe(0);
    expect(h.daysWithPlan).toBe(0);
    expect(h.bestStreak).toBe(0);
    expect(h.loggedPercent).toBeNull();
    expect(h.bestWeekday).toBeNull();
  });
});

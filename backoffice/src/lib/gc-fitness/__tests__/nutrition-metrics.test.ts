// nutrition-metrics.test.ts
// TS twin of `GCFitnessCoreTests/NutritionMetricsTests.swift` and
// `android/core/.../NutritionMetricsTest.kt` (#920). Same cases, same expectations — if you
// change one, change all three in the SAME PR.
//
// What these tests are really defending:
//
//   • **The delta against a period that asked nothing.** A client with no plan last month
//     did not "improve by 84 points". That is the most flattering lie this screen could
//     tell, and it would tell it every time somebody starts their first phase.
//   • **Calendar weeks, Mon→Sun.** Fixed cross-surface and already broken once (#534) —
//     mobile bucketed rolling 7-day windows while everything else used calendar weeks, so
//     the same client had two different "last week" numbers.
//   • **An insight that fires on noise.** Two bad days is not a pattern, and a line that
//     claims one teaches people to stop reading the line.

import { civilDateAddDays } from "../civil-date";
import {
  nutritionInsight,
  nutritionRangeMetrics,
  nutritionWeekBuckets,
  nutritionWeekdayIndex,
} from "../nutrition-metrics";
import type { NutritionLog, NutritionMealEntry } from "../nutrition-schema";
import {
  DAY_BEFORE,
  MID_DAY,
  TODAY,
  YESTERDAY,
  fullyDone,
  log,
  mixed,
  phaseA,
} from "./nutrition-fixtures";

describe("nutritionWeekdayIndex", () => {
  it("is Monday-first", () => {
    // Off by one here silently mislabels every concentration sentence the product writes.
    expect(nutritionWeekdayIndex("2026-08-17")).toBe(0); // Monday
    expect(nutritionWeekdayIndex("2026-08-18")).toBe(1); // Tuesday
    expect(nutritionWeekdayIndex("2026-08-21")).toBe(4); // Friday
    expect(nutritionWeekdayIndex("2026-08-22")).toBe(5); // Saturday
    expect(nutritionWeekdayIndex("2026-08-23")).toBe(6); // Sunday
    // The epoch itself, and a date before it — the modulo must not go negative.
    expect(nutritionWeekdayIndex("1970-01-01")).toBe(3); // Thursday
    expect(nutritionWeekdayIndex("1969-12-29")).toBe(0); // Monday
    expect(nutritionWeekdayIndex("nope")).toBeNull();
  });
});

describe("nutritionWeekBuckets", () => {
  it("uses calendar weeks, Monday to Sunday, clipped to the range", () => {
    const buckets = nutritionWeekBuckets(
      [phaseA()],
      [fullyDone(YESTERDAY), mixed(TODAY)],
      "2026-08-12",
      TODAY,
    );

    // 08-12 is a Wednesday, so the first bucket is the week that STARTED Monday 08-10 — and
    // it is clipped, not backfilled: the Mon–Tue before the range are not scored.
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.weekStart).toBe("2026-08-10");
    expect(buckets[0]!.weekEnd).toBe("2026-08-16");
    expect(buckets[1]!.weekStart).toBe("2026-08-17");

    // Week 1 covers 08-12…08-16 (5 days × 3 meals, none logged) = 15 unmarked.
    expect(buckets[0]!.breakdown.expected).toBe(15);
    // Week 2 is clipped at today: 08-17 + 08-18 = 6 slots, 4 done.
    expect(buckets[1]!.breakdown.expected).toBe(6);
    expect(buckets[1]!.breakdown.done).toBe(4);
    expect(buckets[1]!.breakdown.percent).toBe(67);
  });
});

describe("nutritionRangeMetrics", () => {
  it("compares against the same LENGTH, immediately before", () => {
    const metrics = nutritionRangeMetrics(
      [phaseA()],
      [fullyDone(DAY_BEFORE), fullyDone(MID_DAY), fullyDone(YESTERDAY), mixed(TODAY)],
      YESTERDAY,
      TODAY,
    );

    // Range is 2 days (08-17…08-18) ⇒ previous is 08-15…08-16, also 2 days. Comparing a
    // 2-day window against a 3-day one would move the number with nobody doing anything.
    expect(metrics.previous.expected).toBe(6);
    expect(metrics.previous.percent).toBe(100);
    expect(metrics.overall.percent).toBe(67);
    expect(metrics.deltaPercentPoints).toBe(-33);
  });

  it("reports NO delta when the previous period asked nothing", () => {
    const metrics = nutritionRangeMetrics(
      [phaseA()],
      [fullyDone(YESTERDAY)],
      "2026-08-01",
      TODAY,
    );
    expect(metrics.previous.isEmpty).toBe(true);
    // NOT "+100": a client with no plan last month did not improve.
    expect(metrics.deltaPercentPoints).toBeNull();
  });
});

describe("nutritionInsight", () => {
  /** Days where ONE meal fails, always on the same weekdays. */
  function logsFailing(mealId: string, onWeekdays: number[], weeks: number): NutritionLog[] {
    const out: NutritionLog[] = [];
    let day: string | null = "2026-07-06"; // a Monday
    for (let i = 0; i < weeks * 7 && day !== null; i += 1) {
      const civilDate: string = day;
      const weekday = nutritionWeekdayIndex(civilDate) ?? 0;
      const entries: Record<string, NutritionMealEntry> = {
        m1: { status: "done" },
        m2: { status: "done" },
        m3: { status: "done" },
      };
      if (onWeekdays.includes(weekday)) entries[mealId] = { status: "missed" };
      out.push(log(civilDate, entries));
      day = civilDateAddDays(civilDate, 1);
    }
    return out;
  }

  it("names the meal dragging the rest down, and when it happens", () => {
    // Dinner fails every Friday and Saturday for four weeks: 8 failures, all of them on two
    // weekdays, all of them the same meal. This is the sentence the issue asks for.
    const insight = nutritionInsight(
      [phaseA()],
      logsFailing("m3", [4, 5], 4),
      "2026-07-06",
      "2026-08-02",
    );

    expect(insight.worstMeal?.mealId).toBe("m3");
    expect(insight.worstMeal?.name.es).toBe("Cena");
    expect(insight.worstMeal?.failures).toBe(8);
    // Friday, Saturday — in WEEKDAY order, so the sentence reads "viernes y sábados".
    expect(insight.concentration?.weekdays).toEqual([4, 5]);
    expect(insight.concentration?.failures).toBe(8);
    expect(insight.hasEnoughData).toBe(true);
    expect(insight.isPerfect).toBe(false);
  });

  it("says nothing when the failures are spread out", () => {
    // Every meal fails on every weekday: 12 failures, no culprit, no concentration. An
    // insight that fires here is an insight nobody will read twice.
    const out: NutritionLog[] = [];
    let day: string | null = "2026-07-06";
    for (let i = 0; i < 12 && day !== null; i += 1) {
      const civilDate: string = day;
      const mealId = ["m1", "m2", "m3"][i % 3]!;
      const entries: Record<string, NutritionMealEntry> = {
        m1: { status: "done" },
        m2: { status: "done" },
        m3: { status: "done" },
      };
      entries[mealId] = { status: "missed" };
      out.push(log(civilDate, entries));
      day = civilDateAddDays(civilDate, 1);
    }

    const insight = nutritionInsight([phaseA()], out, "2026-07-06", "2026-07-17");
    expect(insight.totalFailures).toBe(12);
    expect(insight.worstMeal).toBeNull();
    expect(insight.concentration).toBeNull();
    expect(insight.hasEnoughData).toBe(true);
  });

  it("treats two bad days as not a pattern", () => {
    const insight = nutritionInsight([phaseA()], [mixed(TODAY)], TODAY, TODAY);
    expect(insight.totalFailures).toBe(2);
    expect(insight.hasEnoughData).toBe(false);
    expect(insight.worstMeal).toBeNull();
  });

  it("separates a perfect range from an empty one", () => {
    const perfect = nutritionInsight(
      [phaseA()],
      [fullyDone(YESTERDAY), fullyDone(TODAY)],
      YESTERDAY,
      TODAY,
    );
    expect(perfect.isPerfect).toBe(true);
    expect(perfect.hasEnoughData).toBe(true);

    // No plan in force ⇒ nothing was asked. NOT perfect: nobody did anything right, there
    // was simply nothing to do.
    const empty = nutritionInsight([], [], YESTERDAY, TODAY);
    expect(empty.isPerfect).toBe(false);
    expect(empty.hasEnoughData).toBe(false);
  });

  it("counts an unmarked slot as a failure", () => {
    // The client said nothing for four days. The number already counts it against them; the
    // sentence has to agree, or the screen contradicts itself.
    const insight = nutritionInsight([phaseA()], [], "2026-08-15", TODAY);
    expect(insight.totalFailures).toBe(12);
    expect(insight.hasEnoughData).toBe(true);
  });
});

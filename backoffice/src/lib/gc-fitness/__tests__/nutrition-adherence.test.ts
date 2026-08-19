// nutrition-adherence.test.ts
// Twin of iOS `NutritionAdherenceCalculatorTests.swift` and Kotlin
// `NutritionAdherenceCalculatorTest.kt` — case for case, same fixtures (#913).

import {
  expectedNutritionMeals,
  nutritionAdherence,
  nutritionAdherenceByMeal,
  nutritionAdherenceForPlan,
  nutritionBestStreak,
  nutritionCompliancePercent,
  nutritionCurrentStreak,
  nutritionDayIsFullyCompliant,
} from "../nutrition-adherence";
import type { NutritionLog } from "../nutrition-schema";
import {
  DAY_BEFORE,
  MID_DAY,
  TODAY,
  YESTERDAY,
  fullyDone,
  log,
  mixed,
  phaseA,
  phaseB,
} from "./nutrition-fixtures";

function byDate(logs: NutritionLog[]): Map<string, NutritionLog> {
  return new Map(logs.map((l) => [l.civilDate, l]));
}

describe("nutrition adherence — the canonical scenario", () => {
  it("4 done of 6 expected slots over two days → 67%", () => {
    const breakdown = nutritionAdherence(
      [phaseA()],
      [fullyDone(YESTERDAY), mixed(TODAY)],
      YESTERDAY,
      TODAY,
    );
    expect(breakdown.expected).toBe(6);
    expect(breakdown.done).toBe(4);
    expect(breakdown.different).toBe(1);
    expect(breakdown.missed).toBe(1);
    expect(breakdown.unmarked).toBe(0);
    expect(breakdown.percent).toBe(67);
  });

  it("`different` does NOT count as compliant", () => {
    // A day where every meal is `different` is 0%, not 100% and not 50%. "Distinto"
    // means the plan was not followed; a half-credit fraction would be arbitrary and
    // unexplainable on screen.
    const allDifferent = log(TODAY, {
      m1: { status: "different" },
      m2: { status: "different" },
      m3: { status: "different" },
    });
    const breakdown = nutritionAdherence([phaseA()], [allDifferent], TODAY, TODAY);
    expect(breakdown.done).toBe(0);
    expect(breakdown.different).toBe(3);
    expect(breakdown.percent).toBe(0);
  });
});

describe("nutrition adherence — the rule the whole feature rests on", () => {
  it("loading actualMacros does NOT move adherence", () => {
    const withoutMacros = mixed(TODAY);
    const withMacros: NutritionLog = {
      ...withoutMacros,
      meals: {
        ...withoutMacros.meals,
        m2: {
          status: "different",
          note: "Comí afuera",
          actualMacros: { kcal: 950, proteinG: 48, carbsG: 95, fatG: 38 },
        },
        m3: { status: "missed", actualMacros: { kcal: 0 } },
      },
    };

    const before = nutritionAdherence([phaseA()], [withoutMacros], TODAY, TODAY);
    const after = nutritionAdherence([phaseA()], [withMacros], TODAY, TODAY);

    // Identical, not merely "close". The moment this number reacts to reported macros,
    // the app has to demand they be accurate and it becomes the food tracker #908 asks
    // us not to build.
    expect(after).toEqual(before);
    expect(after.percent).toBe(33);
  });
});

describe("nutrition adherence — denominator rules", () => {
  it("an unmarked day counts against adherence, it is not skipped", () => {
    // 08-17 fully done, 08-18 has no log at all. 3 of 6 → 50%. If unmarked days were
    // dropped, adherence would RISE the longer someone ignores the app.
    const breakdown = nutritionAdherence(
      [phaseA()],
      [fullyDone(YESTERDAY)],
      YESTERDAY,
      TODAY,
    );
    expect(breakdown.expected).toBe(6);
    expect(breakdown.unmarked).toBe(3);
    expect(breakdown.percent).toBe(50);
  });

  it("days with no plan in force contribute nothing to either side", () => {
    // Phase A starts 2026-08-01, so July asks nothing. A range reaching into July must
    // not dilute the ratio — otherwise the roster shows a low percentage for a client
    // who has simply not been assigned a plan yet.
    const breakdown = nutritionAdherence(
      [phaseA()],
      [fullyDone(YESTERDAY), fullyDone(MID_DAY), fullyDone(DAY_BEFORE)],
      "2026-07-20",
      YESTERDAY,
    );
    expect(breakdown.expected).toBe(17 * 3); // 08-01…08-17
    expect(breakdown.done).toBe(9);
  });

  it("no plan at all → isEmpty, which is the empty state and NOT 0%", () => {
    const breakdown = nutritionAdherence([], [], YESTERDAY, TODAY);
    expect(breakdown.isEmpty).toBe(true);
    expect(breakdown.expected).toBe(0);
    // The ratio is 0 mechanically, but callers MUST branch on isEmpty — "sin plan
    // vigente" is the single most important thing for a coach to notice on a roster,
    // and rendering it as "0%" reads as a client who is failing.
    expect(breakdown.ratio).toBe(0);
  });

  it("an inverted range yields nothing rather than walking backwards forever", () => {
    const breakdown = nutritionAdherence([phaseA()], [mixed(TODAY)], TODAY, YESTERDAY);
    expect(breakdown.isEmpty).toBe(true);
  });
});

describe("nutrition adherence — the frozen snapshot", () => {
  it("the past is judged by the log's frozen snapshot, not by the current phase", () => {
    // The August log froze phase A's three meals. Phase B is now in force and could have
    // a different meal list — the August day must still expect exactly what it froze, or
    // starting a new phase silently rewrites past compliance.
    const trimmedPhaseB = {
      ...phaseB(),
      startsOn: "2026-08-01",
      meals: phaseB().meals.slice(0, 1),
    };
    const expected = expectedNutritionMeals(
      YESTERDAY,
      [trimmedPhaseB],
      byDate([fullyDone(YESTERDAY)]),
    );
    expect(expected.map((m) => m.mealId)).toEqual(["m1", "m2", "m3"]);
    // Phase A's number, not phase B's 450.
    expect(expected[0]!.targets?.kcal).toBe(520);
  });

  it("a day with no log falls back to the plan's meals", () => {
    const expected = expectedNutritionMeals(TODAY, [phaseA()], new Map());
    expect(expected.map((m) => m.mealId)).toEqual(["m1", "m2", "m3"]);
    expect(expected.map((m) => m.order)).toEqual([0, 1, 2]);
  });
});

describe("nutrition adherence — per meal", () => {
  it("sorts worst-first — the 'dónde fallás más' list", () => {
    // m1 done twice, m2 done once + different once, m3 done once + missed once.
    const rows = nutritionAdherenceByMeal(
      [phaseA()],
      [fullyDone(YESTERDAY), mixed(TODAY)],
      YESTERDAY,
      TODAY,
    );
    expect(rows).toHaveLength(3);
    // m2 and m3 tie at 50%; the mealId tie-break keeps the order stable across the three
    // platforms.
    expect(rows.map((r) => r.mealId)).toEqual(["m2", "m3", "m1"]);
    expect(rows[0]!.breakdown.percent).toBe(50);
    expect(rows[2]!.breakdown.percent).toBe(100);
    expect(rows[2]!.name.es).toBe("Desayuno");
  });
});

describe("nutrition adherence — per phase", () => {
  it("phase adherence is clamped to today, not to the phase's endsOn", () => {
    // Phase A runs to 2026-08-31. Judging it today (08-18) must not count the 13 days
    // that have not happened yet as unmarked.
    const breakdown = nutritionAdherenceForPlan(
      phaseA(),
      [fullyDone(YESTERDAY), mixed(TODAY)],
      TODAY,
    );
    expect(breakdown.expected).toBe(18 * 3); // 08-01…08-18
    expect(breakdown.done).toBe(4);
  });

  it("a phase that has not started yet reports empty", () => {
    expect(nutritionAdherenceForPlan(phaseB(), [], TODAY).isEmpty).toBe(true);
  });
});

describe("nutrition adherence — rounding", () => {
  it("rounds half-up through the one helper — the #173 lesson", () => {
    // 6/7 = 0.857… must be 86 everywhere. #173 shipped one surface truncating to 85
    // while every other rounded, and the coach saw two numbers for one fact.
    expect(nutritionCompliancePercent(6 / 7)).toBe(86);
    expect(nutritionCompliancePercent(2 / 3)).toBe(67);
    expect(nutritionCompliancePercent(0.005)).toBe(1);
    expect(nutritionCompliancePercent(0)).toBe(0);
    expect(nutritionCompliancePercent(1)).toBe(100);
    // Defensive clamping — a ratio outside [0,1] is a bug upstream, but it must not
    // print "137%".
    expect(nutritionCompliancePercent(1.37)).toBe(100);
    expect(nutritionCompliancePercent(-0.4)).toBe(0);
  });
});

describe("nutrition — the fully-compliant predicate", () => {
  it("a day is fully compliant only when EVERY expected meal is done", () => {
    const logsByDate = byDate([fullyDone(YESTERDAY), mixed(TODAY)]);
    expect(nutritionDayIsFullyCompliant(YESTERDAY, [phaseA()], logsByDate)).toBe(true);
    expect(nutritionDayIsFullyCompliant(TODAY, [phaseA()], logsByDate)).toBe(false);
    // A day with nothing expected is not "compliant" — it is simply not a day the streak
    // counts. The streak skips it; it does not treat it as a win.
    expect(nutritionDayIsFullyCompliant("2026-07-01", [phaseA()], logsByDate)).toBe(false);
  });
});

describe("nutrition streak", () => {
  it("three fully-done days with today still in progress → 3 (grace day)", () => {
    // Without the grace day the streak would read 0 every morning until the first tap —
    // precisely when the number is supposed to be motivating.
    const streak = nutritionCurrentStreak(
      [phaseA()],
      [fullyDone(DAY_BEFORE), fullyDone(MID_DAY), fullyDone(YESTERDAY), mixed(TODAY)],
      TODAY,
    );
    expect(streak).toBe(3);
  });

  it("completing today counts it — 4, not 3", () => {
    const streak = nutritionCurrentStreak(
      [phaseA()],
      [
        fullyDone(DAY_BEFORE),
        fullyDone(MID_DAY),
        fullyDone(YESTERDAY),
        fullyDone(TODAY),
      ],
      TODAY,
    );
    expect(streak).toBe(4);
  });

  it("a partial day breaks the run — the streak is all-or-nothing", () => {
    // The advertised "N días seguidos cumpliendo" has to mean one thing, so a day where
    // two of three meals were done does not count.
    const streak = nutritionCurrentStreak(
      [phaseA()],
      [fullyDone(DAY_BEFORE), mixed(MID_DAY), fullyDone(YESTERDAY), fullyDone(TODAY)],
      TODAY,
    );
    expect(streak).toBe(2);
  });

  it("yesterday incomplete AND today incomplete → 0", () => {
    // The grace covers today only. If yesterday is also unfinished the run is over —
    // otherwise a streak would survive indefinitely on two consecutive bad days.
    const streak = nutritionCurrentStreak(
      [phaseA()],
      [fullyDone(DAY_BEFORE), mixed(YESTERDAY), mixed(TODAY)],
      TODAY,
    );
    expect(streak).toBe(0);
  });

  it("a day with no plan in force is SKIPPED, not counted and not a break", () => {
    // Phase A ran to 08-31; a new phase starts 09-05, leaving a four-day gap where
    // nothing was asked of the client. Punishing them for the coach's calendar would be
    // the wrong call, so the run continues across the gap.
    const a = { ...phaseA(), endsOn: "2026-08-31" };
    const c = { ...phaseB(), startsOn: "2026-09-05" };
    const streak = nutritionCurrentStreak(
      [a, c],
      [
        fullyDone("2026-08-30", a),
        fullyDone("2026-08-31", a),
        fullyDone("2026-09-05", c),
        fullyDone("2026-09-06", c),
      ],
      "2026-09-06",
    );
    expect(streak).toBe(4);
  });

  it("no plans at all → 0 without walking a year of empty days", () => {
    expect(nutritionCurrentStreak([], [], TODAY)).toBe(0);
  });

  it("bestStreak finds the longest historical run, not the current one", () => {
    // 08-01..08-03 done, 08-04 broken, 08-05..08-06 done. Current run is 2, best is 3.
    const logs = [
      fullyDone("2026-08-01"),
      fullyDone("2026-08-02"),
      fullyDone("2026-08-03"),
      mixed("2026-08-04"),
      fullyDone("2026-08-05"),
      fullyDone("2026-08-06"),
    ];
    expect(nutritionBestStreak([phaseA()], logs, "2026-08-01", "2026-08-06")).toBe(3);
    // The current run is shorter, and it is measured against a today the caller supplies
    // rather than the clock.
    expect(nutritionCurrentStreak([phaseA()], logs, "2026-08-06")).toBe(2);
  });

  it("bestStreak over a range with no logs is 0", () => {
    expect(nutritionBestStreak([phaseA()], [], "2026-08-01", "2026-08-06")).toBe(0);
  });

  it("loading actualMacros does not change the streak either", () => {
    const done = fullyDone(TODAY);
    const withMacros: NutritionLog = {
      ...done,
      meals: {
        ...done.meals,
        m2: { status: "done", actualMacros: { kcal: 1200 } }, // way over target
      },
    };
    // Going 400 kcal over on a meal the client marked as done does not cost them the
    // streak. Adherence is declared, not computed from macros.
    expect(
      nutritionCurrentStreak([phaseA()], [fullyDone(YESTERDAY), withMacros], TODAY),
    ).toBe(2);
  });
});

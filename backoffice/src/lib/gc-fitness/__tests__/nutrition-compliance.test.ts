// nutrition-compliance.test.ts
// The coach's read-side aggregation (#919): weekly grid, note feed, phase-vs-weight table.
//
// The load-bearing assertions here are the AGREEMENT ones: the grid's cells and the
// percentage printed above them must be the same fact seen twice. A grid that counts its
// own cells drifts from the adherence twin the first time either changes, and the failure
// is silent — four green ticks next to "75%", with neither number wrong on its own terms.
// That is the exact shape of #173 on habit compliance.
//
// The canonical scenario comes from `nutrition-fixtures.ts`, shared with the Swift and
// Kotlin twins: phase A 2026-08-01→08-31, logs on 08-15/16/17 fully done and 08-18 mixed
// (done / different / missed), "today" = 2026-08-18 (a Tuesday, so its week is
// Mon 08-17 → Sun 08-23).

import { civilDaysBetween } from "../civil-date";
import {
  nutritionAdherence,
  nutritionAdherenceByMeal,
  nutritionCurrentStreak,
} from "../nutrition-adherence";
import {
  MAX_NUTRITION_NOTES,
  buildNutritionPhaseBands,
  buildNutritionPhaseRows,
  buildNutritionStats,
  buildNutritionWeekGrid,
  civilWeekStart,
  collectNutritionNotes,
  nutritionDayCellState,
} from "../nutrition-compliance";
import type { NutritionLog, NutritionPlan } from "../nutrition-schema";
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
  selfPlan,
} from "./nutrition-fixtures";

const WEEK_START = "2026-08-17";
const WEEK_END = "2026-08-23";

function canonicalLogs(): NutritionLog[] {
  return [fullyDone(DAY_BEFORE), fullyDone(MID_DAY), fullyDone(YESTERDAY), mixed(TODAY)];
}

function logsByDate(logs: NutritionLog[]): Map<string, NutritionLog> {
  return new Map(logs.map((entry) => [entry.civilDate, entry]));
}

describe("civilWeekStart re-export", () => {
  it("anchors the grid on Monday, like every other week boundary", () => {
    expect(civilWeekStart(TODAY)).toBe(WEEK_START);
    expect(civilWeekStart(WEEK_START)).toBe(WEEK_START);
    // Sunday belongs to the week that STARTED, not the one about to.
    expect(civilWeekStart(MID_DAY)).toBe("2026-08-10");
  });
});

describe("buildNutritionWeekGrid", () => {
  it("lays out Monday→Sunday and marks the days that have not happened", () => {
    const grid = buildNutritionWeekGrid([phaseA()], canonicalLogs(), TODAY, TODAY);

    expect(grid.weekStart).toBe(WEEK_START);
    expect(grid.weekEnd).toBe(WEEK_END);
    expect(grid.days).toHaveLength(7);
    expect(grid.days[0]).toBe(WEEK_START);
    expect(grid.days[6]).toBe(WEEK_END);

    // Wednesday onwards has not been lived. Counting it as unmarked would make this
    // week's adherence sink a little further every morning on its own.
    expect(grid.dayRow.slice(2).every((cell) => cell.state === "future")).toBe(true);
  });

  it("reports the SAME percentage the adherence twin does — never its own count", () => {
    const plans = [phaseA()];
    const logs = canonicalLogs();
    const grid = buildNutritionWeekGrid(plans, logs, TODAY, TODAY);

    // The window is clamped at today: Mon 08-17 (3 done) + Tue 08-18 (1 done, 1
    // different, 1 missed) = 4 of 6.
    const twin = nutritionAdherence(plans, logs, WEEK_START, TODAY);
    expect(grid.breakdown).toEqual(twin);
    expect(grid.breakdown.expected).toBe(6);
    expect(grid.breakdown.done).toBe(4);
    expect(grid.breakdown.percent).toBe(67);

    // …and every row is the twin's row, not a recount.
    const byMeal = nutritionAdherenceByMeal(plans, logs, WEEK_START, TODAY);
    for (const row of grid.rows) {
      const expected = byMeal.find((entry) => entry.mealId === row.mealId);
      expect(row.breakdown).toEqual(expected?.breakdown);
    }
  });

  it("counts exactly as many scored cells as the twin expects", () => {
    const plans = [phaseA()];
    const logs = canonicalLogs();
    const grid = buildNutritionWeekGrid(plans, logs, TODAY, TODAY);

    const scored = grid.rows.flatMap((row) =>
      row.cells.filter(
        (cell) => cell.state !== "future" && cell.state !== "noPlan",
      ),
    );
    expect(scored).toHaveLength(grid.breakdown.expected);
    expect(scored.filter((cell) => cell.state === "done")).toHaveLength(
      grid.breakdown.done,
    );
  });

  it("orders rows by the meal's own order, not worst-first", () => {
    const grid = buildNutritionWeekGrid([phaseA()], canonicalLogs(), TODAY, TODAY);
    // The grid is a timetable: Desayuno stays above Cena even though Cena is the row
    // dragging the week down (`nutritionAdherenceByMeal` sorts the other way on purpose).
    expect(grid.rows.map((row) => row.mealId)).toEqual(["m1", "m2", "m3"]);
    // The twin sorts worst-first, so the perfect meal (m1) sinks to the bottom there
    // while it stays at the top here. Same rows, two orders, each right for its screen.
    const worstFirst = nutritionAdherenceByMeal([phaseA()], canonicalLogs(), WEEK_START, TODAY);
    expect(worstFirst[worstFirst.length - 1]!.mealId).toBe("m1");
  });

  it("puts each status in its own cell", () => {
    const grid = buildNutritionWeekGrid([phaseA()], canonicalLogs(), TODAY, TODAY);
    const cellAt = (mealId: string, date: string) =>
      grid.rows.find((row) => row.mealId === mealId)!.cells.find((c) => c.civilDate === date)!;

    expect(cellAt("m1", YESTERDAY).state).toBe("done");
    expect(cellAt("m2", TODAY).state).toBe("different");
    expect(cellAt("m3", TODAY).state).toBe("missed");
  });

  it("distinguishes an unmarked meal from a declared miss", () => {
    // Silence is not a declared failure. Both count against adherence — an unmarked day
    // must never RAISE the number — but a UI has to be able to draw them differently.
    const logs = [log(TODAY, { m1: { status: "done" } })];
    const grid = buildNutritionWeekGrid([phaseA()], logs, TODAY, TODAY);
    const states = grid.rows.map(
      (row) => row.cells.find((cell) => cell.civilDate === TODAY)!.state,
    );
    expect(states).toEqual(["done", "unmarked", "unmarked"]);
    // Monday was never touched either, so the week is 1 done of 6: two silent meals today
    // plus three on a day the client ignored entirely. None of them is a declared miss.
    expect(grid.breakdown.unmarked).toBe(5);
    expect(grid.breakdown.missed).toBe(0);
    expect(grid.breakdown.percent).toBe(17);
  });

  it("renders a week with no plan in force as empty, not as 0%", () => {
    // The single most important thing for a coach to spot. "0%" reads as a client who is
    // failing; "sin plan vigente" is a coach who has not assigned one.
    const grid = buildNutritionWeekGrid([phaseB()], [], TODAY, TODAY);
    expect(grid.isEmpty).toBe(true);
    expect(grid.breakdown.expected).toBe(0);
    expect(grid.dayRow.every((cell) => cell.state === "noPlan" || cell.state === "future")).toBe(
      true,
    );
  });

  it("flags the cells whose note the feed will carry", () => {
    const grid = buildNutritionWeekGrid([phaseA()], canonicalLogs(), TODAY, TODAY);
    const different = grid.rows
      .find((row) => row.mealId === "m2")!
      .cells.find((cell) => cell.civilDate === TODAY)!;
    expect(different.hasNote).toBe(true);
    expect(grid.dayRow.find((cell) => cell.civilDate === TODAY)!.hasNote).toBe(true);
    expect(grid.dayRow.find((cell) => cell.civilDate === YESTERDAY)!.hasNote).toBe(false);
  });

  it("blanks a meal on the days its phase never asked for it", () => {
    const august = phaseA();
    const september: NutritionPlan = {
      ...phaseB(),
      startsOn: "2026-08-18",
      endsOn: null,
      meals: phaseB().meals.filter((meal) => meal.mealId !== "m3"),
    };
    const logs = [fullyDone(YESTERDAY, august)];
    const grid = buildNutritionWeekGrid([august, september], logs, TODAY, TODAY);

    const dinner = grid.rows.find((row) => row.mealId === "m3")!;
    expect(dinner.cells.find((cell) => cell.civilDate === YESTERDAY)!.state).toBe("done");
    // Dropped from the plan today — the client was never asked, so it is blank and out of
    // the denominator, not an unmarked miss.
    expect(dinner.cells.find((cell) => cell.civilDate === TODAY)!.state).toBe("noPlan");
  });
});

describe("nutritionDayCellState", () => {
  const plans = [phaseA()];

  it("is done only when the whole day is — the streak's own predicate", () => {
    const logs = canonicalLogs();
    expect(nutritionDayCellState(YESTERDAY, plans, logsByDate(logs), TODAY)).toBe("done");
    // 08-15, 08-16, 08-17 are done; the walk starts at yesterday because today is still
    // in progress. A day green here must be a day that extends the client's streak.
    expect(nutritionCurrentStreak(plans, logs, TODAY)).toBe(3);
  });

  it("lets the worst meal decide the day", () => {
    // One missed dinner behind a good breakfast has to stay visible: an averaged cell
    // would hide exactly the thing the coach opened this screen to find.
    expect(nutritionDayCellState(TODAY, plans, logsByDate(canonicalLogs()), TODAY)).toBe(
      "missed",
    );

    const noMiss = [
      log(TODAY, {
        m1: { status: "done" },
        m2: { status: "different", note: "salí tarde" },
        m3: { status: "done" },
      }),
    ];
    expect(nutritionDayCellState(TODAY, plans, logsByDate(noMiss), TODAY)).toBe("different");

    const silent = [log(TODAY, { m1: { status: "done" } })];
    expect(nutritionDayCellState(TODAY, plans, logsByDate(silent), TODAY)).toBe("unmarked");
  });

  it("separates a day with no plan from a day not yet lived", () => {
    expect(nutritionDayCellState("2026-07-30", plans, new Map(), TODAY)).toBe("noPlan");
    expect(nutritionDayCellState("2026-08-20", plans, new Map(), TODAY)).toBe("future");
  });
});

describe("collectNutritionNotes", () => {
  it("returns notes newest first, in meal order within a day", () => {
    const logs = [
      log(YESTERDAY, {
        m2: { status: "missed", note: "me olvidé" },
        m1: { status: "different", note: "cambié la avena" },
      }),
      mixed(TODAY),
    ];
    const feed = collectNutritionNotes(logs);
    expect(feed.map((entry) => [entry.civilDate, entry.mealId])).toEqual([
      [TODAY, "m2"],
      [YESTERDAY, "m1"],
      [YESTERDAY, "m2"],
    ]);
    expect(feed[0]!.note).toBe("Comí afuera — milanesa con puré");
    expect(feed[0]!.mealName.es).toBe("Almuerzo");
  });

  it("skips meals with nothing to say", () => {
    // ✓ stays a single tap that opens nothing. A feed padded with silent completions is
    // a feed a coach stops reading.
    expect(collectNutritionNotes([fullyDone(TODAY)])).toHaveLength(0);
    expect(collectNutritionNotes([log(TODAY, { m1: { status: "missed" } })])).toHaveLength(0);
    expect(
      collectNutritionNotes([log(TODAY, { m1: { status: "missed", note: "   " } })]),
    ).toHaveLength(0);
  });

  it("carries actual macros with their delta against the FROZEN target", () => {
    const logs = [
      log(TODAY, {
        m2: {
          status: "different",
          note: "milanesa",
          actualMacros: { kcal: 950, proteinG: 48, carbsG: 95, fatG: 38 },
        },
      }),
    ];
    const [entry] = collectNutritionNotes(logs);
    // m2's frozen target is 780 / 55 / 78 / 22.
    expect(entry!.delta).toEqual({ kcal: 170, proteinG: -7, carbsG: 17, fatG: 16 });
    expect(entry!.targets).toEqual({ kcal: 780, proteinG: 55, carbsG: 78, fatG: 22 });
  });

  it("reads the delta against what was asked THAT day, not against the live plan", () => {
    // The log was frozen under phase A (lunch 780 kcal). Phase B is in force now with a
    // 700 kcal lunch. A coach reading July has to see July's target.
    const logs = [
      {
        ...log(TODAY, {
          m2: { status: "different", actualMacros: { kcal: 800 } },
        }),
      },
    ];
    const [entry] = collectNutritionNotes(logs);
    expect(entry!.delta.kcal).toBe(20);
  });

  it("leaves a delta unknowable rather than claiming a target was hit", () => {
    // A delta against a target the coach never set is not zero. Rendering "+0" would
    // quietly assert compliance with a number nobody wrote.
    const plan = phaseA();
    const noTargets: NutritionPlan = {
      ...plan,
      meals: plan.meals.map((meal) => ({ ...meal, targets: null })),
    };
    const logs = [
      log(TODAY, { m2: { status: "missed", actualMacros: { kcal: 900 } } }, noTargets),
    ];
    const [entry] = collectNutritionNotes(logs);
    expect(entry!.delta).toEqual({ kcal: null, proteinG: null, carbsG: null, fatG: null });
  });

  it("keeps a note whose meal has left the snapshot", () => {
    const logs = [
      {
        ...log(TODAY, { "m-ghost": { status: "missed", note: "esto ya no está en el plan" } }),
      },
    ];
    const [entry] = collectNutritionNotes(logs);
    expect(entry!.mealId).toBe("m-ghost");
    expect(entry!.note).toBe("esto ya no está en el plan");
    expect(entry!.mealName).toEqual({ en: "", es: "" });
  });

  it("bounds the feed", () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      log(`2026-06-${String((index % 28) + 1).padStart(2, "0")}`, {
        m1: { status: "missed", note: `n${index}` },
      }),
    );
    expect(collectNutritionNotes(many).length).toBeLessThanOrEqual(MAX_NUTRITION_NOTES);
    expect(collectNutritionNotes(many, 5)).toHaveLength(5);
  });
});

describe("buildNutritionStats", () => {
  it("reads the last 7 days and the current phase through the twin", () => {
    const plans = [phaseA()];
    const logs = canonicalLogs();
    const stats = buildNutritionStats(plans, logs, TODAY, phaseA());

    expect(stats.last7Days).toEqual(nutritionAdherence(plans, logs, "2026-08-12", TODAY));
    // 4 days logged of the 7-day window: 08-15/16/17 fully done (9) + 08-18 (1) = 10 done
    // of 21 expected. The unlogged 08-12…08-14 still count against — a metric that rose
    // while you ignored the app would be worthless.
    expect(stats.last7Days.expected).toBe(21);
    expect(stats.last7Days.done).toBe(10);

    // The phase started 08-01 and is clamped at today, so it is a wider window.
    expect(stats.currentPhase!.expected).toBe(54);
  });

  it("has no phase number when no phase is in force", () => {
    expect(buildNutritionStats([], [], TODAY, null).currentPhase).toBeNull();
  });
});

describe("buildNutritionPhaseRows", () => {
  const weights = [
    { date: "2026-08-01", weight: 82.4 },
    { date: "2026-08-15", weight: 81.2 },
    { date: "2026-09-05", weight: 80.6 },
  ];

  it("puts what was asked, what was followed and what the body did on one row", () => {
    const rows = buildNutritionPhaseRows(
      [phaseA(), phaseB()],
      canonicalLogs(),
      weights,
      TODAY,
      "plan-a",
    );

    expect(rows.map((row) => row.planId)).toEqual(["plan-a", "plan-b"]);
    const [a, b] = rows;

    expect(a!.kcalTarget).toBe(2400);
    expect(a!.isActive).toBe(true);
    expect(a!.observedEnd).toBe(TODAY); // still running — clamped at today, not 08-31
    expect(a!.startWeightKg).toBe(82.4);
    expect(a!.endWeightKg).toBe(81.2);
    expect(a!.deltaKg).toBe(-1.2);

    // Phase B has not started; its weigh-in on 09-05 is outside the observed window.
    expect(b!.isActive).toBe(false);
    expect(b!.deltaKg).toBeNull();
    expect(b!.adherence.isEmpty).toBe(true);
  });

  it("rates the change over the days between the WEIGH-INS, not the phase length", () => {
    // 14 days apart, −1.2 kg ⇒ −0.6 kg/week. Dividing by the 18-day phase-to-date would
    // print −0.47 — a rate the client never had, on the exact number a coach uses to
    // decide whether the plan is working.
    const [row] = buildNutritionPhaseRows([phaseA()], [], weights, TODAY, "plan-a");
    expect(civilDaysBetween("2026-08-01", "2026-08-15")).toBe(14);
    expect(row!.deltaKgPerWeek).toBe(-0.6);
  });

  it("says nothing rather than guessing from a single weigh-in", () => {
    const [row] = buildNutritionPhaseRows(
      [phaseA()],
      [],
      [{ date: "2026-08-03", weight: 82 }],
      TODAY,
      null,
    );
    expect(row!.startWeightKg).toBe(82);
    expect(row!.endWeightKg).toBeNull();
    expect(row!.deltaKg).toBeNull();
    expect(row!.deltaKgPerWeek).toBeNull();
  });

  it("shows the client's own phase, tagged, instead of hiding it", () => {
    // Manda el coach — but the weeks a coach-less client ran their own plan are real data
    // the coach can learn from, so the row stays and says whose plan it was (#917).
    const [row] = buildNutritionPhaseRows([selfPlan()], [], [], TODAY, "plan-self");
    expect(row!.isSelfAuthored).toBe(true);
  });

  it("says how much of an old phase the number actually covers", () => {
    // A phase that started before the loaded log window would otherwise count every
    // unread day as unmarked and print 8% for a month the client followed. The number
    // stays honest by shrinking its range, and the row says so.
    const rows = buildNutritionPhaseRows(
      [phaseA()],
      canonicalLogs(),
      [],
      TODAY,
      "plan-a",
      YESTERDAY,
    );
    expect(rows[0]!.adherenceIsPartial).toBe(true);
    expect(rows[0]!.adherenceFrom).toBe(YESTERDAY);
    expect(rows[0]!.adherence.expected).toBe(6); // 08-17 + 08-18, not all of August
    expect(rows[0]!.adherence.percent).toBe(67);
  });

  it("is not partial when the window covers the whole phase", () => {
    const rows = buildNutritionPhaseRows(
      [phaseA()],
      canonicalLogs(),
      [],
      TODAY,
      "plan-a",
      "2026-07-01",
    );
    expect(rows[0]!.adherenceIsPartial).toBe(false);
    expect(rows[0]!.adherenceFrom).toBe("2026-08-01");
  });

  it("drops superseded phases", () => {
    const rows = buildNutritionPhaseRows(
      [{ ...phaseA(), deleted: true }, phaseB()],
      [],
      [],
      TODAY,
      null,
    );
    expect(rows.map((row) => row.planId)).toEqual(["plan-b"]);
  });
});

describe("buildNutritionPhaseBands", () => {
  it("clamps the bands to the chart window", () => {
    const rows = buildNutritionPhaseRows([phaseA()], [], [], TODAY, "plan-a");
    const [band] = buildNutritionPhaseBands(rows, "2026-08-10", TODAY);
    // A band drawn outside the axis stretches recharts' domain and flattens the weight
    // line — the chart it was supposed to annotate.
    expect(band!.from).toBe("2026-08-10");
    expect(band!.to).toBe(TODAY);
    expect(band!.label).toBe("Mantenimiento");
  });

  it("drops phases outside the window entirely", () => {
    const rows = buildNutritionPhaseRows([phaseA()], [], [], TODAY, null);
    expect(buildNutritionPhaseBands(rows, "2026-09-01", "2026-09-30")).toHaveLength(0);
  });

  it("labels in the reader's language", () => {
    const rows = buildNutritionPhaseRows([phaseA()], [], [], TODAY, null);
    expect(buildNutritionPhaseBands(rows, "2026-08-01", TODAY, "en")[0]!.label).toBe(
      "Maintenance",
    );
  });
});

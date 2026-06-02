// __tests__/habit-adherence.test.ts
// Pure-function tests for computeAdherence in habit-compliance.ts (Task 2).
//
// computeAdherence is SCHEDULED-DAY adherence: the denominator counts only
// days the habit was active + scheduled in the window (via isHabitScheduledOn,
// honoring startsOn/endsOn/skippedDates + cadence), NOT the full calendar
// window. This is the cross-surface "compliance %" definition shared with iOS
// GCFitnessCore.HabitStreakCalculator.computeAdherenceRatio.
//
// THE LOAD-BEARING CASE (T-A1): a daily habit activated 2026-05-05, evaluated
// on 2026-05-10 with all 6 scheduled days (05-05..05-10) completed → 100%,
// NOT 6/30. This is the bug this task fixes.

import { computeAdherence, type HabitLogRow } from "../habit-compliance";

function binaryLog(opts: {
  date: string;
  value: boolean;
  deleted?: boolean;
}): HabitLogRow {
  return {
    habitId: "hab-test",
    clientId: "client-test",
    civilDate: opts.date,
    value: opts.value,
    deleted: opts.deleted,
  };
}

describe("habit-compliance — computeAdherence", () => {
  // T-A1 — daily habit since a recent start, all scheduled days done → 100%.
  it("T-A1: daily, activated 2026-05-05, 5 completed by 2026-05-10 over 30d → 5/6 (start day not yet logged) ", () => {
    // Days 05-06..05-10 logged true (5 logs). Scheduled days in the 30-day
    // window = 05-05..05-10 = 6 days. completedScheduled = 5 → 5/6.
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-05",
    };
    const logs: HabitLogRow[] = [
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ].map((date) => binaryLog({ date, value: true }));

    const result = computeAdherence(habit, logs, 30, "2026-05-10");
    expect(result.scheduledDays).toBe(6); // 05-05..05-10 inclusive
    expect(result.completedScheduled).toBe(5);
    expect(result.ratio).toBeCloseTo(5 / 6, 10);
    // Must NOT be 5/30.
    expect(result.ratio).not.toBeCloseTo(5 / 30, 5);
  });

  // T-A2 — daily, ALL scheduled days completed including the start day → 100%.
  it("T-A2: daily, all 6 scheduled days completed → 100% (not 6/30)", () => {
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-05",
    };
    const logs: HabitLogRow[] = [
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ].map((date) => binaryLog({ date, value: true }));

    const result = computeAdherence(habit, logs, 30, "2026-05-10");
    expect(result.scheduledDays).toBe(6);
    expect(result.completedScheduled).toBe(6);
    expect(result.ratio).toBe(1);
  });

  // T-A3 — weekly habit: only the single scheduled weekday counts.
  it("T-A3: weekly (Mondays) → 100% when the one scheduled day in window is hit", () => {
    // 2026-05-04 is a Monday (ISO weekday 1). 2026-05-11 is the next Monday.
    // Window: 7 days ending 2026-05-11 (05-05..05-11). startsOn 2026-05-04.
    // Only 2026-05-11 is a Monday in that window → scheduledDays = 1.
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "weekly",
      scheduleWeekdays: [1], // ISO Monday
      startsOn: "2026-05-04",
    };
    const logs: HabitLogRow[] = [binaryLog({ date: "2026-05-11", value: true })];

    const result = computeAdherence(habit, logs, 7, "2026-05-11");
    expect(result.scheduledDays).toBe(1);
    expect(result.completedScheduled).toBe(1);
    expect(result.ratio).toBe(1);
  });

  // T-A4 — days before startsOn excluded from the denominator.
  it("T-A4: days before startsOn are excluded from the denominator", () => {
    // Daily habit starting 2026-05-08, window 7 days ending 2026-05-10.
    // Window civil days: 05-04..05-10. Only 05-08, 05-09, 05-10 are >= startsOn
    // → scheduledDays = 3 (the 4 earlier days are excluded).
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-08",
    };
    const logs: HabitLogRow[] = [
      binaryLog({ date: "2026-05-08", value: true }),
      binaryLog({ date: "2026-05-09", value: true }),
      binaryLog({ date: "2026-05-10", value: true }),
    ];

    const result = computeAdherence(habit, logs, 7, "2026-05-10");
    expect(result.scheduledDays).toBe(3);
    expect(result.completedScheduled).toBe(3);
    expect(result.ratio).toBe(1);
  });

  // T-A5 — skippedDates excluded from the denominator.
  it("T-A5: skippedDates are excluded from the denominator", () => {
    // Daily habit, window 5 days ending 2026-05-10 (05-06..05-10), startsOn
    // well before. Skip 05-08 → scheduledDays = 4. Complete the other 4 → 100%.
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-01",
      skippedDates: ["2026-05-08"],
    };
    const logs: HabitLogRow[] = [
      binaryLog({ date: "2026-05-06", value: true }),
      binaryLog({ date: "2026-05-07", value: true }),
      binaryLog({ date: "2026-05-09", value: true }),
      binaryLog({ date: "2026-05-10", value: true }),
    ];

    const result = computeAdherence(habit, logs, 5, "2026-05-10");
    expect(result.scheduledDays).toBe(4); // 05-08 skipped
    expect(result.completedScheduled).toBe(4);
    expect(result.ratio).toBe(1);
  });

  // T-A6 — empty logs → 0 (denominator still counts scheduled days).
  it("T-A6: empty logs → ratio 0 with a non-zero scheduled denominator", () => {
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-01",
    };
    const result = computeAdherence(habit, [], 7, "2026-05-10");
    expect(result.scheduledDays).toBe(7); // every day scheduled
    expect(result.completedScheduled).toBe(0);
    expect(result.ratio).toBe(0);
  });

  // T-A7 — windowDays <= 0 guard.
  it("T-A7: windowDays <= 0 → ratio 0, scheduledDays 0, empty dailyCounts", () => {
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-01",
    };
    const result = computeAdherence(
      habit,
      [binaryLog({ date: "2026-05-10", value: true })],
      0,
      "2026-05-10",
    );
    expect(result.ratio).toBe(0);
    expect(result.scheduledDays).toBe(0);
    expect(result.dailyCounts).toHaveLength(0);
  });

  // T-A8 — no scheduled days in window → ratio 0 (div-by-zero guard).
  it("T-A8: zero scheduled days in window → ratio 0 (no divide-by-zero)", () => {
    // endsOn before the window → nothing scheduled in 05-06..05-10.
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-04-01",
      endsOn: "2026-04-30",
    };
    const result = computeAdherence(
      habit,
      [binaryLog({ date: "2026-05-08", value: true })],
      5,
      "2026-05-10",
    );
    expect(result.scheduledDays).toBe(0);
    expect(result.ratio).toBe(0);
  });

  // T-A9 — dailyCounts keeps every day in the window (sparkline parity).
  it("T-A9: dailyCounts spans the full window, ascending, completion-flagged", () => {
    const habit = {
      scheduleType: "recurring",
      scheduleCadence: "daily",
      startsOn: "2026-05-08",
    };
    const logs: HabitLogRow[] = [binaryLog({ date: "2026-05-09", value: true })];
    const result = computeAdherence(habit, logs, 7, "2026-05-10");
    expect(result.dailyCounts).toHaveLength(7);
    expect(result.dailyCounts[0].date).toBe("2026-05-04"); // oldest first
    expect(result.dailyCounts[6].date).toBe("2026-05-10"); // newest last
    const completed = result.dailyCounts
      .filter((d) => d.completed)
      .map((d) => d.date);
    expect(completed).toEqual(["2026-05-09"]);
  });
});

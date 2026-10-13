import { describe, expect, it } from "@jest/globals";

import {
  HABIT_WEEKDAY_FORMAT_ISO,
  effectiveIsoWeekdays,
  effectiveIsoWeekdaysOf,
  isHabitScheduledOn,
  isIsoWeekdayFormat,
} from "../habit-schedule";

/**
 * `isHabitScheduledOn` is the single source of truth for the trainer-facing
 * "X/Y habits done today" denominator (recent-logs feed, client daily timeline,
 * coach pulse, habit trends). It must agree with the iOS client
 * (`HabitSchedule.isActive`); divergences here are exactly the
 * "2/5 habits done today, but the client only has 4 habits today" report.
 *
 * Civil-date weekday reference (verified):
 *   2026-05-29 = Friday   (ISO 5)
 *   2026-05-30 = Saturday (ISO 6)
 *   2026-05-31 = Sunday   (ISO 7)
 *   2026-06-01 = Monday   (ISO 1)
 */
function weekly(weekdays: number[], extra: Record<string, unknown> = {}) {
  return {
    scheduleType: "recurring",
    scheduleCadence: "weekly",
    scheduleWeekdays: weekdays,
    ...extra,
  };
}

describe("isHabitScheduledOn — weekly cadence (canonical ISO, no over-count)", () => {
  it("matches on the canonical ISO weekday (Friday=5)", () => {
    expect(isHabitScheduledOn(weekly([5]), "2026-05-29")).toBe(true);
  });

  it("does NOT match an adjacent weekday — the over-count bug (Saturday=6 must not count on Friday)", () => {
    // Old code OR-ed in a legacy Sun=1..Sat=7 alias (Friday→6), so a Saturday
    // habit wrongly counted on Friday. That is the inflated denominator.
    expect(isHabitScheduledOn(weekly([6]), "2026-05-29")).toBe(false);
  });

  it("still matches the same habit on its real day (Saturday)", () => {
    expect(isHabitScheduledOn(weekly([6]), "2026-05-30")).toBe(true);
  });

  it("Monday alias must not count on Sunday (Monday=1 must not fire on 2026-05-31)", () => {
    expect(isHabitScheduledOn(weekly([1]), "2026-05-31")).toBe(false);
    expect(isHabitScheduledOn(weekly([7]), "2026-05-31")).toBe(true);
  });

  it("empty weekdays never matches", () => {
    expect(isHabitScheduledOn(weekly([]), "2026-05-29")).toBe(false);
  });
});

describe("isHabitScheduledOn — disambiguated legacy Sun=1..Sat=7 (iOS parity)", () => {
  // A habit authored under the OLD Sun=1..Sat=7 convention, with weekdays=[1]
  // meaning Sunday, and a startsOn that is itself a Sunday. iOS opts into the
  // legacy reading because startsOn disambiguates it.
  const legacySundayHabit = weekly([1], { startsOn: "2026-05-31" });

  it("fires on Sunday for a legacy-stored Sunday habit", () => {
    expect(isHabitScheduledOn(legacySundayHabit, "2026-05-31")).toBe(true);
  });

  it("does not fire on Monday for that legacy Sunday habit", () => {
    expect(isHabitScheduledOn(legacySundayHabit, "2026-06-01")).toBe(false);
  });

  it("zero-based Sunday stray docs (weekday 0) still resolve on Sunday", () => {
    expect(isHabitScheduledOn(weekly([0]), "2026-05-31")).toBe(true);
  });
});

describe("isHabitScheduledOn — skippedDates (trainer removed this day)", () => {
  it("a daily habit skipped for the day does not count", () => {
    const habit = { scheduleCadence: "daily", skippedDates: ["2026-05-30"] };
    expect(isHabitScheduledOn(habit, "2026-05-30")).toBe(false);
    expect(isHabitScheduledOn(habit, "2026-05-29")).toBe(true);
  });

  it("a weekly habit skipped on a matching day does not count", () => {
    const habit = weekly([5], { skippedDates: ["2026-05-29"] });
    expect(isHabitScheduledOn(habit, "2026-05-29")).toBe(false);
  });
});

describe("isHabitScheduledOn — daily / one-time / window / monthly", () => {
  it("daily is always scheduled", () => {
    expect(isHabitScheduledOn({ scheduleCadence: "daily" }, "2026-05-29")).toBe(true);
    expect(isHabitScheduledOn({}, "2026-05-29")).toBe(true); // default cadence
  });

  it("one-time fires only on startsOn", () => {
    const habit = { scheduleType: "one-time", startsOn: "2026-05-30" };
    expect(isHabitScheduledOn(habit, "2026-05-30")).toBe(true);
    expect(isHabitScheduledOn(habit, "2026-05-29")).toBe(false);
  });

  it("respects the startsOn / endsOn civil-date window", () => {
    expect(
      isHabitScheduledOn({ scheduleCadence: "daily", startsOn: "2026-05-30" }, "2026-05-29"),
    ).toBe(false);
    expect(
      isHabitScheduledOn({ scheduleCadence: "daily", endsOn: "2026-05-29" }, "2026-05-30"),
    ).toBe(false);
  });

  it("monthly fires on its month day(s)", () => {
    expect(
      isHabitScheduledOn({ scheduleCadence: "monthly", scheduleMonthDays: [30] }, "2026-05-30"),
    ).toBe(true);
    expect(
      isHabitScheduledOn({ scheduleCadence: "monthly", scheduleMonthDays: [30] }, "2026-05-29"),
    ).toBe(false);
    expect(
      isHabitScheduledOn({ scheduleCadence: "monthly", scheduleDayOfMonth: 29 }, "2026-05-29"),
    ).toBe(true);
  });
});

// ── gc-fitness#1343 — explicit `weekdayFormat: "iso"` marker ────────────────
// Twin vectors V1–V5, IDENTICAL on iOS (HabitScheduleTests), Android
// (HabitScheduleTest) and functions. Weekday reference:
//   2026-10-08 Thu · 10-11 Sun · 10-12 Mon · 10-13 Tue · 10-14 Wed
//   10-15 Thu · 10-16 Fri · 10-18 Sun
describe("#1343 — weekdayFormat marker (twin vectors)", () => {
  const repro = weekly([1, 3, 5], { startsOn: "2026-10-08" });

  it("#1343 V1 — unmarked [1,3,5] started on a Thursday reads as legacy Sun-first (Sun/Tue/Thu)", () => {
    for (const d of ["2026-10-11", "2026-10-13", "2026-10-15"]) {
      expect(isHabitScheduledOn(repro, d)).toBe(true);
    }
    for (const d of ["2026-10-12", "2026-10-14", "2026-10-16"]) {
      expect(isHabitScheduledOn(repro, d)).toBe(false);
    }
    expect(effectiveIsoWeekdays(repro)).toEqual([2, 4, 7]);
  });

  it("#1343 V2 — the same doc with weekdayFormat:'iso' is Mon/Wed/Fri, never the heuristic", () => {
    const marked = { ...repro, weekdayFormat: HABIT_WEEKDAY_FORMAT_ISO };
    for (const d of ["2026-10-12", "2026-10-14", "2026-10-16"]) {
      expect(isHabitScheduledOn(marked, d)).toBe(true);
    }
    for (const d of ["2026-10-11", "2026-10-13", "2026-10-15"]) {
      expect(isHabitScheduledOn(marked, d)).toBe(false);
    }
    expect(effectiveIsoWeekdays(marked)).toEqual([1, 3, 5]);
  });

  it("#1343 V3 — zero-based Sunday stray: honored unmarked, ignored with the marker", () => {
    const stray = weekly([0, 3], { startsOn: "2026-10-12" });
    expect(isHabitScheduledOn(stray, "2026-10-14")).toBe(true);
    expect(isHabitScheduledOn(stray, "2026-10-18")).toBe(true);
    expect(effectiveIsoWeekdays(stray)).toEqual([3, 7]);

    const marked = { ...stray, weekdayFormat: "iso" };
    expect(isHabitScheduledOn(marked, "2026-10-14")).toBe(true);
    expect(isHabitScheduledOn(marked, "2026-10-18")).toBe(false);
    expect(effectiveIsoWeekdays(marked)).toEqual([3]);
  });

  it("#1343 V4 — an unknown marker value falls back to the legacy heuristic (same as V1)", () => {
    const unknown = { ...repro, weekdayFormat: "sunday-first" };
    expect(isIsoWeekdayFormat("sunday-first")).toBe(false);
    for (const d of ["2026-10-11", "2026-10-13", "2026-10-15"]) {
      expect(isHabitScheduledOn(unknown, d)).toBe(true);
    }
    expect(isHabitScheduledOn(unknown, "2026-10-12")).toBe(false);
    expect(effectiveIsoWeekdays(unknown)).toEqual([2, 4, 7]);
  });

  it("#1343 V5 — a genuine legacy Sun-first doc resolves to its real ISO days, and re-saving it marked keeps them", () => {
    const legacy = weekly([2, 4, 6], { startsOn: "2026-10-12" }); // Mon/Wed/Fri Sun-first
    expect(effectiveIsoWeekdaysOf([2, 4, 6], "2026-10-12", undefined)).toEqual([1, 3, 5]);
    const resaved = weekly(effectiveIsoWeekdays(legacy), {
      startsOn: "2026-10-12",
      weekdayFormat: "iso",
    });
    for (const d of ["2026-10-12", "2026-10-14", "2026-10-16"]) {
      expect(isHabitScheduledOn(legacy, d)).toBe(true);
      expect(isHabitScheduledOn(resaved, d)).toBe(true);
    }
    for (const d of ["2026-10-13", "2026-10-15", "2026-10-18"]) {
      expect(isHabitScheduledOn(legacy, d)).toBe(false);
      expect(isHabitScheduledOn(resaved, d)).toBe(false);
    }
  });
});

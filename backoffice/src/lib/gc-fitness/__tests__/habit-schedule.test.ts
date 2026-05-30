import { describe, expect, it } from "@jest/globals";

import { isHabitScheduledOn } from "../habit-schedule";

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

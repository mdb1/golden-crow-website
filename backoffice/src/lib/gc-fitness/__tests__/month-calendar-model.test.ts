// __tests__/month-calendar-model.test.ts
//
// #507 — the pure civil-date + label helpers moved out of the schedule
// calendar component. The component suites (month-calendar-*.test.tsx) still
// drive the UI; these pin the helpers directly.

import type { MonthWorkoutChip } from "../schedule-month-actions";
import {
  addCivilDays,
  ageOnCivilDate,
  buildGrid,
  calendarCells,
  calendarRange,
  clientInitials,
  findWorkoutChip,
  formatMovedFromLabel,
  habitIdFromChip,
  isBirthdayOn,
  mondayIndex,
  monthDay,
  monthLabel,
  parseCivilDateInUtc,
  shiftMonth,
  shortDateLabel,
  startOfWeekMon,
} from "../month-calendar-model";

describe("civil date arithmetic", () => {
  it("adds days across months, years and DST", () => {
    expect(addCivilDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCivilDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addCivilDays("2026-03-07", 2)).toBe("2026-03-09");
  });

  it("shifts months across years", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-05-01", 0)).toBe("2026-05-01");
  });

  it("is Monday-first", () => {
    expect(mondayIndex("2026-11-16")).toBe(0); // Monday
    expect(mondayIndex("2026-11-15")).toBe(6); // Sunday
    expect(startOfWeekMon("2026-11-15")).toBe("2026-11-09");
    expect(startOfWeekMon("2026-11-16")).toBe("2026-11-16");
  });
});

describe("buildGrid", () => {
  it("is a Monday-first 6 × 7 grid padded with the neighbour months", () => {
    const { cells } = buildGrid("2026-11-01"); // Nov 1 2026 is a Sunday
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ civil: "2026-10-26", inMonth: false });
    expect(cells[6]).toEqual({ civil: "2026-11-01", inMonth: true });
    expect(cells[41]).toEqual({ civil: "2026-12-06", inMonth: false });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30);
  });
});

describe("calendarRange / calendarCells", () => {
  it("month view has no range and renders the grid", () => {
    expect(calendarRange("month", "2026-11-18")).toBeNull();
    expect(calendarCells("month", null, "2026-11-01")).toEqual(buildGrid("2026-11-01").cells);
  });

  it("week view spans Mon…Sun around the anchor", () => {
    const range = calendarRange("week", "2026-11-18");
    expect(range).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    const cells = calendarCells("week", range, "2026-11-01");
    expect(cells.map((c) => c.civil)).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    expect(cells.every((c) => c.inMonth)).toBe(true);
  });

  it("3-day view starts at the anchor", () => {
    const range = calendarRange("3day", "2026-11-30");
    expect(range).toEqual({ start: "2026-11-30", end: "2026-12-02" });
    expect(calendarCells("3day", range, "2026-11-01").map((c) => c.civil)).toEqual([
      "2026-11-30", "2026-12-01", "2026-12-02",
    ]);
  });
});

describe("labels", () => {
  it("formats month and short labels in Spanish", () => {
    expect(monthLabel("2026-11-01")).toBe("Noviembre 2026");
    expect(shortDateLabel("2026-05-28")).toBe("28 May");
  });

  it("builds two-letter initials", () => {
    expect(clientInitials("ana maría lópez")).toBe("AM");
    expect(clientInitials("  Bo ")).toBe("B");
  });

  it("explains a client move in UTC weekdays", () => {
    const label = formatMovedFromLabel("2026-11-16", "2026-11-18");
    expect(label).toMatch(/^Originalmente lunes.*el cliente lo movió a miércoles/);
    expect(formatMovedFromLabel("nope", "2026-11-18")).toBeNull();
  });
});

describe("birthdays", () => {
  it("parses civil dates in UTC and rejects garbage", () => {
    expect(parseCivilDateInUtc("2026-11-15")?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(parseCivilDateInUtc("2026-11")).toBeNull();
    expect(parseCivilDateInUtc("0-0-0")).toBeNull();
  });

  it("matches on month-day only", () => {
    expect(monthDay("1990-11-15")).toBe("11-15");
    expect(monthDay(null)).toBeNull();
    expect(isBirthdayOn("1990-11-15", "2026-11-15")).toBe(true);
    expect(isBirthdayOn("1990-11-16", "2026-11-15")).toBe(false);
    expect(isBirthdayOn(null, "2026-11-15")).toBe(false);
  });

  it("computes the age on a given day", () => {
    expect(ageOnCivilDate("1990-11-15", "2026-11-15")).toBe(36);
    expect(ageOnCivilDate("1990-11-16", "2026-11-15")).toBe(35);
    expect(ageOnCivilDate("2030-01-01", "2026-11-15")).toBeNull();
    expect(ageOnCivilDate(undefined, "2026-11-15")).toBeNull();
  });
});

describe("chip lookups", () => {
  it("finds a workout chip anywhere in the payload", () => {
    const chip = { id: "a2", scheduledFor: "2026-11-17" } as MonthWorkoutChip;
    const byDay = {
      "2026-11-16": [{ id: "a1" } as MonthWorkoutChip],
      "2026-11-17": [chip],
    };
    expect(findWorkoutChip(byDay, "a2")).toBe(chip);
    expect(findWorkoutChip(byDay, "zz")).toBeNull();
  });

  it("recovers the habit id from a `${habitId}_${civilDate}` chip id", () => {
    expect(habitIdFromChip({ id: "h_abc_2026-11-15", civilDate: "2026-11-15" })).toBe("h_abc");
  });
});

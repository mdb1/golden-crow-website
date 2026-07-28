// __tests__/month-grid.test.ts
//
// Locks the Monday-first month grid behind the read-only admin calendar. Pure
// civil-date math — no firebase, no timezone, no mocks.

import {
  chunkWeeks,
  monthFirst,
  monthGridDays,
  monthLabel,
  nextMonthFirst,
  previousMonthFirst,
  shiftCivil,
} from "../month-grid";

describe("shiftCivil", () => {
  it("crosses month and year boundaries", () => {
    expect(shiftCivil("2026-07-28", 1)).toBe("2026-07-29");
    expect(shiftCivil("2026-07-31", 1)).toBe("2026-08-01");
    expect(shiftCivil("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(shiftCivil("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftCivil("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("previousMonthFirst / nextMonthFirst", () => {
  it("steps months without overflowing on short or long months", () => {
    expect(nextMonthFirst("2026-01-31")).toBe("2026-02-01");
    expect(nextMonthFirst("2026-02-01")).toBe("2026-03-01");
    expect(previousMonthFirst("2026-03-15")).toBe("2026-02-01");
    expect(previousMonthFirst("2026-01-05")).toBe("2025-12-01");
  });

  it("is stable when applied repeatedly (no drift)", () => {
    let civil = "2026-07-01";
    for (let i = 0; i < 12; i += 1) civil = nextMonthFirst(civil);
    expect(civil).toBe("2027-07-01");
    for (let i = 0; i < 12; i += 1) civil = previousMonthFirst(civil);
    expect(civil).toBe("2026-07-01");
  });
});

describe("monthGridDays", () => {
  it("starts on the Monday on or before the 1st", () => {
    // 2026-07-01 is a Wednesday → the grid opens on Monday 2026-06-29.
    const days = monthGridDays("2026-07-15");
    expect(days[0].civil).toBe("2026-06-29");
    expect(days[0].inMonth).toBe(false);
    expect(days[2].civil).toBe("2026-07-01");
    expect(days[2].inMonth).toBe(true);
  });

  it("always emits whole weeks", () => {
    for (const civil of ["2026-01-10", "2026-02-10", "2028-02-10", "2026-08-10"]) {
      expect(monthGridDays(civil).length % 7).toBe(0);
    }
  });

  it("covers every day of the month exactly once", () => {
    const days = monthGridDays("2026-07-01").filter((d) => d.inMonth);
    expect(days).toHaveLength(31);
    expect(days[0].civil).toBe("2026-07-01");
    expect(days[30].civil).toBe("2026-07-31");
    expect(new Set(days.map((d) => d.civil)).size).toBe(31);
  });

  it("never renders a week made entirely of adjacent-month days", () => {
    // A 28-day February that starts on a Monday fits in exactly 4 rows; the
    // naive fixed-6-week grid would render two empty trailing weeks.
    const days = monthGridDays("2027-02-10");
    const weeks = chunkWeeks(days);
    expect(weeks.every((w) => w.some((d) => d.inMonth))).toBe(true);
  });

  it("marks leading and trailing days as out-of-month", () => {
    const days = monthGridDays("2026-07-15");
    expect(days.filter((d) => d.inMonth)).toHaveLength(31);
    expect(days.filter((d) => !d.inMonth).length).toBeGreaterThan(0);
  });
});

describe("chunkWeeks", () => {
  it("splits into rows of 7 preserving order", () => {
    const weeks = chunkWeeks(monthGridDays("2026-07-15"));
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0].civil).toBe("2026-06-29");
    expect(weeks[0][6].civil).toBe("2026-07-05");
  });
});

describe("monthLabel", () => {
  it("renders the month of the civil date, not the local-timezone month", () => {
    // A UTC-midnight parse read in a negative-offset zone would slip to June.
    expect(monthLabel("2026-07-01", "en-US")).toBe("July 2026");
    expect(monthLabel("2026-07-31", "en-US")).toBe("July 2026");
  });
});

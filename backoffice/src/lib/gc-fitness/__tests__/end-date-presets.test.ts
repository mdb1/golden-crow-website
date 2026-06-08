import {
  addCivilDays,
  addCivilMonths,
  endDateForWeeks,
  inferEndDatePresetMonths,
  inferEndDatePresetWeeks,
} from "../end-date-presets";

describe("addCivilMonths", () => {
  it("adds whole months and preserves the day when possible", () => {
    expect(addCivilMonths("2026-01-15", 3)).toBe("2026-04-15");
  });

  it("clamps to the last valid day of shorter months", () => {
    expect(addCivilMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("handles leap years", () => {
    expect(addCivilMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("inferEndDatePresetMonths", () => {
  it("returns the matching preset when the end date matches a preset span", () => {
    expect(inferEndDatePresetMonths("2026-01-15", "2026-04-15")).toBe(3);
  });

  it("returns null for custom end dates", () => {
    expect(inferEndDatePresetMonths("2026-01-15", "2026-05-01")).toBeNull();
  });
});

describe("addCivilDays", () => {
  it("adds whole days across a month boundary", () => {
    expect(addCivilDays("2026-05-08", 13)).toBe("2026-05-21");
    expect(addCivilDays("2026-05-31", 1)).toBe("2026-06-01");
  });
});

describe("endDateForWeeks", () => {
  // 2 weeks of a daily habit = 14 occurrences over an INCLUSIVE window, so
  // the end date is startsOn + 13 days (NOT +14). This is the fix for the
  // "daily for 2 weeks showed 46 occurrences" bug.
  it("returns an inclusive N*7-day window anchored to the start", () => {
    expect(endDateForWeeks("2026-05-08", 2)).toBe("2026-05-21");
    expect(endDateForWeeks("2026-05-08", 1)).toBe("2026-05-14");
    expect(endDateForWeeks("2026-05-08", 4)).toBe("2026-06-04");
  });
});

describe("inferEndDatePresetWeeks", () => {
  it("returns the matching week preset", () => {
    expect(inferEndDatePresetWeeks("2026-05-08", "2026-05-21")).toBe(2);
  });

  it("returns null for non-matching end dates", () => {
    expect(inferEndDatePresetWeeks("2026-05-08", "2026-06-22")).toBeNull();
  });
});

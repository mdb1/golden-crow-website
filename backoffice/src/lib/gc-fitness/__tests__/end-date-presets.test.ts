import {
  addCivilMonths,
  inferEndDatePresetMonths,
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

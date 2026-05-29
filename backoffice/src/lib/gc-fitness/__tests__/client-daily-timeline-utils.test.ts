import { buildClientDailyTimelineDates } from "../client-daily-timeline-utils";

// Unit tests for buildClientDailyTimelineDates — the 29-day civil-date window
// (today ± 14) centered on the CLIENT's local civil day, used by the client
// detail timeline (roadmap section D — untested pure helper). Locks the
// window size, centering, ordering, month/year-boundary crossing, and the
// timezone-aware "today" resolution.

describe("buildClientDailyTimelineDates", () => {
  const anchor = new Date("2026-05-29T12:00:00Z");

  it("returns exactly 29 civil-date strings", () => {
    const dates = buildClientDailyTimelineDates("UTC", anchor);
    expect(dates).toHaveLength(29);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
  });

  it("centers the window on today (index 14) with ±14 days on each side", () => {
    const dates = buildClientDailyTimelineDates("UTC", anchor);
    expect(dates[14]).toBe("2026-05-29"); // today
    expect(dates[0]).toBe("2026-05-15"); // today - 14
    expect(dates[28]).toBe("2026-06-12"); // today + 14 (crosses into June)
  });

  it("is strictly ascending (oldest first) with no gaps or duplicates", () => {
    const dates = buildClientDailyTimelineDates("UTC", anchor);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
    expect(new Set(dates).size).toBe(29);
  });

  it("resolves 'today' in the CLIENT timezone, not UTC (late-night boundary)", () => {
    // 02:00Z on the 29th is 23:00 on the 28th in Buenos Aires (UTC-3), so the
    // window must center on 2026-05-28, not 2026-05-29.
    const lateNight = new Date("2026-05-29T02:00:00Z");
    const dates = buildClientDailyTimelineDates("America/Argentina/Buenos_Aires", lateNight);
    expect(dates[14]).toBe("2026-05-28");
    expect(dates[0]).toBe("2026-05-14");
    expect(dates[28]).toBe("2026-06-11");
  });

  it("crosses a year boundary correctly", () => {
    const newYears = new Date("2026-01-01T12:00:00Z");
    const dates = buildClientDailyTimelineDates("UTC", newYears);
    expect(dates[14]).toBe("2026-01-01");
    expect(dates[0]).toBe("2025-12-18"); // back into the previous year
    expect(dates[28]).toBe("2026-01-15");
  });

  it("spans a leap-day (Feb 2028) without skipping Feb 29", () => {
    const leap = new Date("2028-02-29T12:00:00Z");
    const dates = buildClientDailyTimelineDates("UTC", leap);
    expect(dates[14]).toBe("2028-02-29");
    expect(dates).toContain("2028-02-29");
    expect(dates[0]).toBe("2028-02-15");
    expect(dates[28]).toBe("2028-03-14");
  });
});

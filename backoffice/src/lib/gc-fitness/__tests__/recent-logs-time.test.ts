import {
  addCivilDays,
  formatRecentLogDayHeading,
  formatRecentLogTime,
  recentLogDayKeyFromIso,
} from "@/lib/gc-fitness/recent-logs-time";

describe("recent logs time helpers", () => {
  test("formats event times in the trainer timezone", () => {
    expect(
      formatRecentLogTime(
        "2026-06-03T14:08:00.000Z",
        "America/Argentina/Buenos_Aires",
        "en-US",
      ),
    ).toBe("11:08 AM");
  });

  test("uses the trainer timezone when grouping by day", () => {
    expect(recentLogDayKeyFromIso("2026-06-03T02:59:00.000Z", "UTC")).toBe("2026-06-03");
    expect(
      recentLogDayKeyFromIso("2026-06-03T02:59:00.000Z", "America/Argentina/Buenos_Aires"),
    ).toBe("2026-06-02");
  });

  test("labels today and yesterday relative to the trainer timezone", () => {
    const now = new Date("2026-06-03T15:00:00.000Z");

    expect(
      formatRecentLogDayHeading(
        "2026-06-03T02:59:00.000Z",
        "America/Argentina/Buenos_Aires",
        "en-US",
        { today: "Today", yesterday: "Yesterday" },
        now,
      ),
    ).toBe("Yesterday");

    expect(
      formatRecentLogDayHeading(
        "2026-06-03T14:08:00.000Z",
        "America/Argentina/Buenos_Aires",
        "en-US",
        { today: "Today", yesterday: "Yesterday" },
        now,
      ),
    ).toBe("Today");
  });

  test("adds civil days across month boundaries", () => {
    expect(addCivilDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addCivilDays("2024-03-01", -1)).toBe("2024-02-29");
  });
});

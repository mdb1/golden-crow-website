// audit-feed-format.test.ts — human dates for the admin Monitoring feed.

import {
  daySeparatorLabel,
  humanDate,
  humanDateRange,
  humanizeDatesInText,
  relativeTime,
  weekdayPlural,
} from "@/lib/gc-fitness/audit-feed-format";

const words = { today: "Hoy", yesterday: "Ayer" };

describe("audit-feed-format", () => {
  it("writes civil dates the es-AR way and the en-US way", () => {
    expect(humanDate("2026-11-14", "es")).toBe("14 nov 2026");
    expect(humanDate("2026-11-14", "en")).toBe("Nov 14, 2026");
    expect(humanDate("not-a-date", "es")).toBe("not-a-date");
  });

  it("writes a range with the year once when both ends share it", () => {
    expect(humanDateRange("2026-11-14", "2026-12-26", "es")).toBe("14 nov → 26 dic 2026");
    expect(humanDateRange("2026-12-28", "2027-01-04", "es")).toBe("28 dic 2026 → 4 ene 2027");
    expect(humanDateRange("2026-11-14", "2026-11-14", "en")).toBe("Nov 14, 2026");
    expect(humanDateRange("2026-11-14", "2026-12-26", "en")).toBe("Nov 14 → Dec 26, 2026");
  });

  it("humanizes the ISO dates inside a stored sentence and leaves timestamps alone", () => {
    expect(humanizeDatesInText("Recurrencia: semanal · 6 fechas · 2026-07-10 a 2026-08-14", "es")).toBe(
      "Recurrencia: semanal · 6 fechas · 10 jul 2026 a 14 ago 2026",
    );
    expect(humanizeDatesInText("Fecha: 2026-12-26", "es")).toBe("Fecha: 26 dic 2026");
    expect(humanizeDatesInText("2026-12-26T04:00:00Z", "es")).toBe("2026-12-26T04:00:00Z");
    expect(humanizeDatesInText("serie 1 h 2 min", "es")).toBe("serie 1 h 2 min");
  });

  it("labels the day separators «Hoy», «Ayer», «Lunes 16 nov»", () => {
    expect(daySeparatorLabel("2026-11-18", "2026-11-18", "es", words)).toBe("Hoy");
    expect(daySeparatorLabel("2026-11-17", "2026-11-18", "es", words)).toBe("Ayer");
    expect(daySeparatorLabel("2026-11-16", "2026-11-18", "es", words)).toBe("Lunes 16 nov");
    expect(daySeparatorLabel("2025-11-17", "2026-11-18", "es", words)).toBe("Lunes 17 nov 2025");
    expect(daySeparatorLabel("2026-11-16", "2026-11-18", "en", words)).toBe("Monday, Nov 16");
    // Month boundary: «Ayer» is computed on civil days, not by string slicing.
    expect(daySeparatorLabel("2026-10-31", "2026-11-01", "es", words)).toBe("Ayer");
  });

  it("says how long ago, in the viewer's language", () => {
    const now = Date.parse("2026-11-18T12:00:00.000Z");
    expect(relativeTime("2026-11-18T11:55:00.000Z", now, "es")).toMatch(/hace 5 min/);
    expect(relativeTime("2026-11-18T09:00:00.000Z", now, "en")).toMatch(/3 hr\.? ago/);
    expect(relativeTime("2026-11-17T12:00:00.000Z", now, "es")).toBe("ayer");
    expect(relativeTime(null, now, "es")).toBeNull();
  });

  it("names a cadence's weekday in the plural", () => {
    expect(weekdayPlural(6, "es")).toBe("sábados");
    expect(weekdayPlural(1, "es")).toBe("lunes");
    expect(weekdayPlural(6, "en")).toBe("Saturdays");
  });
});

// trend-range.test.ts — #451 regression net.
//
// The civil-date helpers behind the client-profile trend widgets. They anchor
// each YYYY-MM-DD at UTC noon so a ±1-day shift can never trip over a DST
// boundary, whatever TZ the server / browser runs in.

import {
  DEFAULT_TREND_RANGE,
  TREND_RANGES,
  addCivilDays,
  bucketGranularity,
  civilDiffDays,
} from "../trend-range";

describe("range vocabulary", () => {
  it("is ordered widest → narrowest with 'all' capped at a year", () => {
    expect(TREND_RANGES.map((r) => [r.key, r.days])).toEqual([
      ["all", 365],
      ["90", 90],
      ["30", 30],
      ["7", 7],
    ]);
    expect(DEFAULT_TREND_RANGE).toBe("30");
  });

  it("buckets by day up to 30d and by week beyond", () => {
    expect(bucketGranularity("7")).toBe("day");
    expect(bucketGranularity("30")).toBe("day");
    expect(bucketGranularity("90")).toBe("week");
    expect(bucketGranularity("all")).toBe("week");
  });
});

describe("addCivilDays — month / year boundaries", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2024-02-28", 1, "2024-02-29"], // leap year
    ["2024-02-29", 1, "2024-03-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2026-10-16", 0, "2026-10-16"],
    ["2026-10-16", -365, "2025-10-16"],
    ["2024-10-16", -365, "2023-10-17"], // 2024 is a leap year
    ["2026-10-16", -90, "2026-07-18"],
  ])("%s %+d → %s", (from, delta, expected) => {
    expect(addCivilDays(from, delta)).toBe(expected);
  });

  it("normalizes an unpadded but valid date to the 10-char form", () => {
    expect(addCivilDays("2026-3-5", 0)).toBe("2026-03-05");
  });
});

describe("DST transitions do not shift the civil day", () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it.each(["America/New_York", "America/Argentina/Buenos_Aires", "Europe/Madrid", "Australia/Sydney"])(
    "in %s, stepping across the spring-forward / fall-back days is exactly ±1",
    (tz) => {
      process.env.TZ = tz;
      // US spring-forward 2026-03-08, fall-back 2026-11-01; EU 2026-03-29 / 2026-10-25;
      // AU 2026-04-05 / 2026-10-04.
      for (const day of ["2026-03-08", "2026-11-01", "2026-03-29", "2026-10-25", "2026-04-05", "2026-10-04"]) {
        const next = addCivilDays(day, 1);
        expect(addCivilDays(next, -1)).toBe(day);
        expect(civilDiffDays(next, day)).toBe(1);
        expect(civilDiffDays(day, next)).toBe(-1);
      }
      expect(addCivilDays("2026-03-07", 2)).toBe("2026-03-09");
      expect(addCivilDays("2026-10-31", 2)).toBe("2026-11-02");
    },
  );
});

describe("civilDiffDays", () => {
  it.each([
    ["2026-10-16", "2026-10-16", 0],
    ["2026-10-17", "2026-10-16", 1],
    ["2026-10-16", "2026-10-17", -1],
    ["2027-01-01", "2026-01-01", 365],
    ["2025-01-01", "2024-01-01", 366],
    ["2026-03-01", "2026-02-01", 28],
  ])("%s - %s = %d", (a, b, expected) => {
    expect(civilDiffDays(a, b)).toBe(expected);
  });

  it("round-trips with addCivilDays across a whole year", () => {
    const start = "2026-01-01";
    for (let i = -400; i <= 400; i += 37) {
      expect(civilDiffDays(addCivilDays(start, i), start)).toBe(i);
    }
  });
});

describe("malformed input", () => {
  it.each(["", "garbage", "2026-10", "2026/10/16", "2026-10-16-01", "2026-xx-16", "2026-10-16T00:00"])(
    "addCivilDays(%p) returns the input unchanged",
    (input) => {
      expect(addCivilDays(input, 3)).toBe(input);
    },
  );

  it("civilDiffDays returns 0 when either side is unparseable", () => {
    expect(civilDiffDays("garbage", "2026-10-16")).toBe(0);
    expect(civilDiffDays("2026-10-16", "")).toBe(0);
  });

  // Regression (#451): `civilToUtcNoon` only rejected NaN components and
  // `Number("")` is 0, so calendar-invalid dates were silently ROLLED OVER by
  // Date.UTC ("2026-02-30" → 2026-03-02, "2026-13-01" → 2027-01-01,
  // "2026--01" → 2025-12-01). They are now malformed and returned unchanged.
  it("treats calendar-invalid dates as invalid instead of rolling them over", () => {
    expect(addCivilDays("2026-02-30", 0)).toBe("2026-02-30");
    expect(addCivilDays("2026-13-01", 0)).toBe("2026-13-01");
    expect(addCivilDays("2026--01", 0)).toBe("2026--01");
    expect(civilDiffDays("2026-02-30", "2026-03-02")).toBe(0);
  });

  // Regression (#451): Date.UTC maps years 0–99 to 1900–1999, so "0026-01-01"
  // came back as "1926-01-01". `setUTCFullYear` keeps the literal year.
  it("keeps two-digit years literal", () => {
    expect(addCivilDays("0026-01-01", 0)).toBe("0026-01-01");
  });
});

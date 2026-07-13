// civil-date.test.ts
// TypeScript twin of GCFitnessCore CivilDateTests.swift.
//
// SHARED CROSS-SURFACE FIXTURES (read this if you touch the Swift suite):
//
// These instants are referenced verbatim by the Swift Testing twin in:
//   gc-fitness/Packages/GCFitnessCore/Tests/GCFitnessCoreTests/CivilDateTests.swift
//
// If you change ANY fixture instant or expected civil-date string here, you
// MUST change it in the Swift twin in the SAME commit. The whole point of
// matched fixtures is to detect Swift ↔ TS drift early (Pitfall 1 / Pitfall 7
// from 04-RESEARCH.md).
//
//   Name                    | Epoch (s)   | Wall clock                              | Expected civil
//   ------------------------|-------------|-----------------------------------------|---------------
//   MXC_NOON_2026_06_01     | 1780336800  | 2026-06-01 12:00 America/Mexico_City    | "2026-06-01"
//   MXC_LATE_2026_06_01     | 1780369200  | 2026-06-01 21:00 America/Mexico_City    | "2026-06-01"
//                           |             | (= 2026-06-02 03:00 UTC — UTC-drift trap)
//   NYC_DST_SPRING_0130_EST | 1772951400  | 2026-03-08 01:30 America/New_York (EST) | "2026-03-08"
//   NYC_DST_SPRING_0330_EDT | 1772955000  | 2026-03-08 03:30 America/New_York (EDT) | "2026-03-08"
//   NYC_DST_FALL_0130_EDT   | 1793511000  | 2026-11-01 01:30 America/New_York (EDT) | "2026-11-01"
//   NYC_DST_FALL_0130_EST   | 1793514600  | 2026-11-01 01:30 America/New_York (EST) | "2026-11-01"
//   MAD_DST_SPRING_0330     | 1774747800  | 2026-03-29 03:30 Europe/Madrid (CEST)   | "2026-03-29"
//   MAD_DST_FALL_0230       | 1792888200  | 2026-10-25 02:30 Europe/Madrid          | "2026-10-25"
//
// References:
//   - .planning/phases/04-workout-templates-assignments/04-RESEARCH.md §Pattern 2
//   - .planning/phases/04-workout-templates-assignments/04-RESEARCH.md §Pitfall 1
//   - .planning/phases/04-workout-templates-assignments/04-RESEARCH.md §Pitfall 2

import {
  civilDateFormat,
  civilDateToday,
  formatCivilDateLabel,
  parseCivilYMD,
  photoCompareElapsed,
} from "../civil-date";

// Shared fixture epochs (seconds).
const MXC_NOON_2026_06_01 = 1780336800;
const MXC_LATE_2026_06_01 = 1780369200;
const NYC_DST_SPRING_0130_EST = 1772951400;
const NYC_DST_SPRING_0330_EDT = 1772955000;
const NYC_DST_FALL_0130_EDT = 1793511000;
const NYC_DST_FALL_0130_EST = 1793514600;
const MAD_DST_SPRING_0330 = 1774747800;
const MAD_DST_FALL_0230 = 1792888200;

const d = (epochS: number) => new Date(epochS * 1000);

describe("civilDateFormat — IANA-aware YYYY-MM-DD", () => {
  it("returns 10-char YYYY-MM-DD with zero-padded month and day", () => {
    const s = civilDateFormat(d(MXC_NOON_2026_06_01), "America/Mexico_City");
    expect(s).toBe("2026-06-01");
    expect(s).toHaveLength(10);
    expect(s[4]).toBe("-");
    expect(s[7]).toBe("-");
  });

  it("zero-pads single-digit month and day", () => {
    // 2026-01-05 00:01 UTC
    const jan05 = new Date(1767571260 * 1000);
    expect(civilDateFormat(jan05, "UTC")).toBe("2026-01-05");
  });

  // Pitfall 1 — UTC drift inoculation
  it("avoids UTC drift — late-day local time stays on the local civil day", () => {
    const local = civilDateFormat(d(MXC_LATE_2026_06_01), "America/Mexico_City");
    expect(local).toBe("2026-06-01");
    // Demonstrates the trap: the SAME instant in UTC is the NEXT day.
    // (We assert against `toISOString()` to lock the invariant — see civil-date.ts
    // file header for why we never use it as a civil-date source.)
    expect(d(MXC_LATE_2026_06_01).toISOString().slice(0, 10)).toBe("2026-06-02");
  });

  // Pitfall 2 — DST spring-forward
  it("DST spring-forward (NYC 2026-03-08) — pre-jump 01:30 EST and post-jump 03:30 EDT map to the same civil day", () => {
    expect(civilDateFormat(d(NYC_DST_SPRING_0130_EST), "America/New_York")).toBe("2026-03-08");
    expect(civilDateFormat(d(NYC_DST_SPRING_0330_EDT), "America/New_York")).toBe("2026-03-08");
  });

  it("DST spring-forward (Madrid 2026-03-29) maps post-jump 03:30 CEST to 2026-03-29", () => {
    expect(civilDateFormat(d(MAD_DST_SPRING_0330), "Europe/Madrid")).toBe("2026-03-29");
  });

  // Pitfall 2 — DST fall-back / cessation
  it("DST fall-back (NYC 2026-11-01) — both 01:30 EDT and 01:30 EST map to 2026-11-01", () => {
    expect(civilDateFormat(d(NYC_DST_FALL_0130_EDT), "America/New_York")).toBe("2026-11-01");
    expect(civilDateFormat(d(NYC_DST_FALL_0130_EST), "America/New_York")).toBe("2026-11-01");
    // Sanity: the two instants are different.
    expect(NYC_DST_FALL_0130_EDT).not.toBe(NYC_DST_FALL_0130_EST);
  });

  it("DST fall-back (Madrid 2026-10-25) maps 02:30 to 2026-10-25", () => {
    expect(civilDateFormat(d(MAD_DST_FALL_0230), "Europe/Madrid")).toBe("2026-10-25");
  });

  it("returns different civil dates in zones that straddle midnight", () => {
    expect(civilDateFormat(d(MXC_LATE_2026_06_01), "America/Mexico_City")).toBe("2026-06-01");
    expect(civilDateFormat(d(MXC_LATE_2026_06_01), "Europe/Madrid")).toBe("2026-06-02");
  });

  // T-04-01 — Unknown timezone fallback
  it("unknown timezone identifier falls back without crashing", () => {
    // `Intl.DateTimeFormat` throws RangeError on unknown TZ; the helper must
    // catch and fall back to the runtime's default zone. We only assert the
    // call doesn't throw and the output shape is valid — the exact day
    // depends on the host TZ.
    const s = civilDateFormat(d(MXC_NOON_2026_06_01), "Fake/Zone");
    expect(s).toHaveLength(10);
    expect(s[4]).toBe("-");
    expect(s[7]).toBe("-");
  });
});

describe("civilDateToday(timezone, now)", () => {
  it("is equivalent to civilDateFormat(now, timezone)", () => {
    const now = d(MXC_NOON_2026_06_01);
    expect(civilDateToday("America/Mexico_City", now)).toBe(
      civilDateFormat(now, "America/Mexico_City"),
    );
    expect(civilDateToday("America/Mexico_City", now)).toBe("2026-06-01");
  });

  it("returns a 10-char string when called without `now`", () => {
    const today = civilDateToday("America/Mexico_City");
    expect(today).toHaveLength(10);
    expect(today[4]).toBe("-");
    expect(today[7]).toBe("-");
    expect(/^\d{4}-\d{2}-\d{2}$/.test(today)).toBe(true);
  });
});

describe("formatCivilDateLabel(civilDate, options)", () => {
  it("formats civil dates without host timezone drift", () => {
    expect(
      formatCivilDateLabel("2026-06-01", {
        weekday: "long",
        day: "numeric",
        month: "short",
      }, "en-US"),
    ).toBe("Monday, Jun 1");
  });

  it("returns the original string for malformed civil dates", () => {
    expect(formatCivilDateLabel("not-a-date")).toBe("not-a-date");
  });
});

// photoCompareElapsed — twin of PhotoCompareElapsedTests.swift /
// PhotoCompareElapsedTest.kt.
//
// SHARED CROSS-SURFACE FIXTURES: these before→after pairs and their expected
// {value, unit, approximate} are referenced verbatim by the Swift and Kotlin
// twins. Change one, change all three in the same PR.
//
//   before      | after       | expected
//   ------------|-------------|-------------------------------
//   2026-03-01  | 2026-04-01  | 1 month  exact   ("1 mes")
//   2026-03-01  | 2026-05-20  | 2 months approx  ("~2 meses")
//   2026-01-31  | 2026-03-31  | 2 months exact
//   2026-01-31  | 2026-02-28  | 4 weeks  exact   (28d, month decremented)
//   2026-03-01  | 2026-03-15  | 2 weeks  exact   (14d)
//   2026-03-01  | 2026-03-10  | 1 week   approx  (9d)
//   2026-03-01  | 2026-03-06  | 5 days   exact
//   2026-03-01  | 2026-03-01  | null (same day)
//   2026-04-01  | 2026-03-01  | null (after < before)
//   2025-12-15  | 2026-01-10  | 3 weeks  approx  (26d, year boundary)
describe("photoCompareElapsed", () => {
  const ymd = (s: string) => parseCivilYMD(s)!;
  const cases: Array<[string, string, ReturnType<typeof photoCompareElapsed>]> = [
    ["2026-03-01", "2026-04-01", { value: 1, unit: "month", approximate: false }],
    ["2026-03-01", "2026-05-20", { value: 2, unit: "month", approximate: true }],
    ["2026-01-31", "2026-03-31", { value: 2, unit: "month", approximate: false }],
    ["2026-01-31", "2026-02-28", { value: 4, unit: "week", approximate: false }],
    ["2026-03-01", "2026-03-15", { value: 2, unit: "week", approximate: false }],
    ["2026-03-01", "2026-03-10", { value: 1, unit: "week", approximate: true }],
    ["2026-03-01", "2026-03-06", { value: 5, unit: "day", approximate: false }],
    ["2026-03-01", "2026-03-01", null],
    ["2026-04-01", "2026-03-01", null],
    ["2025-12-15", "2026-01-10", { value: 3, unit: "week", approximate: true }],
  ];
  it.each(cases)("%s → %s", (before, after, expected) => {
    expect(photoCompareElapsed(ymd(before), ymd(after))).toEqual(expected);
  });

  it("parseCivilYMD rejects malformed strings", () => {
    expect(parseCivilYMD("not-a-date")).toBeNull();
    expect(parseCivilYMD("2026-13-01")).toBeNull();
    expect(parseCivilYMD("2026-01-32")).toBeNull();
    expect(parseCivilYMD("2026-03-01")).toEqual({ year: 2026, month: 3, day: 1 });
  });
});

// Locks the source-file contract that we never reach for `Date.toISOString()`
// inside civil-date.ts (Pitfall 1 — that path is UTC-fixed by design).
// This is a unit-level grep run via the test harness so it lives with the
// rest of the suite and can't be silently bypassed.
describe("civil-date.ts source contract", () => {
  it("does not call Date.prototype.toISOString anywhere in civil-date.ts", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "civil-date.ts"),
      "utf8",
    );
    // Strip line comments so the explanatory header is allowed to mention it.
    const stripped = src
      .split("\n")
      .filter((line: string) => !line.trim().startsWith("//"))
      .join("\n");
    expect(stripped).not.toMatch(/toISOString/);
  });
});

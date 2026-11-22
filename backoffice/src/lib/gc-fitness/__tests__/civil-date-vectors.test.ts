// civil-date-vectors.test.ts — gc-fitness #1644. EVERY case of the ONE civil-date table
// (`twin-vectors/civil-date-vectors.json`, pinned copy of gc-fitness `twin-vectors/`) through
// civil-date.ts. The same file drives Swift/Kotlin `CivilDate` and the functions helpers.

import { civilDateAddDays, civilDateFormat, civilDateToday, civilDaysBetween } from "../civil-date";
import vectors from "./twin-vectors/civil-date-vectors.json";

interface Vectors {
  addDays: { name: string; civil: string; days: number; expected: string | null }[];
  daysBetween: { name: string; from: string; to: string; expected: number | null }[];
  format: { name: string; instant: string; timezone: string; expected: string }[];
}

const v = vectors as Vectors;
const named = <T extends { name: string }>(cases: T[]) => cases.map((c) => [c.name, c] as const);

describe("civil-date twin vectors (#1644)", () => {
  it("has the minimum case counts", () => {
    expect(v.addDays.length).toBeGreaterThanOrEqual(25);
    expect(v.daysBetween.length).toBeGreaterThanOrEqual(20);
    expect(v.format.length).toBeGreaterThanOrEqual(12);
  });

  test.each(named(v.addDays))("addDays: %s", (_n, c) => {
    expect(civilDateAddDays(c.civil, c.days)).toBe(c.expected);
  });

  test.each(named(v.daysBetween))("daysBetween: %s", (_n, c) => {
    expect(civilDaysBetween(c.from, c.to)).toBe(c.expected);
  });

  test.each(named(v.format))("format: %s", (_n, c) => {
    const instant = new Date(c.instant);
    expect(civilDateFormat(instant, c.timezone)).toBe(c.expected);
    expect(civilDateToday(c.timezone, instant)).toBe(c.expected);
  });
});

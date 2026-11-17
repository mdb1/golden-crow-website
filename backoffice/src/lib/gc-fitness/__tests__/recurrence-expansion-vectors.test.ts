// recurrence-expansion-vectors.test.ts — gc-fitness #1644. `twin-vectors/recurrence-expansion.json`
// (pinned copy of gc-fitness `twin-vectors/`) was GENERATED from this file's
// `expandRecurrenceDates` (#1239) and is run by functions + Swift + Kotlin; this suite runs it
// here too, with the process timezone set to each case's `timezone` (the weekday / month-end math
// reads LOCAL time — exactly where a twin drifts).

import { expandRecurrenceDates, MAX_RECURRING_OCCURRENCES, type ExpandableRecurrence } from "../recurrence-expansion";
import vectors from "./twin-vectors/recurrence-expansion.json";

interface Case {
  name: string;
  recurrence: ExpandableRecurrence;
  startDate: string;
  endDate?: string;
  timezone: string;
  expected: string[];
}

const cases = (vectors as unknown as { cases: Case[] }).cases;
const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe("recurrence expansion twin vector (#1239, consumed here since #1644)", () => {
  test.each(cases.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    process.env.TZ = c.timezone;
    expect(expandRecurrenceDates(c.recurrence, c.startDate, c.endDate)).toEqual(c.expected);
  });

  it("no case exceeds the occurrence cap", () => {
    for (const c of cases) expect(c.expected.length).toBeLessThanOrEqual(MAX_RECURRING_OCCURRENCES);
  });
});

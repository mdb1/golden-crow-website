// habit-vectors.test.ts — gc-fitness #1644. Two shared tables, pinned copies of gc-fitness
// `twin-vectors/`:
//   * `habit-schedule-vectors.json` — `isHabitScheduledOn` / `effectiveIsoWeekdays` against iOS
//     `HabitSchedule.isActive` (the source of truth); Kotlin runs it too.
//   * `habit-compliance.json` — `computeAdherence`; it was GENERATED from this file (#1245) and the
//     apps ran it, but this suite never did until #1644.

import { computeAdherence, type HabitLogRow } from "../habit-compliance";
import { effectiveIsoWeekdays, isHabitScheduledOn } from "../habit-schedule";
import complianceVectors from "./twin-vectors/habit-compliance.json";
import scheduleVectors from "./twin-vectors/habit-schedule-vectors.json";

interface ScheduleCase {
  name: string;
  habit: Record<string, unknown>;
  checks: { date: string; expected: boolean }[];
  isoWeekdays?: number[];
}
interface ComplianceCase {
  name: string;
  habit: Record<string, unknown>;
  logs: { civilDate: string; value: boolean; deleted?: boolean }[];
  today: string;
  windowDays: number;
  expected: { ratio: number; scheduledDays: number; completedScheduled: number };
}

/** Firestore omits absent fields; the vector spells them as null. */
const doc = (h: Record<string, unknown>) => Object.fromEntries(Object.entries(h).filter(([, x]) => x !== null));
const schedule = (scheduleVectors as unknown as { cases: ScheduleCase[] }).cases;
const compliance = (complianceVectors as unknown as { cases: ComplianceCase[] }).cases;

describe("habit-schedule twin vectors (#1644)", () => {
  it("has the minimum case count", () => {
    expect(schedule.length).toBeGreaterThanOrEqual(30);
  });

  test.each(schedule.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    for (const check of c.checks) {
      expect({ date: check.date, scheduled: isHabitScheduledOn(doc(c.habit), check.date) }).toEqual({
        date: check.date,
        scheduled: check.expected,
      });
    }
    if (c.isoWeekdays) expect(effectiveIsoWeekdays(doc(c.habit))).toEqual(c.isoWeekdays);
  });
});

describe("habit-compliance twin vector (#1245, consumed here since #1644)", () => {
  it("has the minimum case count", () => {
    expect(compliance.length).toBeGreaterThanOrEqual(18);
  });

  test.each(compliance.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    const logs: HabitLogRow[] = c.logs.map((l) => ({
      habitId: "h1",
      clientId: "c1",
      civilDate: l.civilDate,
      value: l.value,
      deleted: l.deleted,
    }));
    const got = computeAdherence(doc(c.habit), logs, c.windowDays, c.today);
    expect({ ratio: got.ratio, scheduledDays: got.scheduledDays, completedScheduled: got.completedScheduled }).toEqual(
      c.expected,
    );
  });
});

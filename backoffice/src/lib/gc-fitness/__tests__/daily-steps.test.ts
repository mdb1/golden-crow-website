// __tests__/daily-steps.test.ts
//
// The read side of daily steps. NOTHING WRITES THIS YET — iOS reads the count
// from HealthKit on the device and never uploads it — so these tests are the
// contract the two app writers will be held to, not a description of live data.
//
// The two decisions worth locking down:
//   • The DOC ID is the civil date. HealthKit's count for today changes all day,
//     so a sync is an upsert; an auto-id collection would accumulate partial
//     rows and the chart would have to guess which is the real total.
//   • A malformed row drops ITSELF. A negative or non-numeric count that made it
//     into the series would distort the axis for every other day.

import { projectDailySteps } from "@/lib/gc-fitness/daily-steps";

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe("projectDailySteps", () => {
  it("reads the count and returns oldest-first", () => {
    const rows = projectDailySteps([
      doc("2026-08-05", { civilDate: "2026-08-05", steps: 8123 }),
      doc("2026-08-03", { civilDate: "2026-08-03", steps: 4200 }),
    ]);

    expect(rows).toEqual([
      { date: "2026-08-03", steps: 4200 },
      { date: "2026-08-05", steps: 8123 },
    ]);
  });

  it("falls back to the doc id when the field is missing", () => {
    // The id IS the date by contract, so a writer that forgets to duplicate it
    // into a field still produces a readable row.
    const rows = projectDailySteps([doc("2026-08-05", { steps: 7000 })]);

    expect(rows).toEqual([{ date: "2026-08-05", steps: 7000 }]);
  });

  it("drops a row whose date is not a civil date", () => {
    const rows = projectDailySteps([
      doc("latest", { steps: 9000 }),
      doc("2026-08-05", { civilDate: "2026-08-05", steps: 7000 }),
    ]);

    expect(rows).toEqual([{ date: "2026-08-05", steps: 7000 }]);
  });

  it("drops a negative or unparseable count instead of charting it", () => {
    const rows = projectDailySteps([
      doc("2026-08-01", { civilDate: "2026-08-01", steps: -5 }),
      doc("2026-08-02", { civilDate: "2026-08-02", steps: "muchos" }),
      doc("2026-08-03", { civilDate: "2026-08-03", steps: 6000 }),
    ]);

    expect(rows).toEqual([{ date: "2026-08-03", steps: 6000 }]);
  });

  it("accepts a numeric string, since Firestore fields are writer-typed", () => {
    const rows = projectDailySteps([
      doc("2026-08-03", { civilDate: "2026-08-03", steps: "6000" }),
    ]);

    expect(rows).toEqual([{ date: "2026-08-03", steps: 6000 }]);
  });

  it("keeps the LARGER count when two docs claim the same day", () => {
    // Only possible from a writer whose doc id and `civilDate` disagree. The
    // partial-day sync is the one that undercounts, so the larger is the day's
    // real total.
    const rows = projectDailySteps([
      doc("2026-08-03", { civilDate: "2026-08-03", steps: 2000 }),
      doc("partial", { civilDate: "2026-08-03", steps: 9500 }),
    ]);

    expect(rows).toEqual([{ date: "2026-08-03", steps: 9500 }]);
  });

  it("rounds a fractional count", () => {
    const rows = projectDailySteps([
      doc("2026-08-03", { civilDate: "2026-08-03", steps: 6000.4 }),
    ]);

    expect(rows[0].steps).toBe(6000);
  });

  it("returns nothing for a client whose app never synced", () => {
    // Today's expected state everywhere. The widget turns this into an explicit
    // "the app doesn't report steps yet", NOT a flat zero line.
    expect(projectDailySteps([])).toEqual([]);
  });
});

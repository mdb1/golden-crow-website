// __tests__/habit-compliance.test.ts
// Pure-function tests for habit-compliance.ts (Plan 06-08 Task 1).
//
// SCOPE: only the pure-function math. The Server Action wrapper
// (habit-compliance-actions.ts) is exercised separately via integration —
// the auth + Admin SDK ownership guards mirror habit-actions.ts (P06-05)
// verbatim and are already locked by that plan's 14 action tests.
//
// CROSS-SURFACE PARITY (T08):
//   The T08 fixture is the load-bearing case. It is a hand-crafted 5-log
//   set against a 7-day window where the expected ratio (4/7 ≈ 0.5714…) was
//   computed BY HAND from the rules in .planning/schemas/habit-logs.md +
//   the Swift HabitStreakCalculator.complianceRatio semantics. The same
//   fixture should be re-run against the Swift implementation when an iOS
//   test target eventually lands (Active Policies forbid iOS tests in v1).
//
//   Documented expectation:
//     - Window: 7 days ending 2026-05-19 (so 2026-05-13 .. 2026-05-19).
//     - Logs (binary habit):
//         2026-05-19  value=true              → completed
//         2026-05-18  value=true              → completed
//         2026-05-17  value=true, deleted=true → NOT completed (soft-delete excluded)
//         2026-05-16  value=true              → completed
//         2026-05-15  value=false             → NOT completed (binary requires true)
//         2026-05-14  (no log)                → NOT completed (gap)
//         2026-05-13  value=true              → completed
//     - Distinct completed civil-days in window: {2026-05-19, 2026-05-18,
//       2026-05-16, 2026-05-13} = 4 days.
//     - Ratio: 4 / 7 ≈ 0.5714285714285714
//
// THREAT REGISTER LOCKING (PLAN 06-08):
//   T-06-08-02 (soft-delete) — T04 + T08 (soft-deleted log excluded).
//   T-06-08-04 (cross-surface algorithm drift) — T08 fixture parity lock.
//
// Habits are BINARY-ONLY now: a log counts iff `!deleted && value === true`.

import {
  coerceLegacyHabitLogValue,
  computeCompliance,
  logCountsAsCompleted,
  type HabitLogRow,
} from "../habit-compliance";

function binaryLog(opts: {
  date: string;
  value: boolean;
  deleted?: boolean;
}): HabitLogRow {
  return {
    habitId: "hab-test",
    clientId: "client-test",
    civilDate: opts.date,
    value: opts.value,
    deleted: opts.deleted,
  };
}

describe("habit-compliance — logCountsAsCompleted", () => {
  it("binary: returns true iff value === true and not deleted", () => {
    expect(
      logCountsAsCompleted(binaryLog({ date: "2026-05-19", value: true })),
    ).toBe(true);

    expect(
      logCountsAsCompleted(binaryLog({ date: "2026-05-19", value: false })),
    ).toBe(false);

    // Soft-delete always overrides even when value === true.
    expect(
      logCountsAsCompleted(
        binaryLog({ date: "2026-05-19", value: true, deleted: true }),
      ),
    ).toBe(false);
  });
});

describe("habit-compliance — coerceLegacyHabitLogValue", () => {
  // TS twin of the Swift HabitLogValue.init(from:) collapse and the Android
  // fromWire fix (gc-fitness #173 round 2). Fixtures IDENTICAL to the Swift
  // and Kotlin parity tests — a strict `=== true` coercion under-counted
  // legacy numeric/string completed days (the 34% vs 36% mismatch).
  it("passes booleans through", () => {
    expect(coerceLegacyHabitLogValue(true)).toBe(true);
    expect(coerceLegacyHabitLogValue(false)).toBe(false);
  });

  it("collapses legacy numbers: non-zero counts, zero does not", () => {
    expect(coerceLegacyHabitLogValue(1.0)).toBe(true);
    expect(coerceLegacyHabitLogValue(3)).toBe(true);
    expect(coerceLegacyHabitLogValue(0)).toBe(false);
  });

  it("collapses legacy strings: non-empty counts, empty does not", () => {
    expect(coerceLegacyHabitLogValue("done")).toBe(true);
    expect(coerceLegacyHabitLogValue("")).toBe(false);
  });

  it("null/undefined/unknown shapes never count", () => {
    expect(coerceLegacyHabitLogValue(null)).toBe(false);
    expect(coerceLegacyHabitLogValue(undefined)).toBe(false);
    expect(coerceLegacyHabitLogValue({ legacy: true })).toBe(false);
  });

  it("repro: a legacy 1.0-valued completed day counts toward compliance (36% not 34%)", () => {
    // The wire-boundary mapping must collapse BEFORE logCountsAsCompleted.
    const legacyWire: unknown = 1.0;
    const log = binaryLog({
      date: "2026-05-19",
      value: coerceLegacyHabitLogValue(legacyWire),
    });
    expect(logCountsAsCompleted(log)).toBe(true);
  });
});

describe("habit-compliance — computeCompliance", () => {
  // T01 — empty logs
  it("T01: empty logs → ratio 0 + dailyCounts of length windowDays all false", () => {
    const result = computeCompliance(
      "binary",
      [],
      7,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBe(0);
    expect(result.dailyCounts).toHaveLength(7);
    expect(result.dailyCounts.every((d) => !d.completed)).toBe(true);
  });

  // T02 — 7 consecutive completed days
  it("T02: 7 consecutive completed binary logs ending today → ratio 1.0", () => {
    const logs: HabitLogRow[] = [
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
    ].map((date) => binaryLog({ date, value: true }));

    const result = computeCompliance(
      "binary",
      logs,
      7,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBe(1.0);
    expect(result.dailyCounts).toHaveLength(7);
    expect(result.dailyCounts.every((d) => d.completed)).toBe(true);
    // Sparkline ascending: oldest entry first.
    expect(result.dailyCounts[0].date).toBe("2026-05-13");
    expect(result.dailyCounts[6].date).toBe("2026-05-19");
  });

  // T03 — partial: 3 of 7 days completed
  it("T03: 3 of 7 days completed → ratio 3/7", () => {
    const logs: HabitLogRow[] = [
      binaryLog({ date: "2026-05-19", value: true }),
      binaryLog({ date: "2026-05-17", value: true }),
      binaryLog({ date: "2026-05-15", value: true }),
    ];
    const result = computeCompliance(
      "binary",
      logs,
      7,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBeCloseTo(3 / 7, 10);
    const completedDates = result.dailyCounts
      .filter((d) => d.completed)
      .map((d) => d.date);
    expect(completedDates).toEqual(["2026-05-15", "2026-05-17", "2026-05-19"]);
  });

  // T04 — soft-deleted log excluded
  it("T04: soft-deleted log does NOT count (T-06-08-02)", () => {
    const logs: HabitLogRow[] = [
      binaryLog({ date: "2026-05-19", value: true }),
      binaryLog({ date: "2026-05-18", value: true, deleted: true }),
      binaryLog({ date: "2026-05-17", value: true }),
    ];
    const result = computeCompliance(
      "binary",
      logs,
      7,
      "2026-05-19",
      "UTC",
      undefined,
    );
    // 2 completed (19 + 17), 2026-05-18 excluded by soft-delete
    expect(result.ratio).toBeCloseTo(2 / 7, 10);
  });

  // T08 — CROSS-SURFACE PARITY FIXTURE (T-06-08-04 — load-bearing)
  //
  // This is the algorithm-layer lock between iOS HabitStreakCalculator.swift
  // and the TS computeCompliance. When iOS tests eventually land (Active
  // Policies currently forbid them in v1), the same fixture should be run
  // through HabitStreakCalculator.complianceRatio and produce IDENTICAL
  // ratio: 4 / 7 ≈ 0.5714285714285714.
  //
  // Window: 7 days ending 2026-05-19 (so 2026-05-13 .. 2026-05-19).
  // Habit type: binary.
  // Logs:
  //   2026-05-19 value=true                       → completed
  //   2026-05-18 value=true                       → completed
  //   2026-05-17 value=true, deleted=true         → NOT completed (soft-delete)
  //   2026-05-16 value=true                       → completed
  //   2026-05-15 value=false                      → NOT completed (binary req. true)
  //   2026-05-14 (no log)                         → NOT completed (gap)
  //   2026-05-13 value=true                       → completed
  // Distinct completed days: 4 → ratio = 4 / 7.
  it("T08: cross-surface parity fixture (T-06-08-04) — 4/7", () => {
    const logs: HabitLogRow[] = [
      binaryLog({ date: "2026-05-19", value: true }),
      binaryLog({ date: "2026-05-18", value: true }),
      binaryLog({ date: "2026-05-17", value: true, deleted: true }),
      binaryLog({ date: "2026-05-16", value: true }),
      binaryLog({ date: "2026-05-15", value: false }),
      // 2026-05-14 intentionally missing — gap day
      binaryLog({ date: "2026-05-13", value: true }),
    ];
    const result = computeCompliance(
      "binary",
      logs,
      7,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBeCloseTo(4 / 7, 10);
    expect(result.ratio).toBeCloseTo(0.5714285714285714, 10);
    // Verify the per-day breakdown explicitly — sparkline rendering relies
    // on the exact ascending ordering + completed flags.
    expect(result.dailyCounts).toEqual([
      { date: "2026-05-13", completed: true },
      { date: "2026-05-14", completed: false },
      { date: "2026-05-15", completed: false },
      { date: "2026-05-16", completed: true },
      { date: "2026-05-17", completed: false },
      { date: "2026-05-18", completed: true },
      { date: "2026-05-19", completed: true },
    ]);
  });

  // T09 — windowDays guard
  it("T09: windowDays <= 0 → ratio 0 + empty dailyCounts", () => {
    const result = computeCompliance(
      "binary",
      [binaryLog({ date: "2026-05-19", value: true })],
      0,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBe(0);
    expect(result.dailyCounts).toHaveLength(0);

    const negative = computeCompliance(
      "binary",
      [binaryLog({ date: "2026-05-19", value: true })],
      -5,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(negative.ratio).toBe(0);
    expect(negative.dailyCounts).toHaveLength(0);
  });

  // T10 — multiple logs same day = at-least-one rule
  it("T10: multiple logs on the same civil day count once", () => {
    const logs: HabitLogRow[] = [
      binaryLog({ date: "2026-05-19", value: true }),
      binaryLog({ date: "2026-05-19", value: true }),
      binaryLog({ date: "2026-05-19", value: true }),
    ];
    const result = computeCompliance(
      "binary",
      logs,
      7,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBeCloseTo(1 / 7, 10);
  });

  // T11 — 30-day window happy path (sanity check on the production window size)
  it("T11: 30-day window with 10 completed days → ratio 10/30", () => {
    const logs: HabitLogRow[] = [];
    // Mark every 3rd day in the trailing 30 (10 hits): 2026-05-19, -16, -13, ..., -04-22 (10 entries)
    const startEpoch = Date.UTC(2026, 4, 19, 12, 0, 0); // 2026-05-19 noon UTC
    for (let i = 0; i < 30; i += 3) {
      const d = new Date(startEpoch);
      d.setUTCDate(d.getUTCDate() - i);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      logs.push(binaryLog({ date: `${y}-${m}-${day}`, value: true }));
    }
    expect(logs).toHaveLength(10);
    const result = computeCompliance(
      "binary",
      logs,
      30,
      "2026-05-19",
      "UTC",
      undefined,
    );
    expect(result.ratio).toBeCloseTo(10 / 30, 10);
    expect(result.dailyCounts).toHaveLength(30);
  });
});

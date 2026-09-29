// Unit tests for the live-workout finalize math (twin of iOS finalize totals).

import {
  computeDurationSeconds,
  computeTotalVolumeKg,
  countWorkingSets,
  isBodyweightEquipment,
  stampingBodyweight,
} from "../live-workout-volume";
import type { SessionSetLog } from "../live-workout-types";

function set(overrides: Partial<SessionSetLog>): SessionSetLog {
  return {
    id: "s",
    exerciseId: "ex",
    setIndex: 0,
    weightKg: 0,
    reps: 0,
    completedAt: "2026-06-03T10:00:00.000Z",
    isWarmup: false,
    clientLoggedAt: "2026-06-03T10:00:00.000Z",
    durationSeconds: null,
    ...overrides,
  };
}

describe("computeTotalVolumeKg", () => {
  it("sums weight × reps for working reps-based sets", () => {
    const sets = [
      set({ weightKg: 100, reps: 8 }),
      set({ weightKg: 100, reps: 7 }),
    ];
    expect(computeTotalVolumeKg(sets)).toBe(1500);
  });

  // #565 — REVERSES the #403 rule. Warm-ups used to contribute 0; every set
  // type now counts identically, so `setType` is a display marker only.
  it("#565 — includes warmup sets like any other set", () => {
    const sets = [
      set({ weightKg: 60, reps: 10, isWarmup: true }),
      set({ weightKg: 100, reps: 5 }),
    ];
    expect(computeTotalVolumeKg(sets)).toBe(600 + 500);
  });

  it("uses weight × minutes for time-based sets", () => {
    // 20 kg loaded plank for 90s => 20 * 1.5 = 30
    expect(computeTotalVolumeKg([set({ weightKg: 20, durationSeconds: 90 })])).toBe(
      30,
    );
  });

  it("a bodyweight (0 kg) time set contributes 0", () => {
    expect(
      computeTotalVolumeKg([set({ weightKg: 0, durationSeconds: 120 })]),
    ).toBe(0);
  });

  it("returns 0 for an empty session", () => {
    expect(computeTotalVolumeKg([])).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    // 10 kg for 100s => 10 * (100/60) = 16.666... -> 16.67
    expect(
      computeTotalVolumeKg([set({ weightKg: 10, durationSeconds: 100 })]),
    ).toBe(16.67);
  });
});

describe("computeDurationSeconds", () => {
  it("returns whole seconds between start and end", () => {
    const start = "2026-06-03T10:00:00.000Z";
    const end = Date.parse("2026-06-03T10:45:30.000Z");
    expect(computeDurationSeconds(start, end)).toBe(45 * 60 + 30);
  });

  it("returns 0 when start is null", () => {
    expect(computeDurationSeconds(null, Date.now())).toBe(0);
  });

  it("clamps a backwards clock to 0", () => {
    const start = "2026-06-03T10:00:00.000Z";
    const end = Date.parse("2026-06-03T09:00:00.000Z");
    expect(computeDurationSeconds(start, end)).toBe(0);
  });
});

describe("countWorkingSets", () => {
  it("#565 — counts every logged set, warmups included", () => {
    expect(
      countWorkingSets([
        set({ isWarmup: true }),
        set({}),
        set({}),
      ]),
    ).toBe(3);
  });
});

// #565 — twin vectors shared with iOS WorkoutVolumeTests + Android
// WorkoutVolumeTest: EVERY set type contributes. These vectors read 450 / 200
// / 2 while #403 excluded warm-ups.
describe("set-type aware volume (#565 — all types count)", () => {
  it("warmup + failure + dropset all included ⇒ 650.0 exactly", () => {
    const sets = [
      set({ weightKg: 20, reps: 10, setType: "warmup", isWarmup: true }), // 200
      set({ weightKg: 20, reps: 10 }), // 200
      set({ weightKg: 30, reps: 5, setType: "failure" }), // 150
      set({ weightKg: 10, reps: 10, setType: "dropset" }), // 100
    ];
    expect(computeTotalVolumeKg(sets)).toBe(650);
  });

  it("a set_type-only warmup (isWarmup false) counts too", () => {
    const sets = [
      set({ weightKg: 20, reps: 10, setType: "warmup", isWarmup: false }),
      set({ weightKg: 20, reps: 10 }),
    ];
    expect(computeTotalVolumeKg(sets)).toBe(400);
    expect(countWorkingSets(sets)).toBe(2);
  });

  it("every set type counts toward the set tally", () => {
    expect(
      countWorkingSets([
        set({ setType: "failure" }),
        set({ setType: "dropset" }),
        set({ setType: "warmup", isWarmup: true }),
      ]),
    ).toBe(3);
  });
});

// #1197 — twin of the iOS / Android `WorkoutVolume` body-weight cases.
describe("body weight in volume (#1197)", () => {
  it("a stamped bodyweight set loads weight + body weight", () => {
    expect(computeTotalVolumeKg([set({ reps: 10, bodyweightKg: 80 })])).toBe(800);
    expect(
      computeTotalVolumeKg([set({ weightKg: 10, reps: 5, bodyweightKg: 80 })]),
    ).toBe(450);
    expect(
      computeTotalVolumeKg([set({ durationSeconds: 90, bodyweightKg: 80 })]),
    ).toBe(120);
    expect(computeTotalVolumeKg([set({ reps: 10 })])).toBe(0);
  });

  it("stamps only bodyweight exercises, only with a known weight, never re-stamps", () => {
    const sets = [
      set({ exerciseId: "pullup", reps: 10 }),
      set({ exerciseId: "bench", weightKg: 60, reps: 8 }),
      set({ exerciseId: "dip", reps: 12, bodyweightKg: 70 }),
    ];
    const stamped = stampingBodyweight(sets, 80, new Set(["pullup", "dip"]));
    expect(stamped.map((s) => s.bodyweightKg ?? null)).toEqual([80, null, 70]);
    expect(computeTotalVolumeKg(stamped)).toBe(800 + 480 + 840);
    expect(stampingBodyweight(sets, null, new Set(["pullup"]))).toBe(sets);
    expect(stampingBodyweight(sets, 0, new Set(["pullup"]))).toBe(sets);
  });

  it("recognises bodyweight equipment like Exercise.isBodyweight", () => {
    expect(isBodyweightEquipment(["bodyweight"])).toBe(true);
    expect(isBodyweightEquipment([" None "])).toBe(true);
    expect(isBodyweightEquipment(["barbell"])).toBe(false);
    expect(isBodyweightEquipment(undefined)).toBe(false);
  });
});

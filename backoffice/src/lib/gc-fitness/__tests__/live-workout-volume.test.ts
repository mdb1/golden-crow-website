// Unit tests for the live-workout finalize math (twin of iOS finalize totals).

import {
  computeDurationSeconds,
  computeTotalVolumeKg,
  countWorkingSets,
  defaultBodyweightFactor,
  isBodyweight,
  isBodyweightEquipment,
  resolveBodyweightLoadFactor,
  setLoadKg,
  stampingBodyweight,
  wireSetLoadKg,
  wireSetVolumeKg,
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

  it("recognises bodyweight equipment like Exercise.isBodyweight", () => {
    expect(isBodyweightEquipment(["bodyweight"])).toBe(true);
    expect(isBodyweightEquipment([" None "])).toBe(true);
    expect(isBodyweightEquipment(["barbell"])).toBe(false);
    expect(isBodyweightEquipment(undefined)).toBe(false);
  });
});

// #1307 — per-exercise FRACTION of body weight. Canonical twin vectors shared
// with iOS / Android `WorkoutVolume` and functions' `countedSets`.
describe("body-weight fraction (#1307)", () => {
  it("(weight 0, bw 80, factor 0.65, reps 10) → 520", () => {
    expect(
      computeTotalVolumeKg([
        set({ reps: 10, bodyweightKg: 80, bodyweightFactor: 0.65 }),
      ]),
    ).toBe(520);
  });

  it("legacy (bw 80, no factor, reps 10) → 800 (factor 1.0)", () => {
    expect(computeTotalVolumeKg([set({ reps: 10, bodyweightKg: 80 })])).toBe(800);
    expect(setLoadKg({ weightKg: 0, bodyweightKg: 80 })).toBe(80);
  });

  it("(weight 10, bw 80, factor 0.95, reps 5) → 430", () => {
    expect(
      computeTotalVolumeKg([
        set({ weightKg: 10, reps: 5, bodyweightKg: 80, bodyweightFactor: 0.95 }),
      ]),
    ).toBe(430);
  });

  it("a factor without a body weight is inert", () => {
    expect(
      setLoadKg({ weightKg: 20, bodyweightKg: null, bodyweightFactor: 0.65 }),
    ).toBe(20);
  });

  it("time set: factor × bw × minutes", () => {
    // 0.65 × 80 = 52 kg for 90 s → 78
    expect(
      computeTotalVolumeKg([
        set({ durationSeconds: 90, bodyweightKg: 80, bodyweightFactor: 0.65 }),
      ]),
    ).toBe(78);
  });

  it("equipment none, primary chest, no field → 0.65", () => {
    expect(
      resolveBodyweightLoadFactor({ equipment: ["none"], primaryMuscleGroup: "chest" }),
    ).toBe(0.65);
  });

  it("equipment barbell → 0 (not bodyweight)", () => {
    const ex = { equipment: ["barbell"], primaryMuscleGroup: "chest" };
    expect(resolveBodyweightLoadFactor(ex)).toBe(0);
    expect(isBodyweight(ex)).toBe(false);
  });

  it("an explicit factor wins over equipment (pull-up bar counts)", () => {
    const pullUp = {
      equipment: ["pull_up_bar"],
      primaryMuscleGroup: "back",
      bodyweightLoadFactor: 0.95,
    };
    expect(resolveBodyweightLoadFactor(pullUp)).toBe(0.95);
    expect(isBodyweight(pullUp)).toBe(true);
  });

  it("explicit factor 0 → doesn't count, even on bodyweight equipment", () => {
    const plank = {
      equipment: ["bodyweight"],
      primaryMuscleGroup: "abs",
      bodyweightLoadFactor: 0,
    };
    expect(resolveBodyweightLoadFactor(plank)).toBe(0);
    expect(isBodyweight(plank)).toBe(false);
  });

  it("muscle defaults use the raw vocabulary values; unknown/missing → 0.65", () => {
    expect(defaultBodyweightFactor("chest")).toBe(0.65);
    expect(defaultBodyweightFactor("back")).toBe(0.8);
    expect(defaultBodyweightFactor("shoulders")).toBe(0.65);
    expect(defaultBodyweightFactor("triceps")).toBe(0.7);
    expect(defaultBodyweightFactor("biceps")).toBe(0.8);
    expect(defaultBodyweightFactor("quadriceps")).toBe(0.9);
    expect(defaultBodyweightFactor("glutes")).toBe(0.6);
    expect(defaultBodyweightFactor("hamstrings")).toBe(0.45);
    expect(defaultBodyweightFactor("calves")).toBe(0.95);
    expect(defaultBodyweightFactor("abs")).toBe(0.35);
    expect(defaultBodyweightFactor("full_body")).toBe(0.65);
    expect(defaultBodyweightFactor("core")).toBe(0.65);
    expect(defaultBodyweightFactor(undefined)).toBe(0.65);
    expect(resolveBodyweightLoadFactor({ equipment: ["bodyweight"] })).toBe(0.65);
  });

  it("an out-of-range / off-grid explicit factor is clamped and snapped", () => {
    expect(resolveBodyweightLoadFactor({ bodyweightLoadFactor: 1.4 })).toBe(1);
    expect(resolveBodyweightLoadFactor({ bodyweightLoadFactor: 0.67 })).toBe(0.65);
  });

  it("stamps bw + factor only on factor>0 exercises, with a known weight, never re-stamps", () => {
    const sets = [
      set({ exerciseId: "pushup", reps: 10 }),
      set({ exerciseId: "bench", weightKg: 60, reps: 8 }),
      set({ exerciseId: "dip", reps: 12, bodyweightKg: 70 }),
      set({ exerciseId: "plank", durationSeconds: 60 }),
    ];
    const factors = new Map([
      ["pushup", 0.65],
      ["dip", 0.95],
      ["plank", 0],
    ]);
    const stamped = stampingBodyweight(sets, 80, factors);
    expect(stamped.map((s) => s.bodyweightKg ?? null)).toEqual([80, null, 70, null]);
    expect(stamped.map((s) => s.bodyweightFactor ?? null)).toEqual([
      0.65,
      null,
      null,
      null,
    ]);
    // 520 + 480 + legacy dip 70×12 = 840
    expect(computeTotalVolumeKg(stamped)).toBe(520 + 480 + 840);
    expect(stampingBodyweight(sets, null, factors)).toBe(sets);
    expect(stampingBodyweight(sets, 0, factors)).toBe(sets);
    expect(stampingBodyweight(sets, 80, new Map())).toBe(sets);
  });

  it("wire readers decode snake_case sets through the same formula", () => {
    expect(
      wireSetLoadKg({ weight_kg: 0, bodyweight_kg: 80, bodyweight_factor: 0.65 }),
    ).toBe(52);
    expect(wireSetLoadKg({ weight_kg: 0, bodyweight_kg: 80 })).toBe(80);
    expect(wireSetLoadKg({ weight: 20 })).toBe(20);
    expect(
      wireSetVolumeKg({
        weight_kg: 10,
        reps: 5,
        bodyweight_kg: 80,
        bodyweight_factor: 0.95,
      }),
    ).toBe(430);
    expect(
      wireSetVolumeKg({ weight_kg: 20, reps: 10, duration_seconds: 90 }),
    ).toBe(30);
  });
});

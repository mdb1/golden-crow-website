// Unit tests for the live-workout finalize math (twin of iOS finalize totals).

import {
  computeDurationSeconds,
  computeTotalVolumeKg,
  countWorkingSets,
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

  it("excludes warmup sets", () => {
    const sets = [
      set({ weightKg: 60, reps: 10, isWarmup: true }),
      set({ weightKg: 100, reps: 5 }),
    ];
    expect(computeTotalVolumeKg(sets)).toBe(500);
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

  // 26-vol (#243) — bodyweight-aware volume.
  describe("bodyweight-aware (#243)", () => {
    it("adds bodyWeight × factor × reps for a bodyweight movement", () => {
      // Pull-up: 80 kg bodyweight × 1.0 × 10 reps = 800.
      const sets = [set({ exerciseId: "pullup", weightKg: 0, reps: 10 })];
      expect(computeTotalVolumeKg(sets, 80, { pullup: 1.0 })).toBe(800);
    });

    it("adds the added weight on top of bodyweight load (weighted pull-up)", () => {
      // (80 × 1.0 + 20) × 5 = 500.
      const sets = [set({ exerciseId: "pullup", weightKg: 20, reps: 5 })];
      expect(computeTotalVolumeKg(sets, 80, { pullup: 1.0 })).toBe(500);
    });

    it("uses the per-movement fraction (push-up ~0.64)", () => {
      // 70 × 0.64 × 10 = 448.
      const sets = [set({ exerciseId: "pushup", weightKg: 0, reps: 10 })];
      expect(computeTotalVolumeKg(sets, 70, { pushup: 0.64 })).toBe(448);
    });

    it("counts a bodyweight time hold (plank) via load·minutes", () => {
      // 70 × 0.6 × (120/60) = 84.
      const sets = [
        set({ exerciseId: "plank", weightKg: 0, durationSeconds: 120 }),
      ];
      expect(computeTotalVolumeKg(sets, 70, { plank: 0.6 })).toBe(84);
    });

    it("degrades to load-only when bodyWeight is 0 (no logged weight)", () => {
      const sets = [set({ exerciseId: "pullup", weightKg: 0, reps: 10 })];
      expect(computeTotalVolumeKg(sets, 0, { pullup: 1.0 })).toBe(0);
    });

    it("ignores bodyweight for a free-weight exercise with no factor", () => {
      // Barbell row at 60 kg × 8, no factor entry → 480 (bodyweight irrelevant).
      const sets = [set({ exerciseId: "row", weightKg: 60, reps: 8 })];
      expect(computeTotalVolumeKg(sets, 80, {})).toBe(480);
    });
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
  it("counts only non-warmup sets", () => {
    expect(
      countWorkingSets([
        set({ isWarmup: true }),
        set({}),
        set({}),
      ]),
    ).toBe(2);
  });
});

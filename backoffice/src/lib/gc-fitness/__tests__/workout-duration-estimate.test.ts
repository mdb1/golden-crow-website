// workout-duration-estimate.test.ts
//
// Locks the backoffice estimator twin against the iOS Swift source of truth
// (WorkoutDurationEstimate.swift). Mirrors the same fixtures + expected values
// as WorkoutDurationEstimateTests.swift — including the shared COLO
// HIPERTROFIADO parity vector (2841s / 48 min). If this file and the Swift
// suite ever disagree, the estimators have drifted (algorithm-twin break).

import {
  DurationEstimateExercise,
  ESTIMATED_SETUP_SECONDS_PER_SET,
  estimateTemplateDurationMinutes,
  estimateTemplateDurationMinutesFromRaw,
  estimateTemplateDurationSeconds,
  exerciseEstimatedDurationSeconds,
  isTimeBasedForEstimate,
} from "@/lib/gc-fitness/workout-duration-estimate";

function ex(partial: Partial<DurationEstimateExercise>): DurationEstimateExercise {
  return { exerciseId: "ex-1", sets: 0, reps: 0, rest_seconds: 0, order: 0, ...partial };
}

describe("workout duration estimate (TS twin of WorkoutDurationEstimate.swift)", () => {
  it("constant matches the calibrated 45s/set overhead", () => {
    expect(ESTIMATED_SETUP_SECONDS_PER_SET).toBe(45);
  });

  // --- per-exercise (work + rest + 45s/set) ---

  it("pure reps = Σ (reps×3 + rest + 45 setup) per set", () => {
    // 4 × (10×3 + 60 + 45) = 540
    const e = ex({ sets: 4, reps: 10, rest_seconds: 60 });
    expect(isTimeBasedForEstimate(e)).toBe(false);
    expect(exerciseEstimatedDurationSeconds(e)).toBe(540);
  });

  it("repsBySet override summed per set", () => {
    // (30+45)+(24+45)+(18+45) = 207
    expect(
      exerciseEstimatedDurationSeconds(
        ex({ sets: 3, reps: 10, rest_seconds: 0, repsBySet: [10, 8, 6] }),
      ),
    ).toBe(207);
  });

  it("time via durationSeconds counts the hold", () => {
    // 3 × (60 + 30 + 45) = 405
    const e = ex({ sets: 3, reps: 0, rest_seconds: 30, durationSeconds: 60 });
    expect(isTimeBasedForEstimate(e)).toBe(true);
    expect(exerciseEstimatedDurationSeconds(e)).toBe(405);
  });

  it("time via durationBySetSeconds sums each hold", () => {
    // (60+20+45)+(45+20+45)+(30+20+45) = 330
    expect(
      exerciseEstimatedDurationSeconds(
        ex({ sets: 3, rest_seconds: 20, durationBySetSeconds: [60, 45, 30] }),
      ),
    ).toBe(330);
  });

  it("durationBySetSeconds shorter than sets falls back to durationSeconds", () => {
    // (60+45)+(45+45)+(45+45) = 285
    expect(
      exerciseEstimatedDurationSeconds(
        ex({ sets: 3, rest_seconds: 0, durationBySetSeconds: [60], durationSeconds: 45 }),
      ),
    ).toBe(285);
  });

  it("metric=time with no duration falls back to reps×3 (never zero)", () => {
    // 2 × (5×3 + 10 + 45) = 140
    const e = ex({ sets: 2, reps: 5, rest_seconds: 10, metric: "time" });
    expect(isTimeBasedForEstimate(e)).toBe(true);
    expect(exerciseEstimatedDurationSeconds(e)).toBe(140);
  });

  it("zero sets contributes zero", () => {
    expect(exerciseEstimatedDurationSeconds(ex({ sets: 0, reps: 10, rest_seconds: 60 }))).toBe(0);
  });

  // --- template-level sum + transitions + minutes ---

  it("template sums exercises incl. time work", () => {
    const reps = ex({ exerciseId: "reps", sets: 4, reps: 10, rest_seconds: 60, order: 1 }); // 540
    const time = ex({ exerciseId: "plank", sets: 3, rest_seconds: 30, durationSeconds: 60, order: 2 }); // 405
    expect(estimateTemplateDurationSeconds([reps, time])).toBe(945);
    expect(estimateTemplateDurationMinutes([reps, time])).toBe(16);
  });

  it("template uses explicit transition rest after an exercise final set", () => {
    const first = ex({
      exerciseId: "bench",
      sets: 2,
      reps: 10,
      rest_seconds: 30,
      transition_rest_seconds: 120,
      order: 1,
    });
    const second = ex({ exerciseId: "row", sets: 1, reps: 10, rest_seconds: 45, order: 2 });
    // bench 210 + row 120, boundary swaps 30→120 (+90) = 420
    expect(estimateTemplateDurationSeconds([first, second])).toBe(420);
  });

  it("template uses default 60s transition rest when omitted", () => {
    const first = ex({ exerciseId: "bench", sets: 1, reps: 10, rest_seconds: 30, order: 1 });
    const second = ex({ exerciseId: "row", sets: 1, reps: 10, rest_seconds: 45, order: 2 });
    // bench 105 + row 120, boundary swaps 30→60 (+30) = 255
    expect(estimateTemplateDurationSeconds([first, second])).toBe(255);
  });

  it("minutes floor at 1 for a tiny prescription", () => {
    // 1×3 + 0 + 45 = 48s → ceil(48/60) = 1
    expect(estimateTemplateDurationMinutes([ex({ sets: 1, reps: 1, rest_seconds: 0 })])).toBe(1);
  });

  it("empty template estimates 0 minutes", () => {
    expect(estimateTemplateDurationMinutes([])).toBe(0);
  });

  // --- CROSS-REPO PARITY VECTOR (must match WorkoutDurationEstimateTests.swift) ---

  it("COLO HIPERTROFIADO parity vector = 2841s / 48 min", () => {
    const exercises: DurationEstimateExercise[] = [
      ex({ exerciseId: "e1", sets: 4, reps: 10, rest_seconds: 120, order: 1 }),
      ex({ exerciseId: "e2", sets: 3, reps: 12, rest_seconds: 90, order: 2 }),
      ex({ exerciseId: "e3", sets: 3, reps: 12, rest_seconds: 60, order: 3 }),
      ex({ exerciseId: "e4", sets: 3, reps: 8, rest_seconds: 60, order: 4 }),
      ex({ exerciseId: "e5", sets: 3, reps: 10, rest_seconds: 60, order: 5 }),
      ex({ exerciseId: "e6", sets: 3, reps: 12, rest_seconds: 60, order: 6 }),
    ];
    expect(estimateTemplateDurationSeconds(exercises)).toBe(2841);
    expect(estimateTemplateDurationMinutes(exercises)).toBe(48);
  });

  it("estimateFromRaw coerces a raw Firestore exercises array to the same minutes", () => {
    const raw = [
      { exerciseId: "e1", sets: 4, reps: 10, rest_seconds: 120, order: 1 },
      { exerciseId: "e2", sets: 3, reps: 12, rest_seconds: 90, order: 2 },
      { exerciseId: "e3", sets: 3, reps: 12, rest_seconds: 60, order: 3 },
      { exerciseId: "e4", sets: 3, reps: 8, rest_seconds: 60, order: 4 },
      { exerciseId: "e5", sets: 3, reps: 10, rest_seconds: 60, order: 5 },
      { exerciseId: "e6", sets: 3, reps: 12, rest_seconds: 60, order: 6 },
    ];
    expect(estimateTemplateDurationMinutesFromRaw(raw)).toBe(48);
    expect(estimateTemplateDurationMinutesFromRaw(undefined)).toBe(0);
  });
});

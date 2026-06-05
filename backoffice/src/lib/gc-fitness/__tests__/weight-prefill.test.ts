// weight-prefill.test.ts
// Locks the "most recent intent wins" rule that replaced the per-user
// WorkoutPrefillSource setting. Mirrors the Swift twin's test cases
// (WeightPrefillResolverTests.swift) one-for-one.

import {
  coachUpdatedSinceLastLog,
  resolveSetPrefill,
  type ResolveSetPrefillInput,
} from "../weight-prefill";

const t0 = new Date(1_000_000 * 1000); // "old"
const t1 = new Date(2_000_000 * 1000); // "newer"

/** Base input — every test overrides only the fields it cares about. */
function input(overrides: Partial<ResolveSetPrefillInput>): ResolveSetPrefillInput {
  return {
    templateWeightKg: 40,
    templateReps: 10,
    templateDurationSeconds: null,
    exerciseDefaultReps: 8,
    exerciseDefaultDurationSeconds: null,
    previous: null,
    prescriptionUpdatedAt: t0,
    lastLoggedAt: null,
    ...overrides,
  };
}

describe("resolveSetPrefill — the four user scenarios", () => {
  // Scenario 1: first time doing the exercise → routine, no notice.
  it("first time shows the routine", () => {
    const r = resolveSetPrefill(
      input({ templateWeightKg: 40, templateReps: 10, lastLoggedAt: null }),
    );
    expect(r.weightKg).toBe(40);
    expect(r.reps).toBe(10);
    expect(r.origin).toBe("routine");
  });

  // Scenario 2: logged before, coach hasn't changed since → remember user's value.
  it("after logging shows previous", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 40,
        templateReps: 10,
        previous: { weightKg: 50, reps: 12 },
        prescriptionUpdatedAt: t0, // prescription is OLDER than the log
        lastLoggedAt: t1,
      }),
    );
    expect(r.weightKg).toBe(50);
    expect(r.reps).toBe(12);
    expect(r.origin).toBe("previous");
  });

  // Scenario 3: coach changed the plan AFTER the last log → routine once + notice.
  it("coach update overrides previous once", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 45,
        templateReps: 8,
        previous: { weightKg: 50, reps: 12 },
        prescriptionUpdatedAt: t1, // prescription is NEWER than the log
        lastLoggedAt: t0,
      }),
    );
    expect(r.weightKg).toBe(45);
    expect(r.reps).toBe(8);
    expect(r.origin).toBe("routineUpdated");
  });

  // Scenario 4: after the coach update, the user logs again → back to remembering.
  it("after relogging falls back to previous", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 45,
        templateReps: 8,
        previous: { weightKg: 45, reps: 8 },
        prescriptionUpdatedAt: t0,
        lastLoggedAt: t1,
      }),
    );
    expect(r.weightKg).toBe(45);
    expect(r.origin).toBe("previous");
  });
});

describe("resolveSetPrefill — edge cases", () => {
  // Equal timestamps are NOT an update (strict `>`): keep remembering.
  it("equal timestamps keep previous", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 45,
        templateReps: 8,
        previous: { weightKg: 50, reps: 12 },
        prescriptionUpdatedAt: t1,
        lastLoggedAt: t1,
      }),
    );
    expect(r.origin).toBe("previous");
    expect(r.weightKg).toBe(50);
  });

  // Legacy assignment with no prescription timestamp → keep remembering, no nag.
  it("null prescription keeps previous", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 45,
        templateReps: 8,
        previous: { weightKg: 50, reps: 12 },
        prescriptionUpdatedAt: null,
        lastLoggedAt: t1,
      }),
    );
    expect(r.origin).toBe("previous");
  });

  // Coach update but routine has no weight prescribed → cannot override; keep previous.
  it("coach update without template weight keeps previous", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: null,
        templateReps: 8,
        previous: { weightKg: 50, reps: 12 },
        prescriptionUpdatedAt: t1,
        lastLoggedAt: t0,
      }),
    );
    expect(r.origin).toBe("previous");
    expect(r.weightKg).toBe(50);
  });

  // Exercise logged before but not at this (new) set index → routine, no notice.
  it("added set index falls to routine", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 40,
        templateReps: 10,
        previous: null, // no history for this set index
        prescriptionUpdatedAt: t0,
        lastLoggedAt: t1, // but the exercise WAS logged
      }),
    );
    expect(r.origin).toBe("routine");
    expect(r.weightKg).toBe(40);
  });

  // Reps fall back to the exercise-level default when no per-set reps prescribed.
  it("reps fall back to the exercise default", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 40,
        templateReps: null,
        exerciseDefaultReps: 12,
        previous: null,
        prescriptionUpdatedAt: t0,
        lastLoggedAt: null,
      }),
    );
    expect(r.reps).toBe(12);
  });

  // Time-based set carries duration through on the previous branch.
  it("duration carries through on previous", () => {
    const r = resolveSetPrefill(
      input({
        templateWeightKg: 0,
        templateReps: null,
        templateDurationSeconds: 60,
        exerciseDefaultReps: 0,
        exerciseDefaultDurationSeconds: 60,
        previous: { weightKg: 0, reps: 0, durationSeconds: 47 },
        prescriptionUpdatedAt: t0,
        lastLoggedAt: t1,
      }),
    );
    expect(r.origin).toBe("previous");
    expect(r.durationSeconds).toBe(47);
  });

  it("coachUpdatedSinceLastLog helper", () => {
    expect(coachUpdatedSinceLastLog(t1, t0)).toBe(true);
    expect(coachUpdatedSinceLastLog(t0, t1)).toBe(false);
    expect(coachUpdatedSinceLastLog(t1, null)).toBe(false);
    expect(coachUpdatedSinceLastLog(null, t1)).toBe(false);
  });
});

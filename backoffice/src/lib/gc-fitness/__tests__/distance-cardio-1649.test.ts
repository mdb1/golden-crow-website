// gc-fitness #1649 — distance / cardio on the backoffice: the wire contract
// (`distanceBySetMeters` on template exercises, `tracksDistance` on exercises,
// `distance_meters` on logged sets + prs[]) at every pure boundary.

import type { WorkoutTemplateInput } from "../workout-template-schema";
import { exerciseRefSchema } from "../workout-template-schema";
import { exerciseSchema } from "../exercise-schema";
import { buildPersonalRecords, flattenLogPRs, type PRExerciseMeta } from "../personal-records";
import {
  normalizeDistanceBySetMeters,
  normalizeTemplateSubmission,
} from "@/components/gc-fitness/template-form/template-form-model";

const baseRef = {
  exerciseId: "std-rowing",
  sets: 3,
  reps: 10,
  rest_seconds: 60,
  order: 1,
};

describe("exerciseRefSchema.distanceBySetMeters", () => {
  it("is optional (legacy rows parse unchanged)", () => {
    expect(exerciseRefSchema.parse(baseRef).distanceBySetMeters).toBeUndefined();
  });

  it("keeps an EMPTY array — the 'tracked, no targets' signal", () => {
    const parsed = exerciseRefSchema.parse({
      ...baseRef,
      metric: "time",
      durationSeconds: 600,
      distanceBySetMeters: [],
    });
    expect(parsed.distanceBySetMeters).toEqual([]);
  });

  it("accepts meter targets and rejects out-of-range / too many entries", () => {
    expect(
      exerciseRefSchema.parse({ ...baseRef, distanceBySetMeters: [500, 0, 1000] }).distanceBySetMeters,
    ).toEqual([500, 0, 1000]);
    expect(exerciseRefSchema.safeParse({ ...baseRef, distanceBySetMeters: [-1] }).success).toBe(false);
    expect(exerciseRefSchema.safeParse({ ...baseRef, distanceBySetMeters: [1_000_001] }).success).toBe(false);
    expect(
      exerciseRefSchema.safeParse({ ...baseRef, distanceBySetMeters: Array.from({ length: 11 }, () => 1) }).success,
    ).toBe(false);
  });
});

describe("exerciseSchema.tracksDistance", () => {
  const base = {
    name: { en: "Rowing machine", es: "Remo" },
    description: { en: "", es: "" },
    muscleGroups: ["back"],
    equipment: ["machine"],
    source: "trainer",
    ownerId: "coach-1",
    metric: "time",
  };

  it("round-trips true (cardio) and is absent on legacy docs", () => {
    const cardio = exerciseSchema.safeParse({ ...base, tracksDistance: true });
    expect(cardio.success).toBe(true);
    if (cardio.success) {
      expect(cardio.data.metric).toBe("time");
      expect(cardio.data.tracksDistance).toBe(true);
    }
    const legacy = exerciseSchema.safeParse(base);
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data.tracksDistance).toBeUndefined();
  });

  it("does NOT widen the closed metric enum", () => {
    expect(exerciseSchema.safeParse({ ...base, metric: "distance" }).success).toBe(false);
  });
});

describe("normalizeDistanceBySetMeters", () => {
  it.each([
    [undefined, 3, null],
    [null, 3, null],
    [[], 3, []],
    [[0, 0, 0], 3, []],
    [[500, 0, 1000], 3, [500, 0, 1000]],
    [[500, 1000, 0], 3, [500, 1000]],
    [[500, 600, 700, 800], 2, [500, 600]],
    [[499.6, Number.NaN, 2_000_000], 3, [500, 0, 1_000_000]],
  ] as const)("%j (sets %d) ⇒ %j", (raw, sets, expected) => {
    expect(normalizeDistanceBySetMeters(raw, sets)).toEqual(expected);
  });
});

describe("normalizeTemplateSubmission — distance", () => {
  type Exercise = WorkoutTemplateInput["exercises"][number];
  const values = (ex: Partial<Exercise>): WorkoutTemplateInput => ({
    name: { en: "", es: "Cardio" },
    description: { en: "", es: "" },
    tag: "custom",
    tags: [],
    exercises: [{ ...baseRef, transition_rest_seconds: 60, notes: "", ...ex } as Exercise],
  });

  it("keeps `[]` on a cardio row (never coerced to undefined)", () => {
    const [ex] = normalizeTemplateSubmission(
      values({ durationBySetSeconds: [600, 600, 600], distanceBySetMeters: [] }),
    ).exercises;
    expect(ex.distanceBySetMeters).toEqual([]);
  });

  it("truncates targets to the set count", () => {
    const [ex] = normalizeTemplateSubmission(
      values({ sets: 2, durationBySetSeconds: [600, 600], distanceBySetMeters: [2000, 2000, 2000] }),
    ).exercises;
    expect(ex.distanceBySetMeters).toEqual([2000, 2000]);
  });

  it("omits the KEY (not undefined) on a non-cardio row and on an explicit reps row", () => {
    const [plain] = normalizeTemplateSubmission(values({})).exercises;
    expect("distanceBySetMeters" in plain).toBe(false);
    const [reps] = normalizeTemplateSubmission(values({ metric: "reps", distanceBySetMeters: [500] })).exercises;
    expect("distanceBySetMeters" in reps).toBe(false);
  });
});

describe("distance PRs", () => {
  const meta = new Map<string, PRExerciseMeta>([
    ["row", { name: "Rowing", muscleGroups: ["back"], sessionCount: 3 }],
  ]);

  it("flattenLogPRs reads distance_meters (forgiving) and the metric is distance", () => {
    const rows = flattenLogPRs({
      completedAt: new Date(2000),
      prs: [
        { exerciseId: "row", set_log_id: "a", weight_kg: 0, reps: 0, estimated_one_rm: 0, duration_seconds: 600, distance_meters: 2000, achieved_at: new Date(1000) },
        { exerciseId: "row", set_log_id: "b", weight_kg: 0, reps: 0, estimated_one_rm: 0, duration_seconds: 600, distance_meters: 2500, achieved_at: new Date(2000) },
        { exerciseId: "row", set_log_id: "c", weight_kg: 0, reps: 0, estimated_one_rm: 0, duration_seconds: 60, distance_meters: -1, achieved_at: new Date(500) },
      ],
    });
    expect(rows.map((r) => r.distanceMeters)).toEqual([2000, 2500, null]);
    const [entry] = buildPersonalRecords(rows.slice(0, 2), meta);
    expect(entry.metric).toBe("distance");
    expect(entry.current.distanceMeters).toBe(2500);
    expect(entry.previous?.distanceMeters).toBe(2000);
  });
});

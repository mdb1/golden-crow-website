import {
  buildPersonalRecords,
  flattenLogPRs,
  previousRecordsByExercise,
  type PRExerciseMeta,
  type RawPersonalRecord,
} from "../personal-records";

function pr(over: Partial<RawPersonalRecord> & { exerciseId: string; setLogId: string }): RawPersonalRecord {
  return {
    weightKg: 100,
    reps: 5,
    estimatedOneRM: 116.7,
    durationSeconds: null,
    achievedAtMs: 0,
    ...over,
  };
}

const meta = new Map<string, PRExerciseMeta>([
  ["bench", { name: "Bench Press", muscleGroups: ["chest"], sessionCount: 12 }],
  ["squat", { name: "Squat", muscleGroups: ["legs"], sessionCount: 20 }],
  ["plank", { name: "Plank", muscleGroups: ["core"], sessionCount: 4 }],
]);

describe("buildPersonalRecords", () => {
  it("returns current + previous PR per exercise (newest is current)", () => {
    const rows = [
      pr({ exerciseId: "bench", setLogId: "b1", estimatedOneRM: 100, achievedAtMs: 1000 }),
      pr({ exerciseId: "bench", setLogId: "b2", estimatedOneRM: 110, achievedAtMs: 2000 }),
      pr({ exerciseId: "bench", setLogId: "b3", estimatedOneRM: 120, achievedAtMs: 3000 }),
    ];
    const [entry] = buildPersonalRecords(rows, meta);
    expect(entry.exerciseId).toBe("bench");
    expect(entry.exerciseName).toBe("Bench Press");
    expect(entry.muscleGroups).toEqual(["chest"]);
    expect(entry.metric).toBe("reps");
    expect(entry.current.estimatedOneRM).toBe(120);
    expect(entry.current.achievedAtMs).toBe(3000);
    expect(entry.previous?.estimatedOneRM).toBe(110);
  });

  it("has null previous when there is only one PR", () => {
    const rows = [pr({ exerciseId: "squat", setLogId: "s1", estimatedOneRM: 150, achievedAtMs: 5000 })];
    const [entry] = buildPersonalRecords(rows, meta);
    expect(entry.previous).toBeNull();
    expect(entry.current.estimatedOneRM).toBe(150);
  });

  it("detects time-based PRs and orders by duration", () => {
    const rows = [
      pr({ exerciseId: "plank", setLogId: "p1", reps: 0, estimatedOneRM: 0, durationSeconds: 60, achievedAtMs: 1000 }),
      pr({ exerciseId: "plank", setLogId: "p2", reps: 0, estimatedOneRM: 0, durationSeconds: 90, achievedAtMs: 2000 }),
    ];
    const [entry] = buildPersonalRecords(rows, meta);
    expect(entry.metric).toBe("time");
    expect(entry.current.durationSeconds).toBe(90);
    expect(entry.previous?.durationSeconds).toBe(60);
  });

  it("orders entries by most-recent PR first", () => {
    const rows = [
      pr({ exerciseId: "bench", setLogId: "b1", achievedAtMs: 1000 }),
      pr({ exerciseId: "squat", setLogId: "s1", achievedAtMs: 9000 }),
    ];
    const entries = buildPersonalRecords(rows, meta);
    expect(entries.map((e) => e.exerciseId)).toEqual(["squat", "bench"]);
  });

  it("falls back to magnitude when achievedAt is missing", () => {
    const rows = [
      pr({ exerciseId: "bench", setLogId: "b1", estimatedOneRM: 130, achievedAtMs: null }),
      pr({ exerciseId: "bench", setLogId: "b2", estimatedOneRM: 120, achievedAtMs: null }),
    ];
    const [entry] = buildPersonalRecords(rows, meta);
    expect(entry.current.estimatedOneRM).toBe(130);
    expect(entry.previous?.estimatedOneRM).toBe(120);
  });

  it("dedupes repeated setLogId", () => {
    const rows = [
      pr({ exerciseId: "bench", setLogId: "b1", estimatedOneRM: 100, achievedAtMs: 1000 }),
      pr({ exerciseId: "bench", setLogId: "b1", estimatedOneRM: 100, achievedAtMs: 1000 }),
    ];
    const [entry] = buildPersonalRecords(rows, meta);
    expect(entry.previous).toBeNull();
  });
});

describe("flattenLogPRs", () => {
  it("maps snake_case wire keys and resolves achieved_at", () => {
    const rows = flattenLogPRs({
      completedAt: { toDate: () => new Date(5000) },
      prs: [
        {
          exerciseId: "bench",
          weight_kg: 100,
          reps: 5,
          estimated_one_rm: 116.7,
          set_log_id: "b1",
          achieved_at: { toDate: () => new Date(4000) },
        },
      ],
    });
    expect(rows).toEqual([
      {
        exerciseId: "bench",
        weightKg: 100,
        reps: 5,
        estimatedOneRM: 116.7,
        durationSeconds: null,
        setLogId: "b1",
        achievedAtMs: 4000,
      },
    ]);
  });

  it("falls back to the log timestamp when a PR has no achieved_at, and skips PRs missing ids", () => {
    const rows = flattenLogPRs({
      startedAt: { toDate: () => new Date(7000) },
      prs: [
        { exerciseId: "plank", reps: 0, duration_seconds: 90, set_log_id: "p1" },
        { weight_kg: 50, reps: 5, set_log_id: "no-exercise" },
        { exerciseId: "x", reps: 5 },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ exerciseId: "plank", durationSeconds: 90, achievedAtMs: 7000 });
  });

  it("returns [] when the log has no prs", () => {
    expect(flattenLogPRs({})).toEqual([]);
  });
});

describe("previousRecordsByExercise", () => {
  it("returns the latest earlier PR per requested exercise", () => {
    const earlier = [
      pr({ exerciseId: "bench", setLogId: "b1", estimatedOneRM: 100, achievedAtMs: 1000 }),
      pr({ exerciseId: "bench", setLogId: "b2", estimatedOneRM: 110, achievedAtMs: 2000 }),
      pr({ exerciseId: "squat", setLogId: "s1", estimatedOneRM: 140, achievedAtMs: 1500 }),
    ];
    const prev = previousRecordsByExercise(earlier, new Set(["bench"]));
    expect(prev.get("bench")?.estimatedOneRM).toBe(110);
    expect(prev.has("squat")).toBe(false);
  });

  it("returns empty when no earlier PR exists for the exercise", () => {
    const prev = previousRecordsByExercise([], new Set(["bench"]));
    expect(prev.size).toBe(0);
  });
});

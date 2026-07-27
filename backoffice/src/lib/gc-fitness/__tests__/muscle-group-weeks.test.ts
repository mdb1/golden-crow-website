// muscle-group-weeks.test.ts — #480 weekly bucketing + #568 projection.
//
// The projection math is the TS twin of iOS
// `ProgressPhotosViewModel.projectedSetVolumeKg` / `projectedContributions` and
// Android `MuscleGroupCharts` — the vectors below mirror those twins.

import {
  PROJECTION_WEEKS,
  buildChartRows,
  buildMuscleGroupWeeks,
  civilWeekStart,
  projectedSetVolumeKg,
  projectedSetsForAssignment,
  shiftCivilDays,
  weekHasProjection,
  type ExerciseMuscleMeta,
  type MuscleGroupWeekPoint,
  type MuscleSetInput,
} from "@/lib/gc-fitness/muscle-group-weeks";

/** Bench press: chest primary, triceps + shoulders secondary (1.0 / 0.5 / 0.5). */
const BENCH: ExerciseMuscleMeta = {
  muscleGroups: ["chest", "triceps", "shoulders"],
  primaryMuscleGroup: "chest",
  secondaryMuscles: ["triceps", "shoulders"],
};

/** Row: back primary only. */
const ROW: ExerciseMuscleMeta = {
  muscleGroups: ["back"],
  primaryMuscleGroup: "back",
  secondaryMuscles: [],
};

const META = new Map<string, ExerciseMuscleMeta>([
  ["bench", BENCH],
  ["row", ROW],
]);

function set(date: string, exerciseId: string, volumeKg: number): MuscleSetInput {
  return { date, exerciseId, volumeKg };
}

describe("civilWeekStart", () => {
  it("anchors on Monday", () => {
    // 2026-07-27 is a Monday; 2026-08-02 is the Sunday that closes that week.
    expect(civilWeekStart("2026-07-27")).toBe("2026-07-27");
    expect(civilWeekStart("2026-07-29")).toBe("2026-07-27");
    expect(civilWeekStart("2026-08-02")).toBe("2026-07-27");
    expect(civilWeekStart("2026-08-03")).toBe("2026-08-03");
  });

  it("returns the input unchanged on a malformed date", () => {
    expect(civilWeekStart("nope")).toBe("nope");
  });
});

describe("shiftCivilDays", () => {
  it("crosses month and year boundaries", () => {
    expect(shiftCivilDays("2026-07-27", 7)).toBe("2026-08-03");
    expect(shiftCivilDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("projectedSetVolumeKg", () => {
  it("uses the per-set weight × per-set reps when both are prescribed", () => {
    const ex = { weightBySetKg: [60, 70, 80], repsBySet: [10, 8, 6] };
    expect(projectedSetVolumeKg(ex, 0)).toBe(600);
    expect(projectedSetVolumeKg(ex, 1)).toBe(560);
    expect(projectedSetVolumeKg(ex, 2)).toBe(480);
  });

  it("falls back to the LAST prescribed weight past the array end", () => {
    const ex = { weightBySetKg: [60, 70], reps: 10 };
    expect(projectedSetVolumeKg(ex, 5)).toBe(700);
  });

  it("falls back to the exercise-level reps", () => {
    expect(projectedSetVolumeKg({ weightBySetKg: [50], reps: 12 }, 0)).toBe(600);
  });

  it("uses weight × duration/60 for time-metric sets", () => {
    expect(
      projectedSetVolumeKg({ metric: "time", weightBySetKg: [20], durationSeconds: 90 }, 0),
    ).toBe(30);
    expect(
      projectedSetVolumeKg({ weightBySetKg: [20], durationBySetSeconds: [30, 60] }, 1),
    ).toBe(20);
  });

  it("is 0 when no weight is prescribed (bodyweight / open lift)", () => {
    expect(projectedSetVolumeKg({ reps: 12 }, 0)).toBe(0);
    expect(projectedSetVolumeKg({ weightBySetKg: [], reps: 12 }, 0)).toBe(0);
  });
});

describe("projectedSetsForAssignment", () => {
  it("emits one input per prescribed set, dated on scheduledFor", () => {
    const out = projectedSetsForAssignment("2026-07-30", [
      { exerciseId: "bench", sets: 3, weightBySetKg: [60], reps: 10 },
      { exerciseId: "row", sets: 2, weightBySetKg: [50], reps: 12 },
    ]);
    expect(out).toHaveLength(5);
    expect(out.every((s) => s.date === "2026-07-30")).toBe(true);
    expect(out.filter((s) => s.exerciseId === "bench")).toEqual([
      { date: "2026-07-30", exerciseId: "bench", volumeKg: 600 },
      { date: "2026-07-30", exerciseId: "bench", volumeKg: 600 },
      { date: "2026-07-30", exerciseId: "bench", volumeKg: 600 },
    ]);
  });

  it("skips exercises with no id or no sets", () => {
    expect(
      projectedSetsForAssignment("2026-07-30", [
        { sets: 3 },
        { exerciseId: "bench", sets: 0 },
        { exerciseId: "bench" },
      ]),
    ).toEqual([]);
  });
});

describe("buildMuscleGroupWeeks — actuals (#480 behavior preserved)", () => {
  it("weights primary 1.0 and secondary 0.5 and zero-fills the gap weeks", () => {
    const { muscleGroupWeeks, availableMuscleGroups } = buildMuscleGroupWeeks(
      [set("2026-07-14", "bench", 600), set("2026-07-27", "row", 500)],
      [],
      META,
      "2026-07-27",
    );

    expect(muscleGroupWeeks.map((w) => w.weekStart).slice(0, 3)).toEqual([
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
    expect(muscleGroupWeeks[0].byGroup).toEqual({
      chest: { sets: 1, volume: 600 },
      triceps: { sets: 0.5, volume: 300 },
      shoulders: { sets: 0.5, volume: 300 },
    });
    // Untrained week in the middle stays present and empty.
    expect(muscleGroupWeeks[1].byGroup).toEqual({});
    expect(muscleGroupWeeks[2].byGroup).toEqual({ back: { sets: 1, volume: 500 } });
    expect(availableMuscleGroups).toEqual(["back", "chest", "triceps", "shoulders"]);
  });

  it("returns nothing when there is neither actual nor projected data", () => {
    expect(buildMuscleGroupWeeks([], [], META, "2026-07-27")).toEqual({
      muscleGroupWeeks: [],
      availableMuscleGroups: [],
    });
  });

  it("never attaches a projection to a past week", () => {
    const { muscleGroupWeeks } = buildMuscleGroupWeeks(
      [set("2026-07-14", "row", 100)],
      [],
      META,
      "2026-07-27",
    );
    expect(muscleGroupWeeks[0].projectedByGroup).toBeUndefined();
    expect(muscleGroupWeeks[0].projected).toBeUndefined();
  });
});

describe("buildMuscleGroupWeeks — projection (#568)", () => {
  // Monday 2026-07-27. One row logged today; two more rows scheduled Thursday,
  // plus a full session each of the next two weeks.
  const actual = [set("2026-07-27", "row", 500)];
  const projected = [
    set("2026-07-30", "row", 500),
    set("2026-07-30", "row", 500),
    set("2026-08-04", "bench", 600),
    set("2026-08-11", "bench", 600),
  ];

  it("adds the current week's remaining prescription on top of the actuals", () => {
    const { muscleGroupWeeks } = buildMuscleGroupWeeks(
      actual,
      projected,
      META,
      "2026-07-27",
    );
    const current = muscleGroupWeeks.find((w) => w.weekStart === "2026-07-27")!;

    // Logged so far: 1 set. Projected week total: 1 logged + 2 scheduled.
    expect(current.byGroup).toEqual({ back: { sets: 1, volume: 500 } });
    expect(current.projectedByGroup).toEqual({ back: { sets: 3, volume: 1500 } });
    expect(current.projected).toBeUndefined();
  });

  it("marks future weeks as projected with an empty actual bucket", () => {
    const { muscleGroupWeeks } = buildMuscleGroupWeeks(
      actual,
      projected,
      META,
      "2026-07-27",
    );
    const next = muscleGroupWeeks.find((w) => w.weekStart === "2026-08-03")!;

    expect(next.projected).toBe(true);
    expect(next.byGroup).toEqual({});
    expect(next.projectedByGroup).toEqual({
      chest: { sets: 1, volume: 600 },
      triceps: { sets: 0.5, volume: 300 },
      shoulders: { sets: 0.5, volume: 300 },
    });
  });

  it("extends the axis exactly PROJECTION_WEEKS past the current week", () => {
    const { muscleGroupWeeks } = buildMuscleGroupWeeks(
      actual,
      projected,
      META,
      "2026-07-27",
    );
    const last = muscleGroupWeeks[muscleGroupWeeks.length - 1];
    expect(last.weekStart).toBe(shiftCivilDays("2026-07-27", 7 * PROJECTION_WEEKS));
    expect(muscleGroupWeeks.filter((w) => w.projected)).toHaveLength(
      PROJECTION_WEEKS,
    );
  });

  it("starts the axis at the current week when there is no logged history", () => {
    const { muscleGroupWeeks, availableMuscleGroups } = buildMuscleGroupWeeks(
      [],
      projected,
      META,
      "2026-07-27",
    );
    expect(muscleGroupWeeks[0].weekStart).toBe("2026-07-27");
    expect(muscleGroupWeeks[0].byGroup).toEqual({});
    expect(muscleGroupWeeks[0].projectedByGroup).toEqual({
      back: { sets: 2, volume: 1000 },
    });
    expect(availableMuscleGroups).toEqual(["back", "chest", "triceps", "shoulders"]);
  });

  it("ignores exercises with no resolvable muscle metadata", () => {
    const { muscleGroupWeeks } = buildMuscleGroupWeeks(
      [],
      [set("2026-07-30", "ghost", 999)],
      META,
      "2026-07-27",
    );
    expect(muscleGroupWeeks).toEqual([]);
  });
});

describe("weekHasProjection", () => {
  it("is false without a projected bucket (a past week)", () => {
    expect(
      weekHasProjection({ weekStart: "2026-07-20", byGroup: { back: { sets: 3, volume: 0 } } }),
    ).toBe(false);
  });

  it("is false for a current week whose plan adds nothing", () => {
    expect(
      weekHasProjection({
        weekStart: "2026-07-27",
        byGroup: { back: { sets: 3, volume: 0 } },
        projectedByGroup: { back: { sets: 3, volume: 0 } },
      }),
    ).toBe(false);
  });

  it("is true for a current week with work still scheduled", () => {
    expect(
      weekHasProjection({
        weekStart: "2026-07-27",
        byGroup: { back: { sets: 3, volume: 0 } },
        projectedByGroup: { back: { sets: 9, volume: 0 } },
      }),
    ).toBe(true);
  });

  it("is true for a future week with scheduled sets, false for an empty one", () => {
    expect(
      weekHasProjection({
        weekStart: "2026-08-03",
        byGroup: {},
        projectedByGroup: { back: { sets: 6, volume: 0 } },
        projected: true,
      }),
    ).toBe(true);
    expect(
      weekHasProjection({
        weekStart: "2026-08-03",
        byGroup: {},
        projectedByGroup: {},
        projected: true,
      }),
    ).toBe(false);
  });
});

describe("buildChartRows", () => {
  const WEEKS: MuscleGroupWeekPoint[] = [
    { weekStart: "2026-07-13", byGroup: { back: { sets: 8, volume: 4000 } } },
    { weekStart: "2026-07-20", byGroup: { back: { sets: 10, volume: 5000 } } },
    {
      weekStart: "2026-07-27",
      byGroup: { back: { sets: 3, volume: 1500 } },
      projectedByGroup: { back: { sets: 12, volume: 6000 } },
    },
    {
      weekStart: "2026-08-03",
      byGroup: {},
      projectedByGroup: { back: { sets: 12, volume: 6000 } },
      projected: true,
    },
  ];

  it("splits the solid and dashed regions at the current week", () => {
    const rows = buildChartRows(WEEKS, ["back"], "sets", 2, true);

    expect(rows).toEqual([
      { week: "2026-07-13", back: 8, back__proj: null },
      // Seed: the dashed line starts on the last complete week's actual value.
      { week: "2026-07-20", back: 10, back__proj: 10 },
      { week: "2026-07-27", back: 3, back__proj: 12 },
      // Future week — the solid line stops, only the projection continues.
      { week: "2026-08-03", back: null, back__proj: 12 },
    ]);
  });

  it("reads the volume metric off the same buckets", () => {
    const rows = buildChartRows(WEEKS, ["back"], "volume", 2, true);
    expect(rows.map((r) => r.back)).toEqual([4000, 5000, 1500, null]);
    expect(rows.map((r) => r.back__proj)).toEqual([null, 5000, 6000, 6000]);
  });

  it("emits no projected values at all when there is nothing upcoming", () => {
    const rows = buildChartRows(WEEKS.slice(0, 3), ["back"], "sets", 2, false);
    expect(rows.every((r) => r.back__proj === null)).toBe(true);
    expect(rows.map((r) => r.back)).toEqual([8, 10, 3]);
  });

  it("starts the dashed region at the current week when it's first in view", () => {
    const rows = buildChartRows(WEEKS.slice(2), ["back"], "sets", 0, true);
    expect(rows).toEqual([
      { week: "2026-07-27", back: 3, back__proj: 12 },
      { week: "2026-08-03", back: null, back__proj: 12 },
    ]);
  });
});

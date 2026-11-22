// __tests__/assign-template-overrides.test.ts
//
// #507 — the per-exercise override model moved out of assign-template-modal.
// The modal's own suites (assign-template-modal*.test.tsx) still drive it
// end-to-end; these pin the pure pieces directly.

import {
  buildAssignRecurrence,
  buildExerciseOverrides,
  copyFirstSetToAllRows,
  formatLocalDateToCivil,
  parseCivilToLocalDate,
  restMinutesHint,
  seedOverrideDrafts,
  toggleWeekdayIn,
  withAppendedSetRow,
  withExerciseMetric,
  withoutSetRow,
  withRowField,
  withRowType,
  type AssignOverrideDraft,
  type AssignTemplateDetail,
  type AssignTemplateDetailExercise,
} from "../assign-template-overrides";

function exercise(overrides: Partial<AssignTemplateDetailExercise> = {}): AssignTemplateDetailExercise {
  return {
    index: 0,
    exerciseId: "ex1",
    exerciseName: "Bench",
    sets: 3,
    reps: 10,
    repsBySet: [10, 10, 8],
    weightBySetKg: [60, 60, 62.5],
    rest_seconds: 90,
    transition_rest_seconds: 60,
    notes: "",
    ...overrides,
  } as AssignTemplateDetailExercise;
}

function detail(exercises: AssignTemplateDetailExercise[]): AssignTemplateDetail {
  return { exercises } as unknown as AssignTemplateDetail;
}

function draft(overrides: Partial<AssignOverrideDraft> = {}): AssignOverrideDraft {
  return {
    rest_seconds: "90",
    transition_rest_seconds: "60",
    notes: "",
    noWeight: false,
    setRows: [
      { reps: "10", kg: "60", type: "warmup" },
      { reps: "8", kg: "70", type: "normal" },
    ],
    ...overrides,
  };
}

describe("civil date helpers", () => {
  it("round-trips a civil date through a local Date without a UTC shift", () => {
    const d = parseCivilToLocalDate("2026-03-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(8);
    expect(formatLocalDateToCivil(d)).toBe("2026-03-08");
  });
});

describe("restMinutesHint", () => {
  it.each([
    ["", ""],
    ["0", ""],
    ["abc", ""],
    ["45", ""],
    ["60", "1 min"],
    ["120", "2 min"],
    ["90", "1.5 min"],
  ])("%s → %s", (raw, hint) => {
    expect(restMinutesHint(raw)).toBe(hint);
  });
});

describe("buildAssignRecurrence", () => {
  const base = { civilDate: "2026-11-17", recurringWeekdays: new Set([3, 1]), recurringEveryN: 4 };
  it("maps every cadence to its wire rule", () => {
    expect(buildAssignRecurrence("daily", base)).toEqual({ kind: "daily" });
    expect(buildAssignRecurrence("everyN", base)).toEqual({ kind: "every_n_days", everyN: 4 });
    expect(buildAssignRecurrence("monthly", base)).toEqual({ kind: "monthly", dayOfMonth: 17 });
    expect(buildAssignRecurrence("weekly", base)).toEqual({ kind: "weekly_days", weekdays: [1, 3] });
    expect(
      buildAssignRecurrence("weekly", { ...base, recurringWeekdays: new Set([5]) }),
    ).toEqual({ kind: "weekly", weekday: 5 });
  });
});

describe("toggleWeekdayIn", () => {
  it("adds, removes, and never empties the selection", () => {
    expect([...toggleWeekdayIn(new Set([1]), 3)].sort()).toEqual([1, 3]);
    expect([...toggleWeekdayIn(new Set([1, 3]), 3)]).toEqual([1]);
    expect([...toggleWeekdayIn(new Set([1]), 1)]).toEqual([1]);
  });
});

describe("seedOverrideDrafts", () => {
  it("builds one row per prescribed set from the longest array", () => {
    const drafts = seedOverrideDrafts([
      exercise({ sets: 1, setTypesBySet: ["warmup"] } as Partial<AssignTemplateDetailExercise>),
    ]);
    expect(drafts[0]).toEqual({
      rest_seconds: "90",
      transition_rest_seconds: "60",
      notes: "",
      noWeight: false,
      setRows: [
        { reps: "10", kg: "60", type: "warmup" },
        { reps: "10", kg: "60", type: "normal" },
        { reps: "8", kg: "62.5", type: "normal" },
      ],
    });
  });

  it("seeds durations for time exercises and the Sin peso intent", () => {
    const drafts = seedOverrideDrafts([
      exercise({
        index: 2,
        metric: "time",
        sets: 2,
        repsBySet: [],
        weightBySetKg: [],
        durationBySetSeconds: [30],
        durationSeconds: 45,
        hasExplicitNoWeightPrescription: true,
      } as Partial<AssignTemplateDetailExercise>),
    ]);
    expect(drafts[2].noWeight).toBe(true);
    expect(drafts[2].setRows.map((r) => r.duration)).toEqual(["30", "45"]);
    expect(drafts[2].setRows.map((r) => r.kg)).toEqual(["", ""]);
  });
});

describe("buildExerciseOverrides", () => {
  it("is empty without a template and for untouched drafts", () => {
    expect(buildExerciseOverrides(null, {})).toEqual([]);
    const ex = exercise();
    expect(buildExerciseOverrides(detail([ex]), seedOverrideDrafts([ex]))).toEqual([]);
  });

  it("emits only the changed fields", () => {
    const ex = exercise();
    const drafts = seedOverrideDrafts([ex]);
    drafts[0] = withRowField(drafts[0], 2, "kg", "65");
    drafts[0] = { ...drafts[0], notes: "  slow  " };
    expect(buildExerciseOverrides(detail([ex]), drafts)).toEqual([
      { index: 0, weightBySetKg: [60, 60, 65], notes: "slow" },
    ]);
  });

  it("writes weightBySetKg: [] for Sin peso and the metric flip with durations", () => {
    const ex = exercise();
    let d = seedOverrideDrafts([ex])[0];
    d = { ...d, noWeight: true };
    d = withExerciseMetric(d, "time", 40);
    const [override] = buildExerciseOverrides(detail([ex]), { 0: d });
    expect(override).toMatchObject({
      index: 0,
      weightBySetKg: [],
      metric: "time",
      durationBySetSeconds: [40, 40, 40],
      durationSeconds: 40,
    });
    expect(override).not.toHaveProperty("repsBySet");
  });

  it("registers a removed set as a set-type change (#582)", () => {
    const ex = exercise({ setTypesBySet: ["warmup", "normal", "failure"] } as Partial<AssignTemplateDetailExercise>);
    const d = withoutSetRow(seedOverrideDrafts([ex])[0], 0)!;
    const [override] = buildExerciseOverrides(detail([ex]), { 0: d });
    expect(override).toMatchObject({ sets: 2, setTypesBySet: ["normal", "failure"] });
  });
});

describe("row updaters", () => {
  it("copies set 1 to every other set but keeps each row's type", () => {
    const next = copyFirstSetToAllRows(draft(), "reps")!;
    expect(next.setRows).toEqual([
      { reps: "10", kg: "60", type: "warmup" },
      { reps: "10", kg: "60", type: "normal" },
    ]);
    expect(copyFirstSetToAllRows(undefined, "reps")).toBeUndefined();
    expect(copyFirstSetToAllRows(draft({ setRows: [{ reps: "1", kg: "", type: "normal" }] }), "reps")).toBeUndefined();
  });

  it("copies duration on time exercises (defaulting to 60)", () => {
    const next = copyFirstSetToAllRows(draft(), "time")!;
    expect(next.setRows.map((r) => r.duration)).toEqual([undefined, "60"]);
  });

  it("swaps one row's type", () => {
    expect(withRowType(draft(), 1, "dropset").setRows.map((r) => r.type)).toEqual(["warmup", "dropset"]);
  });

  it("seeds durations when flipping to time, keeps rows when flipping to reps", () => {
    const d = draft();
    expect(withExerciseMetric(d, "time", 30).setRows.map((r) => r.duration)).toEqual(["30", "30"]);
    const reps = withExerciseMetric(d, "reps", 30);
    expect(reps.metric).toBe("reps");
    expect(reps.setRows).toBe(d.setRows);
  });

  it("never removes the last set", () => {
    expect(withoutSetRow(draft({ setRows: [{ reps: "1", kg: "", type: "normal" }] }), 0)).toBeUndefined();
    expect(withoutSetRow(draft(), 0)!.setRows).toEqual([{ reps: "8", kg: "70", type: "normal" }]);
  });

  it("appends a NORMAL set carrying the previous values, capped at 10", () => {
    const next = withAppendedSetRow(draft(), "time")!;
    expect(next.setRows[2]).toEqual({ reps: "8", kg: "70", type: "normal", duration: "60" });
    const full = draft({
      setRows: Array.from({ length: 10 }, () => ({ reps: "1", kg: "", type: "normal" as const })),
    });
    expect(withAppendedSetRow(full, "reps")).toBeUndefined();
  });
});

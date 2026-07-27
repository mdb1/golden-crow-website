// exercise-set-history.test.ts — #574 per-session set breakdown shaping.

import {
  SET_HISTORY_PAGE_SIZE,
  sessionSetLines,
} from "@/lib/gc-fitness/exercise-set-history";
import type { ExerciseSetRow } from "@/lib/gc-fitness/exercise-progress-actions";

function row(overrides: Partial<ExerciseSetRow> = {}): ExerciseSetRow {
  return { setIndex: 0, weightKg: 70, reps: 8, ...overrides };
}

describe("sessionSetLines", () => {
  it("orders by setIndex regardless of the input order", () => {
    const lines = sessionSetLines([
      row({ setIndex: 2, reps: 6 }),
      row({ setIndex: 0, reps: 10 }),
      row({ setIndex: 1, reps: 8 }),
    ]);
    expect(lines.map((l) => l.reps)).toEqual([10, 8, 6]);
    expect(lines.map((l) => l.label)).toEqual(["1", "2", "3"]);
  });

  it("applies the Hevy numbering rule — W/F/D don't consume a number", () => {
    const lines = sessionSetLines([
      row({ setIndex: 0, setType: "warmup" }),
      row({ setIndex: 1 }),
      row({ setIndex: 2 }),
      row({ setIndex: 3, setType: "dropset" }),
      row({ setIndex: 4 }),
    ]);
    expect(lines.map((l) => l.label)).toEqual(["W", "1", "2", "D", "3"]);
    expect(lines.map((l) => l.setType)).toEqual([
      "warmup",
      "normal",
      "normal",
      "dropset",
      "normal",
    ]);
  });

  it("labels a failure set F", () => {
    const lines = sessionSetLines([
      row({ setIndex: 0 }),
      row({ setIndex: 1, setType: "failure" }),
    ]);
    expect(lines.map((l) => l.label)).toEqual(["1", "F"]);
  });

  it("classifies weighted / bodyweight / time sets", () => {
    const lines = sessionSetLines([
      row({ setIndex: 0, weightKg: 70, reps: 8 }),
      row({ setIndex: 1, weightKg: 0, reps: 12 }),
      row({ setIndex: 2, weightKg: 20, reps: 0, durationSeconds: 90 }),
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["weighted", "reps", "time"]);
    expect(lines[2].durationSeconds).toBe(90);
  });

  it("treats a zero/absent duration as a reps set, not a 0 s time set", () => {
    expect(sessionSetLines([row({ durationSeconds: 0 })])[0].kind).toBe(
      "weighted",
    );
    expect(sessionSetLines([row({ weightKg: 0 })])[0].durationSeconds).toBeNull();
  });

  it("carries the PR flag through, defaulting to false", () => {
    const lines = sessionSetLines([
      row({ setIndex: 0 }),
      row({ setIndex: 1, isPR: true }),
    ]);
    expect(lines.map((l) => l.isPR)).toEqual([false, true]);
  });

  it("returns [] for a session with no sets", () => {
    expect(sessionSetLines([])).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const sets = [row({ setIndex: 1 }), row({ setIndex: 0 })];
    sessionSetLines(sets);
    expect(sets.map((s) => s.setIndex)).toEqual([1, 0]);
  });
});

describe("SET_HISTORY_PAGE_SIZE", () => {
  it("reveals 3 sessions per press, per issue #574", () => {
    expect(SET_HISTORY_PAGE_SIZE).toBe(3);
  });
});

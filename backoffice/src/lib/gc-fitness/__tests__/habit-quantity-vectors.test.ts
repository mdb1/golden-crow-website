// habit-quantity-vectors.test.ts — gc-fitness #1648. EVERY case of the habit-quantity table
// (`twin-vectors/habit-quantity-vectors.json`, pinned copy of gc-fitness `twin-vectors/`) through
// habit-quantity.ts. The same file drives Swift/Kotlin `HabitQuantity`.

import {
  formatHabitQuantityProgress,
  habitQuantityAutoSteps,
  habitQuantityFraction,
  habitQuantityStep,
  habitQuantityTap,
  habitQuantityTarget,
  habitQuantityUnit,
  isAutoStepsHabit,
  isQuantityHabit,
} from "../habit-quantity";
import { logCountsAsCompleted, coerceLegacyHabitLogValue } from "../habit-compliance";
import vectors from "./twin-vectors/habit-quantity-vectors.json";

interface VLog {
  quantity?: number;
  value?: boolean;
  deleted?: boolean;
}
interface Vectors {
  target: { raw: number | null; expected: number | null }[];
  unit: { raw: string | null; expected: string }[];
  step: { unit: string; expected: number }[];
  fraction: { quantity: number; target: number; expected: number }[];
  tap: {
    name: string;
    target: number;
    unit: string;
    log: VLog | null;
    expected: { action: "reset" } | { action: "write"; quantity: number; value: boolean };
  }[];
  autoSteps: {
    name: string;
    target: number;
    log: VLog | null;
    steps: number;
    expected: { quantity: number; value: boolean } | null;
  }[];
}

const v = vectors as unknown as Vectors;
const named = <T extends { name: string }>(cases: T[]) => cases.map((c) => [c.name, c] as const);

describe("habit-quantity twin vectors (#1648)", () => {
  it("has the minimum case counts", () => {
    expect(v.target.length).toBeGreaterThanOrEqual(10);
    expect(v.tap.length).toBeGreaterThanOrEqual(10);
    expect(v.autoSteps.length).toBeGreaterThanOrEqual(10);
  });

  test.each(v.target.map((c) => [String(c.raw), c] as const))("target(%s)", (_n, c) => {
    expect(habitQuantityTarget(c.raw)).toBe(c.expected);
  });

  test.each(v.unit.map((c) => [String(c.raw), c] as const))("unit(%s)", (_n, c) => {
    expect(habitQuantityUnit(c.raw)).toBe(c.expected);
  });

  test.each(v.step.map((c) => [c.unit, c] as const))("step(%s)", (_n, c) => {
    expect(habitQuantityStep(habitQuantityUnit(c.unit))).toBe(c.expected);
  });

  test.each(v.fraction.map((c) => [`${c.quantity}/${c.target}`, c] as const))("fraction %s", (_n, c) => {
    expect(habitQuantityFraction(c.quantity, c.target)).toBeCloseTo(c.expected, 9);
  });

  test.each(named(v.tap))("tap: %s", (_n, c) => {
    expect(habitQuantityTap(c.target, habitQuantityUnit(c.unit), c.log)).toEqual(c.expected);
  });

  test.each(named(v.autoSteps))("autoSteps: %s", (_n, c) => {
    expect(habitQuantityAutoSteps(c.target, c.log, c.steps)).toEqual(c.expected);
  });
});

describe("habit-quantity helpers", () => {
  it("detects quantity and auto-steps habits; legacy habits stay plain", () => {
    expect(isQuantityHabit({})).toBe(false);
    expect(isQuantityHabit({ quantityTarget: 8, quantityUnit: "glasses" })).toBe(true);
    expect(isAutoStepsHabit({ quantityTarget: 10000, quantityUnit: "steps" })).toBe(true);
    expect(isAutoStepsHabit({ quantityTarget: 8, quantityUnit: "glasses" })).toBe(false);
    expect(isAutoStepsHabit({ quantityUnit: "steps" })).toBe(false);
  });

  it("formats progress like the apps", () => {
    expect(formatHabitQuantityProgress(3, 8, "glasses", "es")).toBe("3 / 8 vasos");
    expect(formatHabitQuantityProgress(6240, 10000, "steps", "es")).toBe("6.240 / 10.000 pasos");
    expect(formatHabitQuantityProgress(6240, 10000, "steps", "en")).toBe("6,240 / 10,000 steps");
  });

  it("compliance stays binary: a partial quantity log (value false) never counts", () => {
    const partial = { quantity: 5, value: coerceLegacyHabitLogValue(false), deleted: false };
    expect(logCountsAsCompleted(partial as never, "binary")).toBe(false);
    const done = { quantity: 8, value: coerceLegacyHabitLogValue(true), deleted: false };
    expect(logCountsAsCompleted(done as never, "binary")).toBe(true);
  });
});

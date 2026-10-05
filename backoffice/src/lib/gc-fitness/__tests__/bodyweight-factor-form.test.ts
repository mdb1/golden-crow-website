// #1307 — the exercise editors' «% del peso corporal para el volumen» policy.

import {
  factorToPersist,
  percentToFactor,
  showsBodyweightFactorField,
  suggestedBodyweightPercent,
} from "../bodyweight-factor-form";

describe("showsBodyweightFactorField", () => {
  it("asks for bodyweight / none / empty (saved as bodyweight) / pull-up bar", () => {
    expect(showsBodyweightFactorField(["bodyweight"])).toBe(true);
    expect(showsBodyweightFactorField(["none"])).toBe(true);
    expect(showsBodyweightFactorField([])).toBe(true);
    expect(showsBodyweightFactorField(["pull_up_bar"])).toBe(true);
  });

  it("does not ask for weighted equipment unless a factor is already set", () => {
    expect(showsBodyweightFactorField(["barbell"])).toBe(false);
    expect(showsBodyweightFactorField(["barbell"], 0)).toBe(false);
    expect(showsBodyweightFactorField(["dumbbell"], 0.5)).toBe(true);
  });
});

describe("percent ⇄ factor", () => {
  it("suggests by primary muscle", () => {
    expect(suggestedBodyweightPercent("chest")).toBe(65);
    expect(suggestedBodyweightPercent("quadriceps")).toBe(90);
    expect(suggestedBodyweightPercent(undefined)).toBe(65);
  });

  it("snaps a typed percent to the 0.05 grid and clamps", () => {
    expect(percentToFactor(70)).toBe(0.7);
    expect(percentToFactor(67)).toBe(0.65);
    expect(percentToFactor(130)).toBe(1);
    expect(percentToFactor(null)).toBeNull();
  });

  it("persists the explicit value, else the muscle suggestion", () => {
    expect(factorToPersist(0.95, "back")).toBe(0.95);
    expect(factorToPersist(0, "back")).toBe(0);
    expect(factorToPersist(null, "back")).toBe(0.8);
    expect(factorToPersist(undefined, "hamstrings")).toBe(0.45);
  });
});

// exercise-name-variants.test.ts
//
// Issue #581: the client Progress tab's exercise picker only matched the ONE
// language the row displayed (the payload flattens `{en, es}` ES-first), so a
// coach typing "bench press" found nothing on a "Press de banca" row. These
// cover the pure half of the fix — pulling every language out of a wire name
// and turning the collected set into the search-only alias list.

import {
  collectExerciseNameVariants,
  exerciseNameVariants,
  searchAliasesFor,
} from "../exercise-name-variants";

describe("exerciseNameVariants", () => {
  it("returns both languages of a bilingual name, EN first", () => {
    expect(
      exerciseNameVariants({ en: "Bench Press", es: "Press de banca" }),
    ).toEqual(["Bench Press", "Press de banca"]);
  });

  it("keeps the single language when only one is filled", () => {
    expect(exerciseNameVariants({ en: "Bench Press", es: "" })).toEqual([
      "Bench Press",
    ]);
    expect(exerciseNameVariants({ es: "Sentadilla" })).toEqual(["Sentadilla"]);
  });

  it("accepts a legacy plain-string name", () => {
    expect(exerciseNameVariants("  Squat  ")).toEqual(["Squat"]);
  });

  it("yields nothing for absent / blank / non-name values", () => {
    expect(exerciseNameVariants(null)).toEqual([]);
    expect(exerciseNameVariants(undefined)).toEqual([]);
    expect(exerciseNameVariants("   ")).toEqual([]);
    expect(exerciseNameVariants(42)).toEqual([]);
    expect(exerciseNameVariants({ en: 7, es: null })).toEqual([]);
  });
});

describe("collectExerciseNameVariants", () => {
  it("accumulates across several logs, keyed by normalized text", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, {
      en: "Bench Press",
      es: "Press de banca",
    });
    collectExerciseNameVariants(variants, {
      en: "Bench Press",
      es: "Press de banca",
    });
    expect([...variants.values()]).toEqual(["Bench Press", "Press de banca"]);
  });

  it("treats case/diacritic spelling differences as the same name", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, { es: "Sentadílla" });
    collectExerciseNameVariants(variants, { es: "sentadilla" });
    // First spelling seen wins — one entry, not two.
    expect([...variants.values()]).toEqual(["Sentadílla"]);
  });

  it("keeps an older name so a renamed exercise stays findable", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, { en: "Barbell Row", es: "Remo" });
    collectExerciseNameVariants(variants, {
      en: "Bent Over Row",
      es: "Remo inclinado",
    });
    expect([...variants.values()]).toEqual([
      "Barbell Row",
      "Remo",
      "Bent Over Row",
      "Remo inclinado",
    ]);
  });
});

describe("searchAliasesFor", () => {
  it("drops the displayed name and keeps the other language", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, {
      en: "Bench Press",
      es: "Press de banca",
    });
    expect(searchAliasesFor("Press de banca", variants)).toEqual([
      "Bench Press",
    ]);
    expect(searchAliasesFor("Bench Press", variants)).toEqual([
      "Press de banca",
    ]);
  });

  it("matches the display name on normalized text, not raw text", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, {
      en: "Squat",
      es: "Sentadílla",
    });
    // Display came through a different accent/case path — still the same name,
    // so it must not be echoed back as an alias.
    expect(searchAliasesFor("sentadilla", variants)).toEqual(["Squat"]);
  });

  it("is empty when the exercise is known by exactly one name", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, { en: "Plank", es: "Plank" });
    expect(searchAliasesFor("Plank", variants)).toEqual([]);
  });

  it("returns everything when no variant matches the display name", () => {
    const variants = new Map<string, string>();
    collectExerciseNameVariants(variants, {
      en: "Bench Press",
      es: "Press de banca",
    });
    // Display fell back to the exerciseId (no snapshot name resolved).
    expect(searchAliasesFor("std-bench-press", variants)).toEqual([
      "Bench Press",
      "Press de banca",
    ]);
  });
});

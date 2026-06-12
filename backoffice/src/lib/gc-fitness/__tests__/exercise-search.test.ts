// exercise-search.test.ts
//
// Covers the shared exercise discovery haystack used by the library view and
// the picker/multi-add flows. The synonym mapping is the core of issue #180:
// a trainer should find "Military Standing Press" by typing "shoulder press".
//
// Issue #291 additions (A–D): normalization + name-aware RANKING in
// `searchExercises` / `scoreExercise`. A coach typing a partial / hyphenated /
// pluralized name should find the right exercise AND see the best match first.

import {
  exerciseSearchHaystack,
  normalizeSearchText,
  scoreExercise,
  searchExercises,
} from "../exercise-search";
import type { ExerciseRow } from "../exercises-listener";

describe("exerciseSearchHaystack", () => {
  it("includes keywords and variations for synonym search", () => {
    const haystack = exerciseSearchHaystack({
      name: { en: "Military Standing Press", es: "Press militar de pie" },
      description: { en: "Overhead press.", es: "Press por encima." },
      muscleGroups: ["shoulders", "triceps"],
      equipment: ["barbell", "smith"],
      keywords: ["shoulder press", "overhead press"],
      tags: ["standard-library"],
      variations: ["Seated Shoulder Press"],
    });

    expect(haystack.toLowerCase()).toContain("shoulder press");
    expect(haystack.toLowerCase()).toContain("seated shoulder press");
    expect(haystack.toLowerCase()).toContain("standard-library");
  });
});

// ---------------------------------------------------------------------------
// Issue #291 — normalization edge cases.
// ---------------------------------------------------------------------------

describe("normalizeSearchText (issue #291 punctuation)", () => {
  it("treats parentheses as a word separator", () => {
    expect(normalizeSearchText("Bench Press (Barbell)")).toBe(
      "bench press barbell",
    );
  });

  it("treats hyphens as a word separator and strips diacritics", () => {
    expect(normalizeSearchText("Pull-Ups")).toBe("pull ups");
    expect(normalizeSearchText("Sentadílla")).toBe("sentadilla");
  });
});

// ---------------------------------------------------------------------------
// Shared fixture helper — one local makeRow, override per case.
// Mirrors the field set from the component test's makeRow.
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: overrides.id ?? "row",
    name: { en: "Test Exercise", es: "Ejercicio", ...(overrides.name ?? {}) },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    mediaURL: null,
    thumbnailURL: null,
    youtubeURL: null,
    source: "free-exercise-db",
    ownerId: null,
    version: 1,
    updatedAt: "2026-05-25T00:00:00.000Z",
    createdAt: "2026-05-25T00:00:00.000Z",
    deleted: false,
    deletedAt: null,
    mergedInto: null,
    imageUrl: null,
    endImageUrl: null,
    gifUrl: null,
    instructions: null,
    deletedReason: null,
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    mechanic: "compound",
    level: "intermediate",
    category: "strength",
    force: "push",
    metric: "reps",
    ...overrides,
  } as ExerciseRow;
}

// ---------------------------------------------------------------------------
// Test A — hyphen + plural tolerance.
// ---------------------------------------------------------------------------

describe("searchExercises Test A — hyphen + plural (#291)", () => {
  const pullUps = makeRow({
    id: "pull-ups",
    name: { en: "Pull-Ups", es: "Dominadas" },
  });
  const pushUps = makeRow({
    id: "push-ups",
    name: { en: "Push-Ups", es: "Flexiones" },
  });

  it('"pull up" surfaces "Pull-Ups" and ranks it first', () => {
    const result = searchExercises([pullUps, pushUps], "pull up");
    expect(result.map((r) => r.id)).toContain("pull-ups");
    expect(result[0].id).toBe("pull-ups");
  });

  it('"pull ups" surfaces the "Pull-Up" stored singular too', () => {
    const pullUp = makeRow({ id: "pull-up", name: { en: "Pull-Up", es: "" } });
    const result = searchExercises([pullUp, pushUps], "pull ups");
    expect(result.map((r) => r.id)).toContain("pull-up");
    expect(result[0].id).toBe("pull-up");
  });
});

// ---------------------------------------------------------------------------
// Test B — name-aware ranking.
// ---------------------------------------------------------------------------

describe("searchExercises Test B — ranking (#291)", () => {
  const benchBarbell = makeRow({
    id: "bench-barbell",
    name: { en: "Bench Press (Barbell)", es: "Press de banca (Barra)" },
  });
  const inclineBench = makeRow({
    id: "incline-bench",
    name: { en: "Incline Bench Press", es: "Press de banca inclinado" },
  });
  const keywordOnly = makeRow({
    id: "floor-fly",
    name: { en: "Floor Fly", es: "Aperturas en el suelo" },
    keywords: ["bench press"],
  });

  it('"bench press" puts "Bench Press (Barbell)" first', () => {
    const result = searchExercises(
      [inclineBench, keywordOnly, benchBarbell],
      "bench press",
    );
    expect(result[0].id).toBe("bench-barbell");
  });

  it('"Incline Bench Press" ranks above the keyword-only match', () => {
    const result = searchExercises(
      [keywordOnly, inclineBench, benchBarbell],
      "bench press",
    );
    const inclineIdx = result.findIndex((r) => r.id === "incline-bench");
    const keywordIdx = result.findIndex((r) => r.id === "floor-fly");
    expect(inclineIdx).toBeGreaterThanOrEqual(0);
    expect(keywordIdx).toBeGreaterThanOrEqual(0);
    expect(inclineIdx).toBeLessThan(keywordIdx);
  });

  it("scores a tighter name above a longer one", () => {
    expect(scoreExercise("bench press", benchBarbell)).toBeGreaterThan(
      scoreExercise("bench press", inclineBench),
    );
  });
});

// ---------------------------------------------------------------------------
// Test C — order-independent multi-token.
// ---------------------------------------------------------------------------

describe("searchExercises Test C — order-independent (#291)", () => {
  const inclineDbPress = makeRow({
    id: "incline-db-press",
    name: { en: "Incline Dumbbell Press", es: "Press inclinado con mancuernas" },
  });
  const squat = makeRow({ id: "squat", name: { en: "Squat", es: "Sentadilla" } });

  it('"incline press" matches "Incline Dumbbell Press"', () => {
    const result = searchExercises([squat, inclineDbPress], "incline press");
    expect(result.map((r) => r.id)).toContain("incline-db-press");
  });
});

// ---------------------------------------------------------------------------
// Test D — empty query passthrough.
// ---------------------------------------------------------------------------

describe("searchExercises Test D — empty passthrough (#291)", () => {
  const rows = [
    makeRow({ id: "a", name: { en: "Alpha", es: "" } }),
    makeRow({ id: "b", name: { en: "Beta", es: "" } }),
    makeRow({ id: "c", name: { en: "Gamma", es: "" } }),
  ];

  it("empty query returns rows unchanged (same order)", () => {
    expect(searchExercises(rows, "")).toEqual(rows);
  });

  it("whitespace-only query returns rows unchanged (same order)", () => {
    expect(searchExercises(rows, "   ")).toEqual(rows);
  });
});

// ---------------------------------------------------------------------------
// Test E (bonus) — diacritic-insensitive ES name match.
// ---------------------------------------------------------------------------

describe("searchExercises diacritics (#291)", () => {
  it('"sentadilla" finds a row whose ES name is "Sentadílla"', () => {
    const accented = makeRow({
      id: "sentadilla",
      name: { en: "Squat", es: "Sentadílla" },
    });
    const result = searchExercises([accented], "sentadilla");
    expect(result.map((r) => r.id)).toContain("sentadilla");
  });
});

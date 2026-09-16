import {
  exerciseIdentityKey,
  matchingExerciseIds,
  normalizedExerciseName,
} from "../exercise-identity-match";

/**
 * gc-fitness#1111 — the same exercise under two document ids.
 *
 * TWIN of `ExerciseIdentityMatchTests.swift` / `ExerciseIdentityMatchTest.kt`: same cases,
 * same fixtures, including the real ids from the report.
 */
describe("exerciseIdentityKey / matchingExerciseIds (#1111)", () => {
  // The two live documents behind the report, verbatim from production.
  const canonicalId = "1434";
  const twinId = "std-legs-back-squat-smith";
  const sharedName = "Back Squat (Smith)";

  const entry = (
    exerciseId: string,
    nameEN: string,
    metric: "reps" | "time" | null = null,
  ) => ({ exerciseId, nameEN, metric });

  it("claims the twin id for the canonical exercise's history", () => {
    // Friday's log: the routine of the day froze the `std-*` twin.
    const matched = matchingExerciseIds(
      new Set([canonicalId]),
      exerciseIdentityKey(sharedName, "reps"),
      [entry(twinId, sharedName), entry("0765", "Military Standing Press (Smith)")],
    );
    expect(matched.has(twinId)).toBe(true);
    expect(matched.has(canonicalId)).toBe(true);
    expect(matched.has("0765")).toBe(false);
  });

  it("without the key the twin is invisible — the pre-fix behavior", () => {
    // Pins what the bug WAS, so a refactor that drops the key cannot quietly restore it.
    const matched = matchingExerciseIds(new Set([canonicalId]), null, [
      entry(twinId, sharedName),
    ]);
    expect([...matched]).toEqual([canonicalId]);
  });

  it("normalizes case, accents and punctuation", () => {
    const a = exerciseIdentityKey("Back Squat (Smith)", "reps");
    expect(exerciseIdentityKey("back squat   smith", "reps")).toBe(a);
    expect(exerciseIdentityKey("BÁCK-SQUÁT, SMITH!", "reps")).toBe(a);
    expect(normalizedExerciseName("Sentadilla trasera (Smith)")).toBe(
      "sentadilla trasera smith",
    );
  });

  it("has no key for a blank name", () => {
    // Otherwise every unnamed exercise shares the key "|reps" and one person's history
    // absorbs another exercise's sets.
    expect(exerciseIdentityKey("", "reps")).toBeNull();
    expect(exerciseIdentityKey("   ", "reps")).toBeNull();
    expect(exerciseIdentityKey("!!!", "reps")).toBeNull();
  });

  it("never matches a nameless snapshot entry", () => {
    const matched = matchingExerciseIds(
      new Set([canonicalId]),
      exerciseIdentityKey(sharedName, "reps"),
      [entry("mystery", "")],
    );
    expect([...matched]).toEqual([canonicalId]);
  });

  it("keeps the same name under a different metric apart", () => {
    // A plank held for 45 seconds and a "plank" logged as 12 reps are not comparable.
    const matched = matchingExerciseIds(
      new Set(["plank-reps"]),
      exerciseIdentityKey("Plank (Bodyweight)", "reps"),
      [entry("plank-time", "Plank (Bodyweight)", "time")],
    );
    expect([...matched]).toEqual(["plank-reps"]);
  });

  it("does not merge a different exercise with a similar name", () => {
    const matched = matchingExerciseIds(
      new Set([canonicalId]),
      exerciseIdentityKey(sharedName, "reps"),
      [entry("0752", "Front Squat (Smith)"), entry("0755", "Hack Squat (Smith)")],
    );
    expect([...matched]).toEqual([canonicalId]);
  });

  it("cascades a snapshot with NO metric override", () => {
    // `metric` is null whenever the trainer did not override it — almost every exercise in
    // the library. Reading null as "reps" is right by accident here and wrong for every
    // time-based exercise; reading it as "does not match" drops nearly all history.
    const matched = matchingExerciseIds(
      new Set(["plank-canonical"]),
      exerciseIdentityKey("Plank (Bodyweight)", "time"),
      [entry("plank-twin", "Plank (Bodyweight)", null)],
    );
    expect(matched.has("plank-twin")).toBe(true);
  });

  it("keeps accepted ids the log never mentions", () => {
    const matched = matchingExerciseIds(
      new Set([canonicalId, "alias-of-1434"]),
      exerciseIdentityKey(sharedName, "reps"),
      [],
    );
    expect([...matched].sort()).toEqual(["1434", "alias-of-1434"]);
  });

  it("puts three ids of one exercise in the same history", () => {
    // Not hypothetical: 233 names in the production library have both a numeric and a
    // `std-*` document, and a coach's own copy of the same exercise is a third.
    const matched = matchingExerciseIds(
      new Set([canonicalId]),
      exerciseIdentityKey(sharedName, "reps"),
      [entry(twinId, sharedName), entry("custom-coach-abc", "Back Squat (Smith)")],
    );
    expect([...matched].sort()).toEqual([
      "1434",
      "custom-coach-abc",
      "std-legs-back-squat-smith",
    ]);
  });
});

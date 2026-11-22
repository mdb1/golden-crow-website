/**
 * #1649 (gc-fitness) — the GC Fitness library seed marks true DISTANCE cardio as a timed,
 * distance-tracked exercise (`metric: "time"`, `tracksDistance: true`), and a template that picks
 * one prescribes it as time + distance with no load. Strength "rows" and moves that merely mention
 * a cardio word stay plain reps exercises (no `metric` key, as before).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require("../../../../scripts/seed-gc-fitness-library.cjs");

describe("seed-gc-fitness-library — distance cardio (#1649)", () => {
  it.each([
    ["Rowing machine", "Cardio"],
    ["Rowing", "Cardio"],
    ["Indoor rowing", "Back"],
    ["Treadmill running", "Cardio"],
    ["Running", "Legs"],
    ["Stationary bike", "Cardio"],
    ["Cycling", "Cardio"],
    ["Elliptical trainer", "Cardio"],
    ["Swimming", "Cardio"],
    ["Ski erg", "Cardio"],
    ["Walking", "Cardio"],
  ])("%s (%s) is distance cardio", (name, category) => {
    expect(seed.isDistanceCardio(name, category)).toBe(true);
  });

  it.each([
    ["Bent Over Rowing", "Back"],
    ["Upright Row", "Shoulders"],
    ["Cable Row", "Back"],
    ["Seated Row", "Back"],
    ["Row", "Back"],
    ["Walking lunges", "Legs"],
    ["Bicycle crunches", "Abs"],
    ["Burpees", "Cardio"],
    ["Jumping jacks", "Cardio"],
    ["", "Cardio"],
  ])("%s (%s) is NOT distance cardio", (name, category) => {
    expect(seed.isDistanceCardio(name, category)).toBe(false);
  });

  const wger = (name: string, category: string) => ({
    id: 1,
    uuid: name.replace(/\s+/g, "-").toLowerCase(),
    translations: [{ name }],
    category: { name: category },
    muscles: [],
    equipment: [],
  });

  it("mapExercise stamps metric time + tracksDistance only on cardio", () => {
    const row = seed.mapExercise(wger("Rowing machine", "Cardio"));
    expect(row.metric).toBe("time");
    expect(row.tracksDistance).toBe(true);
    const bench = seed.mapExercise(wger("Bench press", "Chest"));
    expect("metric" in bench).toBe(false);
    expect("tracksDistance" in bench).toBe(false);
  });

  it("a template that picks a cardio exercise prescribes time + distance, no load", () => {
    const exercises = [
      seed.mapExercise(wger("Rowing machine", "Cardio")),
      seed.mapExercise(wger("Bench press", "Chest")),
    ];
    const index = seed.buildExerciseIndex(exercises);
    const refs = seed.pickExercises(index, { slug: "conditioning", tag: "full-body", muscles: ["cardio", "chest"] });
    const cardio = refs.find((r: { exerciseId: string }) => r.exerciseId === exercises[0].id);
    expect(cardio).toMatchObject({ metric: "time", reps: 1, weightBySetKg: [], distanceBySetMeters: [] });
    expect(cardio.durationBySetSeconds).toHaveLength(cardio.sets);
    const strength = refs.find((r: { exerciseId: string }) => r.exerciseId === exercises[1].id);
    expect(strength.metric).toBeUndefined();
    expect(strength.distanceBySetMeters).toBeUndefined();
  });
});

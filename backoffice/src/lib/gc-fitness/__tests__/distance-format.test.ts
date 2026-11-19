// gc-fitness #1649 — distance / cardio. Runs the shared vectors (pinned copy of gc-fitness
// `twin-vectors/distance-format-vectors.json`), the SAME file Swift and Kotlin run.

import {
  coachDistanceText,
  distanceNumber,
  distanceText,
  metersFromInput,
  readDistanceMeters,
  totalMeters,
} from "../distance-format";
import vectors from "./twin-vectors/distance-format-vectors.json";

describe("distance-format twin vectors", () => {
  it.each(vectors.number.map((c) => [JSON.stringify(c), c] as const))("number %s", (_, c) => {
    expect(distanceNumber(c.meters, c.units, c.locale)).toBe(c.expected);
  });

  it.each(vectors.metersFromInput.map((c) => [JSON.stringify(c), c] as const))("metersFromInput %s", (_, c) => {
    expect(metersFromInput(c.value, c.units)).toBe(c.expected);
  });

  it.each(
    vectors.roundTrip.units.flatMap((u) => vectors.roundTrip.typed.map((t) => [u, t] as const)),
  )("%s typed %s reads back identical", (units, typed) => {
    expect(distanceNumber(metersFromInput(Number(typed), units), units, "en-US")).toBe(typed);
  });

  it.each(vectors.totalMeters.map((c) => [JSON.stringify(c), c] as const))("totalMeters %s", (_, c) => {
    expect(totalMeters(c.sets as Array<Record<string, unknown>>)).toBe(c.expected);
  });
});

describe("distance display helpers", () => {
  it("distanceText adds the unit", () => {
    expect(distanceText(5250, "kg", "es-AR")).toBe("5,25 km");
    expect(distanceText(5000, "lb", "en-US")).toBe("3.11 mi");
  });

  it("coachDistanceText: km, plus mi for lb clients", () => {
    expect(coachDistanceText(5000, "kg", "es-AR")).toBe("5 km");
    expect(coachDistanceText(5000, "lb", "es-AR")).toBe("5 km (3,11 mi)");
  });

  it("readDistanceMeters is forgiving", () => {
    expect(readDistanceMeters(500)).toBe(500);
    expect(readDistanceMeters(0)).toBeNull();
    expect(readDistanceMeters(-1)).toBeNull();
    expect(readDistanceMeters("500")).toBeNull();
    expect(readDistanceMeters(Number.NaN)).toBeNull();
  });
});

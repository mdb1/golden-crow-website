// gc-fitness #1646 — kg / lb. Runs the shared vectors (pinned copy of gc-fitness
// `twin-vectors/weight-units-vectors.json`), the SAME file Swift and Kotlin run.

import {
  clientWeightUnits,
  coachLoadText,
  kgFromInput,
  loadNumber,
  loadText,
} from "../weight-units";
import vectors from "./twin-vectors/weight-units-vectors.json";

describe("weight-units twin vectors", () => {
  it.each(vectors.kgFromInput.map((c) => [JSON.stringify(c), c] as const))("kgFromInput %s", (_, c) => {
    expect(kgFromInput(c.value, c.units)).toBe(c.expected);
  });

  it.each(vectors.loadNumber.map((c) => [JSON.stringify(c), c] as const))("loadNumber %s", (_, c) => {
    expect(loadNumber(c.kg, c.units, c.locale)).toBe(c.expected);
  });

  it.each(vectors.lbRoundTrip.typed.map((t) => [t] as const))("lb typed %s reads back identical", (typed) => {
    expect(loadNumber(kgFromInput(Number(typed), "lb"), "lb", "en-US")).toBe(typed);
  });
});

describe("clientWeightUnits", () => {
  it.each([
    [undefined, "kg"],
    [{}, "kg"],
    [{ preferences: {} }, "kg"],
    [{ preferences: { units: "kg" } }, "kg"],
    [{ preferences: { units: "lb" } }, "lb"],
    [{ preferences: { units: "LB" } }, "lb"],
    [{ preferences: { units: "stone" } }, "kg"],
    [{ preferences: "lb" }, "kg"],
  ] as const)("%j ⇒ %s", (doc, expected) => {
    expect(clientWeightUnits(doc)).toBe(expected);
  });
});

describe("coachLoadText", () => {
  it("kg client: kg only, up to two decimals", () => {
    expect(coachLoadText(61.25, "kg", "es-AR")).toBe("61,25 kg");
    expect(coachLoadText(80, undefined, "en-US")).toBe("80 kg");
  });
  it("lb client: kg + the lb the client typed", () => {
    expect(coachLoadText(61.235, "lb", "es-AR")).toBe("61,24 kg (135 lb)");
    expect(coachLoadText(102.058, "lb", "en-US")).toBe("102.06 kg (225 lb)");
  });
  it("loadText carries the unit", () => {
    expect(loadText(60, "lb", "en-US")).toBe("132.3 lb");
  });
});

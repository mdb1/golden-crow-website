import { visibleCompleteSections } from "../activity-day-grouping";

describe("visibleCompleteSections", () => {
  const sections = [{ key: "d1" }, { key: "d2" }, { key: "d3" }];

  it("returns every section when there are no more pages (all loaded)", () => {
    expect(visibleCompleteSections(sections, false)).toEqual(sections);
  });

  it("hides the trailing (oldest) day while more pages exist", () => {
    // d3 is the oldest loaded day = the pagination boundary, so it may still
    // grow → it must be withheld until the next page closes it.
    expect(visibleCompleteSections(sections, true)).toEqual([
      { key: "d1" },
      { key: "d2" },
    ]);
  });

  it("returns nothing when the only loaded day is still partial", () => {
    expect(visibleCompleteSections([{ key: "d1" }], true)).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(visibleCompleteSections([], true)).toEqual([]);
    expect(visibleCompleteSections([], false)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [{ key: "a" }, { key: "b" }];
    const copy = [...input];
    visibleCompleteSections(input, true);
    expect(input).toEqual(copy);
  });
});

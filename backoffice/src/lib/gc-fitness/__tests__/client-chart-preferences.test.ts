// __tests__/client-chart-preferences.test.ts
//
// The coach's "which charts do I want on a client profile" cookie.
//
// The design decision under test is that the cookie stores the HIDDEN set, not
// the visible one. It reads backwards until you notice that the alternative
// breaks silently: with a visible-set cookie, every coach who ever opened the
// configurator has a value that predates any chart added later, so a new chart
// ships invisible to exactly the people who use the feature — and nothing
// fails, it just isn't there.

import {
  CLIENT_CHART_IDS,
  isChartVisible,
  parseHiddenCharts,
  serializeHiddenCharts,
  toggleChartVisibility,
} from "@/lib/gc-fitness/client-chart-preferences";

describe("parseHiddenCharts", () => {
  it("treats an absent cookie as nothing hidden", () => {
    // Default is every chart on. An absent cookie MUST be the default.
    expect(parseHiddenCharts(undefined)).toEqual([]);
    expect(parseHiddenCharts(null)).toEqual([]);
    expect(parseHiddenCharts("")).toEqual([]);
  });

  it("degrades to nothing hidden rather than throwing on junk", () => {
    // A corrupt cookie must not 500 a profile, and "everything visible" is the
    // state a coach can most easily correct from.
    expect(parseHiddenCharts("not json")).toEqual([]);
    expect(parseHiddenCharts(encodeURIComponent('{"a":1}'))).toEqual([]);
    expect(parseHiddenCharts(encodeURIComponent("[1, 2, 3]"))).toEqual([]);
  });

  it("drops ids that are no longer charts", () => {
    const raw = serializeHiddenCharts(["habits", "someRemovedChart"]);
    expect(parseHiddenCharts(raw)).toEqual(["habits"]);
  });

  it("returns canonical display order, not the order it was written in", () => {
    const raw = encodeURIComponent(
      JSON.stringify(["personalRecords", "bodyWeight", "habits"]),
    );
    expect(parseHiddenCharts(raw)).toEqual([
      "bodyWeight",
      "habits",
      "personalRecords",
    ]);
  });

  it("round-trips through serialize", () => {
    const hidden = ["dailySteps", "muscleGroups"];
    expect(parseHiddenCharts(serializeHiddenCharts(hidden))).toEqual([
      "muscleGroups",
      "dailySteps",
    ]);
  });
});

describe("isChartVisible", () => {
  it("shows every known chart when nothing is hidden", () => {
    for (const id of CLIENT_CHART_IDS) {
      expect(isChartVisible(id, [])).toBe(true);
    }
  });

  it("hides exactly what is in the set", () => {
    expect(isChartVisible("dailySteps", ["dailySteps"])).toBe(false);
    expect(isChartVisible("habits", ["dailySteps"])).toBe(true);
  });

  it("refuses an id that is not a chart", () => {
    expect(isChartVisible("madeUp", [])).toBe(false);
  });
});

describe("toggleChartVisibility", () => {
  it("adds to the hidden set when switched off", () => {
    expect(toggleChartVisibility([], "volume", false)).toEqual(["volume"]);
  });

  it("removes from the hidden set when switched back on", () => {
    expect(toggleChartVisibility(["volume", "habits"], "volume", true)).toEqual([
      "habits",
    ]);
  });

  it("is idempotent — hiding twice does not duplicate", () => {
    const once = toggleChartVisibility([], "habits", false);
    expect(toggleChartVisibility(once, "habits", false)).toEqual(["habits"]);
  });

  it("drops stale ids it passes over", () => {
    // A cookie written before a chart was removed must not resurrect the id
    // every time the coach toggles something else.
    expect(
      toggleChartVisibility(["goneChart", "habits"], "volume", false),
    ).toEqual(["volume", "habits"]);
  });

  it("hiding every chart is allowed", () => {
    let hidden: string[] = [];
    for (const id of CLIENT_CHART_IDS) {
      hidden = toggleChartVisibility(hidden, id, false);
    }
    expect(hidden).toEqual([...CLIENT_CHART_IDS]);
  });
});

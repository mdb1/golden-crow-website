// __tests__/workout-heart-rate.test.ts
//
// The BPM series behind the chart on a finished workout, as the backoffice
// reads it.
//
// THE LOAD-BEARING RULE: min/max/avg come from the STORED fields, never from
// the plotted points. The client's app thins the series to ≤300 samples before
// uploading and the thinning averages within buckets, so a 178 bpm peak can be
// drawn at 126 while still being the real maximum. A reader that recomputes
// from `samples` under-reports exactly the moment a coach opens this screen for
// — and it under-reports plausibly, which is why nobody would notice.

import {
  projectHeartRateSeries,
  type WorkoutHeartRateSeries,
} from "@/lib/gc-fitness/workout-heart-rate";

const doc = (overrides: Record<string, unknown> = {}) => ({
  clientId: "c1",
  trainerId: "t1",
  samples: [
    { offsetSeconds: 0, bpm: 92 },
    { offsetSeconds: 30, bpm: 118 },
    { offsetSeconds: 60, bpm: 141 },
  ],
  minBpm: 88,
  maxBpm: 178,
  avgBpm: 121,
  source: "healthkit",
  ...overrides,
});

describe("projectHeartRateSeries — the stored aggregates win", () => {
  it("reports the STORED min/max/avg, not the plotted extremes", () => {
    // The whole point. The drawn line here tops out at 141; the session's real
    // peak was 178, smoothed away by the writer's downsampling.
    const series = projectHeartRateSeries(doc());

    expect(series).toEqual<WorkoutHeartRateSeries>({
      samples: [
        { offsetSeconds: 0, bpm: 92 },
        { offsetSeconds: 30, bpm: 118 },
        { offsetSeconds: 60, bpm: 141 },
      ],
      minBpm: 88,
      maxBpm: 178,
      avgBpm: 121,
    });
    expect(Math.max(...series!.samples.map((s) => s.bpm))).toBeLessThan(
      series!.maxBpm,
    );
  });

  it("falls back to the points only when an aggregate is absent", () => {
    // Legacy/partial doc. The fallback under-reports by exactly the amount
    // thinning smoothed away, which is why it is a fallback and not the rule.
    const series = projectHeartRateSeries(
      doc({ minBpm: undefined, maxBpm: undefined, avgBpm: undefined }),
    );

    expect(series?.minBpm).toBe(92);
    expect(series?.maxBpm).toBe(141);
    expect(series?.avgBpm).toBe(117);
  });
});

describe("projectHeartRateSeries — absence", () => {
  it("returns null for a missing doc", () => {
    // The common case: most sessions are logged without a watch, and the chart
    // hides itself rather than framing an empty box on every workout.
    expect(projectHeartRateSeries(null)).toBeNull();
    expect(projectHeartRateSeries(undefined)).toBeNull();
  });

  it("returns null when there are no usable samples", () => {
    expect(projectHeartRateSeries(doc({ samples: [] }))).toBeNull();
    expect(projectHeartRateSeries(doc({ samples: "92,118" }))).toBeNull();
    expect(
      projectHeartRateSeries(doc({ samples: [{ offsetSeconds: 0, bpm: 0 }] })),
    ).toBeNull();
  });
});

describe("projectHeartRateSeries — per-sample guards", () => {
  it("drops a non-positive bpm rather than charting it", () => {
    // A dropout charted as 0 drags the line to the floor between two real
    // values, which reads as a cardiac event rather than a lost signal.
    const series = projectHeartRateSeries(
      doc({
        samples: [
          { offsetSeconds: 0, bpm: 120 },
          { offsetSeconds: 30, bpm: 0 },
          { offsetSeconds: 60, bpm: 130 },
        ],
      }),
    );

    expect(series?.samples.map((s) => s.bpm)).toEqual([120, 130]);
  });

  it("drops a negative offset — it has no place on the axis", () => {
    const series = projectHeartRateSeries(
      doc({
        samples: [
          { offsetSeconds: -30, bpm: 70 },
          { offsetSeconds: 30, bpm: 130 },
        ],
      }),
    );

    expect(series?.samples).toEqual([{ offsetSeconds: 30, bpm: 130 }]);
  });

  it("drops a malformed entry instead of the whole series", () => {
    const series = projectHeartRateSeries(
      doc({
        samples: [
          { offsetSeconds: 0, bpm: 120 },
          "not an object",
          { offsetSeconds: "x", bpm: 130 },
          { offsetSeconds: 60, bpm: 135 },
        ],
      }),
    );

    expect(series?.samples).toHaveLength(2);
  });

  it("rounds fractional values — a bpm is whole", () => {
    const series = projectHeartRateSeries(
      doc({ samples: [{ offsetSeconds: 30.4, bpm: 120.6 }] }),
    );

    expect(series?.samples).toEqual([{ offsetSeconds: 30, bpm: 121 }]);
  });
});

describe("projectHeartRateSeries — ordering", () => {
  it("sorts by offset rather than trusting the stored order", () => {
    // A chart whose x-axis doubles back on itself draws a scribble, and the
    // cost of being sure is one sort of at most 300 entries.
    const series = projectHeartRateSeries(
      doc({
        samples: [
          { offsetSeconds: 60, bpm: 141 },
          { offsetSeconds: 0, bpm: 92 },
          { offsetSeconds: 30, bpm: 118 },
        ],
      }),
    );

    expect(series?.samples.map((s) => s.offsetSeconds)).toEqual([0, 30, 60]);
  });
});

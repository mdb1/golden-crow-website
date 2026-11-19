// usage-model.test.ts — the pure shaping of /gc-fitness/admin/usage (golden-crow-website#530):
// forgiving decode of `usage_daily` docs (the gc-fitness `computeUsageDaily` wire shape),
// zero-fill, period totals + deltas, adoption, Corvo topics / n-grams, retention.

import {
  FEATURE_KEYS,
  activitySeries,
  addDays,
  adoptionRanking,
  civilDayBA,
  corvoSummary,
  dayKeys,
  decodeUsageDaily,
  delta,
  familySeries,
  formatDelta,
  lastCompleteDay,
  latestRetention,
  parseUsageRange,
  periodTotals,
  zeroFill,
} from "../usage-model";

import { usageDoc } from "./fixtures/usage-daily";

describe("ranges and days", () => {
  it("parseUsageRange: only 7/30/90, default 30", () => {
    expect(parseUsageRange("7")).toBe(7);
    expect(parseUsageRange(["90"])).toBe(90);
    expect(parseUsageRange("31")).toBe(30);
    expect(parseUsageRange(undefined)).toBe(30);
  });
  it("Buenos Aires day + last complete day", () => {
    expect(civilDayBA(new Date("2026-11-17T02:00:00Z"))).toBe("2026-11-16");
    expect(lastCompleteDay(new Date("2026-11-17T12:00:00Z"))).toBe("2026-11-16");
    expect(dayKeys("2026-11-16", 3)).toEqual(["2026-11-14", "2026-11-15", "2026-11-16"]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("decodeUsageDaily", () => {
  it("decodes the server shape", () => {
    const d = decodeUsageDaily("2026-11-16", usageDoc("2026-11-16"));
    expect(d.actives.total).toBe(5);
    expect(d.features.workouts_logged).toEqual({ events: 4, users: 2 });
    expect(d.corvo.topics.routines).toBe(3);
    expect(d.corvo.estimatedMicroUsd).toBe(24000);
    expect(d.retention).toEqual([{ week: "2026-11-02", size: 4, active: [4, 2, 1] }]);
  });
  it("is forgiving: junk and missing fields are zeros, unknown features ignored", () => {
    const d = decodeUsageDaily("2026-11-16", { actives: "x", features: { brand_new: { events: 9 } }, corvo: { ngrams: [{ t: 3 }, null] } });
    expect(d.actives.total).toBe(0);
    expect(Object.keys(d.features)).toEqual(FEATURE_KEYS);
    expect(d.corvo.ngrams).toEqual([]);
    expect(d.present).toBe(true);
  });
});

describe("periods", () => {
  const keys = dayKeys("2026-11-16", 7);
  const days = zeroFill(keys, [
    decodeUsageDaily(keys[5], usageDoc(keys[5], { dau: 4 })),
    decodeUsageDaily(keys[6], usageDoc(keys[6], { dau: 6 })),
  ]);

  it("zero-fills missing days and averages DAU over days WITH data", () => {
    expect(days).toHaveLength(7);
    expect(days[0].present).toBe(false);
    const p = periodTotals(days);
    expect(p.daysWithData).toBe(2);
    expect(p.avgDau).toBe(5);
    expect(p.wau).toBe(9);
    expect(p.workouts).toBe(8);
    expect(p.corvoMessages).toBe(10);
    expect(p.acceptance).toBeCloseTo(4 / 6);
    // #541 — the fixture day has 1 purchase and no renewals / cancellations / expirations.
    expect(p.premiumPurchases).toBe(2);
    expect(p.premiumRenewals).toBe(0);
    expect(p.premiumCancellations).toBe(0);
    expect(p.premiumExpirations).toBe(0);
  });

  it("delta: null without previous data or with 0", () => {
    expect(delta(12, 10, true)).toBeCloseTo(0.2);
    expect(delta(12, 0, true)).toBeNull();
    expect(delta(12, 10, false)).toBeNull();
    expect(delta(null, 10, true)).toBeNull();
    expect(formatDelta(0.2)).toBe("+20%");
    expect(formatDelta(-0.054)).toBe("-5%");
  });

  it("adoption: share of the audience's active days, coach tools against coaches", () => {
    const rows = adoptionRanking(days);
    const habits = rows.find((r) => r.feature === "habits_checked")!;
    // client active-days = (1+2+1) × 2 days = 8; habits users 3 × 2 = 6
    expect(habits.share).toBeCloseTo(6 / 8);
    const payments = rows.find((r) => r.feature === "payments_recorded")!;
    // coach active-days = (4-4=0) + (6-4=2) = 2; payments users 1 × 2
    expect(payments.audience).toBe("coach");
    expect(payments.share).toBe(1);
    expect(rows[0].share).toBeGreaterThanOrEqual(rows[rows.length - 1].share);
  });

  it("family + activity series", () => {
    const fam = familySeries(days);
    expect(fam[6]).toMatchObject({ day: keys[6], training: 4, habits: 6, corvo: 5, coaching: 1, social: 0 });
    expect(activitySeries(days)[6]).toMatchObject({ dau: 6, wau: 9, mau: 20, coach: 2 });
  });

  it("corvo summary: topics sorted with shares of messages, n-grams merged across days", () => {
    const c = corvoSummary(days);
    expect(c.messages).toBe(10);
    expect(c.topics[0]).toEqual({ topic: "routines", count: 6, share: 0.6 });
    expect(c.ngrams[0]).toEqual({ t: "rutina", users: 4, n: 6, days: 2 });
    expect(c.acceptance).toBeCloseTo(4 / 6);
    expect(c.estimatedMicroUsd).toBe(48000);
  });

  it("retention comes from the latest day with data", () => {
    expect(latestRetention(days)).toEqual({ asOf: keys[6], rows: [{ week: "2026-11-02", size: 4, active: [4, 2, 1] }] });
    expect(latestRetention(zeroFill(keys, []))).toBeNull();
  });
});

// __tests__/body-weight-logs.test.ts — #919.
//
// `loadBodyWeightPoints` is the ONE reader behind the weight chart and the
// nutrition phase table's "Δ peso" column. Pinned: plausibility filter, the
// 365-day window, one point per civil date in the CLIENT'S zone (latest wins),
// ascending by measurement date, and fail-soft on a read error.

import { FakeFirestore, FakeTimestamp } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));

import { BODY_WEIGHT_LOOKBACK_DAYS, loadBodyWeightPoints } from "../body-weight-logs";

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function log(id: string, valueKg: unknown, recordedAt: unknown, clientId = "c1") {
  mockDb.current!.seed(`users/${clientId}/body_weight_logs/${id}`, { valueKg, recordedAt });
}
const ts = (iso: string) => FakeTimestamp.fromDate(new Date(iso));

beforeEach(() => {
  mockDb.current = new FakeFirestore();
  jest.spyOn(Date, "now").mockReturnValue(NOW.getTime());
});
afterEach(() => jest.restoreAllMocks());

it("reads only this client's subcollection, ordered by recordedAt asc, bounded", async () => {
  log("a", 80, ts("2026-06-10T10:00:00Z"));
  log("b", 70, ts("2026-06-10T10:00:00Z"), "someone-else");
  const points = await loadBodyWeightPoints("c1", "UTC");
  expect(points).toEqual([{ date: "2026-06-10", weight: 80 }]);
  expect(mockDb.current!.queries).toEqual([
    {
      collection: "users/c1/body_weight_logs",
      filters: [],
      orderBy: [{ field: "recordedAt", dir: "asc" }],
      limit: 500,
    },
  ]);
});

it("drops implausible weights but keeps the 35 / 300 kg edges", async () => {
  log("low", 34.9, ts("2026-06-01T10:00:00Z"));
  log("edgeLow", 35, ts("2026-06-02T10:00:00Z"));
  log("edgeHigh", 300, ts("2026-06-03T10:00:00Z"));
  log("high", 300.1, ts("2026-06-04T10:00:00Z"));
  const points = await loadBodyWeightPoints("c1", "UTC");
  expect(points).toEqual([
    { date: "2026-06-02", weight: 35 },
    { date: "2026-06-03", weight: 300 },
  ]);
});

it("drops docs with a non-numeric weight or an unusable recordedAt", async () => {
  log("str", "80", ts("2026-06-01T10:00:00Z"));
  log("bad-date", 80, "not a date");
  log("no-date", 80, undefined);
  log("ok-iso-string", 81, "2026-06-05T10:00:00Z");
  log("ok-date", 82, new Date("2026-06-06T10:00:00Z"));
  const points = await loadBodyWeightPoints("c1", "UTC");
  expect(points).toEqual([
    { date: "2026-06-05", weight: 81 },
    { date: "2026-06-06", weight: 82 },
  ]);
});

it(`keeps only the last ${BODY_WEIGHT_LOOKBACK_DAYS} days (boundary instant included)`, async () => {
  const windowStart = NOW.getTime() - BODY_WEIGHT_LOOKBACK_DAYS * DAY;
  log("old", 90, FakeTimestamp.fromDate(new Date(windowStart - 1)));
  expect(await loadBodyWeightPoints("c1", "UTC")).toEqual([]);
  log("edge", 89, FakeTimestamp.fromDate(new Date(windowStart)));
  expect(await loadBodyWeightPoints("c1", "UTC")).toEqual([{ date: "2025-06-15", weight: 89 }]);
});

it("buckets by the CLIENT'S civil date and the latest recordedAt of a day wins", async () => {
  // 02:00Z on the 11th is still the 10th in Buenos Aires (UTC-3).
  log("morning", 80, ts("2026-06-10T12:00:00Z"));
  log("late", 79.5, ts("2026-06-11T02:00:00Z"));
  log("next", 79, ts("2026-06-11T15:00:00Z"));
  expect(await loadBodyWeightPoints("c1", "America/Argentina/Buenos_Aires")).toEqual([
    { date: "2026-06-10", weight: 79.5 },
    { date: "2026-06-11", weight: 79 },
  ]);
  expect(await loadBodyWeightPoints("c1", "UTC")).toEqual([
    { date: "2026-06-10", weight: 80 },
    { date: "2026-06-11", weight: 79 },
  ]);
});

it("returns points ascending by measurement date", async () => {
  log("z", 70, ts("2026-06-03T10:00:00Z"));
  log("a", 71, ts("2026-06-01T10:00:00Z"));
  log("m", 72, ts("2026-06-02T10:00:00Z"));
  const points = await loadBodyWeightPoints("c1", "UTC");
  expect(points.map((p) => p.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
});

it("re-sorts by date even when the query order is not date order (legacy string recordedAt)", async () => {
  // Firestore orders by TYPE before value: every Timestamp sorts before every
  // string, so a legacy ISO-string `recordedAt` comes back AFTER newer
  // Timestamp docs. The in-memory sort is what puts it back in place.
  const docs = [
    { valueKg: 80, recordedAt: ts("2026-06-05T10:00:00Z") },
    { valueKg: 81, recordedAt: "2026-06-01T10:00:00Z" },
  ];
  const query = {
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: docs.map((d) => ({ data: () => d })) }),
  };
  mockDb.current = {
    collection: () => ({ doc: () => ({ collection: () => query }) }),
  } as unknown as FakeFirestore;
  expect(await loadBodyWeightPoints("c1", "UTC")).toEqual([
    { date: "2026-06-01", weight: 81 },
    { date: "2026-06-05", weight: 80 },
  ]);
});

it("fails soft to [] when the read throws", async () => {
  log("a", 80, ts("2026-06-10T10:00:00Z"));
  mockDb.current!.failQueryWhen((q) => q.collection.endsWith("body_weight_logs"));
  await expect(loadBodyWeightPoints("c1", "UTC")).resolves.toEqual([]);
});

// FINDING: the read is `orderBy(recordedAt, "asc").limit(500)` and the 365-day
// window is applied IN MEMORY afterwards. Once a client has more than 500 logs in
// total (≈ 1.4 years of daily weigh-ins), the query returns the OLDEST 500 — all
// outside the window — and the chart / phase "Δ peso" go blank or stale. The
// window belongs in the query (`where(recordedAt >= windowStart)`) or the order
// should be desc + reverse.
it.failing("still returns this year's weigh-ins when the client has > 500 logs in total", async () => {
  for (let i = 0; i < 520; i += 1) {
    // 520 daily logs ending yesterday: the most recent 365 are in the window.
    const at = new Date(NOW.getTime() - (520 - i) * DAY);
    log(`d${String(i).padStart(3, "0")}`, 80, FakeTimestamp.fromDate(at));
  }
  const points = await loadBodyWeightPoints("c1", "UTC");
  expect(points.at(-1)?.date).toBe("2026-06-14");
});

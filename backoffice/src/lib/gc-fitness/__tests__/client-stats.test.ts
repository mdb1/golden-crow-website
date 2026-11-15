// #506 — the pure half of the `client_stats` cache: decode, freshness, encode.
// The roster's use of it (hits, misses, write-back) lives in client-roster.test.ts.

import { FakeTimestamp } from "@/lib/test-utils/fake-firestore-c";

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import {
  CLIENT_STATS_MAX_AGE_MS,
  CLIENT_STATS_VERSION,
  EMPTY_CLIENT_STATS,
  decodeClientStats,
  encodeClientStats,
  isClientStatsFresh,
  type ClientStatsValues,
} from "../client-stats";

const NOW = Date.parse("2026-06-17T15:00:00Z");
const KEY = { coachId: "coach-a", timezone: "UTC", civilDate: "2026-06-17" };
const VALUES: ClientStatsValues = {
  lastWorkoutAtMs: NOW - 1000,
  lastHabitAtMs: null,
  lastPhotoAtMs: NOW - 5000,
  thisWeekComplianceRatio: 0.5,
  habitsCompletedThisWeek: 3,
  habitsScheduledThisWeek: 7,
  missedWorkoutsLast7Days: 1,
  missedForAttention: 1,
  hasSomethingAssignedSoon: true,
  workoutsCompletedThisMonth: 2,
  workoutsScheduledThisMonth: 4,
};

describe("client-stats", () => {
  it("encode → decode round-trips the values and the key, with no dirtyAt", () => {
    const stored = encodeClientStats("c1", KEY, NOW, VALUES);
    expect(stored).not.toHaveProperty("dirtyAt");
    expect(Object.values(stored)).not.toContain(undefined); // the Admin SDK rejects undefined
    expect(decodeClientStats(stored)).toEqual({
      v: CLIENT_STATS_VERSION,
      key: KEY,
      computedAtMs: NOW,
      dirtyAtMs: null,
      values: VALUES,
    });
  });

  it("decode: not a stats doc → null; junk numbers → zeros; ratio clamped; ISO / Date instants", () => {
    expect(decodeClientStats(undefined)).toBeNull();
    expect(decodeClientStats({ coachId: "a", timezone: "UTC" })).toBeNull();
    const d = decodeClientStats({
      ...KEY,
      v: 1,
      computedAt: "2026-06-17T14:00:00.000Z",
      dirtyAt: new Date(NOW),
      lastWorkoutAt: "nope",
      thisWeekComplianceRatio: 4,
      habitsCompletedThisWeek: -3,
      missedWorkoutsLast7Days: "2",
      hasSomethingAssignedSoon: "yes",
    })!;
    expect(d.computedAtMs).toBe(NOW - 60 * 60 * 1000);
    expect(d.dirtyAtMs).toBe(NOW);
    expect(d.values).toEqual({ ...EMPTY_CLIENT_STATS, thisWeekComplianceRatio: 1 });
  });

  describe("isClientStatsFresh", () => {
    const doc = (patch: Record<string, unknown> = {}) =>
      decodeClientStats({ ...encodeClientStats("c1", KEY, NOW - 1000, VALUES), ...patch });

    it("fresh: same key, recent, never dirtied (or dirtied before computedAt)", () => {
      expect(isClientStatsFresh(doc(), KEY, NOW)).toBe(true);
      expect(isClientStatsFresh(doc({ dirtyAt: FakeTimestamp.fromMillis(NOW - 1001) }), KEY, NOW)).toBe(true);
    });

    it.each([
      ["missing", null],
      ["dirty at computedAt", doc({ dirtyAt: FakeTimestamp.fromMillis(NOW - 1000) })],
      ["dirty after computedAt", doc({ dirtyAt: FakeTimestamp.fromMillis(NOW) })],
      ["other coach", doc({ coachId: "coach-b" })],
      ["other zone", doc({ timezone: "Europe/Madrid" })],
      ["other day", doc({ civilDate: "2026-06-16" })],
      ["old version", doc({ v: CLIENT_STATS_VERSION - 1 })],
      ["at the max age", doc({ computedAt: FakeTimestamp.fromMillis(NOW - CLIENT_STATS_MAX_AGE_MS) })],
      ["from the future", doc({ computedAt: FakeTimestamp.fromMillis(NOW + 5 * 60 * 1000) })],
    ])("stale: %s", (_label, d) => {
      expect(isClientStatsFresh(d, KEY, NOW)).toBe(false);
    });
  });
});

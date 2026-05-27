// __tests__/client-attention.test.ts
//
// Pure-function tests for the inactivity-based attention predicate.
// History: replaces the original P11-06 missed-workouts + compliance suite
// after coach feedback (May 2026) that the combined predicate over-flagged
// the roster. New rule is a single 3-day inactivity threshold.

import {
  clientNeedsAttention,
  NEEDS_ATTENTION_INACTIVITY_HOURS,
} from "../client-attention";

const NOW = Date.UTC(2026, 4, 27, 12, 0, 0); // 2026-05-27T12:00:00Z
const HOUR_MS = 60 * 60 * 1000;

describe("clientNeedsAttention (inactivity ≥ 3 days)", () => {
  it("null lastActivity → needs-attention", () => {
    const r = clientNeedsAttention({ lastActivityAtMs: null, nowMs: NOW });
    expect(r.needsAttention).toBe(true);
    expect(r.reasons).toEqual(["inactive-3-days"]);
  });

  it("activity 1 hour ago → not needs-attention", () => {
    const r = clientNeedsAttention({
      lastActivityAtMs: NOW - 1 * HOUR_MS,
      nowMs: NOW,
    });
    expect(r.needsAttention).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("activity exactly at threshold (just inside) → not needs-attention", () => {
    const r = clientNeedsAttention({
      lastActivityAtMs: NOW - (NEEDS_ATTENTION_INACTIVITY_HOURS - 1) * HOUR_MS,
      nowMs: NOW,
    });
    expect(r.needsAttention).toBe(false);
  });

  it("activity older than threshold → needs-attention", () => {
    const r = clientNeedsAttention({
      lastActivityAtMs: NOW - (NEEDS_ATTENTION_INACTIVITY_HOURS + 1) * HOUR_MS,
      nowMs: NOW,
    });
    expect(r.needsAttention).toBe(true);
    expect(r.reasons).toEqual(["inactive-3-days"]);
  });

  it("threshold constant matches documented value", () => {
    expect(NEEDS_ATTENTION_INACTIVITY_HOURS).toBe(72);
  });
});

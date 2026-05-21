// __tests__/client-attention.test.ts
//
// Pure-function tests for client-attention.ts (Plan 11-06 Task 1 — TDD RED).
//
// Scope: lock the predicate semantics + boundary behavior + reason-string
// contract. The Pattern-B precedent is habit-compliance.test.ts (P06-08).
//
// THRESHOLD LOCKING:
//   T5 (boundary case 0.60 → not needs-attention) + the bonus constants
//   assertion ensure the strict `<` semantics and the literal 2 / 0.6
//   thresholds cannot drift silently. CI fails on any unintended change.
//
// REASON STABILITY:
//   T6 sorts the reasons[] array before comparison so we test the SET
//   (both reasons present) without locking the iteration order; the
//   implementation guarantees stable order (missed-workouts first, then
//   low-compliance) but the test allows either ordering to keep the gate
//   robust to refactors that re-arrange the reason-push order.

import {
  clientNeedsAttention,
  NEEDS_ATTENTION_COMPLIANCE_THRESHOLD,
  NEEDS_ATTENTION_MISSED_WORKOUTS_THRESHOLD,
} from "../client-attention";

describe("clientNeedsAttention (P11-06 — Pattern B pure-function predicate)", () => {
  it("T1: 0 missed + 100% compliance → not needs-attention", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 0,
      complianceRatioLast7Days: 1.0,
    });
    expect(r.needsAttention).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("T2: 1 missed + 100% compliance → not needs-attention (1 < threshold)", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 1,
      complianceRatioLast7Days: 1.0,
    });
    expect(r.needsAttention).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("T3: 2 missed + 100% compliance → needs-attention with reason 'missed-workouts'", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 2,
      complianceRatioLast7Days: 1.0,
    });
    expect(r.needsAttention).toBe(true);
    expect(r.reasons).toEqual(["missed-workouts"]);
  });

  it("T4: 0 missed + 59% compliance → needs-attention with reason 'low-compliance'", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 0,
      complianceRatioLast7Days: 0.59,
    });
    expect(r.needsAttention).toBe(true);
    expect(r.reasons).toEqual(["low-compliance"]);
  });

  it("T5 (boundary): 0 missed + EXACTLY 60% compliance → not needs-attention (strict <)", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 0,
      complianceRatioLast7Days: 0.6,
    });
    expect(r.needsAttention).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("T6: 3 missed + 40% compliance → needs-attention with BOTH reasons", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 3,
      complianceRatioLast7Days: 0.4,
    });
    expect(r.needsAttention).toBe(true);
    // Test the set (both present) without locking iteration order.
    expect([...r.reasons].sort()).toEqual(["low-compliance", "missed-workouts"]);
  });

  it("T7 (vacuous): client with no assigned habits — caller passes 1.0 → not needs-attention", () => {
    const r = clientNeedsAttention({
      missedWorkoutsLast7Days: 0,
      complianceRatioLast7Days: 1.0,
    });
    expect(r.needsAttention).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("T8 (bonus): exported constants match the documented thresholds", () => {
    expect(NEEDS_ATTENTION_MISSED_WORKOUTS_THRESHOLD).toBe(2);
    expect(NEEDS_ATTENTION_COMPLIANCE_THRESHOLD).toBe(0.6);
  });
});

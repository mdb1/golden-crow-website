// __tests__/backfill-series-id.test.ts
//
// Unit tests for the 260522-ki7 Task B backfill script. All 4 behaviors are
// covered:
//
//   T1 — computeGroupKey returns the documented composite key shape.
//   T2 — groupDocsBySeries clusters docs with createdAt 30s apart into the
//        same group, but docs 6min apart into separate groups (5-min bucket).
//   T3 — groupDocsBySeries skips docs that already have seriesId (idempotency).
//   T4 — groupDocsBySeries skips docs without `recurrence` (non-recurring
//        singletons are never grouped).
//
// firebase-admin/firestore is mocked — no live network calls.

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "__SERVER_TIMESTAMP__"),
  },
  Timestamp: {
    now: jest.fn(() => ({ __ts__: 12345 })),
  },
  getFirestore: jest.fn(),
}));

jest.mock("firebase-admin/app", () => ({
  cert: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

import {
  computeGroupKey,
  groupDocsBySeries,
  type AssignmentDocShape,
} from "../backfill-series-id";

// Helper — synthesize a doc shape with a fake createdAt.toMillis().
function makeDoc(
  overrides: Partial<AssignmentDocShape> & { createdAtMs?: number },
): AssignmentDocShape {
  const ms = overrides.createdAtMs ?? 1_700_000_000_000;
  return {
    id: overrides.id ?? "asg-test",
    clientId: overrides.clientId ?? "client-1",
    trainerId: overrides.trainerId ?? "trainer-1",
    templateId: overrides.templateId ?? "tpl-1",
    recurrence: overrides.recurrence === undefined
      ? { kind: "weekly", weekday: 2 }
      : overrides.recurrence,
    seriesId: overrides.seriesId,
    createdAt: { toMillis: () => ms },
  };
}

// ---------------------------------------------------------------------------
// T1 — computeGroupKey returns the documented 5-tuple composite key
// ---------------------------------------------------------------------------

describe("computeGroupKey", () => {
  it("returns ${clientId}|${trainerId}|${templateId}|${weekday}|${floor(ms/300000)} for a valid doc", () => {
    const doc = makeDoc({
      clientId: "client-A",
      trainerId: "trainer-X",
      templateId: "tpl-push",
      recurrence: { kind: "weekly", weekday: 3 },
      createdAtMs: 1_700_000_000_000, // floor(1.7e12 / 3e5) = 5_666_666
    });
    const key = computeGroupKey(doc);
    expect(key).toBe("client-A|trainer-X|tpl-push|3|5666666");
  });

  it("returns null for a doc with no recurrence", () => {
    const doc = makeDoc({ recurrence: null });
    expect(computeGroupKey(doc)).toBeNull();
  });

  it("returns null when recurrence.weekday is not a number", () => {
    const doc = makeDoc({ recurrence: { kind: "weekly", weekday: "tue" } });
    expect(computeGroupKey(doc)).toBeNull();
  });

  it("returns null when createdAt cannot be measured in ms", () => {
    const doc: AssignmentDocShape = {
      id: "asg-bad",
      clientId: "client-1",
      trainerId: "trainer-1",
      templateId: "tpl-1",
      recurrence: { kind: "weekly", weekday: 1 },
      createdAt: null,
    };
    expect(computeGroupKey(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T2 — groupDocsBySeries clusters by 5-min createdAt bucket
// ---------------------------------------------------------------------------

describe("groupDocsBySeries — 5-minute createdAt bucket", () => {
  it("clusters two docs created 30s apart (same (client,trainer,template,weekday)) into ONE group", () => {
    const base = 1_700_000_000_000;
    const docs: AssignmentDocShape[] = [
      makeDoc({ id: "asg-1", createdAtMs: base }),
      makeDoc({ id: "asg-2", createdAtMs: base + 30_000 }), // +30s
    ];
    const groups = groupDocsBySeries(docs);
    expect(groups.size).toBe(1);
    const [members] = [...groups.values()];
    expect(members.map((m) => m.id).sort()).toEqual(["asg-1", "asg-2"]);
  });

  it("splits two docs created 6min apart into TWO groups (bucket boundary)", () => {
    // Pick a base that is at the start of a bucket so +6min crosses to the
    // next bucket reliably.
    const base = 1_700_000_000_000;
    const baseBucket = Math.floor(base / 300_000);
    // Find a time that lands in baseBucket + 1.
    const nextBucketStartMs = (baseBucket + 1) * 300_000;
    const docs: AssignmentDocShape[] = [
      makeDoc({ id: "asg-1", createdAtMs: base }),
      makeDoc({ id: "asg-2", createdAtMs: nextBucketStartMs + 60_000 }), // +1min past next-bucket start
    ];
    const groups = groupDocsBySeries(docs);
    expect(groups.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// T3 — Idempotency: docs that already have seriesId are skipped
// ---------------------------------------------------------------------------

describe("groupDocsBySeries — idempotency", () => {
  it("skips docs that already have seriesId set (so the backfill is a no-op on re-run)", () => {
    const docs: AssignmentDocShape[] = [
      makeDoc({ id: "asg-old", seriesId: "existing-uuid" }),
      makeDoc({ id: "asg-new" }),
    ];
    const groups = groupDocsBySeries(docs);
    expect(groups.size).toBe(1);
    const [members] = [...groups.values()];
    expect(members.map((m) => m.id)).toEqual(["asg-new"]);
  });

  it("returns an empty Map when every doc already has seriesId", () => {
    const docs: AssignmentDocShape[] = [
      makeDoc({ id: "asg-1", seriesId: "uuid-1" }),
      makeDoc({ id: "asg-2", seriesId: "uuid-2" }),
    ];
    const groups = groupDocsBySeries(docs);
    expect(groups.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T4 — Non-recurring docs (no `recurrence` field) are never grouped
// ---------------------------------------------------------------------------

describe("groupDocsBySeries — non-recurring docs are skipped", () => {
  it("skips docs with recurrence == null (singleton assignments never join a series)", () => {
    const docs: AssignmentDocShape[] = [
      makeDoc({ id: "asg-singleton", recurrence: null }),
      makeDoc({ id: "asg-recurring" }),
    ];
    const groups = groupDocsBySeries(docs);
    expect(groups.size).toBe(1);
    const [members] = [...groups.values()];
    expect(members.map((m) => m.id)).toEqual(["asg-recurring"]);
  });
});

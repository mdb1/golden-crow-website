// __tests__/audit-grouping.test.ts
//
// Pure unit tests for the recurring-series collapse used by the admin audit
// timeline. A single coach edit to a recurring workout series re-writes every
// future occurrence; the DB-layer capture emits one audit_log doc per write, so
// the dashboard must collapse them back into one row.

import {
  dateRangeLabel,
  fmtYmd,
  groupRecurringAuditEntries,
  recurringSeries,
  type RawAuditLogEntry,
} from "@/lib/gc-fitness/audit-grouping";

const UUID = "010cc42d-5608-42f1-bd9d-2a150f22cfbc";
const UUID2 = "ea91a182-95d0-4080-b727-65b985fc7bb9";

function raw(over: Partial<RawAuditLogEntry> & { id: string }): RawAuditLogEntry {
  return {
    collection: "workout_assignments",
    docId: `asg-SERIES-20270101-${UUID}`,
    op: "update",
    changedFields: ["templateSnapshot", "updatedAt"],
    changedFieldCount: 2,
    actorUid: null,
    trainerId: "coach1",
    coachId: null,
    clientId: "client1",
    occurredAtISO: "2026-06-15T23:33:17.000Z",
    ...over,
  };
}

describe("recurringSeries", () => {
  it("parses `asg-<root>-<YYYYMMDD>-<uuid>` into root + date", () => {
    expect(
      recurringSeries(`asg-choqBshr7PewXYbns1EKerc8bVk1-20270503-${UUID}`),
    ).toEqual({ root: "asg-choqBshr7PewXYbns1EKerc8bVk1", date: "20270503" });
  });

  it("returns null when there is no trailing date+uuid", () => {
    expect(recurringSeries("asg-choqBshr7PewXYbns1EKerc8bVk1")).toBeNull();
    expect(recurringSeries("ex-7")).toBeNull();
    expect(recurringSeries("client1")).toBeNull();
    // Date but no full UUID → not a recurring occurrence id.
    expect(recurringSeries("asg-abc-20270503-deadbeef")).toBeNull();
  });
});

describe("fmtYmd / dateRangeLabel", () => {
  it("formats a compact date", () => {
    expect(fmtYmd("20270503")).toBe("2027-05-03");
  });

  it("builds a single date or a min→max range", () => {
    expect(dateRangeLabel([])).toBeNull();
    expect(dateRangeLabel(["20270503"])).toBe("2027-05-03");
    expect(dateRangeLabel(["20270503", "20260921", "20271231"])).toBe(
      "2026-09-21 → 2027-12-31",
    );
  });
});

describe("groupRecurringAuditEntries", () => {
  it("collapses same series + op + actor + minute into one group, newest as head", () => {
    const entries = [
      raw({ id: "a", docId: `asg-S1-20270503-${UUID}` }),
      raw({ id: "b", docId: `asg-S1-20270104-${UUID}` }),
      raw({ id: "c", docId: `asg-S1-20261214-${UUID}` }),
    ];
    const groups = groupRecurringAuditEntries(entries);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].head.id).toBe("a"); // newest-first input preserved
    expect(groups[0].root).toBe("asg-S1");
    expect(groups[0].dates.sort()).toEqual(["20261214", "20270104", "20270503"]);
  });

  it("does NOT merge across different series root, op, actor or minute", () => {
    const entries = [
      raw({ id: "root-a", docId: `asg-A-20270101-${UUID}` }),
      raw({ id: "root-b", docId: `asg-B-20270101-${UUID}` }),
      raw({ id: "op", docId: `asg-A-20270202-${UUID}`, op: "create" }),
      raw({ id: "actor", docId: `asg-A-20270303-${UUID}`, trainerId: "coach2" }),
      raw({
        id: "minute",
        docId: `asg-A-20270404-${UUID}`,
        occurredAtISO: "2026-06-15T23:34:17.000Z",
      }),
    ];
    const groups = groupRecurringAuditEntries(entries);
    // Five distinct keys → five standalone groups.
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => g.count === 1)).toBe(true);
    expect(groups.every((g) => g.root === null)).toBe(true);
  });

  it("keeps non-recurring ids and non-assignment collections as standalone rows", () => {
    const entries = [
      raw({ id: "ex", collection: "exercises", docId: "ex-7" }),
      // A recurring-looking id in a different collection must NOT collapse.
      raw({ id: "log1", collection: "workout_logs", docId: `wl-S-20270101-${UUID}` }),
      raw({ id: "log2", collection: "workout_logs", docId: `wl-S-20270102-${UUID}` }),
      raw({ id: "one-off", docId: "asg-plain-no-date" }),
    ];
    const groups = groupRecurringAuditEntries(entries);
    expect(groups).toHaveLength(4);
    expect(groups.every((g) => g.count === 1 && g.root === null)).toBe(true);
  });

  it("collapses a recurring CREATE burst too (not just updates)", () => {
    const entries = [
      raw({ id: "c1", op: "create", docId: `asg-NEW-20270101-${UUID}` }),
      raw({ id: "c2", op: "create", docId: `asg-NEW-20270108-${UUID2}` }),
    ];
    const groups = groupRecurringAuditEntries(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].head.op).toBe("create");
    expect(groups[0].root).toBe("asg-NEW");
  });
});

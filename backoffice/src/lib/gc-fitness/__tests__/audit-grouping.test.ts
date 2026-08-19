// __tests__/audit-grouping.test.ts
//
// Pure unit tests for the recurring-series collapse used by the admin audit
// timeline. A single coach edit to a recurring workout series re-writes every
// future occurrence; the DB-layer capture emits one audit_log doc per write, so
// the dashboard must collapse them back into one row.

import {
  assignmentTemplateId,
  nutritionBulkId,
  dateRangeLabel,
  findRecurrenceEdits,
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

  it("parses a CLIENT-created `…-<date>-self-<uuid>` occurrence id (#671)", () => {
    // Self-assigned ids carry a `self-` marker between the date and the uuid.
    // Missing it left every occurrence of a self-created series as its own row.
    expect(
      recurringSeries(
        "asg-oi1SgX6oBPehdHf7f8B86yqXS0L2-20260821-self-DF2F1298-1535-40FE-9499-DFA0847D02DC",
      ),
    ).toEqual({ root: "asg-oi1SgX6oBPehdHf7f8B86yqXS0L2", date: "20260821" });
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

// ─────────────────────────────────────────────────────────────────────────────
// #697 — two routines swapped between weekdays, and only one showed up
// ─────────────────────────────────────────────────────────────────────────────

/** A self-created occurrence: `asg-<uid>-<YYYYMMDD>-self-<uuid>` (#392). */
function selfOccurrence(
  over: Partial<RawAuditLogEntry> & { id: string; date: string; templateId: string },
): RawAuditLogEntry {
  const { date, templateId, ...rest } = over;
  const snapshot = { templateId, recurrence: { kind: "weekly", weekdays: [5] } };
  return raw({
    docId: `asg-uidClient-${date}-self-${UUID}`,
    op: "create",
    trainerId: "uidClient",
    clientId: "uidClient",
    after: snapshot,
    ...rest,
  });
}

describe("assignmentTemplateId", () => {
  it("reads the routine from either snapshot", () => {
    expect(assignmentTemplateId(raw({ id: "a", after: { templateId: "tpl-1" } }))).toBe("tpl-1");
    expect(assignmentTemplateId(raw({ id: "b", before: { templateId: "tpl-2" } }))).toBe("tpl-2");
    expect(assignmentTemplateId(raw({ id: "c" }))).toBeNull();
  });
});

describe("groupRecurringAuditEntries — #697 different routines, same client", () => {
  /**
   * The reported bug. Every assignment id is `asg-<clientUid>-…`, so the "series
   * root" is the PERSON: two routines edited in the same minute collapsed into
   * one row and only the newest one's name survived — "faltan entries".
   */
  it("keeps two routines of the same client in the same minute apart", () => {
    const groups = groupRecurringAuditEntries([
      selfOccurrence({ id: "1", date: "20270107", templateId: "tpl-pullin" }),
      selfOccurrence({ id: "2", date: "20270108", templateId: "tpl-piernubis" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
  });

  it("still collapses the many occurrences of ONE routine's edit", () => {
    const groups = groupRecurringAuditEntries([
      selfOccurrence({ id: "1", date: "20270107", templateId: "tpl-pullin" }),
      selfOccurrence({ id: "2", date: "20270114", templateId: "tpl-pullin" }),
      selfOccurrence({ id: "3", date: "20270121", templateId: "tpl-pullin" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
  });

  it("falls back to the old client-wide collapse when the routine is unknown", () => {
    // An UPDATE only snapshots the fields that changed, so `templateId` is
    // usually absent. Splitting on "unknown" would explode one edit into a row
    // per occurrence — the exact noise #671 removed.
    const groups = groupRecurringAuditEntries([
      raw({ id: "1", docId: `asg-uidClient-20270107-${UUID}` }),
      raw({ id: "2", docId: `asg-uidClient-20270114-${UUID}` }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});

describe("groupRecurringAuditEntries — #785 a move is always its own row", () => {
  /**
   * The reported bug: a coach moved several workouts and the timeline showed one
   * movement. A move is an UPDATE of `scheduledFor`, so `templateId` is absent
   * from the capture and #697's discriminator cannot fire — every move by the
   * same actor in the same minute merged under the client-wide root, keeping the
   * head's routine name and the head's dates and dropping the rest.
   */
  const move = (id: string, date: string, from: string, to: string) =>
    raw({
      id,
      docId: `asg-uidClient-${date}-${UUID}`,
      changedFields: ["scheduledFor", "updatedAt"],
      changedFieldCount: 2,
      before: { scheduledFor: from },
      after: { scheduledFor: to },
    });

  it("keeps two workouts moved in the same minute apart", () => {
    const groups = groupRecurringAuditEntries([
      move("1", "20270107", "2027-01-07", "2027-01-08"),
      move("2", "20270114", "2027-01-14", "2027-01-15"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
    // Each row keeps its OWN before/after, which is the whole point.
    expect(groups.map((g) => g.head.after?.scheduledFor)).toEqual([
      "2027-01-08",
      "2027-01-15",
    ]);
  });

  it("does not change how a non-move update collapses", () => {
    const groups = groupRecurringAuditEntries([
      raw({ id: "1", docId: `asg-uidClient-20270107-${UUID}` }),
      raw({ id: "2", docId: `asg-uidClient-20270114-${UUID}` }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("leaves creates and deletes of a series collapsed", () => {
    // A delete's capture snapshots every key, `scheduledFor` included — so the
    // move test must key on the OP too, or a recurrence edit's delete batch
    // would explode into one row per occurrence.
    const groups = groupRecurringAuditEntries([
      raw({
        id: "1",
        op: "delete",
        docId: `asg-uidClient-20270107-${UUID}`,
        changedFields: ["scheduledFor", "templateId", "status"],
        before: { scheduledFor: "2027-01-07", templateId: "tpl-a" },
      }),
      raw({
        id: "2",
        op: "delete",
        docId: `asg-uidClient-20270114-${UUID}`,
        changedFields: ["scheduledFor", "templateId", "status"],
        before: { scheduledFor: "2027-01-14", templateId: "tpl-a" },
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});

describe("findRecurrenceEdits", () => {
  const deleted = (id: string, date: string, templateId: string, atISO: string) =>
    raw({
      id,
      docId: `asg-uidClient-${date}-self-${UUID}`,
      op: "delete",
      trainerId: "uidClient",
      clientId: "uidClient",
      occurredAtISO: atISO,
      before: { templateId, recurrence: { kind: "weekly", weekdays: [5] } },
    });
  const created = (id: string, date: string, templateId: string, atISO: string) =>
    selfOccurrence({ id, date, templateId, occurredAtISO: atISO });

  it("pairs the delete batch with the re-expansion of the SAME routine", () => {
    const groups = groupRecurringAuditEntries([
      created("c1", "20270106", "tpl-pullin", "2027-01-02T10:00:05.000Z"),
      deleted("d1", "20270108", "tpl-pullin", "2027-01-02T10:00:01.000Z"),
    ]);
    expect(findRecurrenceEdits(groups)).toEqual([{ createIndex: 0, deleteIndex: 1 }]);
  });

  it("does not pair a delete of a DIFFERENT routine", () => {
    // The ticket's scenario: one routine moved off Friday while another moved
    // onto it. Pairing on the series root alone (= the client) would cross the
    // wires and report each change against the other routine.
    const groups = groupRecurringAuditEntries([
      created("c1", "20270106", "tpl-piernubis", "2027-01-02T10:00:05.000Z"),
      deleted("d1", "20270108", "tpl-pullin", "2027-01-02T10:00:01.000Z"),
    ]);
    expect(findRecurrenceEdits(groups)).toEqual([]);
  });

  it("leaves an automatic horizon top-up alone — it only ever adds", () => {
    const groups = groupRecurringAuditEntries([
      created("c1", "20270106", "tpl-pullin", "2027-01-02T10:00:05.000Z"),
    ]);
    expect(findRecurrenceEdits(groups)).toEqual([]);
  });

  it("does not reach across an unrelated delete minutes away", () => {
    const groups = groupRecurringAuditEntries([
      created("c1", "20270106", "tpl-pullin", "2027-01-02T10:30:00.000Z"),
      deleted("d1", "20270108", "tpl-pullin", "2027-01-02T10:00:00.000Z"),
    ]);
    expect(findRecurrenceEdits(groups)).toEqual([]);
  });

  it("never claims one delete for two creates", () => {
    const groups = groupRecurringAuditEntries([
      created("c1", "20270106", "tpl-pullin", "2027-01-02T10:00:05.000Z"),
      created("c2", "20270106", "tpl-pullin", "2027-01-02T10:00:06.000Z"),
      deleted("d1", "20270108", "tpl-pullin", "2027-01-02T10:00:01.000Z"),
    ]);
    // The two creates land in separate groups only because their ids differ;
    // whichever pairs first owns the delete, and the other stays unpaired.
    const links = findRecurrenceEdits(groups);
    expect(links).toHaveLength(1);
    expect(new Set(links.map((l) => l.deleteIndex)).size).toBe(1);
  });
});

// ── #927 — bulk nutrition assign ────────────────────────────────────────────────────
//
// One click assigns a template to N clients: N `nutrition_plans` creates, N audit rows,
// and — before this — N near-identical "Asignó un plan de nutrición" lines in the admin
// timeline. Unlike the workout collapse above, the key is EXACT (a stamped `bulkId`), so
// none of the #697 / #785 false-merge failure modes can reappear here.

function nutritionRaw(
  over: Partial<RawAuditLogEntry> & { id: string },
): RawAuditLogEntry {
  return raw({
    collection: "nutrition_plans",
    docId: `nut-coach1-${UUID}`,
    op: "create",
    changedFields: ["clientId", "trainerId", "startsOn", "endsOn", "bulkId"],
    changedFieldCount: 5,
    after: { clientId: "client1", startsOn: "2026-09-01", bulkId: "nutbulk-abc" },
    ...over,
  });
}

describe("nutritionBulkId", () => {
  it("reads the stamp off a create", () => {
    expect(nutritionBulkId(nutritionRaw({ id: "a" }))).toBe("nutbulk-abc");
  });

  it("ignores updates — a trim carries no stamp, the rules whitelist forbids it", () => {
    expect(
      nutritionBulkId(
        nutritionRaw({ id: "a", op: "update", after: { endsOn: "2026-08-31" } }),
      ),
    ).toBeNull();
  });

  it("is null for a single assign, which writes no bulkId at all", () => {
    expect(
      nutritionBulkId(nutritionRaw({ id: "a", after: { clientId: "client1" } })),
    ).toBeNull();
  });

  it("is null for any other collection", () => {
    expect(nutritionBulkId(raw({ id: "a", op: "create" }))).toBeNull();
  });
});

describe("groupRecurringAuditEntries — bulk nutrition assign", () => {
  it("folds every client of one bulk into a single group", () => {
    const groups = groupRecurringAuditEntries([
      nutritionRaw({ id: "1", clientId: "ana" }),
      nutritionRaw({ id: "2", clientId: "bruno" }),
      nutritionRaw({ id: "3", clientId: "carla" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.root).toBe("nutbulk-abc");
    // No occurrence DATES: a bulk spans people, not days. The feed spells out the client
    // count instead of a date range.
    expect(groups[0]!.dates).toEqual([]);
  });

  it("groups ACROSS clients — the client is deliberately not part of the key", () => {
    const groups = groupRecurringAuditEntries([
      nutritionRaw({ id: "1", clientId: "ana" }),
      nutritionRaw({ id: "2", clientId: "bruno" }),
    ]);
    expect(groups[0]!.members.map((m) => m.clientId)).toEqual(["ana", "bruno"]);
  });

  it("keeps two different bulks apart", () => {
    const groups = groupRecurringAuditEntries([
      nutritionRaw({ id: "1", clientId: "ana" }),
      nutritionRaw({
        id: "2",
        clientId: "ana",
        after: { clientId: "ana", bulkId: "nutbulk-otro" },
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("never merges two different coaches, even on a colliding bulkId", () => {
    const groups = groupRecurringAuditEntries([
      nutritionRaw({ id: "1", trainerId: "coach1" }),
      nutritionRaw({ id: "2", trainerId: "coach2" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("leaves single assigns and trims as their own rows", () => {
    const groups = groupRecurringAuditEntries([
      nutritionRaw({ id: "1", after: { clientId: "ana" } }),
      nutritionRaw({ id: "2", after: { clientId: "bruno" } }),
      nutritionRaw({ id: "3", op: "update", after: { endsOn: "2026-08-31" } }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });
});

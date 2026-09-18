// moderation-model.test.ts — the pure half of the moderation queue (gc-fitness #1050).

import {
  actionsFor,
  decodeModerationReport,
  groupReportsByTarget,
  moderationGroupKey,
  parseMessageTargetId,
  reportAgeHours,
  slaState,
  type ModerationReport,
} from "@/lib/gc-fitness/moderation-model";

function report(overrides: Partial<ModerationReport> & { id: string }): ModerationReport {
  return {
    reporterUid: "u-rep",
    targetType: "routine",
    targetId: "tpl-1",
    targetOwnerUid: "u-owner",
    reason: "spam",
    note: null,
    status: "open",
    createdAtISO: "2026-09-18T10:00:00.000Z",
    resolvedAtISO: null,
    resolvedBy: null,
    resolution: null,
    ...overrides,
  };
}

describe("groupReportsByTarget", () => {
  it("three reports on one target are ONE row, input order preserved, head newest", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", createdAtISO: "2026-09-18T12:00:00.000Z", reason: "spam" }),
      report({ id: "b", targetId: "tpl-2", createdAtISO: "2026-09-18T11:00:00.000Z" }),
      report({ id: "c", createdAtISO: "2026-09-18T09:00:00.000Z", reason: "harassment" }),
      report({ id: "d", createdAtISO: "2026-09-18T08:00:00.000Z", reason: "spam" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["routine|tpl-1", "routine|tpl-2"]);
    expect(groups[0].reports.map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(groups[0].reasons).toEqual(["spam", "harassment"]);
  });

  it("the SLA clock is the OLDEST open report, and a resolved one does not count", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", createdAtISO: "2026-09-18T12:00:00.000Z" }),
      report({ id: "b", createdAtISO: "2026-09-17T01:00:00.000Z", status: "dismissed" }),
      report({ id: "c", createdAtISO: "2026-09-18T06:00:00.000Z" }),
    ]);
    expect(groups[0].oldestOpenISO).toBe("2026-09-18T06:00:00.000Z");
  });

  it("the key is exact: same id under two target types is two rows", () => {
    const groups = groupReportsByTarget([
      report({ id: "a", targetType: "profile", targetId: "x" }),
      report({ id: "b", targetType: "routine", targetId: "x" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(moderationGroupKey("profile", "x")).toBe("profile|x");
  });
});

describe("slaState", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  it("fresh under 18 h, due-soon from 18 h, breached at 24 h; unknown age is fresh", () => {
    expect(slaState("2026-09-18T11:00:00.000Z", now)).toBe("fresh");
    expect(slaState("2026-09-17T18:00:00.000Z", now)).toBe("due-soon");
    expect(slaState("2026-09-17T12:00:00.000Z", now)).toBe("breached");
    expect(slaState("2026-09-10T12:00:00.000Z", now)).toBe("breached");
    expect(slaState(null, now)).toBe("fresh");
    expect(slaState("garbage", now)).toBe("fresh");
  });
  it("age never goes negative for a clock slightly ahead", () => {
    expect(reportAgeHours("2026-09-18T12:00:05.000Z", now)).toBe(0);
  });
});

describe("actionsFor", () => {
  it("a profile has nothing to hide; everything else offers the three verbs", () => {
    expect(actionsFor("profile")).toEqual(["suspend", "dismiss"]);
    expect(actionsFor("routine")).toEqual(["hide", "suspend", "dismiss"]);
    expect(actionsFor("comment")).toEqual(["hide", "suspend", "dismiss"]);
    expect(actionsFor("message")).toEqual(["hide", "suspend", "dismiss"]);
  });
});

describe("parseMessageTargetId", () => {
  it("is {threadId}/{messageId} and nothing else", () => {
    expect(parseMessageTargetId("a_b/m1")).toEqual({ threadId: "a_b", messageId: "m1" });
    expect(parseMessageTargetId("a_b")).toBeNull();
    expect(parseMessageTargetId("a/b/c")).toBeNull();
    expect(parseMessageTargetId("/m1")).toBeNull();
  });
});

describe("decodeModerationReport", () => {
  const toIso = (v: unknown) => (typeof v === "string" ? v : null);
  it("decodes a full document and folds unknown reason/status to safe values", () => {
    const decoded = decodeModerationReport(
      "r1",
      {
        reporterUid: "u1", targetType: "comment", targetId: "c1", targetOwnerUid: "u2",
        reason: "weird", status: "??", note: "  hola  ", createdAt: "2026-09-18T10:00:00.000Z",
      },
      toIso,
    );
    expect(decoded).toMatchObject({ id: "r1", reason: "other", status: "open", note: "hola", targetOwnerUid: "u2" });
  });
  it("refuses a document the queue cannot show", () => {
    expect(decodeModerationReport("r", { targetType: "video", targetId: "x", reporterUid: "u" }, toIso)).toBeNull();
    expect(decodeModerationReport("r", { targetType: "routine", targetId: "", reporterUid: "u" }, toIso)).toBeNull();
    expect(decodeModerationReport("r", { targetType: "routine", targetId: "x" }, toIso)).toBeNull();
  });
});

// #503 — the audit page URL ⇄ feed filters (shared by the page and the CSV export).
import { auditFeedFilters, auditFeedQuery, parseAuditFeedParams } from "../audit-feed-params";

describe("audit feed params", () => {
  it("reads the form, keeps the cursor and passes the page's zone for the date range", () => {
    const p = parseAuditFeedParams({
      tab: "deletions",
      source: "habit_logs",
      cat: ["habit", "bogus"],
      actor: " ana ",
      from: "2026-11-01",
      to: "2026-11-14",
      raw: "1",
      before: "abc",
    });
    expect(p).toMatchObject({ tab: "deletions", source: "habit_logs", selectedCategories: ["habit"], actorQuery: "ana", before: "abc" });
    expect(auditFeedFilters(p, "America/Argentina/Buenos_Aires")).toMatchObject({
      deletionsOnly: true,
      categories: ["habit"],
      fromISO: "2026-11-01",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  });

  it("an unknown source falls back to all; no boxes = every category", () => {
    const p = parseAuditFeedParams({ source: "nope" });
    expect(p.source).toBe("all");
    expect(auditFeedFilters(p, "UTC").categories).toEqual([]);
  });

  it("builds the next-page link with the same filters and the cursor", () => {
    const p = parseAuditFeedParams({ actor: "ana", cat: "habit" });
    const q = new URLSearchParams(auditFeedQuery(p, { before: "CUR" }));
    expect(q.get("actor")).toBe("ana");
    expect(q.getAll("cat")).toEqual(["habit"]);
    expect(q.get("before")).toBe("CUR");
    expect(new URLSearchParams(auditFeedQuery(p)).has("before")).toBe(false);
  });
});

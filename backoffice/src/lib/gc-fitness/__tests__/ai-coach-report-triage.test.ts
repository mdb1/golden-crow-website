// #504 — Corvo report triage, the pure half.
import {
  decodeReportTriage,
  normalizeReportTriageInput,
  parseReportStateFilter,
  reportStateCounts,
  reportTriageDocId,
} from "../ai-coach-report-triage";

describe("report triage model", () => {
  it("no triage doc is a new report", () => {
    expect(decodeReportTriage(null)).toEqual({ status: "new", note: "", updatedAtISO: null, updatedBy: null });
    expect(decodeReportTriage({ status: "weird" }).status).toBe("new");
  });

  it("decodes a stored triage", () => {
    expect(
      decodeReportTriage({ status: "resolved", note: "ok", updatedAt: new Date("2026-11-14T10:00:00Z"), updatedBy: "a1" }),
    ).toEqual({ status: "resolved", note: "ok", updatedAtISO: "2026-11-14T10:00:00.000Z", updatedBy: "a1" });
  });

  it("validates the form", () => {
    expect(normalizeReportTriageInput({ uid: "u", messageId: "m", status: "reviewed", note: "  n " })).toEqual({
      uid: "u",
      messageId: "m",
      status: "reviewed",
      note: "n",
    });
    expect(() => normalizeReportTriageInput({ uid: "u/x", messageId: "m", status: "new" })).toThrow("Invalid report.");
    expect(() => normalizeReportTriageInput({ uid: "u", messageId: "m", status: "done" })).toThrow("Invalid status.");
    expect(() => normalizeReportTriageInput({ uid: "u", messageId: "m", status: "new", note: "x".repeat(1001) })).toThrow(
      "Note too long.",
    );
  });

  it("the default filter is the queue (new); unknown values fall back to it", () => {
    expect(parseReportStateFilter(undefined)).toBe("new");
    expect(parseReportStateFilter("all")).toBe("all");
    expect(parseReportStateFilter("resolved")).toBe("resolved");
    expect(parseReportStateFilter("bogus")).toBe("new");
  });

  it("new = all − reviewed − resolved, never negative (a triage doc can outlive its report)", () => {
    expect(reportStateCounts(10, 3, 2)).toEqual({ all: 10, new: 5, reviewed: 3, resolved: 2 });
    expect(reportStateCounts(1, 2, 1).new).toBe(0);
  });

  it("one triage doc per report", () => {
    expect(reportTriageDocId("u1", "m1")).toBe("u1_m1");
  });
});

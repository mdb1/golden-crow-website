// ai-coach-admin-model.test.ts — pure shaping behind /gc-fitness/admin/corvo (#1330).
//
// What is pinned: the usage series is zero-filled and the cost is the SERVER's
// estimatedMicroUsd (never re-priced); error rate counts only model failures;
// acceptance = applied / shown with superseded excluded and pending included;
// near-quota uses the tier's own quota; report paths outside ai_coach/*/reports
// are ignored; the context is the previous ≤6 messages in chronological order
// plus the reported one, never anything after it.

import {
  AI_COACH_DAILY_QUOTA,
  buildReportContext,
  buildUsageSeries,
  decodeContextMessage,
  decodeReport,
  decodeThread,
  decodeUsageDay,
  formatMicroUsd,
  formatPercent,
  isNearQuotaCandidate,
  nearQuotaUser,
  parseReportPath,
  resolveAICoachTier,
  sortNearQuota,
  summarizeAcceptance,
  summarizeThreads,
  summarizeUsage,
  totalAcceptance,
  utcDayKeys,
  type ContextMessage,
} from "../ai-coach-admin-model";

describe("utcDayKeys", () => {
  it("returns N UTC days ending today, oldest first", () => {
    const keys = utcDayKeys(new Date("2026-10-12T01:00:00Z"), 3);
    expect(keys).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });
  it("crosses a month boundary", () => {
    expect(utcDayKeys(new Date("2026-03-01T12:00:00Z"), 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });
});

describe("decodeUsageDay / buildUsageSeries", () => {
  it("decodes every field and drops garbage to 0", () => {
    const day = decodeUsageDay("2026-10-11", {
      turns: 10,
      quotaRejections: 2,
      prescreenBlocked: "3",
      errors: { upstream: 1, timeout: 2, bogus: "x" },
      toolCalls: { get_workouts: 4 },
      estimatedMicroUsd: 123456,
      latencyMsTotal: 50_000,
    });
    expect(day.turns).toBe(10);
    expect(day.prescreenBlocked).toBe(0);
    expect(day.errors).toEqual({ upstream: 1, timeout: 2 });
    expect(day.toolCalls).toEqual({ get_workouts: 4 });
    expect(day.estimatedMicroUsd).toBe(123456);
  });

  it("zero-fills missing days and keeps key order", () => {
    const series = buildUsageSeries(["a", "b", "c"], [decodeUsageDay("b", { turns: 4 })]);
    expect(series.map((d) => [d.date, d.turns])).toEqual([
      ["a", 0],
      ["b", 4],
      ["c", 0],
    ]);
  });
});

describe("summarizeUsage", () => {
  const series = [
    decodeUsageDay("2026-10-10", {
      turns: 8,
      quotaRejections: 3,
      prescreenBlocked: 1,
      errors: { upstream: 1, quota: 3, not_eligible: 2 },
      latencyMsTotal: 40_000,
      estimatedMicroUsd: 300_000,
    }),
    decodeUsageDay("2026-10-11", {
      turns: 2,
      errors: { refusal: 1 },
      latencyMsTotal: 10_000,
      estimatedMicroUsd: 200_000,
    }),
  ];

  it("today = the LAST entry; cost is the server's estimate summed, not re-priced", () => {
    const s = summarizeUsage(series);
    expect(s.today.date).toBe("2026-10-11");
    expect(s.costTodayMicroUsd).toBe(200_000);
    expect(s.cost30dMicroUsd).toBe(500_000);
    expect(s.avgCostPerTurnMicroUsd).toBe(50_000);
  });

  it("averages latency over turns", () => {
    expect(summarizeUsage(series).avgLatencyMs).toBe(5000);
  });

  it("error rate counts only model failures (quota / not_eligible never reach the model)", () => {
    const s = summarizeUsage(series);
    expect(s.llmErrors30d).toBe(2);
    expect(s.errorRate).toBeCloseTo(2 / 10);
    expect(s.notEligible30d).toBe(2);
    expect(s.quotaRejections30d).toBe(3);
    expect(s.errorsByCode).toEqual({ upstream: 1, quota: 3, not_eligible: 2, refusal: 1 });
  });

  it("a day of only busy-timeouts (turns 0) caps the rate at 100%", () => {
    const s = summarizeUsage([decodeUsageDay("d", { turns: 0, errors: { timeout: 2 } })]);
    expect(s.errorRate).toBe(1);
  });

  it("no turns → null latency, null rate", () => {
    const s = summarizeUsage([decodeUsageDay("d", {})]);
    expect(s.avgLatencyMs).toBeNull();
    expect(s.errorRate).toBeNull();
    expect(s.avgCostPerTurnMicroUsd).toBeNull();
  });
});

describe("formatters", () => {
  it("formats micro-USD", () => {
    expect(formatMicroUsd(1_234_567)).toBe("US$ 1.23");
    expect(formatMicroUsd(1234)).toBe("US$ 0.0012");
    expect(formatMicroUsd(0)).toBe("US$ 0.00");
  });
  it("formats percents", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.025)).toBe("2.5%");
  });
});

describe("threads", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const ms = (iso: string) => ({ toMillis: () => Date.parse(iso) });

  it("decodes usage and lastMessageAt", () => {
    const th = decodeThread("u1", { lastMessageAt: ms("2026-10-12T10:00:00Z"), usage: { civilDate: "2026-10-12", count: 4 } });
    expect(th).toEqual({ uid: "u1", lastMessageAtMs: Date.parse("2026-10-12T10:00:00Z"), usageCivilDate: "2026-10-12", usageCount: 4 });
    expect(decodeThread("u2", { usage: { civilDate: "bad", count: 3 } }).usageCivilDate).toBeNull();
  });

  it("counts active users by window; a deleted conversation (no lastMessageAt) does not count", () => {
    const threads = [
      decodeThread("a", { lastMessageAt: ms("2026-10-12T11:00:00Z") }),
      decodeThread("b", { lastMessageAt: ms("2026-10-08T11:00:00Z") }),
      decodeThread("c", { lastMessageAt: ms("2026-09-20T11:00:00Z") }),
      decodeThread("d", {}),
    ];
    expect(summarizeThreads(threads, now)).toEqual({ last24h: 1, last7d: 2, last30d: 3 });
  });
});

describe("tier + near quota", () => {
  it("resolveAICoachTier mirrors the server", () => {
    expect(resolveAICoachTier(null)).toBe("free");
    expect(resolveAICoachTier({ entitlement: { tier: "premium" } })).toBe("premium");
    expect(resolveAICoachTier({ entitlement: { tier: "free" } })).toBe("free");
    expect(resolveAICoachTier({ role: "Trainer" })).toBe("premium");
    expect(resolveAICoachTier({ coachId: "  " })).toBe("free");
    expect(resolveAICoachTier({ coachId: "c1" })).toBe("coached");
    // coached wins over a leftover premium entitlement, like the server
    expect(resolveAICoachTier({ coachId: "c1", entitlement: { tier: "premium" } })).toBe("coached");
  });

  it("pre-filters on 80% of the smallest (free) quota", () => {
    expect(AI_COACH_DAILY_QUOTA.free).toBe(5);
    expect(isNearQuotaCandidate(decodeThread("u", { usage: { civilDate: "2026-10-12", count: 3 } }))).toBe(false);
    expect(isNearQuotaCandidate(decodeThread("u", { usage: { civilDate: "2026-10-12", count: 4 } }))).toBe(true);
  });

  it("applies the user's OWN quota: 4/5 free is near, 4/50 premium is not", () => {
    const th = decodeThread("u", { usage: { civilDate: "2026-10-12", count: 4 } });
    expect(nearQuotaUser(th, { email: "a@x.com" })).toMatchObject({ tier: "free", quota: 5, count: 4, reachedQuota: false, email: "a@x.com" });
    expect(nearQuotaUser(th, { entitlement: { tier: "premium" } })).toBeNull();
    const full = decodeThread("p", { usage: { civilDate: "2026-10-12", count: 50 } });
    expect(nearQuotaUser(full, { entitlement: { tier: "premium" } })).toMatchObject({ quota: 50, reachedQuota: true });
    // coached quota is 10: 4 is not near, 8 is
    expect(nearQuotaUser(th, { coachId: "c1" })).toBeNull();
    const coached = decodeThread("c", { usage: { civilDate: "2026-10-12", count: 8 } });
    expect(nearQuotaUser(coached, { coachId: "c1" })).toMatchObject({ tier: "coached", quota: 10, reachedQuota: false });
  });

  it("sorts most recent day first, then fullest", () => {
    const row = (uid: string, civilDate: string, count: number, quota = 5) => ({
      uid, email: null, displayName: null, tier: "free" as const, civilDate, count, quota, reachedQuota: count >= quota,
    });
    const sorted = sortNearQuota([row("a", "2026-10-10", 5), row("b", "2026-10-12", 4), row("c", "2026-10-12", 5)]);
    expect(sorted.map((r) => r.uid)).toEqual(["c", "b", "a"]);
  });
});

describe("summarizeAcceptance", () => {
  const p = (type: string, status: string) => ({ type, status });
  it("rate = applied / shown; superseded is not shown, pending is", () => {
    const rows = summarizeAcceptance([
      p("routine", "applied"),
      p("routine", "dismissed"),
      p("routine", "pending"),
      p("routine", "superseded"),
      p("habit_check", "applied"),
      p("habit_check", "expired"),
    ]);
    const routine = rows.find((r) => r.type === "routine")!;
    expect(routine).toMatchObject({ shown: 3, applied: 1, dismissed: 1, pending: 1, superseded: 1 });
    expect(routine.rate).toBeCloseTo(1 / 3);
    const habit = rows.find((r) => r.type === "habit_check")!;
    expect(habit.rate).toBe(0.5);
    expect(rows[0].type).toBe("routine"); // most shown first
    expect(totalAcceptance(rows)).toEqual({ shown: 5, applied: 2, rate: 2 / 5 });
  });

  it("a type with only superseded proposals has rate null", () => {
    expect(summarizeAcceptance([p("follow", "superseded")])[0]).toMatchObject({ shown: 0, rate: null });
  });
});

describe("reports", () => {
  it("parses only ai_coach/{uid}/reports/{messageId}", () => {
    expect(parseReportPath("ai_coach/u1/reports/m1")).toEqual({ uid: "u1", messageId: "m1" });
    expect(parseReportPath("social_profiles/u1/reports/m1")).toBeNull();
    expect(parseReportPath("ai_coach/u1/messages/m1")).toBeNull();
    expect(parseReportPath("reports/r1")).toBeNull();
  });

  it("decodes the contract; the doc id is the message id; unknown reason → other", () => {
    const r = decodeReport("ai_coach/u1/reports/re-m1", {
      messageId: "something-else",
      reason: "spam",
      note: "x".repeat(600),
      createdAt: new Date("2026-10-11T10:00:00Z"),
      platform: "ios",
      appVersion: "1.7.0",
    })!;
    expect(r.messageId).toBe("re-m1");
    expect(r.reason).toBe("other");
    expect(r.note).toHaveLength(500);
    expect(r.createdAtISO).toBe("2026-10-11T10:00:00.000Z");
    expect(decodeReport("ai_coach/u1/reports/m", { reason: "off_topic" })!.reason).toBe("off_topic");
  });

  it("context = previous ≤6 messages oldest→newest, then the reported one", () => {
    const msg = (id: string): ContextMessage => decodeContextMessage(id, { role: "user", text: id }, "rep");
    const reported = decodeContextMessage("rep", { role: "assistant", text: "bad", status: "done" }, "rep");
    const newestFirst = ["m8", "m7", "m6", "m5", "m4", "m3", "m2"].map(msg);
    const ctx = buildReportContext(reported, newestFirst);
    expect(ctx.map((m) => m.id)).toEqual(["m3", "m4", "m5", "m6", "m7", "m8", "rep"]);
    expect(ctx.filter((m) => m.isReported).map((m) => m.id)).toEqual(["rep"]);
  });
});

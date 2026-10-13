// ai-coach-admin-model.test.ts — pure shaping behind /gc-fitness/admin/corvo (#1330).
//
// What is pinned: the usage series is zero-filled and the cost is the SERVER's
// estimatedMicroUsd (never re-priced); error rate counts only model failures;
// acceptance = applied / shown with superseded excluded and pending included;
// near-quota uses the tier's own quota (#1359: free = lifetime `total`,
// premium/coached = today's `count`, a twin table of the server's quota.test.ts); report paths outside ai_coach/*/reports
// are ignored; the context is the previous ≤6 messages in chronological order
// plus the reported one, never anything after it.

import {
  AI_COACH_QUOTA,
  aiCoachQuotaCheck,
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
  possibleTodayCivilDates,
  readAICoachUsage,
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
    expect(th).toEqual({ uid: "u1", lastMessageAtMs: Date.parse("2026-10-12T10:00:00Z"), usageCivilDate: "2026-10-12", usageCount: 4, usageTotal: 0 });
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

  // `now` = 2026-10-13 15:00 UTC → "today" somewhere is 2026-10-13 or 2026-10-14 (UTC+14).
  const NOW = new Date("2026-10-13T15:00:00Z");
  const TODAY = "2026-10-13";

  it("possibleTodayCivilDates spans UTC−12 … UTC+14", () => {
    expect([...possibleTodayCivilDates(NOW)].sort()).toEqual(["2026-10-13", "2026-10-14"]);
    expect([...possibleTodayCivilDates(new Date("2026-10-13T11:30:00Z"))].sort()).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]);
  });

  it("pre-filter: free total ≥ 8, or today's count ≥ 8 (80% of the smallest daily limit)", () => {
    const th = (usage: Record<string, unknown>) => decodeThread("u", { usage });
    expect(isNearQuotaCandidate(th({ civilDate: TODAY, count: 7, total: 7 }), NOW)).toBe(false);
    expect(isNearQuotaCandidate(th({ civilDate: TODAY, count: 1, total: 8 }), NOW)).toBe(true);
    expect(isNearQuotaCandidate(th({ civilDate: TODAY, count: 8 }), NOW)).toBe(true);
    // an old day's count is not today's
    expect(isNearQuotaCandidate(th({ civilDate: "2026-10-10", count: 14, total: 3 }), NOW)).toBe(false);
  });

  it("free is measured with the LIFETIME total, whatever the day", () => {
    const old = decodeThread("f", { usage: { civilDate: "2026-10-01", count: 2, total: 8 } });
    expect(nearQuotaUser(old, { email: "a@x.com" }, NOW)).toMatchObject({
      tier: "free", kind: "lifetime", used: 8, limit: 10, reachedQuota: false, email: "a@x.com", civilDate: "2026-10-01",
    });
    const full = decodeThread("f", { usage: { civilDate: TODAY, count: 1, total: 10 } });
    expect(nearQuotaUser(full, null, NOW)).toMatchObject({ used: 10, limit: 10, reachedQuota: true });
    // pre-#1359 thread: no total ⇒ 0, even with a big count today
    const legacy = decodeThread("f", { usage: { civilDate: TODAY, count: 9 } });
    expect(nearQuotaUser(legacy, null, NOW)).toBeNull();
  });

  it("premium / coached are measured with TODAY's count; total is ignored", () => {
    const today12 = decodeThread("p", { usage: { civilDate: TODAY, count: 12, total: 400 } });
    expect(nearQuotaUser(today12, { entitlement: { tier: "premium" } }, NOW)).toMatchObject({
      tier: "premium", kind: "daily", used: 12, limit: 15, reachedQuota: false,
    });
    expect(nearQuotaUser(today12, { coachId: "c1" }, NOW)).toMatchObject({ tier: "coached", used: 12, limit: 10, reachedQuota: true });
    const today11 = decodeThread("p", { usage: { civilDate: TODAY, count: 11, total: 400 } });
    expect(nearQuotaUser(today11, { entitlement: { tier: "premium" } }, NOW)).toBeNull(); // 11 < 12
    // a full day that is no longer today does not show
    const yesterday = decodeThread("p", { usage: { civilDate: "2026-10-11", count: 15, total: 15 } });
    expect(nearQuotaUser(yesterday, { entitlement: { tier: "premium" } }, NOW)).toBeNull();
  });

  it("sorts fullest first, then most recent day", () => {
    const row = (uid: string, civilDate: string, used: number, limit = 10) => ({
      uid, email: null, displayName: null, tier: "free" as const, kind: "lifetime" as const,
      civilDate, used, limit, reachedQuota: used >= limit,
    });
    const sorted = sortNearQuota([row("a", "2026-10-10", 10), row("b", "2026-10-12", 8), row("c", "2026-10-12", 10), row("d", "2026-10-13", 12, 15)]);
    expect(sorted.map((r) => r.uid)).toEqual(["c", "a", "d", "b"]); // b and d tie at 80%: newer day first
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Twin table of gc-fitness functions/test/aiCoach/quota.test.ts (#1359). If a case
// changes there, change it here.
// ─────────────────────────────────────────────────────────────────────────────
describe("quota twin (server quota.test.ts)", () => {
  const TODAY = "2026-10-13";
  const readUsage = readAICoachUsage;
  const quotaCheck = aiCoachQuotaCheck;

  it("QUOTA shape: free lifetime 10, premium daily 15, coached daily 10", () => {
    expect(AI_COACH_QUOTA).toEqual({
      free: { kind: "lifetime", limit: 10 },
      premium: { kind: "daily", limit: 15 },
      coached: { kind: "daily", limit: 10 },
    });
  });

  it.each([
    ["today's count + total", { civilDate: TODAY, count: 3, total: 8 }, { dailyUsed: 3, total: 8 }],
    ["another day ⇒ dailyUsed 0, total kept", { civilDate: "2026-10-12", count: 9, total: 8 }, { dailyUsed: 0, total: 8 }],
    ["backfill: missing total ⇒ 0", { civilDate: TODAY, count: 4 }, { dailyUsed: 4, total: 0 }],
    ["backfill: non-numeric total ⇒ 0", { civilDate: TODAY, count: 4, total: "7" }, { dailyUsed: 4, total: 0 }],
    ["backfill: negative total ⇒ 0", { civilDate: TODAY, count: 4, total: -2 }, { dailyUsed: 4, total: 0 }],
    ["no usage (undefined) ⇒ zeros", undefined, { dailyUsed: 0, total: 0 }],
    ["no usage (null) ⇒ zeros", null, { dailyUsed: 0, total: 0 }],
    ["no usage (string) ⇒ zeros", "x", { dailyUsed: 0, total: 0 }],
  ])("readUsage: %s", (_name, raw, expected) => {
    expect(readUsage(raw, TODAY)).toEqual(expected);
  });

  it("free is LIFETIME: boundary 9 → allowed, 10 → refused, whatever today's count is", () => {
    expect(quotaCheck("free", { dailyUsed: 0, total: 9 })).toEqual({ allowed: true, kind: "lifetime", limit: 10, used: 9, remaining: 1 });
    expect(quotaCheck("free", { dailyUsed: 0, total: 10 })).toMatchObject({ allowed: false, used: 10, remaining: 0 });
    expect(quotaCheck("free", { dailyUsed: 0, total: 25 })).toMatchObject({ allowed: false, remaining: 0 });
    expect(quotaCheck("free", readUsage({ civilDate: "2026-10-01", count: 10, total: 10 }, TODAY)).allowed).toBe(false);
  });

  it("free with missing total (pre-#1359 thread) starts at 0 → 10 left", () => {
    expect(quotaCheck("free", readUsage({ civilDate: TODAY, count: 5 }, TODAY))).toMatchObject({ allowed: true, used: 0, remaining: 10 });
  });

  it("premium is DAILY 15: 14 allowed, 15 refused; total is ignored", () => {
    expect(quotaCheck("premium", { dailyUsed: 14, total: 500 })).toEqual({ allowed: true, kind: "daily", limit: 15, used: 14, remaining: 1 });
    expect(quotaCheck("premium", { dailyUsed: 15, total: 15 })).toMatchObject({ allowed: false, remaining: 0 });
    expect(quotaCheck("premium", readUsage({ civilDate: "2026-10-12", count: 15, total: 300 }, TODAY)).allowed).toBe(true);
  });

  it("coached is DAILY 10: 9 allowed, 10 refused; total is ignored", () => {
    expect(quotaCheck("coached", { dailyUsed: 9, total: 999 })).toMatchObject({ allowed: true, kind: "daily", limit: 10, remaining: 1 });
    expect(quotaCheck("coached", { dailyUsed: 10, total: 0 })).toMatchObject({ allowed: false, remaining: 0 });
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

// gc-fitness #1347 — the coach's «Resumen de la semana (IA)» writes its own
// `coachSummary` map into the same day doc. It is summed separately and never
// leaks into Corvo's turns / cost.
describe("coach summaries usage (#1347)", () => {
  test("decoded from the coachSummary map, summed apart from Corvo", () => {
    const yesterday = decodeUsageDay("2026-10-12", {
      turns: 3,
      estimatedMicroUsd: 1000,
      coachSummary: { generated: 2, cacheHits: 1, quotaRejections: 0, errors: { upstream: 1 }, inputTokens: 500, cacheReadInputTokens: 100, outputTokens: 50, estimatedMicroUsd: 4000 },
    });
    const today = decodeUsageDay("2026-10-13", {
      coachSummary: { generated: 1, cacheHits: 3, quotaRejections: 1, errors: { timeout: 1, internal: 2 }, inputTokens: 200, outputTokens: 20, estimatedMicroUsd: 1500 },
    });
    expect(yesterday.coachSummary).toEqual({ generated: 2, cacheHits: 1, quotaRejections: 0, errors: 1, inputTokens: 600, outputTokens: 50, estimatedMicroUsd: 4000 });
    const summary = summarizeUsage([yesterday, today]);
    expect(summary.coachSummaries).toEqual({
      generated: 3,
      generatedToday: 1,
      cacheHits: 4,
      quotaRejections: 1,
      errors: 4,
      inputTokens: 800,
      outputTokens: 70,
      estimatedMicroUsd: 5500,
    });
    // Corvo's numbers are untouched by the coach summaries.
    expect(summary.turns30d).toBe(3);
    expect(summary.cost30dMicroUsd).toBe(1000);
  });

  test("a day without the map is all zeros", () => {
    expect(decodeUsageDay("2026-10-13", {}).coachSummary.generated).toBe(0);
  });
});

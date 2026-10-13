// ai-coach-admin-model.ts — pure data shaping for /gc-fitness/admin/corvo
// (gc-fitness #1330, AI Coach «Corvo»). No Firestore, no I/O: the reader in
// `ai-coach-admin-actions.ts` hands raw doc data in, this module decides what
// it means. Everything here is unit-tested in `__tests__/ai-coach-admin-model.test.ts`.
//
// ## Where each number comes from (server contract, gc-fitness functions/src/aiCoach)
//
//   - `ai_coach_usage/{YYYY-MM-DD UTC}` — ONE global doc per UTC day, written only
//     by the agent function with `FieldValue.increment` (usage.ts). Fields:
//     turns, quotaRejections, prescreenBlocked, errors.{code}, iterations,
//     toolCalls.{tool}, inputTokens, cacheReadInputTokens,
//     cacheCreationInputTokens, outputTokens, latencyMsTotal, estimatedMicroUsd,
//     proposalsCreated, updatedAt. The cost is ALREADY estimated by the server in
//     micro-USD at the current model's list prices — this page never re-prices.
//     The doc has NO per-turn latency and NO per-user data, so:
//       · latency is an AVERAGE (latencyMsTotal / turns); p50/p95 need a server
//         change (a histogram field) and are deliberately not invented here;
//       · "active users" cannot be a per-day series — see `summarizeThreads`.
//   - `ai_coach/{uid}` — the per-user thread doc: `lastMessageAt` (cleared when the
//     user deletes the conversation) and `usage: {civilDate, count, total}` (#1359):
//     `count` = turns on `civilDate` (the user's LAST civil day of use, in THEIR
//     timezone — no history), `total` = turns EVER across tiers (never resets;
//     missing on pre-#1359 threads ⇒ 0).
//   - `ai_coach/{uid}/proposals/{pid}` — `type`, `status`, `createdAt`.
//   - `ai_coach/{uid}/reports/{messageId}` — the "Reportar respuesta" contract
//     (#1330): messageId, reason, note, createdAt, platform, appVersion.
//   - `ai_coach/{uid}/messages/{id}` — role, text, status, errorCode, createdAt.

// ─────────────────────────────────────────────────────────────────────────────
// Collection names — ONE place. The reports subcollection name in particular
// is a contract being finalized on the server; if it changes, change it here.
// ─────────────────────────────────────────────────────────────────────────────

export const AI_COACH_COLLECTION = "ai_coach";
export const AI_COACH_MESSAGES_SUBCOLLECTION = "messages";
export const AI_COACH_PROPOSALS_SUBCOLLECTION = "proposals";
export const AI_COACH_REPORTS_SUBCOLLECTION = "reports";
export const AI_COACH_USAGE_COLLECTION = "ai_coach_usage";

/** Days of history the dashboard reads (usage docs, active threads, proposals). */
export const CORVO_WINDOW_DAYS = 30;
/** Messages shown BEFORE the reported one in the context view. */
export const REPORT_CONTEXT_PREVIOUS_MESSAGES = 6;
/** A user is "near quota" when the counter their tier is measured with reached this share of it. */
export const NEAR_QUOTA_RATIO = 0.8;

export type AICoachQuotaKind = "lifetime" | "daily";

/**
 * Twin of functions/src/aiCoach/config.ts `QUOTA` (#1359):
 *   - `lifetime` (free): counted against `usage.total` — turns EVER, never resets;
 *   - `daily` (premium / coached): counted against `usage.count` of `usage.civilDate`
 *     when that is the user's civil date today.
 * A turn is allowed while used < limit. `coached` (#1331) is the Corvo-only tier for
 * clients with a human coach.
 */
export const AI_COACH_QUOTA = {
  free: { kind: "lifetime", limit: 10 },
  premium: { kind: "daily", limit: 15 },
  coached: { kind: "daily", limit: 10 },
} as const satisfies Record<string, { kind: AICoachQuotaKind; limit: number }>;
export type AICoachTier = keyof typeof AI_COACH_QUOTA;

/** Error codes that mean "the model was called and the turn failed". */
export const LLM_ERROR_CODES = ["upstream", "timeout", "refusal", "internal"] as const;

/** Twin of functions/src/aiCoach/types.ts `AIProposalType` — the types the page has labels for. */
export const AI_PROPOSAL_TYPES = [
  "body_weight",
  "routine",
  "follow",
  "challenge",
  "fork_routine",
  "habit_create",
  "habit_update",
  "habit_check",
  "open_photo_checkin",
  "share_content",
  "share_card",
  "schedule_routine",
  "start_workout",
  "move_workout",
  "nutrition_plan",
  "meal_status",
] as const;
export type AIProposalType = (typeof AI_PROPOSAL_TYPES)[number];

export function isKnownProposalType(raw: string): raw is AIProposalType {
  return (AI_PROPOSAL_TYPES as readonly string[]).includes(raw);
}

export const AI_COACH_REPORT_REASONS = ["incorrect", "inappropriate", "off_topic", "other"] as const;
export type AICoachReportReason = (typeof AI_COACH_REPORT_REASONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Small coercions
// ─────────────────────────────────────────────────────────────────────────────

function num(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function numMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = num(v);
    if (n !== 0) out[k] = n;
  }
  return out;
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/** Firestore Timestamp | Date | ISO string → epoch ms, else null. */
export function toMillis(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: unknown }).toMillis === "function") {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function toIso(raw: unknown): string | null {
  const ms = toMillis(raw);
  return ms === null ? null : new Date(ms).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage (ai_coach_usage)
// ─────────────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" in UTC — the usage doc id. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The `days` UTC day keys ending today, oldest first. */
export function utcDayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(utcDayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  return keys;
}

export interface UsageDay {
  date: string;
  turns: number;
  quotaRejections: number;
  prescreenBlocked: number;
  errors: Record<string, number>;
  iterations: number;
  toolCalls: Record<string, number>;
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  latencyMsTotal: number;
  estimatedMicroUsd: number;
  proposalsCreated: number;
  /** #1347 — the coach's «Resumen de la semana (IA)», same day doc, own map. */
  coachSummary: CoachSummaryUsageDay;
}

/**
 * gc-fitness #1347 — `ai_coach_usage/{day}.coachSummary`, written by the
 * `coachWeeklySummary` callable. Separate from Corvo's counters on purpose:
 * Corvo's totals/cost stay exactly what they were.
 */
export interface CoachSummaryUsageDay {
  generated: number;
  cacheHits: number;
  quotaRejections: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  estimatedMicroUsd: number;
}

export function decodeCoachSummaryUsage(raw: unknown): CoachSummaryUsageDay {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors = Object.values(numMap(d.errors)).reduce((a, b) => a + b, 0);
  return {
    generated: num(d.generated),
    cacheHits: num(d.cacheHits),
    quotaRejections: num(d.quotaRejections),
    errors,
    inputTokens: num(d.inputTokens) + num(d.cacheReadInputTokens) + num(d.cacheCreationInputTokens),
    outputTokens: num(d.outputTokens),
    estimatedMicroUsd: num(d.estimatedMicroUsd),
  };
}

export function emptyUsageDay(date: string): UsageDay {
  return decodeUsageDay(date, {});
}

/** Forgiving decode: a missing / non-numeric field is 0 (the doc is built by increments). */
export function decodeUsageDay(date: string, data: Record<string, unknown>): UsageDay {
  return {
    date,
    turns: num(data.turns),
    quotaRejections: num(data.quotaRejections),
    prescreenBlocked: num(data.prescreenBlocked),
    errors: numMap(data.errors),
    iterations: num(data.iterations),
    toolCalls: numMap(data.toolCalls),
    inputTokens: num(data.inputTokens),
    cacheReadInputTokens: num(data.cacheReadInputTokens),
    cacheCreationInputTokens: num(data.cacheCreationInputTokens),
    outputTokens: num(data.outputTokens),
    latencyMsTotal: num(data.latencyMsTotal),
    estimatedMicroUsd: num(data.estimatedMicroUsd),
    proposalsCreated: num(data.proposalsCreated),
    coachSummary: decodeCoachSummaryUsage(data.coachSummary),
  };
}

/** One entry per key (zero-filled), so the chart has no gaps where nobody talked to Corvo. */
export function buildUsageSeries(keys: string[], days: UsageDay[]): UsageDay[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return keys.map((k) => byDate.get(k) ?? emptyUsageDay(k));
}

/** Turns whose model call failed (quota and not_eligible never reach the model). */
export function llmErrorCount(day: Pick<UsageDay, "errors">): number {
  return LLM_ERROR_CODES.reduce((acc, code) => acc + (day.errors[code] ?? 0), 0);
}

export interface UsageSummary {
  today: UsageDay;
  turns30d: number;
  quotaRejections30d: number;
  prescreenBlocked30d: number;
  notEligible30d: number;
  costTodayMicroUsd: number;
  cost30dMicroUsd: number;
  /** null when there were no turns. */
  avgLatencyMs: number | null;
  /** null when there were no turns. */
  errorRate: number | null;
  llmErrors30d: number;
  errorsByCode: Record<string, number>;
  /** null when there were no turns. */
  avgCostPerTurnMicroUsd: number | null;
  toolCalls30d: Record<string, number>;
  /** #1347 — coach summaries over the window (+ today's count). */
  coachSummaries: CoachSummaryUsageDay & { generatedToday: number };
}

function addMaps(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

/**
 * Totals over the series. `series` is oldest→newest and its LAST entry is today.
 *
 * Error rate = model-call failures / turns. A "busy" timeout is recorded with
 * `turns: 0` + `errors.timeout: 1`, so the denominator is `max(turns, failures)`
 * to keep the rate ≤ 100% on a day that is all timeouts.
 */
export function summarizeUsage(series: UsageDay[]): UsageSummary {
  const today = series.length > 0 ? series[series.length - 1] : emptyUsageDay("");
  let turns = 0;
  let quota = 0;
  let prescreen = 0;
  let cost = 0;
  let latency = 0;
  let llmErrors = 0;
  const errorsByCode: Record<string, number> = {};
  const toolCalls: Record<string, number> = {};
  const coach: CoachSummaryUsageDay = decodeCoachSummaryUsage(null);
  for (const day of series) {
    for (const k of Object.keys(coach) as Array<keyof CoachSummaryUsageDay>) {
      coach[k] += day.coachSummary[k];
    }
    turns += day.turns;
    quota += day.quotaRejections;
    prescreen += day.prescreenBlocked;
    cost += day.estimatedMicroUsd;
    latency += day.latencyMsTotal;
    llmErrors += llmErrorCount(day);
    addMaps(errorsByCode, day.errors);
    addMaps(toolCalls, day.toolCalls);
  }
  const denominator = Math.max(turns, llmErrors);
  return {
    today,
    turns30d: turns,
    quotaRejections30d: quota,
    prescreenBlocked30d: prescreen,
    notEligible30d: errorsByCode.not_eligible ?? 0,
    costTodayMicroUsd: today.estimatedMicroUsd,
    cost30dMicroUsd: cost,
    avgLatencyMs: turns > 0 ? Math.round(latency / turns) : null,
    errorRate: denominator > 0 ? llmErrors / denominator : null,
    llmErrors30d: llmErrors,
    errorsByCode,
    avgCostPerTurnMicroUsd: turns > 0 ? Math.round(cost / turns) : null,
    toolCalls30d: toolCalls,
    coachSummaries: { ...coach, generatedToday: today.coachSummary.generated },
  };
}

/** One chart point per day: what reached Corvo and what it did with it. */
export interface UsageChartPoint {
  date: string;
  turns: number;
  quotaRejections: number;
  prescreenBlocked: number;
  costUsd: number;
}

export function usageChartPoints(series: UsageDay[]): UsageChartPoint[] {
  return series.map((d) => ({
    date: d.date,
    turns: d.turns,
    quotaRejections: d.quotaRejections,
    prescreenBlocked: d.prescreenBlocked,
    costUsd: d.estimatedMicroUsd / 1_000_000,
  }));
}

/** "US$ 0.0123" below a cent, "US$ 1.23" otherwise. */
export function formatMicroUsd(micro: number): string {
  const usd = micro / 1_000_000;
  if (usd !== 0 && Math.abs(usd) < 0.01) return `US$ ${usd.toFixed(4)}`;
  return `US$ ${usd.toFixed(2)}`;
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${(ratio * 100).toFixed(ratio < 0.1 && ratio > 0 ? 1 : 0)}%`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Threads (ai_coach/{uid}) — active users + quota
// ─────────────────────────────────────────────────────────────────────────────

export interface ThreadSummary {
  uid: string;
  lastMessageAtMs: number | null;
  /** `usage.civilDate` — the user's last civil day of use (THEIR timezone). */
  usageCivilDate: string | null;
  /** `usage.count` — turns on `usageCivilDate`. */
  usageCount: number;
  /** `usage.total` — turns ever (missing / non-numeric / negative ⇒ 0). */
  usageTotal: number;
}

/** Twin of the server's quota counter coercion: a positive finite number, floored; else 0. */
function counter(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function decodeThread(uid: string, data: Record<string, unknown>): ThreadSummary {
  const usage = data.usage && typeof data.usage === "object" ? (data.usage as Record<string, unknown>) : {};
  const civilDate = str(usage.civilDate);
  return {
    uid,
    lastMessageAtMs: toMillis(data.lastMessageAt),
    usageCivilDate: /^\d{4}-\d{2}-\d{2}$/.test(civilDate) ? civilDate : null,
    usageCount: counter(usage.count),
    usageTotal: counter(usage.total),
  };
}

export interface ActiveUsers {
  last24h: number;
  last7d: number;
  last30d: number;
}

/**
 * Distinct users by `lastMessageAt`. This is a SNAPSHOT ("who talked to Corvo
 * in the last N days, as of now"), not a per-day series: the server keeps only
 * the last activity per user. A user who deleted the conversation has no
 * `lastMessageAt` and does not count.
 */
export function summarizeThreads(threads: ThreadSummary[], now: Date): ActiveUsers {
  const t = now.getTime();
  const within = (days: number) =>
    threads.filter((th) => th.lastMessageAtMs !== null && th.lastMessageAtMs >= t - days * 86_400_000).length;
  return { last24h: within(1), last7d: within(7), last30d: within(CORVO_WINDOW_DAYS) };
}

/**
 * Twin of functions/src/aiCoach/llm.ts `resolveTier` — which quota applies.
 * Coach/admin role ⇒ premium (never reaches Corvo); non-blank `coachId` ⇒
 * `coached`, checked BEFORE the entitlement; else the entitlement.
 */
export function resolveAICoachTier(userDoc: Record<string, unknown> | null | undefined): AICoachTier {
  if (!userDoc) return "free";
  const role = typeof userDoc.role === "string" ? userDoc.role.trim().toLowerCase() : "";
  if (role === "trainer" || role === "admin") return "premium";
  if (typeof userDoc.coachId === "string" && userDoc.coachId.trim() !== "") return "coached";
  const entitlement = userDoc.entitlement;
  if (entitlement && typeof entitlement === "object" && (entitlement as { tier?: unknown }).tier === "premium") {
    return "premium";
  }
  return "free";
}

// ── Quota (#1359) — twin of functions/src/aiCoach/quota.ts ───────────────────

export interface AICoachUsage {
  /** Turns counted today (0 when the stored `civilDate` is another day). */
  dailyUsed: number;
  /** Turns counted ever (0 when `total` is missing). */
  total: number;
}

/** Twin of the server's `readUsage(raw, civilDate)`. */
export function readAICoachUsage(raw: unknown, civilDate: string): AICoachUsage {
  const usage =
    raw && typeof raw === "object" ? (raw as { civilDate?: unknown; count?: unknown; total?: unknown }) : {};
  return {
    dailyUsed: usage.civilDate === civilDate ? counter(usage.count) : 0,
    total: counter(usage.total),
  };
}

export interface AICoachQuotaCheck {
  allowed: boolean;
  kind: AICoachQuotaKind;
  limit: number;
  /** The counter the tier is measured against (total for lifetime, dailyUsed for daily). */
  used: number;
  remaining: number;
}

/** Twin of the server's `quotaCheck(tier, usage)`. */
export function aiCoachQuotaCheck(tier: AICoachTier, usage: AICoachUsage): AICoachQuotaCheck {
  const rule = AI_COACH_QUOTA[tier];
  const used = rule.kind === "lifetime" ? usage.total : usage.dailyUsed;
  return { allowed: used < rule.limit, kind: rule.kind, limit: rule.limit, used, remaining: Math.max(0, rule.limit - used) };
}

/**
 * The civil dates that are "today" SOMEWHERE right now (UTC−12 … UTC+14). The server
 * stamps `usage.civilDate` in the user's timezone, which the admin can't see (it comes
 * with each request, it is not stored), so a daily counter counts as today's when its
 * date is one of these. Sampling the two extremes and `now` covers every date in the
 * 26 h span.
 */
export function possibleTodayCivilDates(now: Date): Set<string> {
  const t = now.getTime();
  return new Set([utcDayKey(new Date(t - 12 * 3_600_000)), utcDayKey(now), utcDayKey(new Date(t + 14 * 3_600_000))]);
}

/** What the thread's counters mean right now: today's count only if its date can still be today. */
export function threadUsageNow(thread: ThreadSummary, now: Date): AICoachUsage {
  const isToday = thread.usageCivilDate !== null && possibleTodayCivilDates(now).has(thread.usageCivilDate);
  return { dailyUsed: isToday ? thread.usageCount : 0, total: thread.usageTotal };
}

function nearThreshold(limit: number): number {
  return Math.ceil(limit * NEAR_QUOTA_RATIO);
}

/**
 * Cheap pre-filter before reading `/users` (the tier needs the user doc): can this
 * thread be near ANY tier's quota? Lifetime rules look at `total`, daily ones at
 * today's `count`.
 */
export function isNearQuotaCandidate(thread: ThreadSummary, now: Date): boolean {
  const usage = threadUsageNow(thread, now);
  return Object.values(AI_COACH_QUOTA).some((rule) => {
    const used = rule.kind === "lifetime" ? usage.total : usage.dailyUsed;
    return used >= nearThreshold(rule.limit);
  });
}

export interface NearQuotaUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  tier: AICoachTier;
  kind: AICoachQuotaKind;
  /** Last civil day of use (for a daily tier it is today's). */
  civilDate: string | null;
  used: number;
  limit: number;
  reachedQuota: boolean;
}

export function nearQuotaUser(
  thread: ThreadSummary,
  userDoc: Record<string, unknown> | null,
  now: Date,
): NearQuotaUser | null {
  const tier = resolveAICoachTier(userDoc);
  const check = aiCoachQuotaCheck(tier, threadUsageNow(thread, now));
  if (check.used < nearThreshold(check.limit)) return null;
  const email = userDoc ? str(userDoc.email) : "";
  const displayName = userDoc ? str(userDoc.displayName) : "";
  return {
    uid: thread.uid,
    email: email || null,
    displayName: displayName || null,
    tier,
    kind: check.kind,
    civilDate: thread.usageCivilDate,
    used: check.used,
    limit: check.limit,
    reachedQuota: !check.allowed,
  };
}

/** Fullest first, then the most recent day of use. */
export function sortNearQuota(rows: NearQuotaUser[]): NearQuotaUser[] {
  return [...rows].sort((a, b) => {
    const byRatio = b.used / b.limit - a.used / a.limit;
    if (byRatio !== 0) return byRatio;
    const da = a.civilDate ?? "";
    const db = b.civilDate ?? "";
    return da === db ? a.uid.localeCompare(b.uid) : da < db ? 1 : -1;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposals — acceptance by type
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalLite {
  type: string;
  status: string;
}

export function decodeProposal(data: Record<string, unknown>): ProposalLite {
  return { type: str(data.type) || "unknown", status: str(data.status) || "unknown" };
}

export interface AcceptanceRow {
  type: string;
  /** Every proposal created in the window except `superseded` ones (replaced before the user could act). */
  shown: number;
  applied: number;
  dismissed: number;
  failed: number;
  expired: number;
  pending: number;
  superseded: number;
  /** applied / shown; null when nothing was shown. */
  rate: number | null;
}

/**
 * applied / shown per proposal type. `superseded` is excluded from "shown"
 * because the server replaced it with a newer card; `pending` IS shown (the
 * user saw it and hasn't acted), so a young proposal lowers the rate until it
 * resolves or expires (7 days).
 */
export function summarizeAcceptance(proposals: ProposalLite[]): AcceptanceRow[] {
  const byType = new Map<string, AcceptanceRow>();
  for (const p of proposals) {
    let row = byType.get(p.type);
    if (!row) {
      row = { type: p.type, shown: 0, applied: 0, dismissed: 0, failed: 0, expired: 0, pending: 0, superseded: 0, rate: null };
      byType.set(p.type, row);
    }
    switch (p.status) {
      case "applied":
        row.applied += 1;
        break;
      case "dismissed":
        row.dismissed += 1;
        break;
      case "failed":
        row.failed += 1;
        break;
      case "expired":
        row.expired += 1;
        break;
      case "pending":
        row.pending += 1;
        break;
      case "superseded":
        row.superseded += 1;
        continue; // not shown
      default:
        break;
    }
    row.shown += 1;
  }
  const rows = Array.from(byType.values());
  for (const row of rows) row.rate = row.shown > 0 ? row.applied / row.shown : null;
  return rows.sort((a, b) => b.shown - a.shown || a.type.localeCompare(b.type));
}

export function totalAcceptance(rows: AcceptanceRow[]): { shown: number; applied: number; rate: number | null } {
  const shown = rows.reduce((a, r) => a + r.shown, 0);
  const applied = rows.reduce((a, r) => a + r.applied, 0);
  return { shown, applied, rate: shown > 0 ? applied / shown : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports — ai_coach/{uid}/reports/{messageId}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ai_coach/{uid}/reports/{messageId}` → `{uid, messageId}`, or null for a doc
 * in some OTHER `reports` subcollection (a collection-group query sees them all).
 */
export function parseReportPath(path: string): { uid: string; messageId: string } | null {
  const parts = path.split("/");
  if (parts.length !== 4) return null;
  if (parts[0] !== AI_COACH_COLLECTION || parts[2] !== AI_COACH_REPORTS_SUBCOLLECTION) return null;
  if (!parts[1] || !parts[3]) return null;
  return { uid: parts[1], messageId: parts[3] };
}

export interface AICoachReport {
  uid: string;
  messageId: string;
  reason: AICoachReportReason;
  note: string;
  createdAtISO: string | null;
  platform: string;
  appVersion: string;
}

export function isReportReason(raw: unknown): raw is AICoachReportReason {
  return typeof raw === "string" && (AI_COACH_REPORT_REASONS as readonly string[]).includes(raw);
}

export function decodeReport(path: string, data: Record<string, unknown>): AICoachReport | null {
  const parsed = parseReportPath(path);
  if (!parsed) return null;
  return {
    uid: parsed.uid,
    // The doc id IS the message id; the field is a copy.
    messageId: parsed.messageId,
    reason: isReportReason(data.reason) ? data.reason : "other",
    note: str(data.note).slice(0, 500),
    createdAtISO: toIso(data.createdAt),
    platform: str(data.platform),
    appVersion: str(data.appVersion),
  };
}

export interface ContextMessage {
  id: string;
  role: "user" | "assistant" | "unknown";
  text: string;
  status: string;
  errorCode: string | null;
  createdAtISO: string | null;
  isReported: boolean;
}

export function decodeContextMessage(
  id: string,
  data: Record<string, unknown>,
  reportedId: string,
): ContextMessage {
  const role = data.role === "user" || data.role === "assistant" ? data.role : "unknown";
  return {
    id,
    role,
    text: str(data.text),
    status: str(data.status),
    errorCode: str(data.errorCode) || null,
    createdAtISO: toIso(data.createdAt),
    isReported: id === reportedId,
  };
}

/**
 * The context view: up to N previous messages (they arrive newest-first from the
 * query) in chronological order, then the reported one. Never anything after it.
 */
export function buildReportContext(
  reported: ContextMessage,
  previousNewestFirst: ContextMessage[],
  limit: number = REPORT_CONTEXT_PREVIOUS_MESSAGES,
): ContextMessage[] {
  const previous = previousNewestFirst
    .filter((m) => m.id !== reported.id)
    .slice(0, limit)
    .reverse();
  return [...previous, reported];
}

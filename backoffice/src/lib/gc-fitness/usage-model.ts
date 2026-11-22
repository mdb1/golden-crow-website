// usage-model.ts — pure shaping behind /gc-fitness/admin/usage (golden-crow-website#530).
//
// The page reads ONLY `usage_daily/{YYYY-MM-DD}`: one compact rollup per Buenos Aires civil day,
// written by the gc-fitness function `computeUsageDaily` (contract:
// gc-fitness/.planning/schemas/usage_daily.md). Nothing here reads Firestore; everything is
// forgiving (a missing field is 0, a missing day is a zero day) because old days and the
// backfill can be thinner than today's doc.

export const USAGE_RANGES = [7, 30, 90] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];
export const DEFAULT_USAGE_RANGE: UsageRange = 30;

export function parseUsageRange(raw: unknown): UsageRange {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return (USAGE_RANGES as readonly number[]).includes(n) ? (n as UsageRange) : DEFAULT_USAGE_RANGE;
}

export const SEGMENTS = ["coached", "coachless", "guest", "coach"] as const;
export type Segment = (typeof SEGMENTS)[number];
export interface SegmentCounts {
  total: number;
  coached: number;
  coachless: number;
  guest: number;
  coach: number;
}

export type FeatureAudience = "client" | "coach";

/**
 * Twin of `FEATURES` in gc-fitness functions/src/usage/computeUsageDaily.ts (key → audience),
 * plus the family each feature is stacked under in the «uso por feature» chart. A key the
 * server adds later and this table lacks is ignored (never rendered as a raw key).
 */
export const FEATURE_DEFS = {
  workouts_logged: { audience: "client", family: "training" },
  self_routines_created: { audience: "client", family: "training" },
  habits_checked: { audience: "client", family: "habits" },
  meals_marked: { audience: "client", family: "nutrition" },
  self_nutrition_plans: { audience: "client", family: "nutrition" },
  progress_photos: { audience: "client", family: "photos" },
  chat_client: { audience: "client", family: "chat" },
  corvo: { audience: "client", family: "corvo" },
  social_follows: { audience: "client", family: "social" },
  social_posts: { audience: "client", family: "social" },
  social_kudos: { audience: "client", family: "social" },
  social_comments: { audience: "client", family: "social" },
  social_dms: { audience: "client", family: "social" },
  challenge_joins: { audience: "client", family: "social" },
  coach_routines_created: { audience: "coach", family: "coaching" },
  coach_nutrition_plans: { audience: "coach", family: "coaching" },
  chat_coach: { audience: "coach", family: "chat" },
  payments_recorded: { audience: "coach", family: "coaching" },
  plans_assigned: { audience: "coach", family: "coaching" },
  invites: { audience: "coach", family: "coaching" },
  coach_actions: { audience: "coach", family: "coaching" },
} as const satisfies Record<string, { audience: FeatureAudience; family: string }>;
export type FeatureKey = keyof typeof FEATURE_DEFS;
export const FEATURE_KEYS = Object.keys(FEATURE_DEFS) as FeatureKey[];

/** Stack order = categorical slot order (fixed: a family keeps its color in every range). */
export const FEATURE_FAMILIES = ["training", "habits", "nutrition", "corvo", "chat", "social", "photos", "coaching"] as const;
export type FeatureFamily = (typeof FEATURE_FAMILIES)[number];

export const CORVO_TOPICS = [
  "routines",
  "schedule",
  "technique",
  "progress",
  "nutrition",
  "habits",
  "motivation",
  "social",
  "app_help",
  "other",
] as const;
export type CorvoTopic = (typeof CORVO_TOPICS)[number];

export interface FeatureCount {
  events: number;
  users: number;
}

export interface RetentionRow {
  week: string;
  size: number;
  active: number[];
}

export interface UsageDay {
  day: string;
  /** false = no doc for that day (zero-filled). */
  present: boolean;
  actives: SegmentCounts;
  wau: SegmentCounts;
  mau: SegmentCounts;
  signups: SegmentCounts;
  features: Record<FeatureKey, FeatureCount>;
  corvo: {
    userMessages: number;
    replies: number;
    replyErrors: number;
    users: number;
    topics: Record<CorvoTopic, number>;
    ngrams: Array<{ t: string; users: number; n: number }>;
    proposals: { created: number; applied: number; dismissed: number; failed: number; expired: number; superseded: number; pending: number };
    reports: number;
    estimatedMicroUsd: number;
  };
  premium: { purchases: number; renewals: number; cancellations: number; expirations: number };
  retention: RetentionRow[];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function decodeSegments(v: unknown): SegmentCounts {
  const o = obj(v);
  return { total: num(o.total), coached: num(o.coached), coachless: num(o.coachless), guest: num(o.guest), coach: num(o.coach) };
}

export function emptyDay(day: string): UsageDay {
  return decodeUsageDaily(day, {}, false);
}

export function decodeUsageDaily(day: string, raw: Record<string, unknown>, present = true): UsageDay {
  const features = obj(raw.features);
  const corvo = obj(raw.corvo);
  const topics = obj(corvo.topics);
  const proposals = obj(corvo.proposals);
  const premium = obj(raw.premium);
  const retention = obj(raw.retention);
  return {
    day,
    present,
    actives: decodeSegments(raw.actives),
    wau: decodeSegments(raw.wau),
    mau: decodeSegments(raw.mau),
    signups: decodeSegments(raw.signups),
    features: Object.fromEntries(
      FEATURE_KEYS.map((k) => {
        const f = obj(features[k]);
        return [k, { events: num(f.events), users: num(f.users) }];
      }),
    ) as Record<FeatureKey, FeatureCount>,
    corvo: {
      userMessages: num(corvo.userMessages),
      replies: num(corvo.replies),
      replyErrors: num(corvo.replyErrors),
      users: num(corvo.users),
      topics: Object.fromEntries(CORVO_TOPICS.map((t) => [t, num(topics[t])])) as Record<CorvoTopic, number>,
      ngrams: (Array.isArray(corvo.ngrams) ? corvo.ngrams : [])
        .map((g) => obj(g))
        .filter((g) => typeof g.t === "string" && g.t.length > 0)
        .map((g) => ({ t: g.t as string, users: num(g.users), n: num(g.n) })),
      proposals: {
        created: num(proposals.created),
        applied: num(proposals.applied),
        dismissed: num(proposals.dismissed),
        failed: num(proposals.failed),
        expired: num(proposals.expired),
        superseded: num(proposals.superseded),
        pending: num(proposals.pending),
      },
      reports: num(corvo.reports),
      estimatedMicroUsd: num(obj(corvo.cost).estimatedMicroUsd),
    },
    premium: {
      purchases: num(premium.purchases),
      renewals: num(premium.renewals),
      cancellations: num(premium.cancellations),
      expirations: num(premium.expirations),
    },
    retention: (Array.isArray(retention.rows) ? retention.rows : [])
      .map((r) => obj(r))
      .filter((r) => typeof r.week === "string")
      .map((r) => ({
        week: r.week as string,
        size: num(r.size),
        active: (Array.isArray(r.active) ? r.active : []).map(num),
      })),
  };
}

// ── days ──────────────────────────────────────────────────────────────────────────────────────

/** Buenos Aires civil date (UTC-3, no DST) — the rollup's day key. */
export function civilDayBA(at: Date): string {
  return new Date(at.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The `n` days ending at `lastDay` (inclusive), oldest first. */
export function dayKeys(lastDay: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(lastDay, i - (n - 1)));
}

/** The last COMPLETE day: yesterday in Buenos Aires (today's rollup runs tomorrow 03:30). */
export function lastCompleteDay(now: Date): string {
  return addDays(civilDayBA(now), -1);
}

export function zeroFill(keys: string[], days: UsageDay[]): UsageDay[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return keys.map((k) => byDay.get(k) ?? emptyDay(k));
}

// ── summaries ─────────────────────────────────────────────────────────────────────────────────

export interface PeriodTotals {
  daysWithData: number;
  avgDau: number;
  /** WAU / MAU of the LAST day with data in the period. */
  wau: number;
  mau: number;
  signups: number;
  workouts: number;
  corvoMessages: number;
  corvoUserDays: number;
  /** applied / resolved (applied + dismissed + failed + expired); null without resolved proposals. */
  acceptance: number | null;
  premiumPurchases: number;
  /** #541 — the other three RevenueCat counters `computeUsageDaily` already rolls up. */
  premiumRenewals: number;
  premiumCancellations: number;
  premiumExpirations: number;
  reports: number;
}

export function periodTotals(days: UsageDay[]): PeriodTotals {
  const withData = days.filter((d) => d.present);
  const last = withData[withData.length - 1];
  const sum = (f: (d: UsageDay) => number) => days.reduce((acc, d) => acc + f(d), 0);
  const applied = sum((d) => d.corvo.proposals.applied);
  const resolved = sum((d) => d.corvo.proposals.applied + d.corvo.proposals.dismissed + d.corvo.proposals.failed + d.corvo.proposals.expired);
  return {
    daysWithData: withData.length,
    avgDau: withData.length ? withData.reduce((a, d) => a + d.actives.total, 0) / withData.length : 0,
    wau: last?.wau.total ?? 0,
    mau: last?.mau.total ?? 0,
    signups: sum((d) => d.signups.total),
    workouts: sum((d) => d.features.workouts_logged.events),
    corvoMessages: sum((d) => d.corvo.userMessages),
    corvoUserDays: sum((d) => d.corvo.users),
    acceptance: resolved > 0 ? applied / resolved : null,
    premiumPurchases: sum((d) => d.premium.purchases),
    premiumRenewals: sum((d) => d.premium.renewals),
    premiumCancellations: sum((d) => d.premium.cancellations),
    premiumExpirations: sum((d) => d.premium.expirations),
    reports: sum((d) => d.corvo.reports),
  };
}

/** Relative change; null when the previous period has no data or is 0 (no fake «+∞ %»). */
export function delta(current: number | null, previous: number | null, previousHasData: boolean): number | null {
  if (current === null || previous === null || !previousHasData || previous === 0) return null;
  return (current - previous) / previous;
}

export interface AdoptionRow {
  feature: FeatureKey;
  audience: FeatureAudience;
  /** Sum of daily distinct users over the period («user-days»). */
  userDays: number;
  events: number;
  /** userDays / audience active-days: share of the audience's active days that used it. */
  share: number;
}

/**
 * Adoption with daily data only: what share of the audience's ACTIVE DAYS included the
 * feature (Σ feature users per day / Σ audience actives per day). Distinct users across the
 * period would need the uids, which the page never reads.
 */
export function adoptionRanking(days: UsageDay[]): AdoptionRow[] {
  const clientDays = days.reduce((a, d) => a + d.actives.coached + d.actives.coachless + d.actives.guest, 0);
  const coachDays = days.reduce((a, d) => a + d.actives.coach, 0);
  return FEATURE_KEYS.map((feature) => {
    const audience = FEATURE_DEFS[feature].audience;
    const userDays = days.reduce((a, d) => a + d.features[feature].users, 0);
    const events = days.reduce((a, d) => a + d.features[feature].events, 0);
    const denom = audience === "coach" ? coachDays : clientDays;
    return { feature, audience, userDays, events, share: denom > 0 ? Math.min(1, userDays / denom) : 0 };
  }).sort((a, b) => b.share - a.share || b.events - a.events || (a.feature < b.feature ? -1 : 1));
}

export type FamilyPoint = { day: string } & Record<FeatureFamily, number>;

/** Events per family per day (the stacked chart). */
export function familySeries(days: UsageDay[]): FamilyPoint[] {
  return days.map((d) => {
    const point = { day: d.day } as FamilyPoint;
    for (const fam of FEATURE_FAMILIES) point[fam] = 0;
    for (const k of FEATURE_KEYS) point[FEATURE_DEFS[k].family] += d.features[k].events;
    return point;
  });
}

export interface ActivityPoint {
  day: string;
  dau: number;
  wau: number;
  mau: number;
  coached: number;
  coachless: number;
  guest: number;
  coach: number;
}

export function activitySeries(days: UsageDay[]): ActivityPoint[] {
  return days.map((d) => ({
    day: d.day,
    dau: d.actives.total,
    wau: d.wau.total,
    mau: d.mau.total,
    coached: d.actives.coached,
    coachless: d.actives.coachless,
    guest: d.actives.guest,
    coach: d.actives.coach,
  }));
}

export interface CorvoSummary {
  messages: number;
  userDays: number;
  replyErrors: number;
  /** Multi-label: a message can count in several topics; shares are of MESSAGES. */
  topics: Array<{ topic: CorvoTopic; count: number; share: number }>;
  ngrams: Array<{ t: string; users: number; n: number; days: number }>;
  proposals: { created: number; applied: number; dismissed: number; failed: number; expired: number; pending: number };
  acceptance: number | null;
  reports: number;
  estimatedMicroUsd: number;
  daily: Array<{ day: string; messages: number; users: number }>;
}

export function corvoSummary(days: UsageDay[], ngramLimit = 20): CorvoSummary {
  const messages = days.reduce((a, d) => a + d.corvo.userMessages, 0);
  const topics = CORVO_TOPICS.map((topic) => {
    const count = days.reduce((a, d) => a + d.corvo.topics[topic], 0);
    return { topic, count, share: messages > 0 ? count / messages : 0 };
  }).sort((a, b) => b.count - a.count || CORVO_TOPICS.indexOf(a.topic) - CORVO_TOPICS.indexOf(b.topic));
  const grams = new Map<string, { t: string; users: number; n: number; days: number }>();
  for (const d of days) {
    for (const g of d.corvo.ngrams) {
      const row = grams.get(g.t) ?? { t: g.t, users: 0, n: 0, days: 0 };
      row.users += g.users;
      row.n += g.n;
      row.days += 1;
      grams.set(g.t, row);
    }
  }
  const p = { created: 0, applied: 0, dismissed: 0, failed: 0, expired: 0, pending: 0 };
  for (const d of days) {
    p.created += d.corvo.proposals.created;
    p.applied += d.corvo.proposals.applied;
    p.dismissed += d.corvo.proposals.dismissed;
    p.failed += d.corvo.proposals.failed;
    p.expired += d.corvo.proposals.expired;
    p.pending += d.corvo.proposals.pending;
  }
  const resolved = p.applied + p.dismissed + p.failed + p.expired;
  return {
    messages,
    userDays: days.reduce((a, d) => a + d.corvo.users, 0),
    replyErrors: days.reduce((a, d) => a + d.corvo.replyErrors, 0),
    topics,
    ngrams: [...grams.values()]
      .sort((a, b) => b.users - a.users || b.n - a.n || (a.t < b.t ? -1 : 1))
      .slice(0, ngramLimit),
    proposals: p,
    acceptance: resolved > 0 ? p.applied / resolved : null,
    reports: days.reduce((a, d) => a + d.corvo.reports, 0),
    estimatedMicroUsd: days.reduce((a, d) => a + d.corvo.estimatedMicroUsd, 0),
    daily: days.map((d) => ({ day: d.day, messages: d.corvo.userMessages, users: d.corvo.users })),
  };
}

/** Retention table = the LATEST day with data's cohorts (each doc recomputes all 8 weeks). */
export function latestRetention(days: UsageDay[]): { asOf: string; rows: RetentionRow[] } | null {
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].present) return days[i].retention.length ? { asOf: days[i].day, rows: days[i].retention } : null;
  }
  return null;
}

export function formatShare(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

export function formatDelta(v: number | null): string {
  if (v === null) return "—";
  const pct = Math.round(v * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

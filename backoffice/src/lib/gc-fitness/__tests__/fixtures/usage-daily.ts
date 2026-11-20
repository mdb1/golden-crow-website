// Fixture `usage_daily` docs for the usage page tests (golden-crow-website#530).

import { FEATURE_KEYS } from "../../usage-model";

/** A doc exactly as computeUsageDaily writes it (schemaVersion 1). */
export function usageDoc(day: string, o: { dau?: number; workouts?: number; corvo?: number; applied?: number; dismissed?: number } = {}) {
  const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { events: 0, users: 0 }]));
  features.workouts_logged = { events: o.workouts ?? 4, users: 2 };
  features.habits_checked = { events: 6, users: 3 };
  features.payments_recorded = { events: 1, users: 1 };
  features.corvo = { events: o.corvo ?? 5, users: 2 };
  return {
    schemaVersion: 1,
    day,
    timezone: "America/Argentina/Buenos_Aires",
    actives: { total: o.dau ?? 5, coached: 1, coachless: 2, guest: 1, coach: (o.dau ?? 5) - 4 },
    wau: { total: 9, coached: 2, coachless: 4, guest: 1, coach: 2 },
    mau: { total: 20, coached: 5, coachless: 10, guest: 2, coach: 3 },
    signups: { total: 1, coached: 0, coachless: 1, guest: 0, coach: 0 },
    features,
    corvo: {
      userMessages: o.corvo ?? 5,
      replies: 4,
      replyErrors: 1,
      users: 2,
      topics: { routines: 3, schedule: 0, technique: 1, progress: 0, nutrition: 2, habits: 0, motivation: 0, social: 0, app_help: 0, other: 1 },
      topicSource: { tools: 1, keywords: 2, both: 1, none: 1 },
      ngrams: [{ t: "rutina", users: 2, n: 3 }, { t: "rutina piernas", users: 2, n: 2 }],
      proposals: { created: 3, applied: o.applied ?? 2, dismissed: o.dismissed ?? 1, failed: 0, expired: 0, superseded: 0, pending: 0, byType: { routine: 3 } },
      reports: 1,
      cost: { turns: 4, estimatedMicroUsd: 24000, quotaRejections: 0 },
    },
    premium: { purchases: 1, renewals: 0, cancellations: 0, expirations: 0, events: 1 },
    retention: { asOf: day, rows: [{ week: "2026-11-02", size: 4, active: [4, 2, 1] }] },
    computedAt: { _seconds: 0 },
  };
}

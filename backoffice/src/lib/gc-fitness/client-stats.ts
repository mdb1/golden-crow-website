// client-stats.ts
//
// #506 — `client_stats/{clientId}`: the cached per-client numbers of the coach
// roster (/clients) and the dashboard, so a roster load stops running 7
// queries per client (habit logs ×2, photos, habits, assignments ×2, workout
// logs — up to ~300 reads per client) when nothing changed.
//
// WHO WRITES WHAT
//   - The backoffice roster (`listClientsForRoster`, Admin SDK) computes a row
//     the slow way when the cached doc is missing or stale, and writes the
//     result back here (`set` with merge — it NEVER writes `dirtyAt`).
//   - gc-fitness Cloud Functions `clientStatsDirty*` (functions/src/stats/
//     clientStatsDirty.ts) stamp `dirtyAt` = the source write's event time when
//     a workout_log / habit_log / habit / workout_assignment / progress_photo of
//     the client changes. They never compute numbers, so there is no second
//     copy of the compliance math to drift.
//
// WHEN A CACHED DOC IS USED (`isClientStatsFresh`)
//   The numbers depend on WHO is asking (a former coach's plan is not counted,
//   #1504), on the client's civil "today" (7-day and month windows) and on the
//   timezone that "today" was computed in. So a doc is reused only when ALL of:
//     v === CLIENT_STATS_VERSION      (bump it when the math or shape changes)
//     coachId  === the calling coach
//     timezone === the zone the row would use now
//     civilDate === today in that zone
//     computedAt is less than CLIENT_STATS_MAX_AGE_MS old
//     dirtyAt is absent or older than computedAt
//
//   `computedAt` is the instant the roster STARTED reading, not the write time:
//   a source write that lands while the roster is computing has an event time
//   ≥ computedAt, so its `dirtyAt` invalidates the doc we are about to write.
//   The max age is the net for what a trigger can't see (a function that was
//   never deployed, a missed event) and for the one rolling window in the math
//   (workout logs of the last 7×24 h).
//
// What is NOT cached (read live every time, already one query for the whole
// roster or one doc per client): unread chat, billing, nutrition, goals, and
// the attention predicate itself — "inactive for 72 h" moves with the clock,
// so the doc stores the raw last-activity instants and the predicate runs at
// read time.
//
// Plain module (no "use server"): pure helpers + types only.

import { Timestamp } from "firebase-admin/firestore";

/** Bump when the computation or the stored shape changes: old docs recompute. */
// v2 (golden-crow-website#535): + `prevWeekComplianceRatio` (the habit-compliance trend).
export const CLIENT_STATS_VERSION = 2;

/** A cached doc older than this recomputes even when no trigger marked it dirty. */
export const CLIENT_STATS_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** The cacheable part of a roster row. */
export interface ClientStatsValues {
  lastWorkoutAtMs: number | null;
  lastHabitAtMs: number | null;
  lastPhotoAtMs: number | null;
  thisWeekComplianceRatio: number;
  /**
   * #535 — the same compliance over the 7 days BEFORE the current window, so the
   * roster can say "up / down vs last week" instead of a hardcoded arrow. `null`
   * when no habit was scheduled then (a new client): no trend, not "0 → x".
   */
  prevWeekComplianceRatio: number | null;
  habitsCompletedThisWeek: number;
  habitsScheduledThisWeek: number;
  missedWorkoutsLast7Days: number;
  /** #499: past days of the last 7 with a non-completed assignment (today excluded). */
  missedForAttention: number;
  /** #499: a workout or a scheduled habit in [today, today + window − 1]. */
  hasSomethingAssignedSoon: boolean;
  workoutsCompletedThisMonth: number;
  workoutsScheduledThisMonth: number;
}

/** What the cached numbers were computed FOR. */
export interface ClientStatsKey {
  coachId: string;
  timezone: string;
  civilDate: string;
}

export interface ClientStatsDoc {
  v: number;
  key: ClientStatsKey;
  computedAtMs: number | null;
  dirtyAtMs: number | null;
  values: ClientStatsValues;
}

/** Zeros: a pending (mirror) client, who has no data under a real uid yet. */
export const EMPTY_CLIENT_STATS: ClientStatsValues = {
  lastWorkoutAtMs: null,
  lastHabitAtMs: null,
  lastPhotoAtMs: null,
  thisWeekComplianceRatio: 0,
  prevWeekComplianceRatio: null,
  habitsCompletedThisWeek: 0,
  habitsScheduledThisWeek: 0,
  missedWorkoutsLast7Days: 0,
  missedForAttention: 0,
  hasSomethingAssignedSoon: false,
  workoutsCompletedThisMonth: 0,
  workoutsScheduledThisMonth: 0,
};

function toMs(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === "function") {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

const count = (raw: unknown): number =>
  typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

/** Decodes a stored doc; null when it can't be a stats doc at all. */
export function decodeClientStats(data: Record<string, unknown> | undefined): ClientStatsDoc | null {
  if (!data) return null;
  const { coachId, timezone, civilDate } = data;
  if (typeof coachId !== "string" || typeof timezone !== "string" || typeof civilDate !== "string") {
    return null;
  }
  const ratio = typeof data.thisWeekComplianceRatio === "number" ? data.thisWeekComplianceRatio : 0;
  const prev = data.prevWeekComplianceRatio;
  return {
    v: typeof data.v === "number" ? data.v : 0,
    key: { coachId, timezone, civilDate },
    computedAtMs: toMs(data.computedAt),
    dirtyAtMs: toMs(data.dirtyAt),
    values: {
      lastWorkoutAtMs: toMs(data.lastWorkoutAt),
      lastHabitAtMs: toMs(data.lastHabitAt),
      lastPhotoAtMs: toMs(data.lastPhotoAt),
      thisWeekComplianceRatio: Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0,
      prevWeekComplianceRatio:
        typeof prev === "number" && Number.isFinite(prev) ? Math.min(1, Math.max(0, prev)) : null,
      habitsCompletedThisWeek: count(data.habitsCompletedThisWeek),
      habitsScheduledThisWeek: count(data.habitsScheduledThisWeek),
      missedWorkoutsLast7Days: count(data.missedWorkoutsLast7Days),
      missedForAttention: count(data.missedForAttention),
      hasSomethingAssignedSoon: data.hasSomethingAssignedSoon === true,
      workoutsCompletedThisMonth: count(data.workoutsCompletedThisMonth),
      workoutsScheduledThisMonth: count(data.workoutsScheduledThisMonth),
    },
  };
}

/** See the header: every condition must hold for the cached numbers to be reused. */
export function isClientStatsFresh(
  doc: ClientStatsDoc | null | undefined,
  key: ClientStatsKey,
  nowMs: number,
): doc is ClientStatsDoc {
  if (!doc) return false;
  if (doc.v !== CLIENT_STATS_VERSION) return false;
  if (doc.key.coachId !== key.coachId) return false;
  if (doc.key.timezone !== key.timezone) return false;
  if (doc.key.civilDate !== key.civilDate) return false;
  if (doc.computedAtMs === null) return false;
  if (nowMs - doc.computedAtMs >= CLIENT_STATS_MAX_AGE_MS) return false;
  if (doc.computedAtMs > nowMs + 60_000) return false; // a clock from the future is not trusted
  if (doc.dirtyAtMs !== null && doc.dirtyAtMs >= doc.computedAtMs) return false;
  return true;
}

const ts = (ms: number | null) => (ms === null ? null : Timestamp.fromMillis(ms));

/**
 * The stored doc. Deliberately WITHOUT `dirtyAt`: it is written with merge, so a
 * trigger's stamp that landed while we computed survives and wins.
 */
export function encodeClientStats(
  clientId: string,
  key: ClientStatsKey,
  computedAtMs: number,
  values: ClientStatsValues,
): Record<string, unknown> {
  return {
    v: CLIENT_STATS_VERSION,
    clientId,
    coachId: key.coachId,
    timezone: key.timezone,
    civilDate: key.civilDate,
    computedAt: Timestamp.fromMillis(computedAtMs),
    lastWorkoutAt: ts(values.lastWorkoutAtMs),
    lastHabitAt: ts(values.lastHabitAtMs),
    lastPhotoAt: ts(values.lastPhotoAtMs),
    thisWeekComplianceRatio: values.thisWeekComplianceRatio,
    // `?? null`: the Admin SDK rejects `undefined`.
    prevWeekComplianceRatio: values.prevWeekComplianceRatio ?? null,
    habitsCompletedThisWeek: values.habitsCompletedThisWeek,
    habitsScheduledThisWeek: values.habitsScheduledThisWeek,
    missedWorkoutsLast7Days: values.missedWorkoutsLast7Days,
    missedForAttention: values.missedForAttention,
    hasSomethingAssignedSoon: values.hasSomethingAssignedSoon,
    workoutsCompletedThisMonth: values.workoutsCompletedThisMonth,
    workoutsScheduledThisMonth: values.workoutsScheduledThisMonth,
  };
}

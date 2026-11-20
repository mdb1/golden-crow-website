// pr-notifications.ts
//
// The "PRs" feed of /gc-fitness/notifications (moved out of the page, #489).
// Server-only (Admin SDK), but NOT a "use server" module: it is called from the
// Server Component, never from the browser, so it can export sync helpers.
//
// #489 — what changed and why:
//   - The feed used to read `workout_logs where trainerId == uid limit(150)` with NO
//     orderBy: an ARBITRARY 150 logs, so busy coaches missed their newest PRs.
//     It now reads the roster's logs NEWEST FIRST — `clientId in [≤30]` +
//     `orderBy(startedAt desc)` per chunk of 30 clients, served by the deployed
//     `workout_logs (clientId ASC, startedAt DESC)` index (no new index).
//   - Each of the top 10 PR logs used to run ANOTHER query reading up to 200
//     earlier logs of that client to find the record it beat (~2,000 reads per
//     visit). The record beaten is now resolved from the `prs[]` STORED on the
//     logs already fetched (PRs are strictly increasing per exercise, so the
//     newest earlier PR for that exercise is the one beaten). When the earlier
//     PR is outside the window the line simply omits the "(antes …)" suffix.
//   - Scope is unchanged: only logs of the CURRENT roster (#446) whose
//     `trainerId` is this coach (the old query's equality, now in memory).

import type { Firestore } from "firebase-admin/firestore";

import { FirestoreCollections } from "./collections";
import { chunkList } from "./map-in-batches";
import {
  filterPrLogsToRoster,
  flattenLogPRs,
  previousRecordBySetLog,
  type PRSnapshot,
} from "./personal-records";

export type PrNotification = {
  id: string;
  occurredAtISO: string | null;
  clientId: string;
  clientName: string;
  workoutName: string;
  prCount: number;
  detail: string;
  detailItems?: string[];
  workoutHref: string;
  chatHref: string;
};

/** Newest logs read per chunk of 30 roster clients. */
export const PR_FEED_LOGS_PER_CHUNK = 60;
/** PR notifications shown. */
export const PR_FEED_SIZE = 10;
const FIRESTORE_IN_LIMIT = 30;

export interface PrFeedLog {
  id: string;
  data: Record<string, unknown>;
}

/** Reads the roster's newest workout logs (bounded: chunks × PR_FEED_LOGS_PER_CHUNK). */
export async function loadRecentRosterLogs(
  db: Firestore,
  rosterUids: ReadonlySet<string>,
): Promise<PrFeedLog[]> {
  const ids = [...rosterUids].filter((uid) => uid && !uid.startsWith("mirror:")).sort();
  if (ids.length === 0) return [];
  const snaps = await Promise.all(
    chunkList(ids, FIRESTORE_IN_LIMIT).map((chunk) =>
      db
        .collection(FirestoreCollections.workoutLogs)
        .where("clientId", "in", chunk)
        .orderBy("startedAt", "desc")
        .limit(PR_FEED_LOGS_PER_CHUNK)
        .get(),
    ),
  );
  return snaps.flatMap((snap) =>
    snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> })),
  );
}

export async function listRecentPrWorkoutNotifications(
  db: Firestore,
  trainerUid: string,
  rosterUids: ReadonlySet<string>,
  formatPrevious: (value: string) => string,
): Promise<PrNotification[]> {
  const logs = await loadRecentRosterLogs(db, rosterUids);
  return buildPrNotifications(logs, { trainerUid, rosterUids, formatPrevious });
}

/** Pure: newest PR logs → notifications, with the beaten record from stored prs[]. */
export function buildPrNotifications(
  logs: PrFeedLog[],
  opts: {
    trainerUid: string;
    rosterUids: ReadonlySet<string>;
    formatPrevious: (value: string) => string;
  },
): PrNotification[] {
  const rows = filterPrLogsToRoster(
    logs.map((log) => ({ ...log, clientId: log.data.clientId })),
    opts.rosterUids,
  ).filter((row) => row.data.deleted !== true);

  const candidates = rows
    .filter((row) => row.data.trainerId === opts.trainerUid)
    .map((row) => {
      const { id, data } = row;
      const completedAt = toIso(data.completedAt);
      if (data.status !== "completed" && !completedAt) return null;
      const prs = Array.isArray(data.prs)
        ? (data.prs as Array<Record<string, unknown>>)
        : [];
      if (prs.length === 0) return null;
      const clientId = typeof data.clientId === "string" ? data.clientId : "";
      if (!clientId) return null;
      const workoutName = localizedValue(
        (data.templateSnapshot as { name?: unknown } | undefined)?.name,
        "Workout",
      );
      const clientName =
        typeof data.clientName === "string" && data.clientName.trim()
          ? data.clientName.trim()
          : clientId;
      const notification: PrNotification = {
        id: `pr:${id}`,
        occurredAtISO: completedAt ?? toIso(data.updatedAt) ?? toIso(data.startedAt),
        clientId,
        clientName,
        workoutName,
        prCount: prs.length,
        detail: workoutName,
        workoutHref: `/gc-fitness/recent-logs/workouts/${id}`,
        chatHref: `/gc-fitness/chat?chatId=${clientId}`,
      };
      return { notification, data, prs };
    })
    .filter(
      (
        item,
      ): item is {
        notification: PrNotification;
        data: Record<string, unknown>;
        prs: Array<Record<string, unknown>>;
      } => item !== null,
    )
    .sort((a, b) => isoMs(b.notification.occurredAtISO) - isoMs(a.notification.occurredAtISO))
    .slice(0, PR_FEED_SIZE);

  // Every fetched log of the roster (any trainerId — a self-routine PR is still
  // the record a later PR beat) feeds the earlier-PR baseline, per client.
  const logsByClient = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const clientId = row.data.clientId as string;
    (logsByClient.get(clientId) ?? logsByClient.set(clientId, []).get(clientId))!.push(row.data);
  }

  return candidates.map(({ notification, data, prs }) => {
    const thisStartedMs = timestampMs(data.startedAt);
    const earlierPrs = (logsByClient.get(notification.clientId) ?? [])
      .filter((other) => other !== data && timestampMs(other.startedAt) < thisStartedMs)
      .flatMap((other) => flattenLogPRs(other));
    const prevBySetLogId =
      thisStartedMs > 0
        ? previousRecordBySetLog(earlierPrs, flattenLogPRs(data))
        : new Map<string, PRSnapshot>();
    return {
      ...notification,
      detailItems: formatPrDetails(data, prs, prevBySetLogId, opts.formatPrevious),
    };
  });
}

function formatPrDetails(
  data: Record<string, unknown>,
  prs: Array<Record<string, unknown>>,
  prevBySetLogId: Map<string, PRSnapshot>,
  formatPrevious: (value: string) => string,
): string[] {
  const templateExercises =
    (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
      ?.exercises ?? [];
  const exerciseNameById = new Map<string, string>();
  for (const exercise of templateExercises) {
    const exerciseId = typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
    if (!exerciseId) continue;
    exerciseNameById.set(exerciseId, localizedValue(exercise.name, exerciseId));
  }
  const sets = Array.isArray(data.sets)
    ? (data.sets as Array<Record<string, unknown>>)
    : [];
  const setById = new Map<string, Record<string, unknown>>();
  for (const set of sets) {
    const id = typeof set.id === "string" ? set.id : "";
    if (id) setById.set(id, set);
  }

  const details = prs.slice(0, 4).map((pr) => {
    const exerciseId = typeof pr.exerciseId === "string" ? pr.exerciseId : "";
    const setLogId =
      typeof pr.set_log_id === "string"
        ? pr.set_log_id
        : typeof pr.setLogId === "string"
          ? pr.setLogId
          : "";
    const set = setLogId ? setById.get(setLogId) : undefined;
    const name =
      exerciseNameById.get(exerciseId) ??
      (set && typeof set.exerciseId === "string"
        ? exerciseNameById.get(set.exerciseId)
        : undefined) ??
      (exerciseId || "PR");
    // #405 follow-up: append the record this PR beat, mirroring the log-detail
    // "(antes …)" copy — duration PR → "Ns", else "W kg x R".
    const prev = setLogId ? prevBySetLogId.get(setLogId) : undefined;
    let previousSuffix = "";
    if (prev) {
      const prevValue =
        prev.durationSeconds !== null && prev.durationSeconds > 0
          ? `${prev.durationSeconds}s`
          : `${formatKg(prev.weightKg)} x ${Math.round(prev.reps)}`;
      previousSuffix = ` ${formatPrevious(prevValue)}`;
    }
    const durationSeconds = numeric(pr.duration_seconds ?? pr.durationSeconds);
    if (durationSeconds !== null && durationSeconds > 0) {
      return `${name}: ${formatDuration(durationSeconds)}${previousSuffix}`;
    }
    const weight = numeric(pr.weight_kg ?? pr.weightKg ?? set?.weight_kg ?? set?.weight);
    const reps = numeric(pr.reps ?? set?.reps);
    const estimatedOneRM = numeric(pr.estimated_one_rm ?? pr.estimatedOneRM);
    const performance =
      weight !== null && reps !== null
        ? `${formatKg(weight)} x ${Math.round(reps)}`
        : weight !== null
          ? formatKg(weight)
          : reps !== null
            ? `${Math.round(reps)} reps`
            : "";
    const oneRm = estimatedOneRM !== null && estimatedOneRM > 0
      ? ` (${formatKg(estimatedOneRM)} 1RM)`
      : "";
    return `${name}${performance ? `: ${performance}` : ""}${oneRm}${previousSuffix}`;
  });
  const remaining = prs.length - details.length;
  if (remaining > 0) {
    details.push(`+${remaining} PRs`);
  }
  return details;
}

function formatKg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} kg`;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  if (rest === 0) return `${minutes}m`;
  return `${minutes}m ${rest}s`;
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "number") {
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function localizedValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.es === "string" && localized.es.trim()) {
      return localized.es.trim();
    }
    if (typeof localized.en === "string" && localized.en.trim()) {
      return localized.en.trim();
    }
  }
  return fallback;
}

function isoMs(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function timestampMs(value: unknown): number {
  const iso = toIso(value);
  return iso ? isoMs(iso) : 0;
}

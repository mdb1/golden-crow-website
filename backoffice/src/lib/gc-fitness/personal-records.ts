// personal-records.ts — PURE grouping logic for a client's personal records
// (issue #405). No Firestore / no React here so it is unit-testable; the server
// action (personal-records-actions.ts) does the I/O and feeds these functions.
//
// PRs live as a `prs[]` array on each workout_logs doc (there is no separate
// collection). PRDetector only appends a PR when it strictly beats the previous
// best for that exercise, so an exercise's PRs form a strictly-increasing
// sequence over time — the newest PR is the current record and the one before
// it is the "previous PR" the coach wants to see (issue #405 part a).

export type PRMetric = "reps" | "time";

/** One raw PR row flattened from a workout_logs `prs[]` entry. */
export interface RawPersonalRecord {
  exerciseId: string;
  weightKg: number;
  reps: number;
  estimatedOneRM: number;
  /** Present (seconds) only for time-based PRs (plank, wall-sit); else null. */
  durationSeconds: number | null;
  setLogId: string;
  /** Epoch ms when the PR was achieved, or null when the doc lacks a date. */
  achievedAtMs: number | null;
}

/** A single record snapshot (current or previous). */
export interface PRSnapshot {
  weightKg: number;
  reps: number;
  estimatedOneRM: number;
  durationSeconds: number | null;
  achievedAtMs: number | null;
}

/** Metadata for an exercise, resolved from the logs + exercise docs. */
export interface PRExerciseMeta {
  name: string;
  muscleGroups: string[];
  /** How many of the client's sessions logged this exercise — drives the
   * "most common" ordering in the UI. */
  sessionCount: number;
}

/** The current PR for one exercise plus the record it beat (if any). */
export interface PersonalRecordEntry {
  exerciseId: string;
  exerciseName: string;
  muscleGroups: string[];
  sessionCount: number;
  metric: PRMetric;
  current: PRSnapshot;
  /** The record the current PR beat — null when this is the first PR. */
  previous: PRSnapshot | null;
}

function prToMs(v: unknown): number | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function prNumeric(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Flattens one workout_logs `prs[]` array into RawPersonalRecord rows, resolving
 * each PR's achieved-at (falling back to the log's completedAt/startedAt). Pure
 * (duck-typed Firestore Timestamp via `.toDate()`) so both the server action and
 * the workout-log detail builder can reuse it (issue #405).
 */
export function flattenLogPRs(logData: Record<string, unknown>): RawPersonalRecord[] {
  const rawPrs = Array.isArray(logData.prs)
    ? (logData.prs as Array<Record<string, unknown>>)
    : [];
  if (rawPrs.length === 0) return [];
  const logFallbackMs = prToMs(logData.completedAt) ?? prToMs(logData.startedAt);
  const out: RawPersonalRecord[] = [];
  for (const pr of rawPrs) {
    const exerciseId = typeof pr.exerciseId === "string" ? pr.exerciseId : "";
    const setLogId =
      typeof pr.set_log_id === "string"
        ? pr.set_log_id
        : typeof pr.setLogId === "string"
          ? pr.setLogId
          : "";
    if (!exerciseId || !setLogId) continue;
    const durationRaw = pr.duration_seconds ?? pr.durationSeconds;
    const durationSeconds =
      typeof durationRaw === "number" && durationRaw > 0 ? durationRaw : null;
    out.push({
      exerciseId,
      weightKg: prNumeric(pr.weight_kg ?? pr.weightKg),
      reps: prNumeric(pr.reps),
      estimatedOneRM: prNumeric(pr.estimated_one_rm ?? pr.estimatedOneRM),
      durationSeconds,
      setLogId,
      achievedAtMs: prToMs(pr.achieved_at ?? pr.achievedAt) ?? logFallbackMs,
    });
  }
  return out;
}

/**
 * Keeps only rows that belong to a client on the coach's CURRENT roster
 * (issue #446). `workout_logs.trainerId` is stamped at log-creation time and is
 * never updated when a client is transferred to another coach, so any
 * `trainerId == coach` query keeps returning the transferred client's
 * historical logs to the FORMER coach. The current `users/{uid}.coachId`
 * (i.e. roster membership via listClients()) is the only valid visibility
 * scope — apply this filter to every coach-facing read built on a stale
 * trainerId query. Rows with a missing/empty/non-string clientId are dropped.
 */
export function filterPrLogsToRoster<T extends { clientId?: unknown }>(
  rows: T[],
  rosterUids: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) =>
      typeof row.clientId === "string" &&
      row.clientId.length > 0 &&
      rosterUids.has(row.clientId),
  );
}

function metricOf(pr: { durationSeconds: number | null }): PRMetric {
  return pr.durationSeconds != null && pr.durationSeconds > 0 ? "time" : "reps";
}

/** Sort magnitude for a PR — duration for time PRs, else Epley e1RM. */
function magnitude(pr: RawPersonalRecord): number {
  return metricOf(pr) === "time" ? pr.durationSeconds ?? 0 : pr.estimatedOneRM;
}

function toSnapshot(pr: RawPersonalRecord): PRSnapshot {
  return {
    weightKg: pr.weightKg,
    reps: pr.reps,
    estimatedOneRM: pr.estimatedOneRM,
    durationSeconds: pr.durationSeconds,
    achievedAtMs: pr.achievedAtMs,
  };
}

/**
 * Groups raw PRs by exercise and returns, per exercise, the current record and
 * the one it beat. Within an exercise, PRs are ordered oldest→newest by
 * `achievedAtMs` (falling back to magnitude when a date is missing), so the
 * last entry is the current record and the second-to-last is "previous".
 *
 * The returned list is ordered most-recent-PR first; callers (the client UI)
 * re-sort for the "most common" view and filter by muscle group.
 */
export function buildPersonalRecords(
  prs: RawPersonalRecord[],
  meta: Map<string, PRExerciseMeta>,
): PersonalRecordEntry[] {
  const byExercise = new Map<string, RawPersonalRecord[]>();
  for (const pr of prs) {
    if (!pr.exerciseId || !pr.setLogId) continue;
    const list = byExercise.get(pr.exerciseId);
    if (list) list.push(pr);
    else byExercise.set(pr.exerciseId, [pr]);
  }

  const entries: PersonalRecordEntry[] = [];
  for (const [exerciseId, list] of byExercise) {
    // Oldest → newest. Primary key is the achieved date; magnitude is the
    // tiebreaker (and the fallback when dates are missing on legacy docs).
    const sorted = [...list].sort((a, b) => {
      const ta = a.achievedAtMs ?? Number.NEGATIVE_INFINITY;
      const tb = b.achievedAtMs ?? Number.NEGATIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return magnitude(a) - magnitude(b);
    });
    // Dedupe identical setLogId (a log read more than once) — keep first.
    const seen = new Set<string>();
    const deduped = sorted.filter((pr) => {
      if (seen.has(pr.setLogId)) return false;
      seen.add(pr.setLogId);
      return true;
    });
    if (deduped.length === 0) continue;

    const currentPr = deduped[deduped.length - 1]!;
    const previousPr = deduped.length >= 2 ? deduped[deduped.length - 2]! : null;
    const m = meta.get(exerciseId);
    entries.push({
      exerciseId,
      exerciseName: m?.name ?? exerciseId,
      muscleGroups: m?.muscleGroups ?? [],
      sessionCount: m?.sessionCount ?? 0,
      metric: metricOf(currentPr),
      current: toSnapshot(currentPr),
      previous: previousPr ? toSnapshot(previousPr) : null,
    });
  }

  // Default order: most recently set PR first (nulls last).
  entries.sort((a, b) => {
    const ta = a.current.achievedAtMs ?? Number.NEGATIVE_INFINITY;
    const tb = b.current.achievedAtMs ?? Number.NEGATIVE_INFINITY;
    if (ta !== tb) return tb - ta;
    return a.exerciseName.localeCompare(b.exerciseName);
  });
  return entries;
}

/**
 * The previous PR (the record it beat) for each of `exerciseIds`, given the raw
 * PRs from logs that came BEFORE the log in question. Returns the latest PR per
 * exercise (max `achievedAtMs`, magnitude tiebreak) — that is the record the
 * new PR beat. Used by the workout-log detail view (issue #405 part a).
 */
export function previousRecordsByExercise(
  earlierPrs: RawPersonalRecord[],
  exerciseIds: Set<string>,
): Map<string, PRSnapshot> {
  const best = new Map<string, RawPersonalRecord>();
  for (const pr of earlierPrs) {
    if (!exerciseIds.has(pr.exerciseId) || !pr.setLogId) continue;
    const cur = best.get(pr.exerciseId);
    if (!cur) {
      best.set(pr.exerciseId, pr);
      continue;
    }
    const ta = pr.achievedAtMs ?? Number.NEGATIVE_INFINITY;
    const tc = cur.achievedAtMs ?? Number.NEGATIVE_INFINITY;
    if (ta > tc || (ta === tc && magnitude(pr) > magnitude(cur))) {
      best.set(pr.exerciseId, pr);
    }
  }
  const out = new Map<string, PRSnapshot>();
  for (const [exId, pr] of best) out.set(exId, toSnapshot(pr));
  return out;
}

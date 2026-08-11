// workout-heart-rate.ts — the BPM series for a finished workout.
//
// Written by the client's app at finish (iOS `WorkoutHeartRateRepository`) to
// `workout_logs/{logId}/metrics/heartRate`. Read here so the coach sees the
// shape of the session, not just the sets.
//
// THE NUMBERS ARE STORED, NOT DERIVED FROM THE POINTS. The app thins the series
// to at most 300 samples before uploading, and thinning averages within buckets
// — so a 178 bpm spike can be DRAWN at 126 while still being the real peak.
// Recomputing min/max/avg from `samples` here would quietly under-report exactly
// the moment a coach is looking for. The chart shows the stored aggregates
// beside the line for that reason; see the iOS twin
// `GCFitnessCore.HeartRateSeriesBuffer` for the writer's half.
//
// A workout with no series is the COMMON case (most sessions are logged without
// a watch), so absence resolves to `null` and the section hides itself rather
// than framing an empty chart on every workout.

import type { Firestore } from "firebase-admin/firestore";

import { FirestoreCollections } from "./collections";

/** Subcollection under `workout_logs/{logId}`. */
export const WORKOUT_LOG_METRICS_SUBCOLLECTION = "metrics";

/** The one metrics document the apps write today. */
export const HEART_RATE_METRIC_ID = "heartRate";

export interface HeartRateSample {
  /** Seconds from the workout's `startedAt` — the chart's x-axis. */
  offsetSeconds: number;
  bpm: number;
}

export interface WorkoutHeartRateSeries {
  samples: HeartRateSample[];
  minBpm: number;
  maxBpm: number;
  avgBpm: number;
}

function wholeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Project the raw metrics doc into a chartable series.
 *
 * Pure, so every guard is testable without Firestore. Returns `null` for a
 * missing doc, a malformed one, or one whose samples are all unusable — all of
 * which mean the same thing to the UI ("this workout has no heart rate"), and
 * none of which should render a chart.
 */
export function projectHeartRateSeries(
  data: Record<string, unknown> | undefined | null,
): WorkoutHeartRateSeries | null {
  if (!data) return null;

  const rawSamples = Array.isArray(data.samples) ? data.samples : [];
  const samples: HeartRateSample[] = [];
  for (const raw of rawSamples) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const offsetSeconds = wholeNumber(entry.offsetSeconds);
    const bpm = wholeNumber(entry.bpm);
    // A non-positive BPM is a sensor dropout, not a reading; charting it drags
    // the line to the floor between two real values. A negative offset has no
    // place on the axis.
    if (offsetSeconds === null || offsetSeconds < 0) continue;
    if (bpm === null || bpm <= 0) continue;
    samples.push({ offsetSeconds, bpm });
  }
  if (samples.length === 0) return null;

  // Sorted here rather than trusted: a chart whose x-axis doubles back on
  // itself draws a scribble, and the cost of being sure is one sort of ≤300.
  samples.sort((a, b) => a.offsetSeconds - b.offsetSeconds);

  // Stored aggregates win — see the file header. The fallback to the drawn
  // points is for a legacy/partial doc only, and it under-reports by exactly
  // the amount thinning smoothed away.
  const bpms = samples.map((s) => s.bpm);
  const minBpm = wholeNumber(data.minBpm) ?? Math.min(...bpms);
  const maxBpm = wholeNumber(data.maxBpm) ?? Math.max(...bpms);
  const avgBpm =
    wholeNumber(data.avgBpm) ??
    Math.round(bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length);

  return { samples, minBpm, maxBpm, avgBpm };
}

/**
 * Read a finished workout's heart-rate series.
 *
 * Fail-soft: one extra point read on a single-workout page, and a chart must
 * never take the page down. Callers get `null` and hide the section.
 */
export async function getWorkoutHeartRateSeries(
  db: Firestore,
  workoutLogId: string,
): Promise<WorkoutHeartRateSeries | null> {
  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .doc(workoutLogId)
    .collection(WORKOUT_LOG_METRICS_SUBCOLLECTION)
    .doc(HEART_RATE_METRIC_ID)
    .get()
    .catch(() => null);
  if (!snap?.exists) return null;
  return projectHeartRateSeries(snap.data());
}

// daily-steps.ts — the wire contract for a client's daily step count.
//
// STATE OF PLAY (2026-08-11): NOTHING WRITES THIS YET.
//
// iOS already reads daily steps — `HealthKitStepsReader.dailySteps(...)` feeds
// the Progress tab — but it reads them ON THE DEVICE and never leaves them
// there, so the coach has no way to see a number the client is already looking
// at. Android is in the same position via Health Connect.
//
// This module defines where those numbers land so the two app writers (a
// separate PR each, both needing on-device verification) have a contract to
// write against instead of inventing one per platform:
//
//   /users/{uid}/daily_steps/{civilDate}
//     civilDate : "YYYY-MM-DD" — the client's LOCAL day, same convention as
//                 habit_logs.civilDate. Doubles as the doc id, so a re-sync of
//                 the same day overwrites instead of appending.
//     steps     : number, whole steps for that local day
//     updatedAt : server timestamp of the last sync
//
// Doc-id-is-the-date is the load-bearing choice: HealthKit's count for TODAY
// changes all day, so a sync is an upsert, not an append. An auto-id collection
// would accumulate a dozen partial rows per day and the chart would have to
// guess which one is the real total.
//
// Until a writer ships, `listDailySteps` returns [] and the chart says so
// plainly — see DailyStepsWidget. It does NOT draw a flat zero line, which
// would read as "this client doesn't walk".

import type { Firestore } from "firebase-admin/firestore";

import { FirestoreCollections } from "./collections";

/** Subcollection under /users/{uid}. */
export const DAILY_STEPS_SUBCOLLECTION = "daily_steps";

export interface DailyStepPoint {
  /** Client-local civil date, "YYYY-MM-DD". */
  date: string;
  steps: number;
}

/**
 * Project raw docs into chart points.
 *
 * Pure, so the guards are testable without Firestore. A row survives only with
 * a well-formed civil date and a finite, non-negative whole step count — a
 * malformed sync must drop its own row, never distort the axis of the others.
 */
export function projectDailySteps(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): DailyStepPoint[] {
  const byDate = new Map<string, number>();
  for (const doc of docs) {
    const data = doc.data();
    const date =
      typeof data.civilDate === "string" && isCivilDate(data.civilDate)
        ? data.civilDate
        : isCivilDate(doc.id)
          ? doc.id
          : null;
    if (!date) continue;
    const raw = data.steps;
    const steps = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(steps) || steps < 0) continue;
    // A same-day duplicate can only come from a doc whose id and `civilDate`
    // disagree; keep the larger count, since a partial-day sync is the one that
    // undercounts.
    byDate.set(date, Math.max(byDate.get(date) ?? 0, Math.round(steps)));
  }
  return Array.from(byDate, ([date, steps]) => ({ date, steps })).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

function isCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Read a client's step history from `windowStart` (inclusive) onward.
 *
 * Bounded by both the date filter and a hard limit. Fail-soft: a chart must
 * never take the profile down, and today it is expected to come back empty.
 */
export async function listDailySteps(
  db: Firestore,
  clientId: string,
  windowStart: string,
  limit = 400,
): Promise<DailyStepPoint[]> {
  const snap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .collection(DAILY_STEPS_SUBCOLLECTION)
    .where("civilDate", ">=", windowStart)
    .orderBy("civilDate", "desc")
    .limit(limit)
    .get()
    .catch(() => null);
  return snap ? projectDailySteps(snap.docs) : [];
}

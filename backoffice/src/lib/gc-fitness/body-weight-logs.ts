// body-weight-logs.ts
// The single server-side read of `/users/{uid}/body_weight_logs`, lifted out of
// `BodyWeightTrendChart` (#919) so the nutrition surface can put the SAME points behind
// the phase table it draws under the same chart.
//
// SERVER ONLY — imports `firebase-admin` through `gcFitnessFirestore`. Never import this
// from a `"use client"` module: it will not bundle and it leaks service-account creds.
// The pure math that consumes these points lives in `nutrition-compliance.ts`.
//
// Why it matters that there is exactly one loader: the chart and the "Δ peso" column of
// the phase table have to be the same measurements. Two readers with slightly different
// plausibility filters would draw a line through a point the table refuses to count, and
// a coach would see a drop on the chart that the table calls "—".

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { civilDateFormat } from "./civil-date";
import { FirestoreCollections } from "./collections";

export interface BodyWeightPoint {
  /** Civil date `YYYY-MM-DD` of the MEASUREMENT (not `createdAt`). */
  date: string;
  weight: number;
}

export const BODY_WEIGHT_LOOKBACK_DAYS = 365;

/** Bound on the read — one weigh-in a day for a year is well under this. */
const MAX_WEIGHT_LOGS = 500;

/**
 * Guardrail for corrupted entries (e.g. a 25 kg mistap on an adult profile) so one bad
 * point cannot flatten the whole chart — or invent a −57 kg phase delta.
 */
function isPlausibleWeightKg(weight: number): boolean {
  return weight >= 35 && weight <= 300;
}

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * The client's weigh-ins over the last year, one point per measurement date (latest
 * wins), sorted ascending BY MEASUREMENT DATE.
 *
 * Sorting by the record's date rather than its creation order is what makes a backfilled
 * entry sort into its real position instead of jumping to the front and posing as the
 * latest weight.
 *
 * Body weight lives in its OWN collection: the legacy `habits (type == "weight")` path is
 * gone, since habits became binary-only.
 *
 * Trust: callers gate ownership upstream (page guard + Firestore rules). This function
 * does not re-check — it is not reachable from the client.
 */
export async function loadBodyWeightPoints(
  clientId: string,
  timezone: string,
): Promise<BodyWeightPoint[]> {
  const windowStart = new Date(
    Date.now() - BODY_WEIGHT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .collection("body_weight_logs")
    .orderBy("recordedAt", "asc")
    .limit(MAX_WEIGHT_LOGS)
    .get()
    .catch(() => null);

  const points = (snap?.docs ?? [])
    .map((doc) => {
      const data = doc.data() as { valueKg?: unknown; recordedAt?: unknown };
      const weight = typeof data.valueKg === "number" ? data.valueKg : null;
      const date = toDate(data.recordedAt);
      if (weight === null || !date) return null;
      if (!isPlausibleWeightKg(weight)) return null;
      if (date < windowStart) return null;
      return { date: civilDateFormat(date, timezone), weight };
    })
    .filter((point): point is BodyWeightPoint => point !== null);

  const byDate = new Map<string, number>();
  for (const point of points) byDate.set(point.date, point.weight);
  return Array.from(byDate.entries())
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

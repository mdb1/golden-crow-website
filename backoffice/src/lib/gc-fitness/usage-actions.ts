"use server";

// usage-actions.ts — the reader behind /gc-fitness/admin/usage (golden-crow-website#530).
// Admin-only; every export is async (a sync export in a "use server" file passes jest and
// breaks `next build` — #785). All shaping lives in the pure `usage-model.ts`.
//
// ## Reads per page view (Firestore cost)
//
//   ≤ 2 × range docs of `usage_daily` (the period + the previous one, for the deltas):
//   ≤ 180 reads at 90 days, ONE doc-id range query. Never the source collections — the
//   gc-fitness function `computeUsageDaily` rolls them up once a day (03:30 Buenos Aires).
//
// `usage_actives` (the server-only uids) is never read here.

import { FieldPath } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentAdmin } from "./auth-helpers";
import { dayKeys, decodeUsageDaily, lastCompleteDay, type UsageDay, type UsageRange } from "./usage-model";

// NOT exported: a "use server" file may only export async functions (#785).
const USAGE_DAILY_COLLECTION = "usage_daily";

export interface UsageDashboardData {
  range: UsageRange;
  lastDay: string;
  /** Days of the selected period, oldest first (only days that HAVE a doc). */
  current: UsageDay[];
  /** The same number of days right before it. */
  previous: UsageDay[];
  generatedAtISO: string;
}

export async function loadUsageDashboard(range: UsageRange): Promise<UsageDashboardData> {
  await getCurrentAdmin();
  const now = new Date();
  const lastDay = lastCompleteDay(now);
  const keys = dayKeys(lastDay, range * 2);
  const snap = await gcFitnessFirestore()
    .collection(USAGE_DAILY_COLLECTION)
    .where(FieldPath.documentId(), ">=", keys[0])
    .where(FieldPath.documentId(), "<=", keys[keys.length - 1])
    .get();
  const days = snap.docs
    .map((d) => decodeUsageDaily(d.id, (d.data() ?? {}) as Record<string, unknown>))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  const firstCurrent = keys[range];
  return {
    range,
    lastDay,
    current: days.filter((d) => d.day >= firstCurrent),
    previous: days.filter((d) => d.day < firstCurrent),
    generatedAtISO: now.toISOString(),
  };
}

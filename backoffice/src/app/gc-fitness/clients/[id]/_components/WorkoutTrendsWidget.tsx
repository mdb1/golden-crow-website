// WorkoutTrendsWidget.tsx — Per-client workout frequency with a time-range
// selector (All time / 90d / 30d / 7d). Async React Server Component.
//
// Replaces RecentWorkoutsWidget (recent sessions now live in the calendar /
// daily timeline). Surfaces how hard a client is hitting their training:
// a bar chart of sessions-per-bucket (daily for ≤30d, weekly beyond) plus
// summary stats — total workouts, completed sets, and tonnage (kg) — for
// the selected range.
//
// Query budget: 1 read (workout_logs where clientId == X and startedAt >=
// today-365 orderBy startedAt asc, limit 500). Each log is reduced to a
// lightweight point { date, sets, volumeKg } before crossing to the client
// so the heavy sets[] arrays never ship to the browser.
//
// Volume = Σ (weight_kg × reps) over COMPLETED, non-warmup sets — the same
// tonnage definition the iOS WorkoutProgressCharts uses. A session counts
// as a workout when it has a completedAt stamp or at least one completed set
// (so abandoned/empty drafts don't inflate frequency).

import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import { addCivilDays } from "./trend-range";
import {
  WorkoutTrendsClient,
  type WorkoutTrendPoint,
} from "./WorkoutTrendsClient";

export interface WorkoutTrendsWidgetProps {
  clientId: string;
  timezone: string;
}

const MAX_LOOKBACK_DAYS = 365;

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function numeric(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function WorkoutTrendsWidget({
  clientId,
  timezone,
}: WorkoutTrendsWidgetProps) {
  const t = await getTranslations("clients.detail.workoutTrends");
  const db = gcFitnessFirestore();

  const today = civilDateFormat(new Date(), timezone);
  const windowStartDate = new Date(
    Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  // orderBy desc (not asc) reuses the same (clientId, startedAt DESC)
  // composite index the previous recent-workouts widget relied on — a
  // range filter on the orderBy field needs no new index. Point order is
  // irrelevant downstream: the client re-buckets purely by civil date.
  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("clientId", "==", clientId)
    .where("startedAt", ">=", windowStartDate)
    .orderBy("startedAt", "desc")
    .limit(500)
    .get();

  const points: WorkoutTrendPoint[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const startedAt = toDate(data.startedAt) ?? toDate(data.createdAt);
    if (!startedAt) continue;

    const rawSets = Array.isArray(data.sets)
      ? (data.sets as Array<Record<string, unknown>>)
      : [];
    let completedSets = 0;
    let volumeKg = 0;
    for (const s of rawSets) {
      const done = Boolean(s.completed_at ?? s.completedAt);
      if (!done) continue;
      completedSets += 1;
      // #565 — every set type contributes to volume (warm-up / failure /
      // drop set alike); `set_type` / `is_warmup` are display markers only.
      volumeKg += numeric(s.weight_kg ?? s.weight) * numeric(s.reps);
    }

    const completedAt = toDate(data.completedAt);
    // Count only sessions that actually happened — a stamped completion or
    // at least one completed set. Drops empty/abandoned drafts.
    if (!completedAt && completedSets === 0) continue;

    points.push({
      date: civilDateFormat(startedAt, timezone),
      sets: completedSets,
      volumeKg: Math.round(volumeKg),
    });
  }

  // Anchor every range to today so empty trailing days still render in the
  // bar chart (a gap reads as "no training", not a missing bucket).
  const rangeStarts = {
    all: addCivilDays(today, -(MAX_LOOKBACK_DAYS - 1)),
    "90": addCivilDays(today, -89),
    "30": addCivilDays(today, -29),
    "7": addCivilDays(today, -6),
  };

  return (
    <WorkoutTrendsClient
      points={points}
      today={today}
      rangeStarts={rangeStarts}
      labels={{
        title: t("title"),
        empty: t("empty"),
        statWorkouts: t("statWorkouts"),
        statSets: t("statSets"),
        statVolume: t("statVolume"),
        volumeUnit: t("volumeUnit"),
        barLabel: t("barLabel"),
        ranges: {
          all: t("rangeAll"),
          "90": t("range90"),
          "30": t("range30"),
          "7": t("range7"),
        },
      }}
    />
  );
}

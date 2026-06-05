// BodyWeightTrendChart.tsx — body-weight area chart with a time-range
// selector (All time / 90d / 30d / 7d). Async React Server Component.
//
// Charting uses recharts (already a backoffice dependency for the workout /
// habit trend widgets); the interactive shell lives in
// BodyWeightTrendChartClient so range-toggling stays instant on the client.
//
// Empty state mirrors the iOS P07-07 "Add a body-weight habit" CTA
// but as a server-side copy line.
//
// Query budget:
//   1) users/{uid}/body_weight_logs orderBy recordedAt ASC, limit 500.
// A single 365-day window read feeds every range; the client filters by
// civil date, so toggling ranges costs zero extra Firestore reads (matches
// the WorkoutTrendsWidget / HabitTrendsWidget pattern). Body weight lives in
// its OWN dedicated collection; the legacy `habits` (type == "weight")
// fallback was removed when habits became binary-only.
//
// Trust: the parent page's ownership gate guarantees the trainer owns
// this client; Firestore rules (P02-11) also enforce. The chart never
// renders raw HTML from any user-controlled field — civil-date strings
// land inside recharts axis/tooltip labels (React auto-escaped), so
// T-11-07-CHART-INJECTION is closed by construction.

import { getTranslations } from "next-intl/server";

import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { addCivilDays } from "./trend-range";
import { BodyWeightTrendChartClient } from "./BodyWeightTrendChartClient";

export interface BodyWeightTrendChartProps {
  clientId: string;
  timezone: string;
}

interface WeightPoint {
  /** civilDate string YYYY-MM-DD (the measurement date, not createdAt) */
  date: string;
  /** weight value (unit-agnostic — see note below) */
  weight: number;
}

const MAX_LOOKBACK_DAYS = 365;

function isPlausibleWeightKg(weight: number): boolean {
  // Guardrail for corrupted entries (ex: 25kg accidental log in adult profile)
  // so one bad point doesn't flatten the whole chart.
  return weight >= 35 && weight <= 300;
}

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

export async function BodyWeightTrendChart({
  clientId,
  timezone,
}: BodyWeightTrendChartProps) {
  const t = await getTranslations("clients.detail.bodyWeightChart");
  const db = gcFitnessFirestore();

  const today = civilDateFormat(new Date(), timezone);
  const windowStartDate = new Date(
    Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  // SOLE source for this widget: /users/{uid}/body_weight_logs. Body weight
  // is no longer a habit type — there is no `habits (type == "weight")`
  // fallback. One 365-day window read feeds all ranges.
  const directWeightLogsSnap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .collection("body_weight_logs")
    .orderBy("recordedAt", "asc")
    .limit(500)
    .get()
    .catch(() => null);

  const unitLabel = "kg";
  let points: WeightPoint[] = (directWeightLogsSnap?.docs ?? [])
    .map((d) => {
      const data = d.data() as {
        valueKg?: unknown;
        recordedAt?: unknown;
      };
      const weight = typeof data.valueKg === "number" ? data.valueKg : null;
      const date = toDate(data.recordedAt);
      if (weight === null || !date) return null;
      if (!isPlausibleWeightKg(weight)) return null;
      if (date < windowStartDate) return null;
      return { date: civilDateFormat(date, timezone), weight };
    })
    .filter((p): p is WeightPoint => p !== null);

  // Keep one point per measurement date (latest wins) to avoid overplot noise,
  // then sort by the record's DATE so "latest" means the most recent
  // measurement, not the last-created row (C2). A backfilled old entry sorts
  // back into its real position instead of jumping to the front.
  const byDate = new Map<string, number>();
  for (const p of points) byDate.set(p.date, p.weight);
  points = Array.from(byDate.entries())
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return (
      <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("noLogs")}</p>
      </section>
    );
  }

  // Anchor every range to today so the client can filter by civil date.
  const rangeStarts = {
    all: addCivilDays(today, -(MAX_LOOKBACK_DAYS - 1)),
    "90": addCivilDays(today, -89),
    "30": addCivilDays(today, -29),
    "7": addCivilDays(today, -6),
  };

  return (
    <BodyWeightTrendChartClient
      data={points}
      today={today}
      rangeStarts={rangeStarts}
      unitLabel={unitLabel}
      labels={{
        title: t("title"),
        noLogs: t("noLogs"),
        latestPrefix: t("latestPrefix"),
        logCount: t("logCount", { count: points.length }),
        weightTooltip: t("weightTooltip"),
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

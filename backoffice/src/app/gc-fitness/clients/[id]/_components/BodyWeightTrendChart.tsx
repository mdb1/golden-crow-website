// BodyWeightTrendChart.tsx — 30-day body-weight inline-SVG line chart.
// Async React Server Component.
//
// Pattern D — inline-SVG chart precedent from ComplianceSparkline.tsx
// (P06-08). NO recharts / @tanstack/react-charts — neither is in the
// backoffice dependency graph and we explicitly avoid adding a chart
// library for one widget. The 30-point dataset fits comfortably in
// hand-rolled <path>/<line>/<circle> elements.
//
// Empty state mirrors the iOS P07-07 "Add a body-weight habit" CTA
// but as a server-side redirect link instead of a button.
//
// Query budget:
//   1) users/{uid}/body_weight_logs orderBy recordedAt ASC, limit 180.
// Body weight lives in its OWN dedicated collection; the legacy
// `habits` (type == "weight") fallback was removed when habits became
// binary-only.
//
// Trust: the parent page's ownership gate guarantees the trainer owns
// this client; Firestore rules (P02-11) also enforce. The chart never
// renders raw HTML from any user-controlled field — civil-date strings
// land inside <title> elements (SVG title, React auto-escaped), so
// T-11-07-CHART-INJECTION is closed by construction.

import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { BodyWeightTrendChartClient } from "./BodyWeightTrendChartClient";

export interface BodyWeightTrendChartProps {
  clientId: string;
  timezone: string;
}

interface WeightPoint {
  /** civilDate string YYYY-MM-DD */
  date: string;
  /** weight value (unit-agnostic — see note below) */
  weight: number;
}

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
}: BodyWeightTrendChartProps) {
  const t = await getTranslations("clients.detail.bodyWeightChart");
  const db = gcFitnessFirestore();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // SOLE source for this widget: /users/{uid}/body_weight_logs. Body weight
  // is no longer a habit type — there is no `habits (type == "weight")`
  // fallback.
  const directWeightLogsSnap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .collection("body_weight_logs")
    .orderBy("recordedAt", "asc")
    .limit(180)
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
      if (date < thirtyDaysAgo) return null;
      return { date: date.toISOString().slice(0, 10), weight };
    })
    .filter((p): p is WeightPoint => p !== null);

  // Keep one point per day (latest wins) to avoid overplot noise.
  const byDate = new Map<string, number>();
  for (const p of points) byDate.set(p.date, p.weight);
  points = Array.from(byDate.entries())
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return (
      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("noLogs")}</p>
      </section>
    );
  }

  const latest = points[points.length - 1];
  const delta =
    points.length > 1 ? latest.weight - points[0].weight : null;
  const deltaStr =
    delta !== null
      ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`
      : null;

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-1 font-medium">{t("title")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("latestPrefix")}{" "}
        <span className="font-medium tabular-nums text-foreground">
          {latest.weight} {unitLabel}
        </span>
        {deltaStr !== null ? (
          <span
            className={
              (delta ?? 0) >= 0
                ? "ml-2 text-amber-600"
                : "ml-2 text-emerald-600"
            }
          >
            ({deltaStr} {unitLabel})
          </span>
        ) : null}
        {" · "}
        {points.length === 1
          ? t("logSingular", { count: points.length })
          : t("logPlural", { count: points.length })}
      </p>
      <BodyWeightTrendChartClient data={points} unitLabel={unitLabel} />
    </section>
  );
}

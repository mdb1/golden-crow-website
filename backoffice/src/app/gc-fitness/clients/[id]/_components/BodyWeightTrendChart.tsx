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
//   1) habits where (clientId, type == "weight", deleted == false) — N=1-2
//   2) habit_logs where (habitId IN <habitIds>, loggedAt >= 30 days ago)
//      orderBy loggedAt ASC
// Firestore caps the `in` operator at 30 values; we expect 1-2 weight
// habits per client so this is comfortably safe.
//
// Trust: the parent page's ownership gate guarantees the trainer owns
// this client; Firestore rules (P02-11) also enforce. The chart never
// renders raw HTML from any user-controlled field — civil-date strings
// land inside <title> elements (SVG title, React auto-escaped), so
// T-11-07-CHART-INJECTION is closed by construction.

import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

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

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const PADDING_X = 20;
const PADDING_Y = 20;

export async function BodyWeightTrendChart({
  clientId,
}: BodyWeightTrendChartProps) {
  const t = await getTranslations("clients.detail.bodyWeightChart");
  const db = gcFitnessFirestore();

  // Find the client's weight habit(s). The 11-05 aggregator filters out
  // soft-deleted habits at the query layer; we mirror that here so a
  // deleted weight habit doesn't poison the inline chart.
  const habitsSnap = await db
    .collection(FirestoreCollections.habits)
    .where("clientId", "==", clientId)
    .where("type", "==", "weight")
    .where("deleted", "==", false)
    .get();

  if (habitsSnap.empty) {
    return (
      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("noHabit")}</p>
        <Link
          href={`/gc-fitness/habits/new?clientId=${clientId}&type=weight`}
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          {t("assignHabit")}
        </Link>
      </section>
    );
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const habitIds = habitsSnap.docs.map((d) => d.id);

  // Pull the habit unit hint (kg vs lb) from the first weight habit
  // for the label. The habit schema stores `unit?` as a free-form
  // string; default to kg when unset (matches the schema's documented
  // default for the `weight` type).
  const firstHabit = habitsSnap.docs[0]?.data() as { unit?: string } | undefined;
  const unitLabel =
    typeof firstHabit?.unit === "string" && firstHabit.unit.length > 0
      ? firstHabit.unit
      : "kg";

  // Firestore `in` operator caps at 30 values — habitIds.length is
  // bounded by the v1 design (1-2 weight habits per client).
  const logsSnap = await db
    .collection(FirestoreCollections.habitLogs)
    .where("habitId", "in", habitIds)
    .where("loggedAt", ">=", thirtyDaysAgo)
    .orderBy("loggedAt", "asc")
    .get();

  const points: WeightPoint[] = logsSnap.docs
    .map((d) => {
      const data = d.data() as {
        civilDate?: string;
        value?: number;
        deleted?: boolean;
      };
      if (data.deleted) return null;
      if (typeof data.value !== "number" || data.value <= 0) return null;
      if (typeof data.civilDate !== "string") return null;
      return { date: data.civilDate, weight: data.value };
    })
    .filter((p): p is WeightPoint => p !== null);

  if (points.length === 0) {
    return (
      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("noLogs")}</p>
      </section>
    );
  }

  const weights = points.map((p) => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  // Avoid divide-by-zero when every point is identical. A 1.0 default
  // range produces a flat horizontal line in the chart, which is the
  // correct visual for "no change".
  const rangeW = Math.max(1, maxW - minW);

  const innerW = CHART_WIDTH - 2 * PADDING_X;
  const innerH = CHART_HEIGHT - 2 * PADDING_Y;

  function xForIndex(i: number): number {
    if (points.length === 1) return PADDING_X + innerW / 2;
    return PADDING_X + (i * innerW) / (points.length - 1);
  }
  function yForWeight(w: number): number {
    return PADDING_Y + innerH - ((w - minW) / rangeW) * innerH;
  }

  const pathD = points
    .map((p, i) => {
      const x = xForIndex(i).toFixed(1);
      const y = yForWeight(p.weight).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

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
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-32 w-full text-foreground"
        role="img"
        aria-label={t("ariaLabel", { count: points.length })}
      >
        <line
          x1={PADDING_X}
          x2={CHART_WIDTH - PADDING_X}
          y1={CHART_HEIGHT - PADDING_Y}
          y2={CHART_HEIGHT - PADDING_Y}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        <path
          d={pathD}
          stroke="currentColor"
          strokeWidth={1.5}
          fill="none"
        />
        {points.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={xForIndex(i)}
            cy={yForWeight(p.weight)}
            r={2.5}
            fill="currentColor"
          >
            <title>
              {p.date}: {p.weight} {unitLabel}
            </title>
          </circle>
        ))}
      </svg>
    </section>
  );
}

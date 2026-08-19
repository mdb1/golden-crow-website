// BodyWeightTrendChart.tsx — body-weight area chart with a time-range
// selector (All time / 90d / 30d / 7d). Async React Server Component.
//
// #919: the Firestore read moved to `lib/gc-fitness/body-weight-logs.ts` so the coach's
// nutrition surface can hand the SAME points to this chart AND to the phase table under
// it, from one read. It also takes optional `phaseBands`, which paint the nutrition
// phases behind the line — the answer to "¿este plan le está funcionando?" is the shape
// of the weight inside each block, and a line with no blocks marked cannot show it.
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

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import {
  BODY_WEIGHT_LOOKBACK_DAYS,
  loadBodyWeightPoints,
  type BodyWeightPoint,
} from "@/lib/gc-fitness/body-weight-logs";
import type { NutritionPhaseBand } from "@/lib/gc-fitness/nutrition-compliance";
import { addCivilDays } from "./trend-range";
import { BodyWeightTrendChartClient } from "./BodyWeightTrendChartClient";

export interface BodyWeightTrendChartProps {
  clientId: string;
  timezone: string;
  /**
   * The "Pedir peso" row, rendered under the chart. It used to live in a
   * "Pedidos al cliente" card halfway down the profile; a coach decides to ask
   * for a weigh-in while looking at the weight, not while scrolling past a list
   * of requests. Passed in (rather than imported) so this component stays
   * reusable by surfaces with no request affordance — the admin coach-less view.
   */
  requestSlot?: ReactNode;
  /**
   * Pre-loaded points. Pass them when the caller already read the weigh-ins for something
   * else on the same page (the nutrition phase table) so the page costs ONE Firestore
   * read instead of two — and, more importantly, so the chart and the table can never
   * disagree about which measurements exist.
   */
  points?: BodyWeightPoint[];
  /** Nutrition phases painted behind the line (#919). */
  phaseBands?: NutritionPhaseBand[];
}

const MAX_LOOKBACK_DAYS = BODY_WEIGHT_LOOKBACK_DAYS;

export async function BodyWeightTrendChart({
  clientId,
  timezone,
  requestSlot,
  points: preloaded,
  phaseBands,
}: BodyWeightTrendChartProps) {
  const t = await getTranslations("clients.detail.bodyWeightChart");

  const today = civilDateFormat(new Date(), timezone);

  // SOLE source for this widget: /users/{uid}/body_weight_logs, read through the shared
  // `loadBodyWeightPoints` (deduped per measurement date, sorted by that date, corrupt
  // values filtered). Body weight is no longer a habit type — there is no
  // `habits (type == "weight")` fallback. One 365-day window read feeds all ranges.
  const unitLabel = "kg";
  const points = preloaded ?? (await loadBodyWeightPoints(clientId, timezone));

  if (points.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("noLogs")}</p>
        </section>
        {/* An empty chart is exactly when asking for a weigh-in matters most. */}
        {requestSlot}
      </div>
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
    <div className="flex flex-col gap-4">
      <BodyWeightTrendChartClient
        data={points}
        today={today}
        rangeStarts={rangeStarts}
        unitLabel={unitLabel}
        phaseBands={phaseBands}
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
      {requestSlot}
    </div>
  );
}

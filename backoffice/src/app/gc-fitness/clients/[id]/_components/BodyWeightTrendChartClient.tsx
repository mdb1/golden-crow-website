"use client";

// BodyWeightTrendChartClient.tsx — interactive shell for the body-weight
// trend widget. Holds the selected range, filters the server-provided
// points (already deduped + sorted by measurement DATE) to the range window,
// and recomputes the "Latest" summary + delta against the prior-by-date
// point. All math is local — the server shipped the full 365-day window once
// so toggling ranges costs no extra Firestore reads.

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "next-intl";

import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import type { NutritionPhaseBand } from "@/lib/gc-fitness/nutrition-compliance";
import {
  DEFAULT_TREND_RANGE,
  type TrendRangeKey,
} from "./trend-range";
import { TrendRangeSelector } from "./TrendRangeSelector";

export interface BodyWeightPoint {
  /** civilDate YYYY-MM-DD of the measurement (not createdAt). */
  date: string;
  weight: number;
}

export interface BodyWeightTrendChartClientProps {
  /** Full window, deduped per date, sorted ascending by measurement date. */
  data: BodyWeightPoint[];
  today: string;
  rangeStarts: Record<TrendRangeKey, string>;
  unitLabel: string;
  /**
   * Nutrition phases to paint behind the line (#919). Optional — the client profile draws
   * the chart without them.
   */
  phaseBands?: NutritionPhaseBand[];
  labels: {
    title: string;
    noLogs: string;
    latestPrefix: string;
    logCount: string;
    weightTooltip: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

/**
 * Band fills. Four tones that cycle, so ADJACENT phases are distinguishable — they carry
 * no meaning of their own. A "definición" is not red and a "volumen" is not green: the
 * coach names the phase, we do not classify it, and colouring by a guessed intent would
 * editorialise somebody else's plan.
 */
const BAND_FILLS = ["var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function BodyWeightTrendChartClient({
  data,
  today,
  rangeStarts,
  unitLabel,
  phaseBands,
  labels,
}: BodyWeightTrendChartClientProps) {
  const locale = useLocale();
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_TREND_RANGE);

  const { points, latest, delta } = useMemo(() => {
    const start = rangeStarts[range];
    const points = data.filter((p) => p.date >= start && p.date <= today);
    // Points arrive sorted ascending by measurement date, so the last one is
    // the most recent measurement (closest to today by date) — not the
    // last-created row (C2). Delta compares it against the prior-by-date point.
    const latest = points.length > 0 ? points[points.length - 1] : null;
    const delta =
      points.length > 1 ? latest!.weight - points[points.length - 2].weight : null;
    return { points, latest, delta };
  }, [data, range, rangeStarts, today]);

  // The X axis is CATEGORICAL (`dataKey="date"`), so a ReferenceArea can only be anchored
  // on values that exist in `points`. Each band is therefore snapped to the first and last
  // weigh-in that falls inside it, and a phase with no weigh-in in the visible range is
  // dropped — there is nothing to annotate, and an unmatched x1/x2 renders as a stray band
  // pinned to the axis origin. The exact phase dates live in the table under the chart.
  const bands = useMemo(() => {
    if (!phaseBands || phaseBands.length === 0 || points.length === 0) return [];
    return phaseBands
      .map((band) => {
        const inside = points.filter(
          (point) => point.date >= band.from && point.date <= band.to,
        );
        if (inside.length === 0) return null;
        return {
          ...band,
          x1: inside[0]!.date,
          x2: inside[inside.length - 1]!.date,
        };
      })
      .filter((band): band is NutritionPhaseBand & { x1: string; x2: string } => band !== null);
  }, [phaseBands, points]);

  const deltaStr =
    delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` : null;

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-medium">{labels.title}</h2>
        <TrendRangeSelector value={range} onChange={setRange} labels={labels.ranges} />
      </div>

      {latest === null ? (
        <p className="text-sm text-muted-foreground">{labels.noLogs}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {labels.latestPrefix}{" "}
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
            {labels.logCount}
          </p>

          <div className="h-60 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={points}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.16}
                />
                {bands.map((band) => (
                  <ReferenceArea
                    key={band.planId}
                    x1={band.x1}
                    x2={band.x2}
                    fill={BAND_FILLS[band.tone % BAND_FILLS.length]}
                    fillOpacity={0.1}
                    // The line has to stay the thing you read. The band is context.
                    ifOverflow="extendDomain"
                  />
                ))}
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(value: string) =>
                    formatCivilDateLabel(
                      value,
                      { month: "short", day: "numeric" },
                      locale,
                    )
                  }
                />
                <YAxis
                  domain={["dataMin - 0.6", "dataMax + 0.6"]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  tickFormatter={(v: number) => `${v.toFixed(1)}`}
                />
                <Tooltip
                  cursor={{ stroke: "var(--chart-1)", strokeOpacity: 0.3 }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                  }}
                  formatter={(value) => [
                    `${Number(value).toFixed(1)} ${unitLabel}`,
                    labels.weightTooltip,
                  ]}
                  labelFormatter={(label) =>
                    formatCivilDateLabel(
                      String(label),
                      { year: "numeric", month: "short", day: "numeric" },
                      locale,
                    )
                  }
                />
                <Area
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--chart-1)"
                  fill="url(#weightArea)"
                  strokeWidth={3}
                  dot={{ r: 3.5, fill: "var(--chart-1)", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "var(--chart-1)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {bands.length > 0 ? (
            <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {bands.map((band) => (
                <li
                  key={band.planId}
                  className="text-muted-foreground flex items-center gap-1.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-[3px]"
                    style={{
                      backgroundColor: BAND_FILLS[band.tone % BAND_FILLS.length],
                      opacity: 0.45,
                    }}
                  />
                  {band.label}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

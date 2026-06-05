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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "next-intl";

import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
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
  labels: {
    title: string;
    noLogs: string;
    latestPrefix: string;
    logCount: string;
    weightTooltip: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

export function BodyWeightTrendChartClient({
  data,
  today,
  rangeStarts,
  unitLabel,
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
        </>
      )}
    </section>
  );
}

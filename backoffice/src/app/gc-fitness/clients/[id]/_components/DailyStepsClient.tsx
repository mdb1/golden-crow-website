"use client";

// DailyStepsClient.tsx — interactive shell for DailyStepsWidget. Same shape as
// WorkoutTrendsClient: the server ships one point per synced day, the range
// selector re-buckets locally, zero extra reads.
//
// The bars are a DAILY AVERAGE per bucket, not a sum. A weekly bucket summing
// steps would put ~70k on the axis next to a daily bucket's ~7k, so the two
// granularities of the same selector would disagree about what a tall bar means.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import type { DailyStepPoint } from "@/lib/gc-fitness/daily-steps";

import {
  DEFAULT_TREND_RANGE,
  addCivilDays,
  bucketGranularity,
  civilDiffDays,
  type TrendRangeKey,
} from "./trend-range";
import { TrendRangeSelector } from "./TrendRangeSelector";

export interface DailyStepsClientProps {
  points: DailyStepPoint[];
  today: string;
  rangeStarts: Record<TrendRangeKey, string>;
  labels: {
    title: string;
    subtitle: string;
    empty: string;
    statAverage: string;
    statBest: string;
    statTotal: string;
    unit: string;
    barLabel: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

interface Bucket {
  key: string;
  label: string;
  total: number;
  days: number;
  average: number;
}

export function DailyStepsClient({
  points,
  today,
  rangeStarts,
  labels,
}: DailyStepsClientProps) {
  const locale = useLocale();
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_TREND_RANGE);

  const { buckets, totals } = useMemo(() => {
    const start = rangeStarts[range];
    const inRange = points.filter((p) => p.date >= start && p.date <= today);

    const totals = inRange.reduce(
      (acc, p) => {
        acc.total += p.steps;
        acc.best = Math.max(acc.best, p.steps);
        acc.days += 1;
        return acc;
      },
      { total: 0, best: 0, days: 0 },
    );

    const granularity = bucketGranularity(range);
    const span = Math.max(0, civilDiffDays(today, start));
    const buckets: Bucket[] = [];
    const step = granularity === "day" ? 1 : 7;
    for (let i = 0; i <= span; i += step) {
      const bucketStart = addCivilDays(start, i);
      buckets.push({
        key: bucketStart,
        label: formatCivilDateLabel(
          bucketStart,
          { month: "short", day: "numeric" },
          locale,
        ),
        total: 0,
        days: 0,
        average: 0,
      });
    }
    for (const p of inRange) {
      const offset = civilDiffDays(p.date, start);
      if (offset < 0) continue;
      const bucket = buckets[Math.floor(offset / step)];
      if (!bucket) continue;
      bucket.total += p.steps;
      bucket.days += 1;
    }
    // Average over the days that actually REPORTED, not over the calendar span:
    // a client whose phone synced 3 of 7 days walked those 3 days' average, and
    // dividing by 7 would invent four zero-step days they may well have walked.
    for (const bucket of buckets) {
      bucket.average = bucket.days > 0 ? Math.round(bucket.total / bucket.days) : 0;
    }

    return { buckets, totals };
  }, [locale, points, range, rangeStarts, today]);

  const average = totals.days > 0 ? Math.round(totals.total / totals.days) : 0;

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-medium">{labels.title}</h2>
          <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <TrendRangeSelector value={range} onChange={setRange} labels={labels.ranges} />
      </div>

      {points.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {labels.empty}
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat value={formatSteps(average)} label={labels.statAverage} />
            <Stat value={formatSteps(totals.best)} label={labels.statBest} />
            <Stat value={formatSteps(totals.total)} label={labels.statTotal} />
          </div>

          <div className="h-44 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.16}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tickFormatter={(value: number) => formatSteps(value)}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                  }}
                  formatter={(value) => [
                    `${Number(value).toLocaleString(locale)} ${labels.unit}`,
                    labels.barLabel,
                  ]}
                />
                {/* The 10k line everyone measures themselves against, drawn so a
                    bar is readable without doing the arithmetic. */}
                <ReferenceLine
                  y={10000}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                />
                <Bar
                  dataKey="average"
                  fill="var(--chart-1)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

function formatSteps(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-muted/35 p-2.5 text-center">
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

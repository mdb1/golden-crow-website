"use client";

// WorkoutTrendsClient.tsx — interactive shell for WorkoutTrendsWidget.
// Holds the selected range, re-buckets the server-provided session points,
// and renders the frequency bar chart + summary stats. All math is local —
// the server shipped one lightweight point per counted session.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DEFAULT_TREND_RANGE,
  bucketGranularity,
  civilDiffDays,
  addCivilDays,
  type TrendRangeKey,
} from "./trend-range";
import { TrendRangeSelector } from "./TrendRangeSelector";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";

export interface WorkoutTrendPoint {
  /** civilDate YYYY-MM-DD of the session start. */
  date: string;
  /** completed sets in the session. */
  sets: number;
  /** tonnage (kg) of completed, non-warmup sets, rounded. */
  volumeKg: number;
}

export interface WorkoutTrendsClientProps {
  points: WorkoutTrendPoint[];
  today: string;
  rangeStarts: Record<TrendRangeKey, string>;
  labels: {
    title: string;
    empty: string;
    statWorkouts: string;
    statSets: string;
    statVolume: string;
    volumeUnit: string;
    barLabel: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

interface Bucket {
  /** Bucket start civil date (used as the stable key). */
  key: string;
  label: string;
  count: number;
}

function formatCivilShort(civilDate: string, locale: string): string {
  return formatCivilDateLabel(civilDate, { month: "short", day: "numeric" }, locale);
}

function formatVolume(kg: number): string {
  if (kg >= 10_000) return `${(kg / 1000).toFixed(1)}k`;
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return String(kg);
}

export function WorkoutTrendsClient({
  points,
  today,
  rangeStarts,
  labels,
}: WorkoutTrendsClientProps) {
  const locale = useLocale();
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_TREND_RANGE);

  const { buckets, totals } = useMemo(() => {
    const start = rangeStarts[range];
    const inRange = points.filter((p) => p.date >= start && p.date <= today);

    const totals = inRange.reduce(
      (acc, p) => {
        acc.workouts += 1;
        acc.sets += p.sets;
        acc.volumeKg += p.volumeKg;
        return acc;
      },
      { workouts: 0, sets: 0, volumeKg: 0 },
    );

    const granularity = bucketGranularity(range);
    const span = Math.max(0, civilDiffDays(today, start));
    const buckets: Bucket[] = [];

    if (granularity === "day") {
      for (let i = 0; i <= span; i += 1) {
        const day = addCivilDays(start, i);
        buckets.push({ key: day, label: formatCivilShort(day, locale), count: 0 });
      }
      const byKey = new Map(buckets.map((b) => [b.key, b]));
      for (const p of inRange) {
        const bucket = byKey.get(p.date);
        if (bucket) bucket.count += 1;
      }
    } else {
      // Weekly buckets anchored at the range start; each spans 7 days.
      const bucketStarts: string[] = [];
      for (let i = 0; i <= span; i += 7) {
        bucketStarts.push(addCivilDays(start, i));
      }
      for (const bs of bucketStarts) {
        buckets.push({ key: bs, label: formatCivilShort(bs, locale), count: 0 });
      }
      for (const p of inRange) {
        const offset = civilDiffDays(p.date, start);
        if (offset < 0) continue;
        const idx = Math.floor(offset / 7);
        if (buckets[idx]) buckets[idx].count += 1;
      }
    }

    return { buckets, totals };
  }, [points, range, rangeStarts, today]);

  const hasData = points.length > 0;

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium">{labels.title}</h2>
        <TrendRangeSelector value={range} onChange={setRange} labels={labels.ranges} />
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat value={String(totals.workouts)} label={labels.statWorkouts} />
            <Stat value={String(totals.sets)} label={labels.statSets} />
            <Stat
              value={`${formatVolume(totals.volumeKg)} ${labels.volumeUnit}`}
              label={labels.statVolume}
            />
          </div>

          <div className="h-44 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={buckets}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
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
                  width={24}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                  }}
                  formatter={(value) => [String(value), labels.barLabel]}
                />
                <Bar
                  dataKey="count"
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-muted/35 p-2.5 text-center">
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

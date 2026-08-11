"use client";

// workout-heart-rate-chart.tsx — the BPM line on a finished workout.
//
// Renders inside WorkoutLogDetailView, so it appears everywhere a workout can be
// inspected: the Recent Logs page, the admin god-mode page, and the calendar's
// completed-workout dialog.
//
// THE NUMBERS BESIDE THE LINE ARE THE STORED AGGREGATES, NOT THE PLOTTED POINTS.
// The client's app thins the series to ≤300 samples before uploading and the
// thinning averages within buckets, so a 178 bpm peak can be DRAWN at 126 while
// still being the real maximum. Reading min/max off the line would under-report
// exactly the moment a coach opens this screen for. The gap between the line's
// apex and the "Máx" number is expected, and is the point.

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HeartPulse } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkoutHeartRateSeries } from "@/lib/gc-fitness/workout-heart-rate";

export function WorkoutHeartRateChart({
  series,
}: {
  series: WorkoutHeartRateSeries | null;
}) {
  const t = useTranslations("recentLogs.workoutDetail.heartRate");

  // Most workouts are logged without a watch. An empty chart frame on every one
  // of them is noise that teaches a coach to scroll past this screen.
  if (!series || series.samples.length === 0) return null;

  // Padded so the line never rides the frame edges, floored at zero so a very
  // steady session doesn't render pinned to the top.
  const low = Math.max(0, series.minBpm - 10);
  const high = Math.max(low + 10, series.maxBpm + 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="size-4 text-rose-500" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series.samples}
              margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--muted-foreground)"
                strokeOpacity={0.16}
                vertical={false}
              />
              <XAxis
                dataKey="offsetSeconds"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                // Whole minutes: an axis in seconds is unreadable past the
                // first couple of minutes of a workout.
                tickFormatter={(value: number) => `${Math.round(value / 60)}′`}
              />
              <YAxis
                domain={[low, high]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
                labelFormatter={(label) =>
                  t("tooltipMinute", { minute: Math.round(Number(label) / 60) })
                }
                formatter={(value) => [`${value} bpm`, t("tooltipLabel")]}
              />
              <Line
                type="monotone"
                dataKey="bpm"
                stroke="var(--color-rose-500, #f43f5e)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("min")} value={series.minBpm} />
          <Stat label={t("avg")} value={series.avgBpm} />
          <Stat label={t("max")} value={series.maxBpm} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/35 p-2.5 text-center">
      <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

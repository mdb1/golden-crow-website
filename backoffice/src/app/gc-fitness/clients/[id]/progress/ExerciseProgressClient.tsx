"use client";

// ExerciseProgressClient.tsx — interactive shell for the per-client per-exercise
// progress chart (backlog C4). The server ships the full set of lightweight
// session points (one per session × exercise) + the exercise list once, so
// switching exercise / metric / range costs ZERO extra Firestore reads — all
// filtering happens locally.
//
// Controls: an exercise picker (only exercises the client actually logged), a
// metric segmented control (top-set weight / estimated 1RM / volume), and the
// shared All/90d/30d/7d range selector. Chart styling mirrors
// BodyWeightTrendChartClient (gold AreaChart, recharts, token colors).

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ExerciseSessionPoint,
  LoggedExerciseOption,
} from "@/lib/gc-fitness/exercise-progress-actions";
import {
  DEFAULT_TREND_RANGE,
  type TrendRangeKey,
} from "../_components/trend-range";
import { TrendRangeSelector } from "../_components/TrendRangeSelector";

type MetricKey = "topSet" | "e1rm" | "volume";

export interface ExerciseProgressClientProps {
  exercises: LoggedExerciseOption[];
  points: ExerciseSessionPoint[];
  today: string;
  rangeStarts: Record<TrendRangeKey, string>;
  labels: {
    exercisePickerLabel: string;
    metricTopSet: string;
    metricE1rm: string;
    metricVolume: string;
    weightUnit: string;
    volumeUnit: string;
    latestPrefix: string;
    emptyNoExercises: string;
    emptyNoData: string;
    tooltipTopSet: string;
    tooltipE1rm: string;
    tooltipVolume: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

interface ChartPoint {
  date: string;
  value: number;
}

// "pull_up_bar" → "Pull up bar". Mirrors the exercise-library filter's
// title-casing (MultiSelectCombobox.defaultFormat) so muscle-group labels read
// the same across surfaces. No per-group i18n map exists yet.
function formatMuscleGroup(group: string): string {
  return group.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function ExerciseProgressClient({
  exercises,
  points,
  today,
  rangeStarts,
  labels,
}: ExerciseProgressClientProps) {
  const locale = useLocale();
  const t = useTranslations("clients.exerciseProgress");
  const [muscleGroup, setMuscleGroup] = useState<string>("all");
  const [exerciseId, setExerciseId] = useState<string>(
    exercises[0]?.exerciseId ?? "",
  );
  const [metric, setMetric] = useState<MetricKey>("topSet");
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_TREND_RANGE);

  // Distinct muscle groups present across the client's logged exercises.
  const muscleGroups = useMemo(() => {
    const set = new Set<string>();
    for (const ex of exercises) for (const g of ex.muscleGroups) set.add(g);
    return Array.from(set).sort((a, b) =>
      formatMuscleGroup(a).localeCompare(formatMuscleGroup(b)),
    );
  }, [exercises]);

  // Exercises shown in the picker after applying the muscle-group filter.
  const visibleExercises = useMemo(
    () =>
      muscleGroup === "all"
        ? exercises
        : exercises.filter((ex) => ex.muscleGroups.includes(muscleGroup)),
    [exercises, muscleGroup],
  );

  // Keep the selected exercise valid when the filter narrows the list.
  useEffect(() => {
    if (visibleExercises.length === 0) return;
    if (!visibleExercises.some((ex) => ex.exerciseId === exerciseId)) {
      setExerciseId(visibleExercises[0].exerciseId);
    }
  }, [visibleExercises, exerciseId]);

  const metricOptions: Array<{ key: MetricKey; label: string }> = [
    { key: "topSet", label: labels.metricTopSet },
    { key: "e1rm", label: labels.metricE1rm },
    { key: "volume", label: labels.metricVolume },
  ];

  const unitFor = (m: MetricKey) =>
    m === "volume" ? labels.volumeUnit : labels.weightUnit;
  const tooltipFor = (m: MetricKey) =>
    m === "topSet"
      ? labels.tooltipTopSet
      : m === "e1rm"
        ? labels.tooltipE1rm
        : labels.tooltipVolume;

  const valueOf = (p: ExerciseSessionPoint, m: MetricKey): number | null => {
    if (m === "topSet") return p.topSetWeightKg;
    if (m === "e1rm") return p.estimatedOneRmKg;
    return p.volumeKg;
  };

  const { chartPoints, latest } = useMemo(() => {
    const start = rangeStarts[range];
    // Sessions for the selected exercise, in the window, with a non-null metric.
    const filtered = points
      .filter(
        (p) =>
          p.exerciseId === exerciseId &&
          p.date >= start &&
          p.date <= today,
      )
      .map((p) => ({ date: p.date, raw: valueOf(p, metric) }))
      .filter((p): p is { date: string; raw: number } => p.raw !== null)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const chartPoints: ChartPoint[] = filtered.map((p) => ({
      date: p.date,
      value: p.raw,
    }));
    const latest =
      chartPoints.length > 0 ? chartPoints[chartPoints.length - 1] : null;
    return { chartPoints, latest };
  }, [points, exerciseId, metric, range, rangeStarts, today]);

  const unit = unitFor(metric);
  const formatValue = (v: number) =>
    metric === "volume" ? String(Math.round(v)) : v.toFixed(1);

  if (exercises.length === 0) {
    return (
      <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {labels.emptyNoExercises}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {muscleGroups.length >= 2 ? (
            <div className="flex flex-col gap-1.5 sm:w-48">
              <label
                htmlFor="exercise-progress-muscle"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {t("muscleGroupLabel")}
              </label>
              <Select value={muscleGroup} onValueChange={setMuscleGroup}>
                <SelectTrigger id="exercise-progress-muscle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("muscleGroupAll")}</SelectItem>
                  {muscleGroups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {formatMuscleGroup(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-1 flex-col gap-1.5">
            <label
              htmlFor="exercise-progress-picker"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {labels.exercisePickerLabel}
            </label>
            <Select value={exerciseId} onValueChange={setExerciseId}>
              <SelectTrigger
                id="exercise-progress-picker"
                className="w-full sm:max-w-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleExercises.map((ex) => (
                  <SelectItem key={ex.exerciseId} value={ex.exerciseId}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label={labels.exercisePickerLabel}
            className="inline-flex items-center gap-0.5 rounded-full border bg-muted/40 p-0.5"
          >
            {metricOptions.map((m) => {
              const selected = m.key === metric;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setMetric(m.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <TrendRangeSelector
            value={range}
            onChange={setRange}
            labels={labels.ranges}
          />
        </div>
      </div>

      {latest === null ? (
        <p className="text-sm text-muted-foreground">{labels.emptyNoData}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {labels.latestPrefix}{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatValue(latest.value)} {unit}
            </span>
            {" · "}
            {t("sessionCount", { count: chartPoints.length })}
          </p>

          <div className="h-64 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartPoints}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="exerciseProgressArea"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.28}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.02}
                    />
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
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => formatValue(v)}
                />
                <Tooltip
                  cursor={{ stroke: "var(--chart-1)", strokeOpacity: 0.3 }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                  }}
                  formatter={(value) => [
                    `${formatValue(Number(value))} ${unit}`,
                    tooltipFor(metric),
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
                  dataKey="value"
                  stroke="var(--chart-1)"
                  fill="url(#exerciseProgressArea)"
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

"use client";

// ExerciseProgressClient.tsx — interactive shell for the per-client per-exercise
// progress chart (backlog C4). The server ships the full set of lightweight
// session points (one per session × exercise) + the exercise list once, so
// switching exercise / metric / range costs ZERO extra Firestore reads — all
// filtering happens locally.
//
// Controls: a SEARCHABLE exercise picker (#574 — Popover + Command, the same
// primitive the template form's exercise picker uses; only exercises the client
// actually logged), a metric segmented control (top-set weight / estimated 1RM /
// volume), and the shared All/90d/30d/7d range selector. Chart styling mirrors
// BodyWeightTrendChartClient (gold AreaChart, recharts, token colors).
//
// #574 also adds the "Series registradas" breakdown under the chart: the
// selected exercise's sessions newest-first, each listing its logged sets
// ("1 · 8 reps × 70 kg"), revealed 3 at a time via "Ver más". The rows ride the
// SAME server payload as the chart, so paging costs zero Firestore reads. The
// list is deliberately NOT filtered by the chart's range selector — it is the
// exercise's history, and pagination is what keeps it manageable.

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
import { Check, ChevronsUpDown, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeSearchText } from "@/lib/gc-fitness/exercise-search";
import { SET_TYPE_TEXT_CLASS } from "@/lib/gc-fitness/set-type";
import {
  SET_HISTORY_PAGE_SIZE,
  sessionSetLines,
} from "@/lib/gc-fitness/exercise-set-history";
import type {
  ExerciseSessionPoint,
  ExerciseSetSession,
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
  /** #574 — per-exercise session set breakdowns, newest session first. */
  setSessions: ExerciseSetSession[];
  /** #574 — exerciseIds whose breakdown was capped server-side. */
  truncatedSetHistoryExerciseIds: string[];
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

/** #574 — set-row weight: whole kg when it is one, else one decimal. */
function formatSetWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

export function ExerciseProgressClient({
  exercises,
  points,
  setSessions,
  truncatedSetHistoryExerciseIds,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  // #574 — how many of the selected exercise's sessions the list reveals.
  const [visibleSessions, setVisibleSessions] = useState(SET_HISTORY_PAGE_SIZE);

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

  const selectedExercise = useMemo(
    () => exercises.find((ex) => ex.exerciseId === exerciseId) ?? null,
    [exercises, exerciseId],
  );

  // #574 — every session of the selected exercise, newest first (the server
  // already emits them in that order). NOT range-filtered: this is the
  // exercise's history, and "Ver más" is what keeps it manageable.
  const exerciseSessions = useMemo(
    () => setSessions.filter((s) => s.exerciseId === exerciseId),
    [setSessions, exerciseId],
  );
  const isTruncated = truncatedSetHistoryExerciseIds.includes(exerciseId);

  // A new exercise starts the list back at the first page.
  useEffect(() => {
    setVisibleSessions(SET_HISTORY_PAGE_SIZE);
  }, [exerciseId]);

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
            {/* #574 — searchable picker. A client with dozens of logged
                exercises made the plain <Select> unusable; Command's fuzzy
                filter runs over the diacritic-normalized name so "sentadilla"
                and "Sentadílla" both match. */}
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="exercise-progress-picker"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="w-full justify-between font-normal sm:max-w-sm"
                >
                  <span className="truncate">
                    {selectedExercise?.name ?? labels.exercisePickerLabel}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[--radix-popover-trigger-width] p-0"
              >
                <Command
                  // `value` below is ALREADY normalized, so the filter is a
                  // plain substring test on normalized text — predictable
                  // ("press" matches "Press de banca") instead of cmdk's
                  // default fuzzy scoring.
                  filter={(value, search) => {
                    const q = normalizeSearchText(search);
                    return !q || value.includes(q) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder={t("exerciseSearchPlaceholder")} />
                  <CommandList>
                    <CommandEmpty>{t("exerciseSearchEmpty")}</CommandEmpty>
                    <CommandGroup>
                      {visibleExercises.map((ex) => (
                        <CommandItem
                          key={ex.exerciseId}
                          // What Command filters on. Normalized (lowercase +
                          // no diacritics) so "sentadilla" matches
                          // "Sentadílla", and suffixed with the id so two
                          // same-named library twins (the known double-seed)
                          // stay DISTINCT items — cmdk keys its registry on
                          // `value`, so a collision would merge the rows.
                          value={normalizeSearchText(
                            `${ex.name} ${ex.exerciseId}`,
                          )}
                          onSelect={() => {
                            setExerciseId(ex.exerciseId);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              ex.exerciseId === exerciseId
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <span className="flex-1 truncate">{ex.name}</span>
                          <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {ex.sessionCount}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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

      {/* #574 — per-session set breakdown for the selected exercise. */}
      {exerciseSessions.length > 0 ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-foreground">
              {t("setHistory.title")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("setHistory.subtitle", { count: exerciseSessions.length })}
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {exerciseSessions.slice(0, visibleSessions).map((session) => (
              <li
                key={`${session.logId}-${session.exerciseId}`}
                className="rounded-lg border bg-muted/20 p-3"
              >
                <p className="text-xs font-medium text-foreground">
                  {formatCivilDateLabel(
                    session.date,
                    { year: "numeric", month: "long", day: "numeric" },
                    locale,
                  )}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {sessionSetLines(session.sets).map((line, i) => (
                    <li
                      key={`${session.logId}-${i}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-center font-semibold tabular-nums",
                          line.setType === "normal"
                            ? "text-muted-foreground"
                            : SET_TYPE_TEXT_CLASS[line.setType],
                        )}
                      >
                        {line.label}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {line.kind === "time"
                          ? t("setHistory.lineTime", {
                              seconds: line.durationSeconds ?? 0,
                            })
                          : line.kind === "weighted"
                            ? t("setHistory.lineWeighted", {
                                reps: line.reps,
                                weight: formatSetWeight(line.weightKg),
                              })
                            : t("setHistory.lineReps", { reps: line.reps })}
                      </span>
                      {line.isPR ? (
                        <Trophy
                          className="size-3 text-amber-500"
                          aria-label={t("setHistory.prLabel")}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {visibleSessions < exerciseSessions.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setVisibleSessions((n) => n + SET_HISTORY_PAGE_SIZE)
              }
            >
              {t("setHistory.loadMore", {
                remaining: exerciseSessions.length - visibleSessions,
              })}
            </Button>
          ) : isTruncated ? (
            <p className="text-[11px] text-muted-foreground">
              {t("setHistory.truncated", { count: exerciseSessions.length })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

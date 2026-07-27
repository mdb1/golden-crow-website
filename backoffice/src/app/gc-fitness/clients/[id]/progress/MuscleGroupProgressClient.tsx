"use client";

// MuscleGroupProgressClient.tsx — #480 per-muscle-group progress section for the
// coach's client-progress page. Twin of the iOS Progress-tab muscle-group
// charts (ProgressPhotosView `MuscleGroupChartsSection`).
//
// Two overlaid charts share a weekly x-axis: SETS by muscle group (with a green
// 12–20 target band) and VOLUME by muscle group. Each selected coarse group is
// its own colored line. Weighting is baked server-side (primary 1.0 / secondary
// 0.5 per set) — see muscle-group-weeks.buildMuscleGroupWeeks + the
// muscle-group-display twin. Switching selection / range / target is pure local
// state (zero extra Firestore reads).
//
// #568 PROJECTION: a dotted divider marks the current week, and from there the
// lines continue DASHED + dimmed through the client's upcoming scheduled
// workouts (the current week's remaining days + 4 weeks). Same idea as the iOS /
// Android Progress-tab charts (MuscleGroupSeriesChart `projectionStartIndex`).
// The weekly readout shows the projected week total too, so a Monday doesn't
// read as "3 series esta semana".

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, SlidersHorizontal, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  COARSE_MUSCLE_GROUPS,
  DEFAULT_SELECTED_MUSCLE_GROUPS,
} from "@/lib/gc-fitness/muscle-group-display";
import {
  PROJECTED_KEY_SUFFIX as PROJ,
  buildChartRows,
  weekHasProjection,
  type MuscleGroupWeekPoint,
} from "@/lib/gc-fitness/muscle-group-weeks";
import {
  DEFAULT_TREND_RANGE,
  type TrendRangeKey,
} from "../_components/trend-range";
import { TrendRangeSelector } from "../_components/TrendRangeSelector";

const DEFAULT_TARGET_MIN = 12;
const DEFAULT_TARGET_MAX = 20;
// Muscle-group charts read best over a multi-week trend; default to 90d.
const DEFAULT_MUSCLE_RANGE: TrendRangeKey = "90";

/** `var(--gc-muscle-<group>)` — the categorical color for a coarse group. */
function colorFor(group: string): string {
  return `var(--gc-muscle-${group})`;
}

function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export interface MuscleGroupProgressClientProps {
  weeks: MuscleGroupWeekPoint[];
  availableGroups: string[];
  /** Monday of the current week — the projection boundary / readout anchor. */
  currentWeekStart: string;
  rangeStarts: Record<TrendRangeKey, string>;
}

export function MuscleGroupProgressClient({
  weeks,
  availableGroups,
  currentWeekStart,
  rangeStarts,
}: MuscleGroupProgressClientProps) {
  const locale = useLocale();
  const t = useTranslations("clients.exerciseProgress");
  const tVocab = useTranslations("exercises.vocabulary");
  const muscleLabel = (g: string) => tVocab(`muscle.${g}`);

  // Available groups in the canonical display order.
  const groups = useMemo(
    () => COARSE_MUSCLE_GROUPS.filter((g) => availableGroups.includes(g)),
    [availableGroups],
  );

  const [selected, setSelected] = useState<Set<string>>(() => {
    const defaults = DEFAULT_SELECTED_MUSCLE_GROUPS.filter((g) =>
      availableGroups.includes(g),
    );
    return new Set(defaults.length > 0 ? defaults : availableGroups.slice(0, 3));
  });
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_MUSCLE_RANGE);
  const [targetMin, setTargetMin] = useState(DEFAULT_TARGET_MIN);
  const [targetMax, setTargetMax] = useState(DEFAULT_TARGET_MAX);

  const toggleGroup = (g: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  // Selected groups in canonical order (stable line order + legend).
  const selectedOrdered = useMemo(
    () => groups.filter((g) => selected.has(g)),
    [groups, selected],
  );

  // #568 — only render the projection region when the client actually has
  // upcoming scheduled work; otherwise the charts stay exactly as before.
  const hasProjection = useMemo(() => weeks.some(weekHasProjection), [weeks]);

  const windowWeeks = useMemo(() => {
    const start = rangeStarts[range];
    const inRange = weeks.filter((w) => w.weekStart >= start);
    return hasProjection ? inRange : inRange.filter((w) => !w.projected);
  }, [weeks, range, rangeStarts, hasProjection]);

  const currentIndex = useMemo(
    () => windowWeeks.findIndex((w) => w.weekStart === currentWeekStart),
    [windowWeeks, currentWeekStart],
  );

  // One row per week; a solid + a dashed column per selected group. See
  // buildChartRows for the actual/projected boundary math.
  const setsData = useMemo(
    () =>
      buildChartRows(windowWeeks, selectedOrdered, "sets", currentIndex, hasProjection),
    [windowWeeks, selectedOrdered, currentIndex, hasProjection],
  );
  const volumeData = useMemo(
    () =>
      buildChartRows(windowWeeks, selectedOrdered, "volume", currentIndex, hasProjection),
    [windowWeeks, selectedOrdered, currentIndex, hasProjection],
  );

  // Current-week weighted sets per selected group — logged so far AND the
  // projected week total (#568: on a Monday the logged figure alone is
  // misleading, so the readout shows what the plan adds up to).
  const currentWeekReadout = useMemo(() => {
    const week =
      currentIndex >= 0
        ? windowWeeks[currentIndex]
        : windowWeeks[windowWeeks.length - 1];
    const out: Record<string, { sets: number; projected: number }> = {};
    for (const g of selectedOrdered) {
      const sets = week?.byGroup[g]?.sets ?? 0;
      out[g] = {
        sets,
        projected: week?.projectedByGroup?.[g]?.sets ?? sets,
      };
    }
    return out;
  }, [windowWeeks, currentIndex, selectedOrdered]);

  const clampTarget = (nextMin: number, nextMax: number) => {
    const lo = Math.max(0, Math.min(nextMin, nextMax));
    const hi = Math.max(lo, nextMax);
    setTargetMin(lo);
    setTargetMax(hi);
  };

  const rangeLabels: Record<TrendRangeKey, string> = {
    all: t("rangeAll"),
    "90": t("range90"),
    "30": t("range30"),
    "7": t("range7"),
  };

  const xTick = (value: string) =>
    formatCivilDateLabel(value, { month: "short", day: "numeric" }, locale);

  /** Tooltip series label — projected columns are marked as such. */
  const seriesLabel = (name: string) =>
    name.endsWith(PROJ)
      ? t("muscleGroups.projection.tooltipSuffix", {
          group: muscleLabel(name.slice(0, -PROJ.length)),
        })
      : muscleLabel(name);

  /** Dotted "current week" divider between the actual and projected regions. */
  const projectionDivider =
    hasProjection && currentIndex >= 0 ? (
      <ReferenceLine
        x={currentWeekStart}
        stroke="var(--muted-foreground)"
        strokeOpacity={0.5}
        strokeDasharray="2 3"
        strokeWidth={1.5}
        label={{
          value: t("muscleGroups.projection.today"),
          position: "top",
          fontSize: 10,
          fill: "var(--muted-foreground)",
        }}
      />
    ) : null;

  /** The dashed, dimmed projected line for one group. */
  const projectedLine = (g: string) =>
    hasProjection ? (
      <Line
        key={`${g}${PROJ}`}
        type="monotone"
        dataKey={`${g}${PROJ}`}
        stroke={colorFor(g)}
        strokeOpacity={0.45}
        strokeWidth={2}
        strokeDasharray="5 4"
        dot={{ r: 2, fill: colorFor(g), fillOpacity: 0.45, strokeWidth: 0 }}
        activeDot={{ r: 4, fill: colorFor(g), fillOpacity: 0.6, strokeWidth: 0 }}
      />
    ) : null;

  const infoBlocks: Array<{ title: string; body: string }> = [
    {
      title: t("muscleGroups.info.countingTitle"),
      body: t("muscleGroups.info.countingBody"),
    },
    {
      title: t("muscleGroups.info.exampleTitle"),
      body: t("muscleGroups.info.exampleBody"),
    },
    {
      title: t("muscleGroups.info.zoneTitle"),
      body: t("muscleGroups.info.zoneBody"),
    },
    {
      title: t("muscleGroups.info.sourceTitle"),
      body: t("muscleGroups.info.sourceBody"),
    },
  ];

  if (groups.length === 0) {
    return (
      <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">
          {t("muscleGroups.sectionTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("muscleGroups.empty")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-foreground">
            {t("muscleGroups.sectionTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("muscleGroups.sectionSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Target-zone config */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={t("muscleGroups.config.a11y")}
              >
                <SlidersHorizontal className="size-3.5" />
                {t("muscleGroups.config.title")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("muscleGroups.config.title")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("muscleGroups.config.description")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="target-min" className="text-xs">
                      {t("muscleGroups.config.min")}
                    </Label>
                    <Input
                      id="target-min"
                      type="number"
                      min={0}
                      value={targetMin}
                      onChange={(e) =>
                        clampTarget(Number(e.target.value), targetMax)
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="target-max" className="text-xs">
                      {t("muscleGroups.config.max")}
                    </Label>
                    <Input
                      id="target-max"
                      type="number"
                      min={0}
                      value={targetMax}
                      onChange={(e) =>
                        clampTarget(targetMin, Number(e.target.value))
                      }
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    clampTarget(DEFAULT_TARGET_MIN, DEFAULT_TARGET_MAX)
                  }
                >
                  {t("muscleGroups.config.reset")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          {/* How-sets-are-counted info */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("muscleGroups.info.a11y")}
              >
                <Info className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {t("muscleGroups.info.title")}
                </p>
                {infoBlocks.map((b) => (
                  <div key={b.title} className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium text-foreground">
                      {b.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{b.body}</p>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Coarse muscle-group multi-select chips */}
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g) => {
          const isOn = selected.has(g);
          return (
            <button
              key={g}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              onClick={() => toggleGroup(g)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isOn
                  ? "border-transparent text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground",
              )}
              style={
                isOn
                  ? { backgroundColor: colorFor(g), color: "#fff" }
                  : undefined
              }
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: colorFor(g) }}
              />
              {muscleLabel(g)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <TrendRangeSelector
          value={range}
          onChange={setRange}
          labels={rangeLabels}
        />
      </div>

      {selectedOrdered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("muscleGroups.selectHint")}
        </p>
      ) : (
        <>
          {/* Per-group current-week readout / legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {selectedOrdered.map((g) => {
              const readout = currentWeekReadout[g] ?? { sets: 0, projected: 0 };
              const showsProjection =
                hasProjection && readout.projected > readout.sets;
              return (
                <span
                  key={g}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: colorFor(g) }}
                  />
                  <span className="text-foreground">{muscleLabel(g)}</span>
                  <span className="tabular-nums">
                    {showsProjection
                      ? t("muscleGroups.setsReadoutProjected", {
                          sets: formatSets(readout.sets),
                          projected: formatSets(readout.projected),
                        })
                      : t("muscleGroups.setsReadout", {
                          sets: formatSets(readout.sets),
                        })}
                  </span>
                </span>
              );
            })}
          </div>

          {hasProjection ? (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="size-3" />
              {t("muscleGroups.projection.caption")}
            </p>
          ) : null}

          {/* SETS chart with the green target band */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("muscleGroups.setsTitle")}
            </p>
            <div className="h-64 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={setsData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.16}
                  />
                  <ReferenceArea
                    y1={targetMin}
                    y2={targetMax}
                    fill="var(--gc-target-zone)"
                    fillOpacity={0.12}
                    stroke="var(--gc-target-zone)"
                    strokeOpacity={0.3}
                    ifOverflow="extendDomain"
                  />
                  {projectionDivider}
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tickFormatter={xTick}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    allowDecimals={false}
                  />
                  <Tooltip
                    filterNull
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                    formatter={(value, name) => [
                      formatSets(Number(value)),
                      seriesLabel(String(name)),
                    ]}
                    labelFormatter={(label) =>
                      formatCivilDateLabel(
                        String(label),
                        { year: "numeric", month: "short", day: "numeric" },
                        locale,
                      )
                    }
                  />
                  {selectedOrdered.map((g) => (
                    <Line
                      key={g}
                      type="monotone"
                      dataKey={g}
                      stroke={colorFor(g)}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: colorFor(g), strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: colorFor(g), strokeWidth: 0 }}
                    />
                  ))}
                  {selectedOrdered.map(projectedLine)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* VOLUME chart */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("muscleGroups.volumeTitle")}
            </p>
            <div className="h-64 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={volumeData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.16}
                  />
                  {projectionDivider}
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tickFormatter={xTick}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v: number) => String(Math.round(v))}
                  />
                  <Tooltip
                    filterNull
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                    formatter={(value, name) => [
                      `${Math.round(Number(value))} ${t("muscleGroups.volumeUnit")}`,
                      seriesLabel(String(name)),
                    ]}
                    labelFormatter={(label) =>
                      formatCivilDateLabel(
                        String(label),
                        { year: "numeric", month: "short", day: "numeric" },
                        locale,
                      )
                    }
                  />
                  {selectedOrdered.map((g) => (
                    <Line
                      key={g}
                      type="monotone"
                      dataKey={g}
                      stroke={colorFor(g)}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: colorFor(g), strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: colorFor(g), strokeWidth: 0 }}
                    />
                  ))}
                  {selectedOrdered.map(projectedLine)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {t("muscleGroups.footnote")}
          </p>
        </>
      )}
    </section>
  );
}

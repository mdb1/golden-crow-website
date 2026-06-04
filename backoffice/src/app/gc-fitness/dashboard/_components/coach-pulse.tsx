"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { CheckCircle2, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  DailyMetric,
  PerformerRow,
} from "@/lib/gc-fitness/coach-pulse-actions";

interface DailyBarsProps {
  data: DailyMetric[];
  emptyLabel: string;
  /** Singular noun for the metric being plotted, used in tooltips ("habits", "workouts"). */
  unitLabel: string;
}

// Y-axis gridline values shared by both the bar and line charts so they read as
// a matched pair (matches the redesign reference screenshots).
const AXIS_TICKS = [100, 75, 50, 25, 0] as const;

function YAxis() {
  return (
    <div className="flex w-7 shrink-0 flex-col justify-between py-px text-right text-[10px] tabular-nums text-muted-foreground/70">
      {AXIS_TICKS.map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
  );
}

function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      {AXIS_TICKS.map((t) => (
        <span key={t} className="block h-px w-full bg-border/60" />
      ))}
    </div>
  );
}

export function DailyBars({ data, emptyLabel, unitLabel }: DailyBarsProps) {
  const locale = useLocale();
  const hasAnyData = data.some((d) => d.denominator > 0);
  if (!hasAnyData) {
    return (
      <p className="rounded-md border border-dashed bg-background/40 px-3 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex gap-2">
        <YAxis />
        <div className="min-w-0 flex-1">
          <div className="relative flex h-40 items-end gap-2">
            <GridLines />
            {data.map((d) => {
              const heightPct =
                d.denominator === 0 ? 0 : Math.max(4, d.percentage);
              return (
                <Tooltip key={d.civilDate}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="group relative flex h-full min-w-0 flex-1 items-end outline-none"
                      aria-label={tooltipLabel(d, unitLabel)}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-md bg-primary/85 transition-all group-hover:bg-primary",
                          d.denominator === 0 && "bg-muted",
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="text-[11px] leading-tight"
                  >
                    <div className="font-semibold">
                      {formatTooltipDate(d.civilDate, locale)}
                    </div>
                    <div className="text-background/85">
                      {d.denominator === 0
                        ? `Nada programado`
                        : `${d.numerator}/${d.denominator} ${unitLabel} · ${d.percentage}%`}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <AxisLabels data={data} />
        </div>
      </div>
    </TooltipProvider>
  );
}

function AxisLabels({ data }: { data: DailyMetric[] }) {
  return (
    <div className="mt-2 flex gap-2">
      {data.map((d, idx) => (
        <span
          key={d.civilDate}
          className={cn(
            "min-w-0 flex-1 text-center text-[11px] uppercase tracking-wide",
            idx === data.length - 1
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          {d.weekdayLabel}
        </span>
      ))}
    </div>
  );
}

// DailyLineChart — line/area variant of DailyBars used for the habits card in
// the redesign (matches the reference screenshot). Same DailyMetric[] input.
export function DailyLineChart({
  data,
  emptyLabel,
  unitLabel,
}: DailyBarsProps) {
  const locale = useLocale();
  const hasAnyData = data.some((d) => d.denominator > 0);
  if (!hasAnyData) {
    return (
      <p className="rounded-md border border-dashed bg-background/40 px-3 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  const n = data.length;
  // Map each point into a 0..100 viewBox (x evenly spaced, y inverted).
  const points = data.map((d, idx) => {
    const x = n === 1 ? 50 : (idx / (n - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, d.percentage));
    return { x, y, d };
  });
  const linePath = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex gap-2">
        <YAxis />
        <div className="min-w-0 flex-1">
          <div className="relative h-40">
            <GridLines />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <path d={areaPath} fill="var(--primary)" fillOpacity={0.12} />
              <path
                d={linePath}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Interactive dots + tooltips, absolutely positioned. */}
            {points.map((p) => (
              <Tooltip key={p.d.civilDate}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={tooltipLabel(p.d, unitLabel)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-1 outline-none"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  >
                    <span className="block size-2.5 rounded-full border-2 border-primary bg-background" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="text-[11px] leading-tight"
                >
                  <div className="font-semibold">
                    {formatTooltipDate(p.d.civilDate, locale)}
                  </div>
                  <div className="text-background/85">
                    {p.d.denominator === 0
                      ? `Nada programado`
                      : `${p.d.numerator}/${p.d.denominator} ${unitLabel} · ${p.d.percentage}%`}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <AxisLabels data={data} />
        </div>
      </div>
    </TooltipProvider>
  );
}

function tooltipLabel(d: DailyMetric, unit: string): string {
  if (d.denominator === 0) return `${d.weekdayLabel}: nothing scheduled`;
  return `${d.weekdayLabel}: ${d.numerator} of ${d.denominator} ${unit} (${d.percentage}%)`;
}

function formatTooltipDate(civilDate: string, locale: string): string {
  return formatCivilDateLabel(
    civilDate,
    {
      weekday: "short",
      month: "short",
      day: "numeric",
    },
    locale,
  );
}

interface TopPerformersProps {
  performers: PerformerRow[];
  emptyLabel?: string;
}

export function TopPerformers({ performers, emptyLabel }: TopPerformersProps) {
  if (performers.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
        {emptyLabel ?? "No habit activity to rank yet."}
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {performers.map((performer, idx) => (
        <li key={performer.uid}>
          <Link
            href={`/gc-fitness/clients/${performer.uid}`}
            className="group flex items-center gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                idx === 0
                  ? "bg-amber-500/20 text-amber-400"
                  : idx === 1
                    ? "bg-slate-400/15 text-slate-300"
                    : "bg-orange-700/15 text-orange-400",
              )}
            >
              {idx + 1}
            </span>
            <ClientAvatar
              name={performer.name}
              photoURL={performer.photoURL}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-foreground">
              {performer.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {performer.numerator}/{performer.denominator}
            </span>
            <span className="font-heading text-sm font-semibold tabular-nums">
              {performer.pct}%
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

// ActivityRow — a single row in the "Actividad Reciente de Clientes" list of the
// redesigned dashboard. Avatar + name + last action, a green/amber adherence bar
// with %, relative time, and a status icon (check when on-track, clock when the
// client is stale / under-adhering). All copy comes from the server.
export interface ActivityRowData {
  uid: string;
  name: string;
  photoURL: string | null;
  /** Short description of the last action ("Completó Tren Superior"). */
  primary: string;
  /** Relative timestamp label, already localized server-side. */
  timeLabel: string;
  /** Adherence ratio in [0, 1] over the last 7 days. */
  ratio: number;
  /** True when the client needs attention (renders a clock + amber bar). */
  stale: boolean;
}

export function ActivityRow({ row }: { row: ActivityRowData }) {
  const pct = Math.round(Math.max(0, Math.min(1, row.ratio)) * 100);
  const onTrack = !row.stale && pct >= 70;
  const StatusIcon = onTrack ? CheckCircle2 : Clock;
  return (
    <Link
      href={`/gc-fitness/clients/${row.uid}`}
      className="group flex items-center gap-4 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/60 sm:px-3"
    >
      <ClientAvatar name={row.name} photoURL={row.photoURL} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground sm:text-base">
          {row.name}
        </p>
        <p className="truncate text-xs text-muted-foreground sm:text-sm">
          {row.primary}
        </p>
      </div>
      <div className="flex w-28 shrink-0 flex-col items-end gap-1 sm:w-40">
        <div className="flex w-full items-center gap-2">
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                onTrack
                  ? "bg-[color:var(--badge-success-fg)]"
                  : "bg-[color:var(--badge-warning-fg)]",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {pct}%
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {row.timeLabel}
        </span>
      </div>
      <StatusIcon
        className={cn(
          "size-5 shrink-0",
          onTrack
            ? "text-[color:var(--badge-success-fg)]"
            : "text-[color:var(--badge-warning-fg)]",
        )}
      />
    </Link>
  );
}

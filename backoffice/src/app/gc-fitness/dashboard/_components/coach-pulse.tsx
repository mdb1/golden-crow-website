"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

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

export function DailyBars({ data, emptyLabel, unitLabel }: DailyBarsProps) {
  const locale = useLocale();
  const hasAnyData = data.some((d) => d.denominator > 0);
  if (!hasAnyData) {
    return (
      <p className="rounded-md border border-dashed bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-24 items-end gap-2">
        {data.map((d, idx) => {
          const isToday = idx === data.length - 1;
          const heightPct = d.denominator === 0 ? 0 : Math.max(4, d.percentage);
          const tone =
            d.denominator === 0
              ? "bg-muted/20"
              : d.percentage >= 80
                ? "bg-emerald-500/70 hover:bg-emerald-500/85"
                : d.percentage >= 50
                  ? "bg-primary/70 hover:bg-primary/90"
                  : "bg-amber-500/70 hover:bg-amber-500/85";
          return (
            <Tooltip key={d.civilDate}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="group flex h-full min-w-0 flex-1 flex-col items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={tooltipLabel(d, unitLabel)}
                >
                  <div className="relative flex h-full w-full items-end overflow-hidden rounded-md bg-muted/40 transition-colors">
                    <div
                      className={cn(
                        "w-full rounded-md transition-all",
                        tone,
                      )}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wide transition-colors",
                      isToday
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {d.weekdayLabel}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px] leading-tight">
                <div className="font-semibold">{formatTooltipDate(d.civilDate, locale)}</div>
                <div className="text-background/85">
                  {d.denominator === 0
                    ? `Nothing scheduled`
                    : `${d.numerator}/${d.denominator} ${unitLabel} · ${d.percentage}%`}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
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

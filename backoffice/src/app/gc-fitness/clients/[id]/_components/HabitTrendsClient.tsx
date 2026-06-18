"use client";

// HabitTrendsClient.tsx — interactive shell for HabitTrendsWidget. Holds
// the selected time range and re-renders the per-habit compliance cards
// from the server-precomputed `byRange` map. No data fetching here — every
// range was aggregated server-side, so toggling is instant.

import { useState } from "react";

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_TREND_RANGE,
  type TrendRangeKey,
} from "./trend-range";
import { TrendRangeSelector } from "./TrendRangeSelector";

export interface HabitTrendRow {
  id: string;
  name: string;
  streak: number;
  /** Pre-interpolated tooltip (streak is range-independent), or null. */
  streakTooltip: string | null;
  byRange: Record<
    TrendRangeKey,
    { pct: number; completed: number; scheduled: number }
  >;
}

export interface HabitTrendsClientProps {
  rows: HabitTrendRow[];
  labels: {
    title: string;
    empty: string;
    daysCompleted: string;
    noScheduled: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

export function HabitTrendsClient({ rows, labels }: HabitTrendsClientProps) {
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_TREND_RANGE);

  const sorted = [...rows].sort(
    (a, b) => b.byRange[range].pct - a.byRange[range].pct,
  );

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-medium">{labels.title}</h2>
        <TrendRangeSelector value={range} onChange={setRange} labels={labels.ranges} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sorted.map((row) => {
            const cell = row.byRange[range];
            // #341 — nothing was scheduled in this range: show "—", not a
            // misleading 100% (or 0%).
            const noData = cell.scheduled === 0;
            return (
              <li
                key={row.id}
                className="rounded-md border bg-muted/35 p-3 text-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{row.name}</span>
                    {row.streak >= 3 ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
                        title={row.streakTooltip ?? undefined}
                      >
                        <span aria-hidden>{row.streak >= 10 ? "🔥🔥" : "🔥"}</span>
                        {row.streak}
                      </Badge>
                    ) : null}
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {noData ? "—" : `${cell.pct}%`}
                  </Badge>
                </div>
                <Progress value={noData ? 0 : cell.pct} className="h-2.5 w-full" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {noData
                    ? labels.noScheduled
                    : `${cell.completed}/${cell.scheduled || 0} ${labels.daysCompleted}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

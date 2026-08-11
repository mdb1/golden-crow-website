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
    /** Shown when the client HAS habits but none were due in the picked range. */
    noneInRange: string;
    ranges: Record<TrendRangeKey, string>;
  };
}

export function HabitTrendsClient({ rows, labels }: HabitTrendsClientProps) {
  const [range, setRange] = useState<TrendRangeKey>(DEFAULT_TREND_RANGE);

  // Only the habits that were actually DUE in the picked range. #341 had these
  // rows rendering a "—" and "Sin días programados en este rango" instead of a
  // percentage, which is honest but fills the card with rows that answer
  // nothing: a client with four retired habits pushed the four live ones below
  // the fold. Choosing a range is choosing a question, and a habit that was not
  // due in it is not part of the answer.
  const inRange = rows.filter((row) => row.byRange[range].scheduled > 0);

  const sorted = [...inRange].sort(
    (a, b) => b.byRange[range].pct - a.byRange[range].pct,
  );

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-medium">{labels.title}</h2>
        <TrendRangeSelector value={range} onChange={setRange} labels={labels.ranges} />
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? labels.empty : labels.noneInRange}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sorted.map((row) => {
            const cell = row.byRange[range];
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

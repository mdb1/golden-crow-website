import { cn } from "@/lib/utils";

import type { DailyMetric } from "@/lib/gc-fitness/coach-pulse-actions";

interface DailyBarsProps {
  data: DailyMetric[];
  emptyLabel: string;
}

export function DailyBars({ data, emptyLabel }: DailyBarsProps) {
  const hasAnyData = data.some((d) => d.denominator > 0);
  if (!hasAnyData) {
    return (
      <p className="rounded-md border border-dashed bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="flex h-24 items-end gap-2">
      {data.map((d, idx) => {
        const isToday = idx === data.length - 1;
        const heightPct = d.denominator === 0 ? 0 : Math.max(4, d.percentage);
        return (
          <div
            key={d.civilDate}
            className="flex h-full min-w-0 flex-1 flex-col items-center gap-1"
            title={
              d.denominator === 0
                ? "Nothing scheduled"
                : `${d.numerator}/${d.denominator} (${d.percentage}%)`
            }
          >
            <div className="relative flex h-full w-full items-end overflow-hidden rounded-md bg-muted/40">
              <div
                className={cn(
                  "w-full rounded-md transition-all",
                  d.denominator === 0
                    ? "bg-muted/20"
                    : d.percentage >= 80
                      ? "bg-emerald-500/70"
                      : d.percentage >= 50
                        ? "bg-primary/70"
                        : "bg-amber-500/70",
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide",
                isToday
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {d.weekdayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface PulseChipProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "success";
}

export function PulseChip({ label, value, hint, tone = "default" }: PulseChipProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/60 px-3 py-2.5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-lg font-semibold leading-tight">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

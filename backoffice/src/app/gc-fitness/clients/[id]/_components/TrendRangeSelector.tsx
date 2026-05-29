"use client";

// TrendRangeSelector.tsx — shared segmented control for the client-profile
// trend widgets. Renders the four ranges (All / 90d / 30d / 7d) as a pill
// group and reports the selected key upward. Labels are passed in already
// localized so this stays a pure presentational toggle.

import { cn } from "@/lib/utils";
import { TREND_RANGES, type TrendRangeKey } from "./trend-range";

export interface TrendRangeSelectorProps {
  value: TrendRangeKey;
  onChange: (next: TrendRangeKey) => void;
  labels: Record<TrendRangeKey, string>;
}

export function TrendRangeSelector({ value, onChange, labels }: TrendRangeSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border bg-muted/40 p-0.5"
    >
      {TREND_RANGES.map((range) => {
        const selected = range.key === value;
        return (
          <button
            key={range.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(range.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[range.key]}
          </button>
        );
      })}
    </div>
  );
}

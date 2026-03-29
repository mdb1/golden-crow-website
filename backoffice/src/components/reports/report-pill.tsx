"use client";

import { cn } from "@/lib/utils";
import { getReportPillStyles } from "@/lib/moderation-utils";

export function ReportPill({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]",
        className
      )}
      style={getReportPillStyles(color)}
    >
      {label}
    </span>
  );
}

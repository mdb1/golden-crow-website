import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// PageHeader — the large in-page title block used at the top of every
// redesigned GC Fitness screen (2026-06). Big navy title + muted subtitle on
// the left, optional actions (CTAs, filters) on the right. Server-component
// safe (no hooks). Pair hero CTAs with `className="rounded-full"` for the pill
// look from the reference design.
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="gc-page-title text-[1.7rem] leading-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground sm:text-[0.95rem]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

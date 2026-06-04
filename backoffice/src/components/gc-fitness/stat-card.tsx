import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// StatCard — the KPI tile from the dashboard hero row (redesign 2026-06).
// Soft icon chip top-left, optional trend delta top-right (green up / rose
// down), big value, muted label. Optionally a link.
//
// Server-component safe (no hooks).
export type StatTrend = "up" | "down" | "neutral";

export function StatCard({
  icon,
  value,
  label,
  delta,
  trend = "neutral",
  href,
  className,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  /** e.g. "+12", "-3", "+5%". Rendered with a trend arrow. */
  delta?: string;
  trend?: StatTrend;
  href?: string;
  className?: string;
}) {
  const TrendIcon = trend === "down" ? TrendingDown : TrendingUp;
  const body = (
    <Card
      className={cn(
        "h-full transition-shadow",
        href && "hover:shadow-md",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary [&>svg]:size-5">
            {icon}
          </span>
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold",
                trend === "down"
                  ? "text-[color:var(--badge-rose-fg)]"
                  : trend === "up"
                    ? "text-[color:var(--badge-success-fg)]"
                    : "text-muted-foreground",
              )}
            >
              <TrendIcon className="size-3.5" />
              {delta}
            </span>
          ) : null}
        </div>
        <div className="space-y-0.5">
          <p className="font-heading text-[1.75rem] font-bold leading-none tracking-tight">
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

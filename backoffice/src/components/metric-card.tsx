import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const toneClasses = {
  blue: "bg-primary/12 text-primary",
  rose: "bg-rose-400/12 text-rose-300",
  green: "bg-emerald-400/12 text-emerald-300",
  red: "bg-destructive/12 text-destructive",
  amber: "bg-amber-300/12 text-amber-200",
  neutral: "bg-muted text-foreground",
} as const;

export function MetricCard({
  icon: Icon,
  title,
  description,
  value,
  href,
  ctaLabel = "Open",
  tone = "blue",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  value?: string | number;
  href: string;
  ctaLabel?: string;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <Link
      href={href}
      className="glass-panel group flex items-center gap-4 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-card/95"
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          toneClasses[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground">{title}</h3>
          {value !== undefined ? (
            <span className="font-mono text-xs text-muted-foreground">
              {value}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        <span>{ctaLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const toneClasses = {
  blue: "border-l-[3px] border-l-primary bg-primary/8",
  rose: "border-l-[3px] border-l-rose-400 bg-rose-400/8",
  green: "border-l-[3px] border-l-emerald-400 bg-emerald-400/8",
  red: "border-l-[3px] border-l-destructive bg-destructive/8",
  amber: "border-l-[3px] border-l-amber-300 bg-amber-300/8",
  neutral: "border-l-[3px] border-l-border bg-muted/45",
} as const;

export function HelperBanner({
  title,
  children,
  tone = "blue",
}: {
  title: string;
  children: ReactNode;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <aside
      className={cn(
        "glass-panel rounded-2xl px-4 py-3 text-sm text-muted-foreground",
        toneClasses[tone]
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      <div className="mt-1">{children}</div>
    </aside>
  );
}

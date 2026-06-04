"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// PillTabs — the rounded segmented control from the reference design
// (Biblioteca tabs, Recent Logs filters, etc.). Items can be links (route
// tabs) or buttons (in-page filters). The active item gets the solid gold pill
// via the `.gc-pill-tab` styles in globals.css.

export type PillTabItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Optional trailing count badge, e.g. "8". */
  count?: ReactNode;
  href?: string;
  onSelect?: () => void;
};

export function PillTabs({
  items,
  activeKey,
  className,
  size = "default",
}: {
  items: PillTabItem[];
  activeKey: string;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted/70 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        const inner = (
          <>
            {item.icon ? (
              <span className="[&>svg]:size-4">{item.icon}</span>
            ) : null}
            <span>{item.label}</span>
            {item.count !== undefined && item.count !== null ? (
              <span
                className={cn(
                  "ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                  active
                    ? "bg-white/25 text-current"
                    : "bg-foreground/8 text-muted-foreground",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );
        const cls = cn(
          "gc-pill-tab inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        );
        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            data-active={active}
            className={cls}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            data-active={active}
            onClick={item.onSelect}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

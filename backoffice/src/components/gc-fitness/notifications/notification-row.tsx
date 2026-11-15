import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { NotificationTone } from "@/lib/gc-fitness/notifications-feed";

// One row of the unified /gc-fitness/notifications feed + its empty state
// (#507 — split out of the page).

// Token-based colored chip for the leading notification icon. Both themes work
// via the shared badge color tokens.
const NOTIFICATION_CHIP: Record<NotificationTone, string> = {
  warning:
    "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-fg)]",
  brand:
    "border-[color:var(--badge-brand-border)] bg-[color:var(--badge-brand-bg)] text-[color:var(--badge-brand-fg)]",
  success:
    "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)]",
  violet:
    "border-[color:var(--badge-violet-border)] bg-[color:var(--badge-violet-bg)] text-[color:var(--badge-violet-fg)]",
};

export function NotificationRow({
  icon,
  tone,
  title,
  titleHref,
  detail,
  detailItems,
  meta,
  actionHref,
  actionLabel,
  secondaryActionHref,
  secondaryActionLabel,
  secondaryActionIcon,
  unread = false,
  featured = false,
}: {
  icon: ReactNode;
  tone: NotificationTone;
  title: string;
  titleHref?: string;
  detail: string;
  detailItems?: string[];
  meta: string;
  actionHref: string;
  actionLabel: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
  secondaryActionIcon?: ReactNode;
  unread?: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-card border bg-card p-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-start sm:justify-between ${
        featured
          ? "border-primary/70 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
          : "border-border"
      }`}
    >
      <div className="flex min-w-0 gap-3">
        <div
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border [&>svg]:size-4 ${NOTIFICATION_CHIP[tone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {titleHref ? (
              <Link
                href={titleHref}
                className="text-sm font-semibold leading-tight text-foreground hover:underline"
              >
                {title}
              </Link>
            ) : (
              <p className="text-sm font-semibold leading-tight text-foreground">
                {title}
              </p>
            )}
            {unread ? (
              <span
                className="size-2 shrink-0 rounded-full bg-primary"
                aria-hidden
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{meta}</p>
          {detailItems && detailItems.length > 0 ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{detail}</p>
              <ul className="list-disc space-y-1 pl-5">
                {detailItems.map((item, index) => (
                  <li key={`${index}-${item}`} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {secondaryActionHref && secondaryActionLabel ? (
          <Button asChild size="sm" variant="outline" className="gap-1">
            <Link href={secondaryActionHref}>
              {secondaryActionIcon}
              {secondaryActionLabel}
            </Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

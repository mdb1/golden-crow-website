import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PendingChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";

interface Props {
  items: PendingChecklistItem[];
}

/**
 * Dashboard widget: the coach's overdue + due-today checklist items, with a
 * button to the full checklist. Server component (read-only); toggling /
 * editing happens on the dedicated /gc-fitness/checklist page. Renders nothing
 * when there's nothing pending so it doesn't add noise to a clean dashboard —
 * the header already carries an always-on "Checklist" link for the empty case.
 */
export async function ChecklistPending({ items }: Props) {
  if (items.length === 0) return null;

  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="gc-page-title flex items-center gap-2 text-xl">
          <ClipboardCheck className="size-5" />
          {t("checklistPendingTitle")}
        </CardTitle>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/gc-fitness/checklist">{t("checklistViewAll")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => {
            const overdue = item.bucket === "overdue";
            const due = item.dueAt ? new Date(item.dueAt) : null;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                {overdue ? (
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                ) : (
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  {item.notes ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {due ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {timeFormatter.format(due)}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      overdue
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {overdue ? t("checklistOverdue") : t("checklistToday")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

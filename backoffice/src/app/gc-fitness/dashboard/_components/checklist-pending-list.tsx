"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChecklistEditDialog } from "@/components/gc-fitness/ChecklistEditDialog";
import { cn } from "@/lib/utils";
import type { PendingChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";
import { setCoachChecklistItemCompleted } from "@/lib/gc-fitness/coach-checklist-actions";

interface Props {
  items: PendingChecklistItem[];
  /** The coach's IANA zone. Explicit, never inferred here (#747). */
  timezone: string;
}

/**
 * Interactive rows for the dashboard "Pendientes de tu checklist" widget: a
 * checkbox to mark an item done (it then drops off the pending list) and a
 * pencil to edit it inline via the shared dialog. All items here are incomplete
 * by construction (the server only feeds overdue + due-today), so the checkbox
 * always starts unchecked and a tick completes the item.
 */
export function ChecklistPendingList({ items, timezone }: Props) {
  const td = useTranslations("dashboard");
  const tc = useTranslations("coachChecklist");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  function complete(item: PendingChecklistItem) {
    startTransition(async () => {
      await setCoachChecklistItemCompleted(item.id, true);
      router.refresh();
    });
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const overdue = item.bucket === "overdue";
        const due = item.dueAt ? new Date(item.dueAt) : null;
        return (
          <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Checkbox
              checked={false}
              onCheckedChange={() => complete(item)}
              disabled={pending}
              aria-label={tc("toggleAria", { title: item.title })}
              className={cn(
                "shrink-0",
                overdue && "border-destructive data-[state=checked]:bg-destructive",
              )}
            />
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
                {overdue ? td("checklistOverdue") : td("checklistToday")}
              </span>
              <ChecklistEditDialog
                item={item}
                timezone={timezone}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={tc("editAria", { title: item.title })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

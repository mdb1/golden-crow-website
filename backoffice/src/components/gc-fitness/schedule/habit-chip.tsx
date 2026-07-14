"use client";

import { CheckCircle2, Circle, User, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { MonthHabitChip } from "@/lib/gc-fitness/schedule-month-actions";
import { cn } from "@/lib/utils";

// Status-only chip classes for habits. Extracted from month-calendar's
// STATUS_PALETTE/habitChipClass (issue #447) — the class strings must stay
// byte-identical to keep the full Agenda calendar visually unchanged.
function habitChipClass(status: MonthHabitChip["status"]): string {
  if (status === "scheduled")
    return "border-border bg-card text-muted-foreground";
  if (status === "done")
    return "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200";
  return "border-rose-400/40 bg-rose-500/10 text-rose-900 dark:text-rose-200";
}

function HabitStatusGlyph({ status }: { status: MonthHabitChip["status"] }) {
  if (status === "done") {
    return <CheckCircle2 className="size-2.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === "missed") {
    return <XCircle className="size-2.5 text-rose-600 dark:text-rose-400" />;
  }
  return <Circle className="size-2.5 opacity-60" />;
}

/** Issue #437: marks a habit the client created for themselves (vs. one the
 * trainer assigned). Rendered on the calendar habit chip. */
function ClientOwnedBadge() {
  const t = useTranslations("schedule.calendar");
  return (
    <span title={t("clientCreatedBadge")} className="inline-flex shrink-0">
      <User className="size-2.5 opacity-70" aria-label={t("clientCreatedBadge")} />
    </span>
  );
}

/**
 * Shared compact habit "pill" used by the full Agenda calendar (DayCell +
 * ClientDayCell) and the client-detail mini calendar (issue #447) — habits
 * render visibly smaller/lighter than the rectangular workout cards.
 *
 * Renders a `<button>` when `onClick` is provided (Agenda: opens the habit
 * dialog) and a non-interactive `<span>` otherwise (mini calendar).
 */
export function HabitChip({
  habit,
  onClick,
  title,
}: {
  habit: MonthHabitChip;
  onClick?: () => void;
  title?: string;
}) {
  const chipTitle = title ?? habit.habitName;
  const content = (
    <>
      <HabitStatusGlyph status={habit.status} />
      <span className="min-w-0 max-w-full truncate">{habit.habitName}</span>
      {habit.clientOwned ? <ClientOwnedBadge /> : null}
    </>
  );

  const baseClass =
    "inline-flex max-w-full items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(baseClass, "hover:brightness-95", habitChipClass(habit.status))}
        title={chipTitle}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={cn(baseClass, habitChipClass(habit.status))}
      title={chipTitle}
    >
      {content}
    </span>
  );
}

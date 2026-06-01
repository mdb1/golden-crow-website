"use client";

// habit-pills.tsx
//
// Shared, NEUTRAL visual primitives for the habits surfaces — the per-client
// assignments table (columns.tsx), the template library table, and the
// template detail dialog all render the same restrained badges so the
// backoffice reads as one app. No per-item rainbow colors: a single muted
// `secondary` badge for the type, quiet `outline` badges for metadata.

import { CalendarDays, Clock, Repeat } from "lucide-react";
import type { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { HabitScheduleType } from "@/lib/gc-fitness/habit-schema";

type TFn = ReturnType<typeof useTranslations>;

// Structural recurrence shape — shared by HabitRow and HabitTemplateRow.
export interface HabitRecurrence {
  scheduleType: HabitScheduleType;
  scheduleCadence?: "daily" | "weekly" | "monthly";
  scheduleWeekdays?: number[];
  scheduleDayOfMonth?: number;
  scheduleMonthDays?: number[];
}

export function recurrenceLabel(
  rec: HabitRecurrence,
  t: TFn,
): { label: string; cadence: "one-time" | "daily" | "weekly" | "monthly" } {
  if (rec.scheduleType === "one-time") {
    return { label: t("recOneTime"), cadence: "one-time" };
  }
  const cadence = rec.scheduleCadence ?? "daily";
  if (cadence === "weekly") {
    const days = (rec.scheduleWeekdays ?? [])
      .filter((d) => d >= 1 && d <= 7)
      .sort((a, b) => a - b)
      .map((d) => t(`weekdayShort.${d}`));
    return {
      label: days.length > 0 ? days.join(" · ") : t("recDaily"),
      cadence: "weekly",
    };
  }
  if (cadence === "monthly") {
    const days =
      rec.scheduleMonthDays && rec.scheduleMonthDays.length > 0
        ? [...rec.scheduleMonthDays].sort((a, b) => a - b)
        : rec.scheduleDayOfMonth
          ? [rec.scheduleDayOfMonth]
          : [];
    return {
      label:
        days.length > 0
          ? `${t("recMonthly")} · ${days.join(", ")}`
          : t("recMonthly"),
      cadence: "monthly",
    };
  }
  return { label: t("recDaily"), cadence: "daily" };
}

const META_BADGE =
  "gap-1 px-1.5 py-0 text-[11px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70";

export function RecurrencePill({ rec, t }: { rec: HabitRecurrence; t: TFn }) {
  const { label, cadence } = recurrenceLabel(rec, t);
  const Icon = cadence === "daily" ? Repeat : CalendarDays;
  return (
    <Badge variant="outline" className={META_BADGE}>
      <Icon />
      {label}
    </Badge>
  );
}

export function ReminderCell({
  reminderEnabled,
  reminderTime,
}: {
  reminderEnabled: boolean;
  reminderTime?: string;
}) {
  if (reminderEnabled && reminderTime) {
    return (
      <Badge variant="outline" className={META_BADGE}>
        <Clock />
        {reminderTime}
      </Badge>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function ScopePill({ isGlobal, t }: { isGlobal: boolean; t: TFn }) {
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
      {isGlobal ? t("scopeGlobal") : t("scopeMine")}
    </Badge>
  );
}

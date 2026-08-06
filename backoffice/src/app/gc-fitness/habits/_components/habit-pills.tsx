"use client";

// habit-pills.tsx
//
// Shared, NEUTRAL visual primitives for the habits surfaces — the per-client
// assignments table (columns.tsx), the template library table, and the
// template detail dialog all render the same restrained badges so the
// backoffice reads as one app. No per-item rainbow colors: a single muted
// `secondary` badge for the type, quiet `outline` badges for metadata.

import { Bell, BellOff, CalendarDays, Clock, Repeat } from "lucide-react";
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

// Amber "client changed reminder" note — the workout twin of this treatment
// shipped in PR #152 as `ClientDailyTimeline.reminderNoteFor`, a component
// deleted in #309 (nothing had mounted it since 2026-05-28). THIS is now the
// only live copy of that inline-Spanish wording (NO i18n keys).
const CLIENT_EDIT_BADGE =
  "gap-1 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700 [&>svg]:size-3 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";

/**
 * Coach-facing label for a CLIENT-edited habit reminder. Only rendered when
 * `reminderEditedAt` is present (the client stamped reminderUpdatedAt from the
 * app). Wording inherited from the workout note that used to live in
 * ClientDailyTimeline.reminderNoteFor (deleted in #309).
 */
export function habitReminderEditNote({
  reminderEnabled,
  reminderTime,
}: {
  reminderEnabled: boolean;
  reminderTime?: string;
}): string {
  if (!reminderEnabled) return "El cliente desactivó el recordatorio";
  if (reminderTime && reminderTime.length > 0) {
    return `El cliente cambió el recordatorio a las ${reminderTime}`;
  }
  return "El cliente cambió el recordatorio";
}

export function ReminderCell({
  reminderEnabled,
  reminderTime,
  reminderEditedAt,
}: {
  reminderEnabled: boolean;
  reminderTime?: string;
  // 260611-ugu: ISO of reminderUpdatedAt — PRESENCE gates the amber client-edit
  // badge below. Mirrors PR #152's workout reminder visibility for habits.
  reminderEditedAt?: string | null;
}) {
  const edited = Boolean(reminderEditedAt);
  const note = edited
    ? habitReminderEditNote({ reminderEnabled, reminderTime })
    : null;

  return (
    <div className="flex flex-col items-start gap-1">
      {reminderEnabled && reminderTime ? (
        <Badge variant="outline" className={META_BADGE}>
          <Clock />
          {reminderTime}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      {note ? (
        <Badge variant="outline" className={CLIENT_EDIT_BADGE} title={note}>
          {reminderEnabled ? <Bell /> : <BellOff />}
          {note}
        </Badge>
      ) : null}
    </div>
  );
}

export function ScopePill({ isGlobal, t }: { isGlobal: boolean; t: TFn }) {
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
      {isGlobal ? t("scopeGlobal") : t("scopeMine")}
    </Badge>
  );
}

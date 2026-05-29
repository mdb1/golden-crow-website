"use client";

// habit-pills.tsx
//
// Shared visual primitives for the habits surfaces — the per-client
// assignments table (columns.tsx) AND the reusable-template library table
// (HabitLibraryTable.tsx) render identical type / recurrence / goal / reminder
// pills and client avatars from here, so the two views read consistently.

import { CalendarDays, Clock, Repeat, Target } from "lucide-react";
import type { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type {
  HabitScheduleType,
  HabitType,
} from "@/lib/gc-fitness/habit-schema";

type TFn = ReturnType<typeof useTranslations>;

export const PILL_BASE =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

export const TONE = {
  sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  violet:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  slate:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
} as const;

// HabitType → short label catalog key (resolved via `t(`shortType${...}`)`).
export const HABIT_SHORT_LABEL_KEYS: Record<HabitType, string> = {
  binary: "Binary",
  "multi-choice": "MultiChoice",
  numeric: "Numeric",
  weight: "Weight",
};

const TYPE_TONE: Record<HabitType, keyof typeof TONE> = {
  binary: "sky",
  "multi-choice": "violet",
  numeric: "amber",
  weight: "emerald",
};

const CADENCE_TONE: Record<
  "one-time" | "daily" | "weekly" | "monthly",
  keyof typeof TONE
> = {
  "one-time": "slate",
  daily: "sky",
  weekly: "violet",
  monthly: "amber",
};

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

// Stable per-client avatar tint from a seed (clientId).
const AVATAR_TONES = [
  "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
];

export function HabitAvatar({ seed, name }: { seed: string; name: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const tone = AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        tone,
      )}
    >
      {initial}
    </span>
  );
}

export function HabitTypePill({ type, t }: { type: HabitType; t: TFn }) {
  return (
    <span className={cn(PILL_BASE, TONE[TYPE_TONE[type]])}>
      {t(`shortType${HABIT_SHORT_LABEL_KEYS[type]}`)}
    </span>
  );
}

export function RecurrencePill({ rec, t }: { rec: HabitRecurrence; t: TFn }) {
  const { label, cadence } = recurrenceLabel(rec, t);
  const Icon = cadence === "daily" ? Repeat : CalendarDays;
  return (
    <span className={cn(PILL_BASE, TONE[CADENCE_TONE[cadence]])}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function GoalPill({
  type,
  targetValue,
  unit,
  t,
}: {
  type: HabitType;
  targetValue?: number;
  unit?: string;
  t: TFn;
}) {
  if (type !== "numeric" || typeof targetValue !== "number") return null;
  return (
    <span className={cn(PILL_BASE, TONE.emerald)}>
      <Target className="h-3 w-3" />
      {`${t("recGoal")}: ${targetValue}${unit ? ` ${unit}` : ""}`}
    </span>
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
      <span className={cn(PILL_BASE, TONE.amber)}>
        <Clock className="h-3 w-3" />
        {reminderTime}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

"use client";

// columns.tsx
//
// TanStack Table column defs for the trainer Habits overview. Columns:
//
//   1. Client  — colored initial avatar + resolved displayName
//   2. Type    — colored pill per habit type
//   3. Name    — name + recurrence pills BELOW (daily / weekday list / monthly
//                / one-time), plus a goal pill for numeric habits
//   4. Reminder— colored pill (clock + HH:mm) when enabled, else em-dash
//   5. Updated — relative time
//   6. Actions — View + Edit + Delete
//
// Handlers are passed in via props from `client.tsx` so this file stays free
// of router / state imports. Same pattern as `exercises/columns.tsx`.

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarDays,
  Clock,
  Edit,
  MoreHorizontal,
  Repeat,
  Target,
  Trash2,
  Eye,
} from "lucide-react";
import type { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { HabitRow } from "@/lib/gc-fitness/habit-actions";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";

export interface HabitColumnHandlers {
  onEdit: (row: HabitRow) => void;
  onView: (row: HabitRow) => void;
  onDelete: (row: HabitRow) => void;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = then - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  const diffMon = Math.round(diffDay / 30);
  if (Math.abs(diffMon) < 12) return rtf.format(diffMon, "month");
  const diffYr = Math.round(diffMon / 12);
  return rtf.format(diffYr, "year");
}

// Maps HabitType → short message-catalog key (resolved via
// `t(`shortType${HABIT_SHORT_LABEL_KEYS[type]}`)`). Kept grep-able.
const HABIT_SHORT_LABEL_KEYS: Record<HabitType, string> = {
  binary: "Binary",
  "multi-choice": "MultiChoice",
  numeric: "Numeric",
  weight: "Weight",
};

// Tailwind pill tones (literal classnames so the JIT keeps them). Mirrors the
// recent-logs feed badge palette for cross-surface consistency.
const PILL_BASE =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";
const TONE = {
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

const TYPE_TONE: Record<HabitType, keyof typeof TONE> = {
  binary: "sky",
  "multi-choice": "violet",
  numeric: "amber",
  weight: "emerald",
};

// Stable per-client avatar tint from the clientId hash.
const AVATAR_TONES = [
  "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
];

function avatarTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

// next-intl's `useTranslations(...)` return type.
type TFn = ReturnType<typeof useTranslations>;

/** Recurrence descriptor for the pill under the habit name. */
function recurrenceLabel(
  row: HabitRow,
  t: TFn,
): { label: string; cadence: "one-time" | "daily" | "weekly" | "monthly" } {
  if (row.scheduleType === "one-time") {
    return { label: t("recOneTime"), cadence: "one-time" };
  }
  const cadence = row.scheduleCadence ?? "daily";
  if (cadence === "weekly") {
    const days = (row.scheduleWeekdays ?? [])
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
      row.scheduleMonthDays && row.scheduleMonthDays.length > 0
        ? [...row.scheduleMonthDays].sort((a, b) => a - b)
        : row.scheduleDayOfMonth
          ? [row.scheduleDayOfMonth]
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

const CADENCE_TONE: Record<
  "one-time" | "daily" | "weekly" | "monthly",
  keyof typeof TONE
> = {
  "one-time": "slate",
  daily: "sky",
  weekly: "violet",
  monthly: "amber",
};

export function makeHabitColumns(
  handlers: HabitColumnHandlers,
  clientNameMap: Map<string, string>,
  t: TFn,
): ColumnDef<HabitRow>[] {
  return [
    {
      accessorKey: "clientId",
      header: t("client"),
      cell: ({ row }) => {
        const name =
          clientNameMap.get(row.original.clientId) ?? row.original.clientId;
        const initial = name.trim().charAt(0).toUpperCase() || "?";
        return (
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                avatarTone(row.original.clientId),
              )}
            >
              {initial}
            </span>
            <span className="font-medium">{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: t("type"),
      cell: ({ row }) => (
        <span className={cn(PILL_BASE, TONE[TYPE_TONE[row.original.type]])}>
          {t(`shortType${HABIT_SHORT_LABEL_KEYS[row.original.type]}`)}
        </span>
      ),
    },
    {
      accessorKey: "name.en",
      header: t("name"),
      cell: ({ row }) => {
        const rec = recurrenceLabel(row.original, t);
        const RecIcon =
          rec.cadence === "daily"
            ? Repeat
            : rec.cadence === "one-time"
              ? CalendarDays
              : CalendarDays;
        const showEs =
          row.original.name.es && row.original.name.es !== row.original.name.en;
        const goal =
          row.original.type === "numeric" &&
          typeof row.original.targetValue === "number"
            ? `${t("recGoal")}: ${row.original.targetValue}${
                row.original.unit ? ` ${row.original.unit}` : ""
              }`
            : null;
        return (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">
              {row.original.name.en || t("untitled")}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <span className={cn(PILL_BASE, TONE[CADENCE_TONE[rec.cadence]])}>
                <RecIcon className="h-3 w-3" />
                {rec.label}
              </span>
              {goal ? (
                <span className={cn(PILL_BASE, TONE.emerald)}>
                  <Target className="h-3 w-3" />
                  {goal}
                </span>
              ) : null}
            </div>
            {showEs ? (
              <span className="text-xs text-muted-foreground">
                {row.original.name.es}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "reminder",
      header: t("reminder"),
      cell: ({ row }) =>
        row.original.reminderEnabled && row.original.reminderTime ? (
          <span className={cn(PILL_BASE, TONE.amber)}>
            <Clock className="h-3 w-3" />
            {row.original.reminderTime}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "updatedAt",
      header: t("updated"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatRelative(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("actionsAria")}
                className="h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
                <Eye className="mr-2 h-4 w-4" />
                {t("view")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
                <Edit className="mr-2 h-4 w-4" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handlers.onDelete(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      size: 56,
    },
  ];
}

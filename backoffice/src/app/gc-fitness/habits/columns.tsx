"use client";

// columns.tsx
//
// TanStack Table column defs for the trainer Habits overview (per-client
// assignments). Visual pills/avatars/recurrence come from the shared
// `habit-pills` module so this view and the template library read identically.
//
//   1. Client  — colored initial avatar + resolved displayName
//   2. Type    — colored pill per habit type
//   3. Name    — name + recurrence pill BELOW + goal pill (numeric)
//   4. Reminder— colored clock pill when enabled, else em-dash
//   5. Updated — relative time
//   6. Actions — View + Edit + Delete

import type { ColumnDef } from "@tanstack/react-table";
import { Edit, MoreHorizontal, Trash2, Eye } from "lucide-react";
import type { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { HabitRow } from "@/lib/gc-fitness/habit-actions";
import {
  GoalPill,
  HabitTypePill,
  RecurrencePill,
  ReminderCell,
} from "./_components/habit-pills";

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

// next-intl's `useTranslations(...)` return type.
type TFn = ReturnType<typeof useTranslations>;

export function makeHabitColumns(
  handlers: HabitColumnHandlers,
  clientNameMap: Map<string, string>,
  t: TFn,
): ColumnDef<HabitRow>[] {
  return [
    {
      accessorKey: "clientId",
      header: t("client"),
      cell: ({ row }) => (
        <span className="font-medium">
          {clientNameMap.get(row.original.clientId) ?? row.original.clientId}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: t("type"),
      cell: ({ row }) => <HabitTypePill type={row.original.type} t={t} />,
    },
    {
      accessorKey: "name.en",
      header: t("name"),
      cell: ({ row }) => {
        const showEs =
          row.original.name.es && row.original.name.es !== row.original.name.en;
        return (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">
              {row.original.name.en || t("untitled")}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <RecurrencePill rec={row.original} t={t} />
              <GoalPill
                type={row.original.type}
                targetValue={row.original.targetValue}
                unit={row.original.unit}
                t={t}
              />
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
      cell: ({ row }) => (
        <ReminderCell
          reminderEnabled={row.original.reminderEnabled}
          reminderTime={row.original.reminderTime}
        />
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
